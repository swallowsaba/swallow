import { cellKey } from '@/city/cells';
import { FACILITY_DEFS } from '@/city/facilities';
import { nextId } from '@/city/place';
import { CAPACITY, FACILITY_JOBS_PER_LEVEL, levelCap, mergeMods } from '@/city/rules';
import type { Terrain } from '@/city/terrain';
import type { Building, City, Facility, FacilityType, Point, Zone } from '@/city/types';
import { ageOf, factorIndex, incomeOf, LAYERS, sizeOf, WEIGHTS, type FactorId } from './layers';
import { powerSupply, powerUse, zonePowerOf } from './power';
import { siteCells } from './permits';
import { ROAD_CAPACITY } from './rules';
import { districtOf, indexOf, inMap, NEIGHBORS, ROAD_KINDS } from './space';
import type { Application, Difficulty, GroupId, IssueId, ObjectionReason, ObjectionState, PoliticsRules, World } from './types';
import { previewOf, type PreviewView } from './week';

/**
 * 反対（docs/game-design.md 16 章）。申請ごとに、反対の集団と理由と反対率を、模擬の値から計算する。**乱数で決めない。**
 *
 *   理由の強さ（0〜1）: 申請が完成した形を模擬に仮に入れて 1 週分計算した見込みの値から（16.2）
 *   世帯の懸念 = min(1, Σ 理由の強さ × その層の重み × 世帯が理由の範囲にいるか)
 *   反対率 = Σ 影響の範囲の人数 × 懸念 ÷ 影響の範囲の人数 × 組織化の係数（0〜100%）（16.3）
 *
 * 都市全体の集団（環境の会・納税者の会）の人数には 0.3 を掛ける。商店会は事業者の雇う人の数を人数として数える。
 * 理由ごとの内訳は、懸念を理由の強さ × 重みの比で分けて足す（内訳の合計は反対率と一致する）。
 */

/** 組織化の係数（27 章） */
export const ORGANIZATION: Record<Difficulty, number> = { gentle: 0.8, normal: 1, tough: 1.25 };
/** 都市全体の集団の人数の重み（16.3） */
export const CITY_GROUP_WEIGHT = 0.3;
/** 強さの割る数（16.2）: 騒音の増え方 ÷ 30・日照の段の差 ÷ 4・家賃の上がり方 ÷ 10% */
export const NOISE_SPAN = 30;
export const SUNLIGHT_SPAN = 4;
export const RENT_SPAN = 0.1;
/** 施設の高さの段（2×2 以下は 2 段、それより大きい物は 3 段。Lv ごとに 1 段。日照の比べ方） */
export const facilitySteps = (type: FacilityType, level: number): number => (FACILITY_DEFS[type].w * FACILITY_DEFS[type].d > 4 ? 3 : 2) + level - 1;

/** 論点 → 層の重みを読む要因（13.2 の「重く見る物」）。技術は重み 1 */
const ISSUE_FACTOR: Record<IssueId, FactorId | null> = {
  afford: 'afford', environment: 'noise', jobs: 'jobs', finance: 'tax', safety: 'police', traffic: 'commute', tech: null,
};
const layerWeight = (layer: number, issue: IssueId): number => {
  const f = ISSUE_FACTOR[issue];
  return f ? ((WEIGHTS[layer] as readonly number[])[factorIndex(f)] as number) : 1;
};
/** 商店会と働く人の会の重みは、雇う人の収入の帯の物（その帯の中年の層の重み。年齢の帯の重みを含まない層） */
const bandWeight = (band: number, issue: IssueId): number => layerWeight(2 * 3 + band, issue);

/** 都市全体の集団に入る層（環境の会: 高齢と子育て / 納税者の会: 中と高の収入の帯） */
export function cityGroupHas(group: GroupId, layer: number): boolean {
  if (group === 'environment') return ageOf(layer) === 3 || ageOf(layer) === 1;
  if (group === 'taxpayers') return incomeOf(layer) >= 1;
  return false;
}

