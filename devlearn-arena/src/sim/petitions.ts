import { cellKey, facilityCells, occupancyOf } from '@/city/cells';
import { COVERAGE_KINDS, FACILITY_DEFS } from '@/city/facilities';
import { checkFacility, placeFacility } from '@/city/place';
import type { Terrain } from '@/city/terrain';
import type { Point } from '@/city/types';
import { evalCondition, parseCondition, type Clause } from './conditions';
import { conditionValues } from './election';
import { moveTrust } from './hearing';
import { parkAt, serviceAt } from './land';
import { adultsOf, incomeOf, LAYERS, sizeOf } from './layers';
import { file, needsApplication, occupiedSites, permitProblems } from './permits';
import { DISTRICT_SIZE } from './rules';
import { DISTRICT_COUNT, DISTRICTS_PER_SIDE } from './space';
import type { Petition, PetitionState, PoliticsRules, World } from './types';
import type { WeekView } from './week';

/**
 * 請願（docs/game-design.md 22.1・docs/content-spec.md 7.3）。純粋な計算。
 * 毎週の終わりに、届く条件（7.7 の式）を満たす候補のうち、優先の高い物から 1 つ届く（同じ優先なら seed で選ぶ）。
 * 受信箱は 5 通まで・届いて 8 週が期限・扱ってから 26 週は同じ請願が届かない
 */

/** 請願の when に使える語（今の模擬が数えている物。docs/content-spec.md 7.7） */
export const PETITION_WORDS = [
  'population', 'jobs', 'unemployment', 'approval', 'treasury', 'taxRate', 'outageDays', 'facilities.it', 'facilities.civic',
  'rentBurden.低', 'rentBurden.中', 'rentBurden.高', 'noiseAtHome', 'coverage.park',
  'coverage.police', 'coverage.fire', 'coverage.school', 'coverage.clinic',
] as const;

export const INBOX_MAX = 5;
export const PETITION_DEADLINE_WEEKS = 8;
export const PETITION_COOLDOWN_WEEKS = 26;
/** 信頼の動き（受理 +2・拒否 −2・放置 −1） */
export const PETITION_TRUST = { accept: 2, reject: -2, expire: -1 } as const;

const BANDS = ['低', '中', '高'] as const;
const round2 = (v: number): number => Math.round(v * 100) / 100;

/** 条件の式の値: 都市全体（city）と、地区ごとの値（any: の語）。地区ごとの層の世帯の数も持つ（送る層の住む地区を選ぶ） */
export interface PlaceValues {
  city: Partial<Record<string, number>>;
  districts: Map<number, Partial<Record<string, number>>>;
  /** 地区 → [層 12] 世帯の数 */
  households: Map<number, number[]>;
}

/** 上から 1 割の平均（数が 10 未満でも 1 つは取る） */
function topTenthMean(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => b - a);
  const n = Math.max(1, Math.ceil(sorted.length * 0.1));
  return sorted.slice(0, n).reduce((s, v) => s + v, 0) / n;
}

/**
 * 週の終わりの値から、条件の式の語の値を作る（docs/content-spec.md 7.7）。
 * 家賃の負担は収入の帯ごとの世帯の平均（%）・住まいの騒音は大きい方から 1 割の平均・公園の行き届きは世帯の平均（0〜100）
 */
