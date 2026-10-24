import { CAPACITY, levelCap } from '@/city/rules';
import type { Terrain } from '@/city/terrain';
import type { Building, City, Point } from '@/city/types';
import { employersOf, salesOf, settleBusinesses, type Employer } from './businesses';
import { commuteOf, type Commute } from './commute';
import { landFieldOf, landTermsAt, noiseTermsAt, parkAt, type LandField, type Source } from './land';
import {
  adultsOf, AGE_SHARE, ageOf, FACTOR_COUNT, FACTORS, INCOME_SHARE, incomeOf, incomeYenOf, LAYER_COUNT, LAYER_SHARE, LAYERS, MONTHLY_INCOME, sizeOf, WEIGHTS,
  workersOf, type FactorId,
} from './layers';
import { networkOf, type Network } from './network';
import {
  AFFORD_POINTS, BURDEN_LEAVE, BURDEN_LIVABLE, COMMUTE_POINTS, GREEN_POINTS, JOBS_POINTS, LEAVE_RATE, NOISE_POINTS, PEOPLE_PER_UNIT, piecewise,
  RENT_FACTOR, RENT_TYPE, RENT_YEN_PER_VALUE, SPENDING_RATE, SUPPORT_EASE, TAX_BUSINESS, TAX_RESIDENT, taxPoints, TRUST_WEEKLY_KEEP,
  WEEKS_PER_TERM,
} from './rules';
import { DISTRICT_COUNT, spaceOf, type Space } from './space';
import type { Cause, SimHistory, WeeklyBreakdown, WeeklySample, World } from './types';

/**
 * 毎週の計算（docs/game-design.md 13 章。週の終わり）:
 * 事業者 → 雇用と通勤 → 騒音と地価 → 家賃と手頃さ → 満足と支持率（内訳と原因）→ 事業者の成長と撤退 → 引っ越し → 需給の倍率 → 税収 → 信頼 → 記録。
 * 純粋な関数。同じ世界と地形からは、必ず同じ結果になる（26 章）。
 */

const F = (id: FactorId): number => FACTORS.indexOf(id);
const AFFORD = F('afford');
const JOBS = F('jobs');
const COMMUTE = F('commute');
const NOISE = F('noise');
const GREEN = F('green');
const TAX = F('tax');
const TRUST = F('trust');

/** 住宅の戸数（CAPACITY ÷ 2.3） */
export const unitsOf = (b: Pick<Building, 'level'>): number => (CAPACITY.residential[b.level - 1] ?? 0) / PEOPLE_PER_UNIT;

/** 1 戸の家賃（円・月）= 地価 × 600 円 × 建物の型（戸建て 1.3・集合 1.0）× 需給の倍率（13.5） */
export function rentOf(landValue: number, level: number, rentFactor: number): number {
  return Math.max(0, landValue) * RENT_YEN_PER_VALUE * (level <= 1 ? RENT_TYPE.house : RENT_TYPE.apartment) * rentFactor;
}

/** 需給の倍率の目標（1 + 0.8 × (5% − 空き室の割合) ÷ 5%）に、1 週で ±0.03 まで近づける */
export function nextRentFactor(current: number, vacancy: number): number {
  const target = Math.max(RENT_FACTOR.min, Math.min(RENT_FACTOR.max, 1 + (RENT_FACTOR.slope * (RENT_FACTOR.vacancyTarget - vacancy)) / RENT_FACTOR.vacancyTarget));
  const step = Math.max(-RENT_FACTOR.step, Math.min(RENT_FACTOR.step, target - current));
  return Math.round((current + step) * 1e6) / 1e6;
}

/** 要因の点（重みを掛ける前。13.8 の表） */
export const affordPoints = (burden: number): number => piecewise(AFFORD_POINTS, burden);
export const jobsPoints = (unemployment: number): number => piecewise(JOBS_POINTS, unemployment);
export const commutePoints = (minutes: number): number => piecewise(COMMUTE_POINTS, minutes);
export const noisePoints = (noise: number): number => piecewise(NOISE_POINTS, noise);

/** 重みを掛けた点の合計が 0〜100 を外れる時は、点の比を保って縮める（目標 = 50 + Σ） */
export function clampTarget(points: number[]): number[] {
  const sum = points.reduce((s, v) => s + v, 0);
  const t = 50 + sum;
  if (t >= 0 && t <= 100) return points;
  const k = t > 100 ? 50 / sum : -50 / sum;
  return points.map((v) => v * k);
}