/** 説明の効き（docs/game-design.md 17.2）: 確かは誤解の分を段階に応じて下げる（段階 1: 40% … 1 段ごとに +15%、段階 5 で 100%） */
export const explainCut = (stage: number): number => Math.min(1, 0.4 + 0.15 * (stage - 1));
/** 一部の説明が下げる割合（誤解の分の 15%） */
export const PARTIAL_CUT = 0.15;
/** 誤った説明で懸念が増える割合 */
export const WRONG_RAISE = 0.1;

/**
 * 理由の懸念に掛ける倍率（説明の手。17.2）。下げられるのは誤解から来る割合の分だけ（騒音そのものは説明では消えない）。
 * 説明の手が無ければ 1
 */
export function concernFactor(reason: Pick<ObjectionReason, 'misconception' | 'explanations'>, hand: ObjectionState['hand']): number {
  if (hand?.kind !== 'explain') return 1;
  if (hand.quality === 'wrong') return 1 + WRONG_RAISE;
  if (hand.quality === 'partial') return 1 - reason.misconception * PARTIAL_CUT;
  const stage = reason.explanations.find((e) => e.id === hand.explanationId)?.stage ?? 1;
  return 1 - reason.misconception * explainCut(stage);
}

/** 申請の種類の鍵（理由の targets と比べる）: 'datacenter'・'upgrade:datacenter'・'rezone:industrial'・'civic:police'・'civic:power-thermal'・'reward:city-hall' */
export function targetOf(app: Pick<Application, 'kind' | 'target'>, city: Pick<City, 'facilities'>): string {
  if (app.kind === 'rezone') return `rezone:${app.target.zone?.kind ?? ''}`;
  if (app.kind === 'upgrade') return `upgrade:${city.facilities.find((f) => f.id === app.target.facilityId)?.type ?? ''}`;
  const type = app.target.type;
  if (type && (FACILITY_DEFS[type].group === 'civic' || FACILITY_DEFS[type].group === 'power')) return `civic:${type}`;
  if (type && FACILITY_DEFS[type].group === 'award') return `reward:${type}`;
  return type ?? '';
}

export function reasonsFor(app: Pick<Application, 'kind' | 'target'>, city: Pick<City, 'facilities'>, rules: PoliticsRules): ObjectionReason[] {
  const key = targetOf(app, city);
  return rules.reasons.filter((r) => r.targets.includes(key));
}

/** 申請の性質の倍率（譲歩の mods。height は足す段） */
const mod = (app: Pick<Application, 'mods'>, k: string, d = 1): number => app.mods[k] ?? d;

/** 申請が完成した形を入れた都市（模擬は純粋なので、写しの上で計算する） */
export function completedCity(city: City, app: Application): City {
  if (app.kind === 'upgrade') {
    return { ...city, facilities: city.facilities.map((f): Facility => (f.id === app.target.facilityId ? { ...f, level: (app.target.toLevel ?? Math.min(5, f.level + 1)) as Facility['level'], state: 'active', mods: mergeMods(f.mods, app.mods) } : f)) };
  }
  if (app.kind === 'rezone' && app.target.zone) {
    const z = app.target.zone;
    const painted = new Set(z.cells.map((c) => cellKey(c.x, c.y)));
    const zones: Zone[] = [];
    for (const old of city.zones) {
      const cells = old.cells.filter((c) => !painted.has(cellKey(c.x, c.y)));
      if (cells.length > 0) zones.push(cells.length === old.cells.length ? old : { ...old, cells });
    }
    const zoneId = nextId('z', city.zones.map((x) => x.id));
    zones.push({ id: zoneId, kind: z.kind, cells: z.cells.map((c) => ({ ...c })), ...(Object.keys(app.mods).length > 0 ? { mods: { ...app.mods } } : {}) });
    const day = Math.floor(city.day);
    const buildings: Building[] = [
      ...city.buildings.filter((b) => !painted.has(cellKey(b.cell.x, b.cell.y))),
      ...z.cells.map((c, i) => ({ id: `${zoneId}-p${String(i)}`, zoneId, cell: { ...c }, variant: `${z.kind}:${String(i)}`, level: 1, builtDay: day - 10 })),
    ];
    return { ...city, zones, buildings };
  }
  if (!app.target.type || !app.target.origin) return city;
  const def = FACILITY_DEFS[app.target.type];
  const facility: Facility = {
    id: app.target.facilityId ?? `${app.id}-site`,
    type: app.target.type,
    ...(def.domain ? { domain: def.domain } : {}),
    origin: { ...app.target.origin },
    rotation: app.target.rotation ?? 0,
    level: 1,
    state: 'active',
    builtDay: Math.floor(city.day) - 1,
    ...(Object.keys(app.mods).length > 0 ? { mods: { ...app.mods } } : {}),
  };
  return { ...city, facilities: [...city.facilities.filter((f) => f.id !== facility.id), facility] };
}