export function placeValues(world: World, view: Pick<WeekView, 'space' | 'field' | 'rent' | 'workers' | 'commute'>): PlaceValues {
  type Acc = { burden: number[]; bandN: number[]; noise: number[]; park: number; service: number[]; hh: number; people: number; layers: number[] };
  const fresh = (): Acc => ({ burden: [0, 0, 0], bandN: [0, 0, 0], noise: [], park: 0, service: COVERAGE_KINDS.map(() => 0), hh: 0, people: 0, layers: new Array<number>(12).fill(0) });
  const acc = new Map<number, Acc>();
  const cityAcc: Acc = fresh();
  for (const zb of view.space.residential) {
    const hh = world.sim.households[zb.building.id];
    if (!hh) continue;
    let a = acc.get(zb.district);
    if (!a) {
      a = fresh();
      acc.set(zb.district, a);
    }
    const burden = view.rent.get(zb.building.id)?.burden ?? [];
    const noise = view.field.noise[zb.cell] as number;
    const park = parkAt(view.field, zb.building.cell.x, zb.building.cell.y).value;
    const service = COVERAGE_KINDS.map((k) => serviceAt(view.field, k, zb.building.cell.x, zb.building.cell.y).value);
    let n = 0;
    for (const t of [a, cityAcc]) {
      for (const l of LAYERS) {
        const c = hh[l] as number;
        if (c <= 0) continue;
        const b = incomeOf(l);
        t.burden[b] = (t.burden[b] as number) + c * ((burden[l]) ?? 0);
        t.bandN[b] = (t.bandN[b] as number) + c;
        t.layers[l] = (t.layers[l] as number) + c;
        t.people += c * sizeOf(l);
        if (t === a) n += c;
      }
      t.park += n * park;
      service.forEach((v, k) => {
        t.service[k] = (t.service[k] as number) + n * v;
      });
      t.hh += n;
      if (n > 0) t.noise.push(noise);
    }
  }
  const valuesOf = (a: Acc): Partial<Record<string, number>> => {
    const out: Partial<Record<string, number>> = {
      population: Math.round(a.people),
      noiseAtHome: round2(topTenthMean(a.noise)),
      'coverage.park': a.hh > 0 ? round2((a.park / a.hh) * 100) : 0,
    };
    COVERAGE_KINDS.forEach((k, i) => {
      out[`coverage.${k}`] = a.hh > 0 ? round2(((a.service[i] as number) / a.hh) * 100) : 0;
    });
    BANDS.forEach((name, b) => {
      if ((a.bandN[b] as number) > 0) out[`rentBurden.${name}`] = round2(((a.burden[b] as number) / (a.bandN[b] as number)) * 100);
    });
    return out;
  };
  const districts = new Map<number, Partial<Record<string, number>>>();
  const households = new Map<number, number[]>();
  for (const [d, a] of acc) {
    if (a.hh <= 0) continue;
    const v = valuesOf(a);
    // 地区の失業率（働く人のうち、仕事に着けなかった人の割合）・支持率（18 歳以上の人数で重み）・停電の日
    let w = 0;
    let e = 0;
    for (let b = 0; b < 3; b += 1) {
      w += view.workers[d * 3 + b] as number;
      e += view.commute.employed[d * 3 + b] as number;
    }
    v.unemployment = w > 0 ? round2((1 - e / w) * 100) : 0;
    let s = 0;
    let n = 0;
    for (const l of LAYERS) {
      const sup = (world.sim.support[d])?.[l] ?? -1;
      const adults = (a.layers[l] as number) * adultsOf(l);
      if (sup < 0 || adults <= 0) continue;
      s += sup * adults;
      n += adults;
    }
    v.approval = n > 0 ? round2(s / n) : 50;
    v.outageDays = world.sim.power.outageDays[d] ?? 0;
    districts.set(d, v);
    households.set(d, a.layers);
  }
  const city = { ...conditionValues(world), ...valuesOf(cityAcc), population: world.city.population };
  households.set(-1, cityAcc.layers);
  return { city, districts, households };
}