/** 毎週の計算の途中の値（画面と表示切替と確かめに使う。保存しない） */
export interface WeekView {
  space: Space;
  net: Network;
  commute: Commute;
  /** [地区 × 3 + 帯] 働く人 */
  workers: Float64Array;
  field: LandField;
  employers: Employer[];
  /** 住宅の建物 ID → 家賃（円・月）と、層ごとの負担 */
  rent: Map<string, { rent: number; burden: number[] }>;
  /** 住宅の建物 ID → [層 12] 重みを掛けた要因の点（目標。clamp 後） */
  points: Map<string, number[][]>;
  population: number;
  jobs: number;
  unemployment: number;
  approval: number;
  tax: { residents: number; businesses: number };
}

const emptyRow = (): number[] => new Array<number>(FACTOR_COUNT).fill(0);

/** 支持の内訳の行（無ければ作る） */
function partsOf(parts: Record<string, number[][]>, d: number): number[][] {
  let rows = parts[String(d)];
  if (!rows) {
    rows = Array.from({ length: LAYER_COUNT }, emptyRow);
    parts[String(d)] = rows;
  }
  return rows;
}

/** 1 週分を計算する。init は版 4 への移行と新しい都市の始め（支持を目標の値で埋め、引っ越し・成長をしない） */
export function weekStep(world: World, terrain: Terrain, init = false): { world: World; view: WeekView } {
  const { sim, budget } = world;
  let city: City = world.city;
  const week = init ? sim.week : sim.week + 1;
  const space = spaceOf(city, terrain);
  const taxRate = budget.taxRate;

  // 1. 事業者と雇い手
  const synced = employersOf(space, sim.businesses, sim.vacant, week);
  const employers = synced.employers;

  // 2. 働く人と仕事（[地区 × 3 + 帯]）
  const households: Record<string, number[]> = {};
  for (const zb of space.residential) households[zb.building.id] = [...(sim.households[zb.building.id] ?? new Array<number>(LAYER_COUNT).fill(0))];
  // 建て直しで一時的に数えない建物の世帯も残す（建物が無くなった時だけ消える）
  const alive = new Set(city.buildings.map((b) => b.id));
  for (const [id, hh] of Object.entries(sim.households)) if (!households[id] && alive.has(id)) households[id] = [...hh];
  const workers = new Float64Array(DISTRICT_COUNT * 3);
  for (const zb of space.residential) {
    const hh = households[zb.building.id] as number[];
    for (const l of LAYERS) workers[zb.district * 3 + incomeOf(l)] = (workers[zb.district * 3 + incomeOf(l)] as number) + (hh[l] as number) * workersOf(l);
  }
  const jobs = new Float64Array(DISTRICT_COUNT * 3);
  for (const e of employers) for (let b = 0; b < 3; b += 1) jobs[e.district * 3 + b] = (jobs[e.district * 3 + b] as number) + (e.slots[b] as number);

  // 3. 雇用と通勤
  const net = networkOf(space);
  const commute = commuteOf(space, net, workers, jobs);
  const anyJobs = jobs.some((j) => j > 0);

  // 4. 騒音・公園・地価
  const field = landFieldOf(space, commute.minutes);

  // 5〜6. 家賃と負担、要因の点（建物 × 層）
  const rent = new Map<string, { rent: number; burden: number[] }>();
  const points = new Map<string, number[][]>();
  const tax = taxPoints(taxRate);
  for (const zb of space.residential) {
    const b = zb.building;
    const land = field.land[zb.cell] as number;
    const r = rentOf(land, b.level, sim.rentFactor);
    const burden = LAYERS.map((l) => r / incomeYenOf(l));
    rent.set(b.id, { rent: r, burden });
    const noise = noisePoints(field.noise[zb.cell] as number);
    const green = parkAt(field, b.cell.x, b.cell.y).value * GREEN_POINTS;
    const minutes = commute.minutes[zb.district] as number;
    const commuteP = !anyJobs ? 0 : Number.isFinite(minutes) ? commutePoints(minutes) : (COMMUTE_POINTS[COMMUTE_POINTS.length - 1] as readonly [number, number])[1];
    // 毎週、建物 × 層の数だけ作るので、行は 1 つの配列の中で重みを掛ける（作る物を減らす）
    const rows = LAYERS.map((l) => {
      const row = emptyRow();
      row[AFFORD] = affordPoints(burden[l] as number);
      row[JOBS] = jobsPoints(commute.unemployment[zb.district * 3 + incomeOf(l)] as number);
      row[COMMUTE] = commuteP;
      row[NOISE] = noise;
      row[GREEN] = green;
      row[TAX] = tax;
      row[TRUST] = sim.trust[l] as number;
      const w = WEIGHTS[l] as readonly number[];
      for (let f = 0; f < FACTOR_COUNT; f += 1) row[f] = (row[f] as number) * (w[f] as number);
      return clampTarget(row);
    });
    points.set(b.id, rows);
  }

  // 7. 支持（地区 × 層）: 地区の中の建物の点を、世帯の数で平均した目標へ 1/4 近づける
  const target = new Map<number, { rows: number[][]; count: number[] }>();
  for (const zb of space.residential) {
    const hh = households[zb.building.id] as number[];
    let t = target.get(zb.district);
    if (!t) {
      t = { rows: Array.from({ length: LAYER_COUNT }, emptyRow), count: new Array<number>(LAYER_COUNT).fill(0) };
      target.set(zb.district, t);
    }
    const rows = points.get(zb.building.id) as number[][];
    for (const l of LAYERS) {
      const n = hh[l] as number;
      if (n <= 0) continue;
      t.count[l] = (t.count[l] as number) + n;
      const row = t.rows[l] as number[];
      const src = rows[l] as number[];
      for (let f = 0; f < FACTOR_COUNT; f += 1) row[f] = (row[f] as number) + (src[f] as number) * n;
    }
  }
  const support = sim.support.map((r) => [...r]);
  const supportParts: Record<string, number[][]> = {};
  for (const [d, rows] of Object.entries(sim.supportParts)) supportParts[d] = rows.map((r) => [...r]);
  let totalAdults = 0;
  const adultsBy = new Map<number, number[]>();
  for (let d = 0; d < DISTRICT_COUNT; d += 1) {
    const t = target.get(d);
    const sRow = support[d] as number[];
    for (const l of LAYERS) {
      const n = t ? (t.count[l] as number) : 0;
      if (n <= 0) {
        // 住む人がいなくなった地区と層は、次に住み始めた週に目標から始める
        if ((sRow[l] as number) >= 0) {
          sRow[l] = -1;
          const rows = supportParts[String(d)];
          if (rows) rows[l] = emptyRow();
        }
        continue;
      }
      const goal = (t?.rows[l] as number[]).map((v) => v / n);
      const rows = partsOf(supportParts, d);
      const fresh = init || (sRow[l] as number) < 0;
      const cur = rows[l] as number[];
      const next = fresh ? goal : cur.map((v, f) => v + ((goal[f] as number) - v) * SUPPORT_EASE);
      rows[l] = next;
      sRow[l] = Math.max(0, Math.min(100, 50 + next.reduce((s, v) => s + v, 0)));
      const adults = n * adultsOf(l);
      totalAdults += adults;
      let a = adultsBy.get(d);
      if (!a) {
        a = new Array<number>(LAYER_COUNT).fill(0);
        adultsBy.set(d, a);
      }
      a[l] = adults;
    }
  }
  for (const [d, rows] of Object.entries(supportParts)) {
    if ((support[Number(d)] as number[]).every((v) => v < 0)) delete supportParts[d];
    else supportParts[d] = rows;
  }
  // 支持率と内訳（[要因][層] の支持率への寄与。支持率 = 50 + 全ての合計）
  const factors = Array.from({ length: FACTOR_COUNT }, () => new Array<number>(LAYER_COUNT).fill(0));
  let approval = 50;
  if (totalAdults > 0) {
    for (const [d, a] of adultsBy) {
      const rows = supportParts[String(d)] as number[][];
      for (const l of LAYERS) {
        const w = (a[l] as number) / totalAdults;
        if (w <= 0) continue;
        const row = rows[l] as number[];
        for (let f = 0; f < FACTOR_COUNT; f += 1) (factors[f] as number[])[l] = ((factors[f] as number[])[l] as number) + w * (row[f] as number);
      }
    }
    approval = 50 + factors.reduce((s, row) => s + row.reduce((x, v) => x + v, 0), 0);
  }

  // 原因（要因ごとの点を、建物・道路・区画・決定に分ける）
  // 要因 → 原因の種類 → ID の順に引く（建物ごとに鍵の文字列を作らない）
  const causes = Array.from({ length: FACTOR_COUNT }, () => new Map<string, Map<string, Cause>>());
  const addCause = (factor: number, source: Source, value: number): void => {
    if (value === 0) return;
    const byKind = causes[factor] as Map<string, Map<string, Cause>>;
    let byId = byKind.get(source.kind);
    if (!byId) {
      byId = new Map();
      byKind.set(source.kind, byId);
    }
    const cur = byId.get(source.id);
    if (cur) cur.points += value;
    else byId.set(source.id, { factor: FACTORS[factor] as FactorId, source: { kind: source.kind, id: source.id, at: source.at }, points: value });
  };
  // 需給の倍率の変化は、その週に雇用の増えた多い雇い手 3 つに、増えた量の比で分ける（13.8）
  const employedNow = new Map<string, number>();
  for (const e of employers) employedNow.set(e.id, e.slots.reduce((s, v, b) => s + v * (commute.fill[e.district * 3 + b] as number), 0));
  const growth = employers
    .map((e) => ({ e, gain: (employedNow.get(e.id) ?? 0) - (sim.employed[e.id] ?? 0) }))
    .filter((g) => g.gain > 0)
    .sort((a, b) => b.gain - a.gain || (a.e.id < b.e.id ? -1 : 1))
    .slice(0, 3);
  const growthSum = growth.reduce((s, g) => s + g.gain, 0);
  const demandSources: { source: Source; share: number }[] = growth.length > 0
    ? growth.map((g) => ({ source: employerSource(g.e), share: g.gain / growthSum }))
    : [{ source: { kind: 'demand', id: 'rent', at: { x: 0, y: 0 } }, share: 1 }];
  if (totalAdults > 0) {
    const whole: { factor: number; kind: Source['kind']; id: string; points: number; at?: Point }[] = [
      { factor: JOBS, kind: 'demand', id: 'jobs', points: 0 },
      { factor: COMMUTE, kind: 'demand', id: 'commute', points: 0 },
      { factor: TAX, kind: 'decision', id: 'tax', points: 0 },
      { factor: TRUST, kind: 'decision', id: 'trust', points: 0 },
    ];
    for (const zb of space.residential) {
      const hh = households[zb.building.id] as number[];
      const rows = points.get(zb.building.id) as number[][];
      const sum = emptyRow();
      for (const l of LAYERS) {
        const w = ((hh[l] as number) * adultsOf(l)) / totalAdults;
        if (w <= 0) continue;
        for (let f = 0; f < FACTOR_COUNT; f += 1) sum[f] = (sum[f] as number) + w * ((rows[l] as number[])[f] as number);
      }
      const at = { x: zb.building.cell.x + 0.5, y: zb.building.cell.y + 0.5 };
      // 手頃さ: 家賃 = 地価 × 型 × 倍率。地価の項の比と、倍率の分（(倍率 − 1) ÷ 倍率）に分ける
      if (sum[AFFORD] !== 0) {
        const terms = landTermsAt(space, field, commute.minutes, zb.building.cell.x, zb.building.cell.y, zb.zoneId);
        const total = terms.reduce((s, t) => s + t.value, 0);
        const demandShare = (sim.rentFactor - 1) / sim.rentFactor;
        const landShare = 1 - demandShare;
        if (total !== 0) for (const t of terms) addCause(AFFORD, t.source, (sum[AFFORD] as number) * landShare * (t.value / total));
        for (const s of demandSources) addCause(AFFORD, s.source, (sum[AFFORD] as number) * demandShare * s.share);
      }
      if (sum[NOISE] !== 0) {
        const terms = noiseTermsAt(field, zb.building.cell.x, zb.building.cell.y);
        const total = terms.reduce((s, t) => s + t.value, 0);
        for (const t of terms) addCause(NOISE, t.source, (sum[NOISE] as number) * (t.value / total));
      }
      if (sum[GREEN] !== 0) {
        const park = parkAt(field, zb.building.cell.x, zb.building.cell.y);
        const p = space.parks[park.park];
        if (p) addCause(GREEN, { kind: 'facility', id: p.facility.id, at: p.center }, sum[GREEN] as number);
      }
      // 仕事・通勤・税・信頼の原因は都市に 1 つずつ。建物ごとに鍵を作らず、足してから 1 度だけ入れる（場所は最初に足した建物）
      for (const s of whole) {
        const v = sum[s.factor] as number;
        if (v === 0) continue;
        s.points += v;
        s.at ??= at;
      }
    }
    for (const s of whole) if (s.at) addCause(s.factor, { kind: s.kind, id: s.id, at: s.at }, s.points);
  }
  // 原因の場所は、同じ原因の中で点の大きい所（同じ原因を 1 つにまとめた時、最初に足した場所が残る）
  const topCauses = causes.flatMap((byKind) => [...byKind.values()].flatMap((byId) => [...byId.values()]))
    .map((c) => ({ ...c, points: Math.round(c.points * 1e6) / 1e6 }))
    .filter((c) => c.points !== 0)
    .sort((a, b) => Math.abs(b.points) - Math.abs(a.points) || (causeKeySort(a) < causeKeySort(b) ? -1 : 1))
    .slice(0, 20);

  // 8. 事業者の売上・費用・成長・撤退（住民の買い物は、住宅の前の道路のマスに集める）
  let population = 0;
  const spending = new Map<number, number>();
  for (const zb of space.residential) {
    const hh = households[zb.building.id] as number[];
    let s = 0;
    for (const l of LAYERS) {
      population += (hh[l] as number) * sizeOf(l);
      s += (hh[l] as number) * (MONTHLY_INCOME[incomeOf(l)] as number) * SPENDING_RATE;
    }
    if (s > 0) spending.set(zb.front, (spending.get(zb.front) ?? 0) + s);
  }
  const sales = salesOf(space, employers, spending, city.techPower, population, taxRate);
  let businesses = synced.businesses;
  let vacant = synced.vacant;
  if (!init) {
    const settled = settleBusinesses(employers, synced.businesses, synced.vacant, sales, commute.fill, week, levelCap(city.stage));
    businesses = settled.businesses;
    vacant = settled.vacant;
    if (settled.grow.length > 0) {
      const grow = new Set(settled.grow);
      city = { ...city, buildings: city.buildings.map((b) => (grow.has(b.id) ? { ...b, level: b.level + 1, builtDay: Math.floor(city.day) } : b)) };
    }
  } else {
    // 始めは、働き口が埋まっているとして写す
    for (const e of employers) {
      const cur = businesses[e.id];
      if (cur) businesses[e.id] = { ...cur, workers: e.slots.map((s, b) => s * (commute.fill[e.district * 3 + b] as number)) };
    }
  }

  // 9. 引っ越し: 負担が 40% を超えた層は週 5% が出ていく。空いた戸に、住める層が需要に応じて入る
  let openJobs = 0;
  for (let i = 0; i < jobs.length; i += 1) openJobs += (jobs[i] as number) * (1 - (commute.fill[i] as number));
  let units = 0;
  let occupied = 0;
  if (!init) {
    for (const zb of space.residential) {
      const hh = households[zb.building.id] as number[];
      const burden = (rent.get(zb.building.id) as { burden: number[] }).burden;
      for (const l of LAYERS) if ((burden[l] as number) > BURDEN_LEAVE && (hh[l] as number) > 0) hh[l] = (hh[l] as number) * (1 - LEAVE_RATE);
    }
    // 都市の魅力: 住民の満足の平均 − 50。住民がいなければ、住んだとした時の満足の平均
    let attraction = 0;
    if (totalAdults > 0) {
      attraction = approvalTargetMean(space, households, points) - 50;
    } else if (space.residential.length > 0) {
      let s = 0;
      for (const zb of space.residential) {
        const rows = points.get(zb.building.id) as number[][];
        for (const l of LAYERS) s += (LAYER_SHARE[l] as number) * (rows[l] as number[]).reduce((x, v) => x + v, 0);
      }
      attraction = s / space.residential.length;
    }
    // 入る人の数 = 空いた仕事 × 1.2 + 魅力 × 2（23 章の住宅の需要の項）。
    // 仕事に引かれて来る人は、空いた仕事の収入の帯の人（13.6: 収入の帯の合う仕事に入る）。魅力に引かれて来る人は初めの分布
    const people = Math.max(0, openJobs * 1.2 + attraction * 2);
    const openByBand = [0, 0, 0];
    for (let i = 0; i < jobs.length; i += 1) openByBand[i % 3] = (openByBand[i % 3] as number) + (jobs[i] as number) * (1 - (commute.fill[i] as number));
    const pull = openByBand.map((o, b) => o * 1.2 + Math.max(0, attraction * 2) * (INCOME_SHARE[b] as number));
    const pullSum = pull.reduce((s, v) => s + v, 0);
    const newcomer = LAYERS.map((l) => (pullSum > 0 ? (pull[incomeOf(l)] as number) / pullSum : (INCOME_SHARE[incomeOf(l)] as number)) * (AGE_SHARE[ageOf(l)] as number));
    const meanSize = LAYERS.reduce((s, l) => s + (newcomer[l] as number) * sizeOf(l), 0);
    /** 層ごとに、この週に入る世帯の数 */
    const quota = newcomer.map((share) => (meanSize > 0 ? (people / meanSize) * share : 0));
    let incoming = quota.reduce((s, v) => s + v, 0);
    const order = space.residential
      .map((zb) => {
        const rows = points.get(zb.building.id) as number[][];
        const mean = LAYERS.reduce((s, l) => s + (LAYER_SHARE[l] as number) * (rows[l] as number[]).reduce((x, v) => x + v, 0), 0);
        return { zb, mean };
      })
      .sort((a, b) => b.mean - a.mean || (a.zb.building.id < b.zb.building.id ? -1 : 1));
    for (const { zb } of order) {
      if (incoming <= 1e-9) break;
      const hh = households[zb.building.id] as number[];
      const room = unitsOf(zb.building) - hh.reduce((s, v) => s + v, 0);
      if (room <= 1e-9) continue;
      const burden = (rent.get(zb.building.id) as { burden: number[] }).burden;
      const can = LAYERS.filter((l) => (burden[l] as number) <= BURDEN_LIVABLE && (quota[l] as number) > 1e-9);
      const left = can.reduce((s, l) => s + (quota[l] as number), 0);
      if (left <= 1e-9) continue;
      const take = Math.min(room, left);
      for (const l of can) {
        const n = (take * (quota[l] as number)) / left;
        hh[l] = (hh[l] as number) + n;
        quota[l] = (quota[l] as number) - n;
      }
      incoming -= take;
    }
  }
  for (const zb of space.residential) {
    units += unitsOf(zb.building);
    occupied += (households[zb.building.id] as number[]).reduce((s, v) => s + v, 0);
  }
  for (const [id, hh] of Object.entries(households)) households[id] = hh.map((v) => Math.round(v * 1e6) / 1e6);
  const vacancy = units > 0 ? Math.max(0, (units - occupied) / units) : RENT_FACTOR.vacancyTarget;
  const rentFactor = init ? sim.rentFactor : nextRentFactor(sim.rentFactor, vacancy);

  // 10. 税収（22.2）: Σ 世帯 × 月の収入（万円）× 税率 × 0.03 + Σ 事業者の雇う人 × 0.05 × 税率 ÷ 10%
  let residentsTax = 0;
  for (const zb of space.residential) {
    const hh = households[zb.building.id] as number[];
    for (const l of LAYERS) residentsTax += (hh[l] as number) * (MONTHLY_INCOME[incomeOf(l)] as number) * (taxRate / 100) * TAX_RESIDENT;
  }
  let employedTotal = 0;
  for (const v of employedNow.values()) employedTotal += v;
  const businessTax = employedTotal * TAX_BUSINESS * (taxRate / 10);
  const income = { residents: round2(residentsTax), businesses: round2(businessTax) };

  // 11. 市政への信頼（1 年で 0 へ 1/4 戻る）
  const trust = init ? sim.trust : sim.trust.map((v) => Math.round(v * TRUST_WEEKLY_KEEP * 1e6) / 1e6);

  // 12. 記録
  let peopleAfter = 0;
  for (const hh of Object.values(households)) for (const l of LAYERS) peopleAfter += (hh[l] as number) * sizeOf(l);
  const totalJobs = jobs.reduce((s, v) => s + v, 0);
  let workersTotal = 0;
  let employedTotalW = 0;
  for (let i = 0; i < workers.length; i += 1) {
    workersTotal += workers[i] as number;
    employedTotalW += commute.employed[i] as number;
  }
  const unemployment = workersTotal > 0 ? 1 - employedTotalW / workersTotal : 0;
  let unemployedLowMid = 0;
  for (let d = 0; d < DISTRICT_COUNT; d += 1) {
    for (const b of [0, 1]) unemployedLowMid += (workers[d * 3 + b] as number) - (commute.employed[d * 3 + b] as number);
  }
  const approvalR = Math.round(approval * 1e6) / 1e6;
  const treasury = init ? budget.treasury : round2(budget.treasury + income.residents + income.businesses);
  city = { ...city, population: Math.round(peopleAfter) };
  const employed: Record<string, number> = {};
  for (const [id, v] of employedNow) employed[id] = Math.round(v * 1e6) / 1e6;
  // 層ごとの支持の平均（地区の支持を 18 歳以上の人数で重み付け）
  const layerSupport = LAYERS.map((l) => {
    let s = 0;
    let w = 0;
    for (const [d, a] of adultsBy) {
      const n = a[l] as number;
      if (n <= 0) continue;
      s += n * ((support[d] as number[])[l] as number);
      w += n;
    }
    return w > 0 ? Math.round((s / w) * 1e6) / 1e6 : -1;
  });
  const breakdown: WeeklyBreakdown = { week, factors: factors.map((r) => r.map((v) => Math.round(v * 1e6) / 1e6)), causes: topCauses, approval: approvalR, layers: layerSupport };
  const sample: WeeklySample = {
    week, population: city.population, funds: city.funds, treasury, approval: approvalR, jobs: Math.round(totalJobs),
    unemployment: Math.round(unemployment * 1e6) / 1e6, marks: [],
  };
  const history: SimHistory = init
    ? { ...world.history, breakdown: [...world.history.breakdown.filter((b) => b.week !== week), breakdown].slice(-8) }
    : { ...world.history, weekly: thin([...world.history.weekly, sample], week), breakdown: [...world.history.breakdown, breakdown].slice(-8) };
  const ledger = init ? budget.ledger : [...budget.ledger, { week, income, spend: { services: 0, power: 0, external: 0, petitions: 0 } }].slice(-52);

  const next: World = {
    ...world,
    city,
    sim: {
      ...sim,
      week,
      households,
      businesses,
      vacant,
      rentFactor,
      support: support.map((r) => r.map((v) => (v < 0 ? -1 : Math.round(v * 1e6) / 1e6))),
      supportParts: Object.fromEntries(Object.entries(supportParts).map(([d, rows]) => [d, rows.map((r) => r.map((v) => Math.round(v * 1e6) / 1e6))])),
      trust,
      employed,
      lastWeek: { unemployedLowMid: Math.round(unemployedLowMid * 1e6) / 1e6, approval: approvalR, jobs: Math.round(totalJobs), unemployment: sample.unemployment },
    },
    history,
    budget: { ...budget, treasury, ledger },
  };
  return {
    world: next,
    view: { space, net, commute, workers, field, employers, rent, points, population: city.population, jobs: totalJobs, unemployment, approval: approvalR, tax: income },
  };
}