/** 申請が完成した時の Lv（施設は 1、アップグレードは上げた先） */
function levelOf(app: Application, city: City): number {
  if (app.kind === 'upgrade') return app.target.toLevel ?? (city.facilities.find((f) => f.id === app.target.facilityId)?.level ?? 1) + 1;
  return 1;
}
function typeOf(app: Application, city: City): FacilityType | undefined {
  if (app.kind === 'upgrade') return city.facilities.find((f) => f.id === app.target.facilityId)?.type;
  return app.kind === 'facility' ? app.target.type : undefined;
}

/** マスの中心から敷地までの、一番近いマスの中心の距離 */
function distanceToSite(cell: Point, site: readonly Point[]): number {
  let best = Infinity;
  for (const s of site) best = Math.min(best, Math.hypot(cell.x - s.x, cell.y - s.y));
  return best;
}

/** 申請が生む通勤の流れ・雇用（区画は Lv1 の建物の大きさ） */
function jobsOf(app: Application, city: City): number {
  if (app.kind === 'rezone') {
    const z = app.target.zone;
    if (!z) return 0;
    return z.cells.length * (CAPACITY[z.kind][0]) * (z.kind === 'residential' ? mod(app, 'units') : mod(app, 'jobs'));
  }
  return FACILITY_JOBS_PER_LEVEL * levelOf(app, city) * mod(app, 'jobs');
}

/** 理由ごとの強さと、元の値（16.2） */
export interface Strength {
  strength: number;
  basis: { value: number; ref?: number };
}

interface Ctx {
  world: World;
  terrain: Terrain;
  app: Application;
  rules: PoliticsRules;
  site: Point[];
  /** 半径の中の住まい（世帯のいる住宅の建物） */
  homesIn: (radius: number) => { building: Building; households: number[] }[];
  before: () => PreviewView;
  after: () => PreviewView;
}

const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1);
const round = (v: number, d = 1): number => Math.round(v * 10 ** d) / 10 ** d;

/** 世帯の数で重みを付けた平均 */
function weightedMean(homes: { building: Building; households: number[] }[], value: (b: Building) => number): number {
  let s = 0;
  let w = 0;
  for (const h of homes) {
    const n = h.households.reduce((a, v) => a + v, 0);
    s += value(h.building) * n;
    w += n;
  }
  return w > 0 ? s / w : 0;
}