/** 同じ優先の候補から seed と週で 1 つ選ぶ（乱数でなく、同じ都市と週なら同じ物） */
function pick(seed: number, week: number, n: number): number {
  let h = (seed ^ Math.imul(week + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) % n;
}

/** 送る層のうち、その場所に一番多く住む層（住んでいなければ undefined） */
function topLayer(p: Petition, layers: number[] | undefined): number | undefined {
  if (!layers || !p.layers || p.layers.length === 0) return undefined;
  let best: number | undefined;
  for (const l of p.layers) if ((layers[l] ?? 0) > 0 && (best === undefined || (layers[l] as number) > (layers[best] as number))) best = l;
  return best;
}

/** 大きい方が強い比べ方か（> と >=） */
const upward = (c: Clause): boolean => c.op === '>' || c.op === '>=';

export interface Arrival {
  petitionId: string;
  district?: number;
  layer?: number;
  value: number;
}

/**
 * この週に条件を満たす請願と、届く地区（満たす地区のうち、最初の any: の語が一番強い所。同じなら番号の小さい地区）。
 * 建てる請願は、建てる物を置ける空き地のある地区にだけ届く（受理の中身を必ず行えるように）
 */
export function candidatesOf(world: World, terrain: Terrain, values: PlaceValues, rules: Pick<PoliticsRules, 'petitions'>, week: number): (Arrival & { priority: number })[] {
  const out: (Arrival & { priority: number })[] = [];
  const inbox = new Set(world.petitions.inbox.map((i) => i.petitionId));
  for (const p of [...(rules.petitions ?? [])].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (inbox.has(p.id)) continue;
    const handled = world.petitions.handled[p.id];
    if (handled && week - handled.week < PETITION_COOLDOWN_WEEKS) continue;
    const clauses = parseCondition(p.when);
    if (!clauses) continue;
    const local = clauses.filter((c) => c.word.startsWith('any:'));
    if (local.length === 0) {
      if (!evalCondition(clauses, values.city)) continue;
      const layer = topLayer(p, values.households.get(-1));
      if (p.layers && layer === undefined) continue;
      out.push({ petitionId: p.id, ...(layer !== undefined ? { layer } : {}), value: values.city[clauses[0]?.word ?? ''] ?? 0, priority: p.priority });
      continue;
    }
    const first = local[0] as Clause;
    const hits: { d: number; v: number; layer?: number }[] = [];
    for (let d = 0; d < DISTRICT_COUNT; d += 1) {
      const dv = values.districts.get(d);
      if (!dv) continue;
      const layer = topLayer(p, values.households.get(d));
      if (p.layers && layer === undefined) continue;
      const merged: Partial<Record<string, number>> = { ...values.city };
      for (const [k, v] of Object.entries(dv)) merged[`any:${k}`] = v;
      if (!evalCondition(clauses, merged)) continue;
      hits.push({ d, v: merged[first.word] as number, ...(layer !== undefined ? { layer } : {}) });
    }
    hits.sort((a, b) => (upward(first) ? b.v - a.v : a.v - b.v) || a.d - b.d);
    const effect = p.accept.effect;
    const best = effect.kind === 'build'
      ? hits.find((h) => buildSiteOf(world, terrain, effect.type, h.d) !== null)
      : hits[0];
    if (best) out.push({ petitionId: p.id, district: best.d, ...(best.layer !== undefined ? { layer: best.layer } : {}), value: best.v, priority: p.priority });
  }
  return out;
}

/** 層の信頼を動かす。請願の送る層（無ければ届いた時の層） */
function trustLayers(p: Petition | undefined, entry: { layer?: number }): number[] {
  if (p?.layers && p.layers.length > 0) return p.layers;
  return entry.layer !== undefined ? [entry.layer] : [];
}

/**
 * 週の終わりの請願（週の計算と払いの後）: 期限の来た請願を放置にし（信頼 −1）、終わった中身を外し、新しい請願を 1 つ届ける
 */
export function stepPetitions(world: World, terrain: Terrain, view: Parameters<typeof placeValues>[1], rules: Pick<PoliticsRules, 'petitions'>): World {
  const week = world.sim.week;
  const byId = new Map((rules.petitions ?? []).map((p) => [p.id, p]));
  let trust = world.sim.trust;
  let expired = 0;
  const handled = { ...world.petitions.handled };
  const inbox: PetitionState['inbox'] = [];
  for (const i of world.petitions.inbox) {
    if (week - i.arrivedWeek >= PETITION_DEADLINE_WEEKS) {
      handled[i.petitionId] = { week, choice: 'expire' };
      trust = moveTrust(trust, trustLayers(byId.get(i.petitionId), i), PETITION_TRUST.expire);
      expired += 1;
    } else inbox.push(i);
  }
  const effects = world.petitions.effects.filter((e) => e.untilWeek > week);
  let next: World = {
    ...world,
    sim: trust === world.sim.trust ? world.sim : { ...world.sim, trust },
    petitions: { inbox, handled, effects },
    politics: expired > 0 ? { ...world.politics, expiredPetitions: world.politics.expiredPetitions + expired } : world.politics,
  };
  if (inbox.length >= INBOX_MAX || byId.size === 0) return next;
  const found = candidatesOf(next, terrain, placeValues(next, view), rules, week);
  if (found.length === 0) return next;
  const top = Math.max(...found.map((f) => f.priority));
  const same = found.filter((f) => f.priority === top);
  const chosen = same[pick(world.city.seed, week, same.length)] as Arrival;
  next = {
    ...next,
    petitions: {
      ...next.petitions,
      inbox: [...inbox, {
        id: `${chosen.petitionId}@${String(week)}`,
        petitionId: chosen.petitionId,
        arrivedWeek: week,
        ...(chosen.district !== undefined ? { district: chosen.district } : {}),
        ...(chosen.layer !== undefined ? { layer: chosen.layer } : {}),
        value: round2(chosen.value),
      }],
    },
  };
  return next;
}

export type PetitionChoice = 'accept' | 'reject' | 'hold';
/** no-site: 地区に置ける場所が無い / permit: 申請を出せない（6 件まで・財政が赤字の間の公共サービス。docs/game-design.md 15.2・22.2） */
export type PetitionProblem = 'no-site' | 'permit';

/**
 * 地区の中で、建てる物を置ける場所（near の点に近い順。同じなら番号の小さいマス）。
 * near は、置ける場所が 1 つでもある時だけ呼ぶ（届くかを確かめる時は、場所の有る無しだけを見る）
 */
export function buildSiteOf(world: World, terrain: Terrain, type: Parameters<typeof checkFacility>[2], district: number, near?: () => Point | undefined): Point | null {
  const x0 = (district % DISTRICTS_PER_SIDE) * DISTRICT_SIZE;
  const y0 = Math.floor(district / DISTRICTS_PER_SIDE) * DISTRICT_SIZE;
  const sites = occupiedSites(world);
  const occ = occupancyOf(world.city);
  const taken = (x: number, y: number): boolean => {
    const k = cellKey(x, y);
    return occ.roads.has(k) || occ.zones.has(k) || occ.buildings.has(k) || occ.facilities.has(k) || sites.has(k);
  };
  // 財布は財政なので、置ける場所の判定では開発資金を見ない
  const city = { ...world.city, funds: Number.MAX_SAFE_INTEGER };
  const ok: Point[] = [];
  for (let y = y0; y < y0 + DISTRICT_SIZE; y += 1) {
    for (let x = x0; x < x0 + DISTRICT_SIZE; x += 1) {
      const origin = { x, y };
      // 埋まったマスを先に除く（込んだ都市では、ほとんどの場所がここで外れる）
      if (facilityCells({ type, origin, rotation: 0 }).some((c) => taken(c.x, c.y))) continue;
      if (checkFacility(city, terrain, type, origin, 0).ok) ok.push(origin);
    }
  }
  if (ok.length === 0) return null;
  const center = near?.() ?? { x: x0 + DISTRICT_SIZE / 2, y: y0 + DISTRICT_SIZE / 2 };
  let best: { at: Point; d: number } | null = null;
  for (const at of ok) {
    const d = Math.hypot(at.x + 0.5 - center.x, at.y + 0.5 - center.y);
    if (!best || d < best.d) best = { at, d };
  }
  return best?.at ?? null;
}

/** 送った層の世帯の重心（届いた地区の中。無ければ undefined） */
function homesCenter(world: World, district: number, layers: readonly number[]): Point | undefined {
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const b of world.city.buildings) {
    const hh = world.sim.households[b.id];
    if (!hh) continue;
    const bx = Math.floor(b.cell.x / DISTRICT_SIZE);
    const by = Math.floor(b.cell.y / DISTRICT_SIZE);
    if (by * DISTRICTS_PER_SIDE + bx !== district) continue;
    const c = layers.reduce((s, l) => s + (hh[l] ?? 0), 0);
    sx += (b.cell.x + 0.5) * c;
    sy += (b.cell.y + 0.5) * c;
    n += c;
  }
  return n > 0 ? { x: sx / n, y: sy / n } : undefined;
}