const round2 = (v: number): number => Math.round(v * 100) / 100;
const causeKeySort = (c: Cause): string => `${c.factor}|${c.source.kind}|${c.source.id}`;

function employerSource(e: Employer): Source {
  if (e.facility) return { kind: 'facility', id: e.facility.facility.id, at: e.facility.center };
  const b = e.place?.building;
  return { kind: 'building', id: e.id, at: b ? { x: b.cell.x + 0.5, y: b.cell.y + 0.5 } : { x: 0, y: 0 } };
}

/** 住民の満足の目標の平均（18 歳以上の人数で重み） */
function approvalTargetMean(space: Space, households: Record<string, number[]>, points: Map<string, number[][]>): number {
  let s = 0;
  let w = 0;
  for (const zb of space.residential) {
    const hh = households[zb.building.id] as number[];
    const rows = points.get(zb.building.id) as number[][];
    for (const l of LAYERS) {
      const a = (hh[l] as number) * adultsOf(l);
      if (a <= 0) continue;
      s += a * (50 + (rows[l] as number[]).reduce((x, v) => x + v, 0));
      w += a;
    }
  }
  return w > 0 ? s / w : 50;
}

/** グラフの記録の間引き: 直近 208 週は全て、それより前は 4 週ごと（docs/game-design.md 14 章） */
export function thin(samples: WeeklySample[], week: number): WeeklySample[] {
  return samples.filter((s) => s.week > week - WEEKS_PER_TERM || s.week % 4 === 0);
}