export function strengthOf(reason: ObjectionReason, c: Ctx): Strength {
  const { world, app } = c;
  const city = world.city;
  const radius = reason.radius ?? 0;
  const m = reason.measure;
  switch (m.kind) {
    case 'noise': {
      const homes = c.homesIn(radius);
      if (homes.length === 0) return { strength: 0, basis: { value: 0, ref: radius } };
      const before = c.before().field.noise;
      const after = c.after().field.noise;
      const up = weightedMean(homes, (b) => Math.max(0, (after[indexOf(b.cell.x, b.cell.y)] as number) - (before[indexOf(b.cell.x, b.cell.y)] as number)));
      return { strength: clamp01(up / NOISE_SPAN), basis: { value: round(up), ref: radius } };
    }
    case 'power': {
      const type = typeOf(app, city);
      const per = type ? (c.rules.facilities[type]?.powerMW ?? 0) : 0;
      let use: number;
      if (app.kind === 'rezone' && app.target.zone) use = app.target.zone.cells.length * zonePowerOf(app.target.zone.kind, 1) * mod(app, 'units');
      else if (app.kind === 'upgrade') use = per * (levelOf(app, city) - (city.facilities.find((f) => f.id === app.target.facilityId)?.level ?? 1));
      else use = per * levelOf(app, city);
      use *= mod(app, 'power');
      const spare = powerSupply(world) - powerUse(city, c.rules);
      return { strength: spare <= 0 ? (use > 0 ? 1 : 0) : clamp01(use / spare), basis: { value: round(use, 2), ref: round(spare, 2) } };
    }
    case 'jobs-density': {
      const cells = Math.max(1, c.site.length);
      const mine = jobsOf(app, city) / cells;
      const kindOf = new Map(city.zones.map((z) => [z.id, z.kind]));
      let jobs = 0;
      let used = 0;
      for (const b of city.buildings) {
        const kind = kindOf.get(b.zoneId);
        if (!kind || kind === 'residential') continue;
        jobs += CAPACITY[kind][b.level - 1] ?? 0;
        used += 1;
      }
      for (const f of city.facilities) {
        if (f.state !== 'active' || FACILITY_DEFS[f.type].group !== 'facility') continue;
        jobs += FACILITY_JOBS_PER_LEVEL * f.level * (f.mods?.jobs ?? 1);
        used += FACILITY_DEFS[f.type].w * FACILITY_DEFS[f.type].d;
      }
      if (used === 0) return { strength: 0, basis: { value: round(mine), ref: 0 } };
      const mean = jobs / used;
      return { strength: clamp01(1 - mine / mean), basis: { value: round(mine), ref: round(mean) } };
    }
    case 'sunlight': {
      const homes = c.homesIn(radius);
      if (homes.length === 0) return { strength: 0, basis: { value: 0, ref: 0 } };
      const type = typeOf(app, city);
      const mine = (type ? facilitySteps(type, levelOf(app, city)) : levelCap(city.stage)) + mod(app, 'height', 0);
      const lowest = Math.min(...homes.map((h) => h.building.level));
      return { strength: clamp01((mine - lowest) / SUNLIGHT_SPAN), basis: { value: mine, ref: lowest } };
    }
    case 'traffic': {
      const flow = jobsOf(app, city) * mod(app, 'traffic');
      const before = c.before();
      // 敷地に面した道路のうち、一番余りのある道路（通勤の流れはそこから出入りする）
      const inSite = new Set(c.site.map((s) => cellKey(s.x, s.y)));
      let spare = -Infinity;
      for (const s of c.site) {
        for (const [dx, dy] of NEIGHBORS) {
          const x = s.x + dx;
          const y = s.y + dy;
          if (!inMap(x, y) || inSite.has(cellKey(x, y))) continue;
          const i = indexOf(x, y);
          const k = before.space.roadKind[i] ?? -1;
          if (k < 0) continue;
          spare = Math.max(spare, ROAD_CAPACITY[ROAD_KINDS[k] ?? 'lane'] - (before.commute.traffic[i] as number));
        }
      }
      if (spare === -Infinity) return { strength: 0, basis: { value: round(flow), ref: 0 } };
      return { strength: spare <= 0 ? 1 : clamp01(flow / spare), basis: { value: round(flow), ref: round(Math.max(0, spare)) } };
    }
    case 'rent': {
      const homes = c.homesIn(radius);
      if (homes.length === 0) return { strength: 0, basis: { value: 0, ref: radius } };
      const before = c.before().rent;
      const after = c.after().rent;
      const up = weightedMean(homes, (b) => {
        const r0 = before.get(b.id)?.rent ?? 0;
        const r1 = after.get(b.id)?.rent ?? r0;
        return r0 > 0 ? Math.max(0, r1 / r0 - 1) : 0;
      });
      return { strength: clamp01(up / RENT_SPAN), basis: { value: round(up * 100), ref: radius } };
    }
    case 'trait': {
      const type = typeOf(app, city);
      const base = type ? (c.rules.facilities[type]?.traits?.[m.trait] ?? 0) : 0;
      const value = base * levelOf(app, city) * mod(app, m.trait);
      return { strength: clamp01(value), basis: { value: round(value, 2) } };
    }
    case 'service-load':
      // 公共サービスは G10 で作る。それまでは負担が無い
      return { strength: 0, basis: { value: 0 } };
    case 'cost': {
      // 今の残りは、取り分けた費用を含めた財布（取り分けは否決・取り下げで戻る、まだ都市のお金）
      const wallet = (app.wallet === 'funds' ? city.funds : world.budget.treasury) + app.reserved;
      return { strength: wallet <= 0 ? 1 : clamp01(app.reserved / wallet), basis: { value: app.reserved, ref: Math.max(0, wallet) } };
    }
  }
}