/** 受理できない理由（建てる請願で、地区に置ける場所が無い） */
export function petitionProblems(world: World, terrain: Terrain, rules: Pick<PoliticsRules, 'petitions'>, inboxId: string): PetitionProblem[] {
  const entry = world.petitions.inbox.find((i) => i.id === inboxId);
  const p = entry ? rules.petitions?.find((x) => x.id === entry.petitionId) : undefined;
  if (!entry || !p || p.accept.effect.kind !== 'build') return [];
  if (entry.district === undefined) return ['no-site'];
  const type = p.accept.effect.type;
  const at = buildSiteOf(world, terrain, type, entry.district);
  if (!at) return ['no-site'];
  // 申請の要る公共サービスは申請になる（15.1）。出せない時は受理できない
  if (needsApplication(type) && permitProblems(world, { kind: 'facility', target: { type, origin: at, rotation: 0 } }, Math.floor(world.city.day)).length > 0) return ['permit'];
  return [];
}

/** 受理した時に財政から払う額（1 度に払う額と、毎週の額 × 週の数） */
export function acceptCost(p: Petition): { once: number; weekly: number; weeks: number } {
  const e = p.accept.effect;
  const once = p.accept.cost?.treasury ?? (e.kind === 'build' ? FACILITY_DEFS[e.type].cost : 0);
  const weeks = p.accept.cost?.weeks ?? ('weeks' in e ? e.weeks : 0);
  return { once, weekly: p.accept.cost?.weekly ?? 0, weeks };
}

/**
 * 請願を扱う（受理・拒否・保留。22.1）。受理は中身を実際に行い（財政から費用・模擬に効く）、送った層の信頼 +2。拒否は −2。保留は何も起きない
 */
export function handlePetition(world: World, terrain: Terrain, rules: Pick<PoliticsRules, 'petitions'>, inboxId: string, choice: PetitionChoice): World {
  if (choice === 'hold') return world;
  const entry = world.petitions.inbox.find((i) => i.id === inboxId);
  const p = entry ? rules.petitions?.find((x) => x.id === entry.petitionId) : undefined;
  if (!entry || !p) return world;
  const week = world.sim.week;
  const inbox = world.petitions.inbox.filter((i) => i.id !== inboxId);
  const handled = { ...world.petitions.handled, [p.id]: { week, choice } };
  const layers = trustLayers(p, entry);
  if (choice === 'reject') {
    return { ...world, sim: { ...world.sim, trust: moveTrust(world.sim.trust, layers, PETITION_TRUST.reject) }, petitions: { ...world.petitions, inbox, handled } };
  }
  if (petitionProblems(world, terrain, rules, inboxId).length > 0) return world;
  const cost = acceptCost(p);
  const e = p.accept.effect;
  let city = world.city;
  let sim = { ...world.sim, trust: moveTrust(world.sim.trust, layers, PETITION_TRUST.accept) };
  let effects = world.petitions.effects;
  let filed: World | null = null;
  if (e.kind === 'build' && entry.district !== undefined) {
    const district = entry.district;
    const at = buildSiteOf(world, terrain, e.type, district, () => homesCenter(world, district, p.layers ?? []));
    if (at && needsApplication(e.type)) {
      // 公共サービスは、その場所に申請を出す（費用は財政から取り分ける。否決・取り下げで戻る。15.1・22.1）
      filed = file(world, { kind: 'facility', target: { type: e.type, origin: at, rotation: 0 } }, cost.once, Math.floor(world.city.day), terrain);
    } else if (at) {
      const check = checkFacility({ ...city, funds: Number.MAX_SAFE_INTEGER }, terrain, e.type, at, 0);
      // 財政から払うので、開発資金は変えない
      city = { ...placeFacility(city, e.type, at, 0, { ...check, cost: 0 }) };
    }
  } else if (e.kind === 'power-cap') {
    sim = { ...sim, power: { ...sim.power, externalCapMW: sim.power.externalCapMW + e.mw } };
  }
  if (cost.weekly > 0 || 'weeks' in e) {
    effects = [...effects, { petitionId: p.id, untilWeek: week + cost.weeks, ...(entry.district !== undefined ? { district: entry.district } : {}) }];
  }
  if (filed) return { ...filed, sim: { ...filed.sim, trust: sim.trust }, petitions: { inbox, handled, effects } };
  return {
    ...world,
    city,
    sim,
    budget: cost.once > 0 ? { ...world.budget, treasury: round2(world.budget.treasury - cost.once) } : world.budget,
    petitions: { inbox, handled, effects },
  };
}

/** その週（week）に払う、受理した請願の毎週の費用 */
export function petitionSpend(world: Pick<World, 'petitions'>, rules: Pick<PoliticsRules, 'petitions'>, week: number): number {
  let sum = 0;
  for (const e of world.petitions.effects) {
    if (e.untilWeek < week) continue;
    const p = rules.petitions?.find((x) => x.id === e.petitionId);
    if (p) sum += acceptCost(p).weekly;
  }
  return round2(sum);
}