/** 反対の計算の結果 */
export interface OppositionResult {
  /** 立った理由（強さが 0 より大きい物）。share は受付の終わりの割合（full と同じ） */
  objections: ObjectionState[];
  /** 受付の終わりの反対率（%） */
  opposition: number;
}

/**
 * 申請の反対を計算する（16 章）。結果の理由ごとの割合の合計は、反対率と一致する
 * - reasons を渡さなければ、rules から申請の種類の理由を引く
 */
export function oppositionOf(world: World, terrain: Terrain, app: Application, rules: PoliticsRules, reasons = reasonsFor(app, world.city, rules)): OppositionResult {
  if (reasons.length === 0) return { objections: [], opposition: 0 };
  const city = world.city;
  const site = siteCells(app, city);
  const kindOf = new Map(city.zones.map((z) => [z.id, z.kind]));
  const homes = city.buildings
    .filter((b) => kindOf.get(b.zoneId) === 'residential')
    .map((b) => ({ building: b, households: world.sim.households[b.id] ?? [], d: distanceToSite(b.cell, site) }))
    .filter((h) => h.households.some((v) => v > 0));
  let beforeView: PreviewView | null = null;
  let afterView: PreviewView | null = null;
  const ctx: Ctx = {
    world, terrain, app, rules, site,
    homesIn: (r) => homes.filter((h) => h.d <= r),
    before: () => (beforeView ??= previewOf(world, terrain, rules)),
    after: () => (afterView ??= previewOf({ ...world, city: completedCity(city, app) }, terrain, rules)),
  };
  // 説明の手は、理由の懸念の重みを変える（強さは変えない）
  const handOf = (id: string): ObjectionState['hand'] => app.objections.find((o) => o.reasonId === id)?.hand;
  const strengths = reasons.map((r) => ({ reason: r, factor: concernFactor(r, handOf(r.id)), ...strengthOf(r, ctx) })).filter((s) => s.strength > 0);
  if (strengths.length === 0) return { objections: [], opposition: 0 };

  // 人数（影響の範囲）と懸念。理由ごとの寄与（人数 × 懸念 × 比）を、地区と層ごとにも数える
  const contrib = strengths.map(() => ({ total: 0, byDistrict: new Map<number, number>(), byLayer: new Array<number>(12).fill(0) }));
  let people = 0;
  const local = (g: GroupId): boolean => g === 'neighbors' || g === 'merchants' || g === 'workers';
  for (const h of homes) {
    const district = districtOf(h.building.cell.x, h.building.cell.y);
    for (const l of LAYERS) {
      const n = (h.households[l] as number) * sizeOf(l);
      if (n <= 0) continue;
      let inLocal = false;
      let inCity = false;
      const parts = strengths.map((s) => {
        const r = s.reason;
        const applies = r.group === 'neighbors' ? h.d <= (r.radius ?? 0) : cityGroupHas(r.group, l);
        if (!applies) return 0;
        if (r.group === 'neighbors') inLocal = true;
        else inCity = true;
        return s.strength * layerWeight(l, r.issue) * s.factor;
      });
      const w = inLocal ? 1 : inCity ? CITY_GROUP_WEIGHT : 0;
      if (w === 0) continue;
      const sum = parts.reduce((a, v) => a + v, 0);
      const concern = Math.min(1, sum);
      people += w * n;
      if (sum <= 0) continue;
      parts.forEach((p, i) => {
        if (p <= 0) return;
        const v = (w * n * concern * p) / sum;
        const c = contrib[i] as (typeof contrib)[number];
        c.total += v;
        c.byDistrict.set(district, (c.byDistrict.get(district) ?? 0) + v);
        c.byLayer[l] = (c.byLayer[l] as number) + v;
      });
    }
  }
  // 商店会: 半径の中の店の、雇う人の数（収入の帯ごと）
  const merchants = strengths.map((s, i) => ({ s, i })).filter((x) => x.s.reason.group === 'merchants');
  if (merchants.length > 0) {
    for (const b of city.buildings) {
      if (kindOf.get(b.zoneId) !== 'commercial') continue;
      const biz = world.sim.businesses[b.id];
      if (!biz) continue;
      const d = distanceToSite(b.cell, site);
      const district = districtOf(b.cell.x, b.cell.y);
      for (let band = 0; band < 3; band += 1) {
        const n = biz.workers[band] ?? 0;
        if (n <= 0) continue;
        const parts = merchants.map(({ s }) => (d <= (s.reason.radius ?? 0) ? s.strength * bandWeight(band, s.reason.issue) * s.factor : 0));
        const sum = parts.reduce((a, v) => a + v, 0);
        if (sum <= 0) continue;
        people += n;
        const concern = Math.min(1, sum);
        parts.forEach((p, k) => {
          if (p <= 0) return;
          const c = contrib[(merchants[k] as (typeof merchants)[number]).i] as (typeof contrib)[number];
          const v = (n * concern * p) / sum;
          c.total += v;
          c.byDistrict.set(district, (c.byDistrict.get(district) ?? 0) + v);
          c.byLayer[2 * 3 + band] = (c.byLayer[2 * 3 + band] as number) + v;
        });
      }
    }
  }
  const org = ORGANIZATION[world.politics.difficulty];
  const raw = people > 0 ? (contrib.reduce((a, c) => a + c.total, 0) / people) * org * 100 : 0;
  const opposition = Math.min(100, raw);
  const scale = raw > 0 ? opposition / raw : 0;
  // 影響の範囲に誰もいない理由は立たない（強さがあっても、反対する人がいない）
  const objections: ObjectionState[] = strengths.flatMap((s, i) => {
    const c = contrib[i] as (typeof contrib)[number];
    if (c.total <= 0) return [];
    const full = people > 0 ? (c.total / people) * org * 100 * scale : 0;
    let district: number | undefined;
    let best = 0;
    for (const [d, v] of c.byDistrict) if (v > best) { best = v; district = d; }
    let topLayer: number | undefined;
    let top = 0;
    c.byLayer.forEach((v, l) => { if (v > top) { top = v; topLayer = l; } });
    const layers = c.byLayer.flatMap((v, l) => (v > 0 ? [l] : []));
    return [{
      reasonId: s.reason.id,
      group: s.reason.group,
      ...(local(s.reason.group) && district !== undefined ? { district } : {}),
      strength: round(s.strength, 4),
      share: full,
      full,
      basis: s.basis,
      ...(topLayer !== undefined ? { topLayer } : {}),
      layers,
    }];
  });
  return { objections, opposition: objections.reduce((a, o) => a + o.full, 0) };
}

/** 反対の受付の日の割合（0 → 1。14 日で直線に上がる） */
export function risingShare(app: Pick<Application, 'objections'>, progress: number): { objections: ObjectionState[]; opposition: number } {
  const p = Math.max(0, Math.min(1, progress));
  const objections = app.objections.map((o) => ({ ...o, share: o.full * p }));
  return { objections, opposition: objections.reduce((a, o) => a + o.share, 0) };
}
