import { stageOf, type Stage } from '@/game/stage';
import { cellKey, facilityFacesRoad, frontOf, occupancyOf } from './cells';
import { FACILITY_DEFS } from './facilities';
import { nextId } from './place';
import { hash01 } from './random';
import {
  BUILD_DAYS_PER_STAGE, CAPACITY, constructionStage, demandOf, FACILITY_JOBS_PER_LEVEL, FACILITY_RADIUS, isRevealed, levelCap,
  NEW_PER_DAY, PARK_RADIUS, revealedFor, UPGRADES_PER_DAY,
} from './rules';
import type { Building, City, Facility, ZoneKind } from './types';

/**
 * 都市の成長（docs/game-design.md 7 章・docs/city-design.md 3 章）。
 * 区画は道路に面し、需要があると建物が建つ。施設と公園は周りの区画の育ちを良くする。
 * 日付が 1 日進むごとに計算する。同じ状態と同じ日付からは、必ず同じ都市になる（seed）。
 */

export interface CityStats {
  population: number;
  /** 建設中の建物が建ち終わると増える人と仕事（区画の種類ごと）。需要から先に引いておく */
  pending: Record<ZoneKind, number>;
  jobs: number;
  commercialJobs: number;
  officeJobs: number;
  industrialJobs: number;
  techPower: number;
  /** 道路網の大きさ（道路のマスの数。工業の需要） */
  roadCells: number;
  /** 低と中の帯の失業者の数（工業の需要）。都市の模擬（src/sim）が渡す。渡さなければ 0 */
  unemployedLowMid: number;
}

const ZONE_KINDS: ZoneKind[] = ['residential', 'commercial', 'office', 'industrial'];

/** 都市の模擬（src/sim）が 1 日の成長に渡す物 */
export interface GrowOptions {
  /** 低と中の帯の失業者の数（工業の需要。docs/game-design.md 23 章） */
  unemployedLowMid?: number;
  /** 周りの良さで建物の段を上げる区画の種類（既定は全て）。模擬は、事業者の建物の段を事業者の成長で上げる（13.3） */
  upgradeKinds?: readonly ZoneKind[];
  /** 都市規模を、建物の大きさからでなく、今の city.population（模擬の住民の合計）のまま使う */
  simPopulation?: boolean;
}

function isDone(builtDay: number, day: number): boolean {
  return constructionStage(builtDay, day) === 'done';
}

const frontCache = new WeakMap<Set<string>, Map<number, boolean>>();

/** マスが道路に面しているか（同じ道路の集まりからは、前の結果を使い回す。毎日の計算を軽くする） */
function facesRoad(cell: { x: number; y: number }, roads: Set<string>): boolean {
  let m = frontCache.get(roads);
  if (!m) {
    m = new Map();
    frontCache.set(roads, m);
  }
  const k = cell.x * 1024 + cell.y;
  let v = m.get(k);
  if (v === undefined) {
    v = frontOf(cell, roads) !== null;
    m.set(k, v);
  }
  return v;
}

/** 施設が働いているか（建設が終わり、道路に面している） */
function facilityWorks(f: Facility, roads: Set<string>): boolean {
  return f.state === 'active' && facilityFacesRoad(f, roads, FACILITY_DEFS[f.type].group === 'facility');
}

/** 都市規模・雇用・技術力。建ち終わり、道路に面した物だけを数える */
export function statsOf(city: City, unemployedLowMid = 0): CityStats {
  const occ = occupancyOf(city);
  const zoneKind = new Map(city.zones.map((z) => [z.id, z.kind]));
  let population = 0;
  let commercialJobs = 0;
  let officeJobs = 0;
  let industrialJobs = 0;
  const pending: Record<ZoneKind, number> = { residential: 0, commercial: 0, office: 0, industrial: 0 };
  for (const b of city.buildings) {
    const kind = zoneKind.get(b.zoneId);
    if (!kind || !facesRoad(b.cell, occ.roads)) continue;
    const amount = CAPACITY[kind][b.level - 1] ?? 0;
    if (!isDone(b.builtDay, city.day)) {
      pending[kind] += amount;
      continue;
    }
    if (kind === 'residential') population += amount;
    else if (kind === 'commercial') commercialJobs += amount;
    else if (kind === 'office') officeJobs += amount;
    else industrialJobs += amount;
  }
  let techPower = 0;
  let facilityJobs = 0;
  for (const f of city.facilities) {
    if (FACILITY_DEFS[f.type].group !== 'facility' || !facilityWorks(f, occ.roads)) continue;
    techPower += f.level;
    facilityJobs += f.level * FACILITY_JOBS_PER_LEVEL;
  }
  return {
    population, pending, jobs: commercialJobs + officeJobs + industrialJobs + facilityJobs, commercialJobs, officeJobs, industrialJobs, techPower,
    roadCells: occ.roads.size, unemployedLowMid,
  };
}

/** 周りの良さを数える物（働いている公園と施設の中心と、届く距離） */
interface AmenitySource {
  cx: number;
  cy: number;
  reach: number;
}

const amenityCache = new WeakMap<readonly Facility[], WeakMap<Set<string>, AmenitySource[]>>();

/** 働いている公園と施設（同じ施設の配列と道路からは、前の結果を使い回す） */
function amenitySources(city: City, roads: Set<string>): AmenitySource[] {
  let byRoads = amenityCache.get(city.facilities);
  if (!byRoads) {
    byRoads = new WeakMap();
    amenityCache.set(city.facilities, byRoads);
  }
  const hit = byRoads.get(roads);
  if (hit) return hit;
  const out: AmenitySource[] = [];
  for (const f of city.facilities) {
    if (!facilityWorks(f, roads)) continue;
    const def = FACILITY_DEFS[f.type];
    if (def.group !== 'park' && def.group !== 'facility') continue;
    out.push({ cx: f.origin.x + def.w / 2, cy: f.origin.y + def.d / 2, reach: (def.group === 'park' ? PARK_RADIUS : FACILITY_RADIUS) + def.w / 2 });
  }
  byRoads.set(roads, out);
  return out;
}

const amenityCellCache = new WeakMap<AmenitySource[], Map<number, number>>();

/** マスの周りの良さ（近くの公園と施設の数）。区画の建物が育つ条件になる */
export function amenityAt(city: City, x: number, y: number, roads: Set<string>): number {
  const sources = amenitySources(city, roads);
  let m = amenityCellCache.get(sources);
  if (!m) {
    m = new Map();
    amenityCellCache.set(sources, m);
  }
  const k = x * 1024 + y;
  const hit = m.get(k);
  if (hit !== undefined) return hit;
  let score = 0;
  for (const a of sources) if (Math.hypot(x + 0.5 - a.cx, y + 0.5 - a.cy) <= a.reach) score += 1;
  m.set(k, score);
  return score;
}

/**
 * order の小さい順に k 個（並べ替えの結果の先頭 k 個と同じ。同じ値なら元の順）。
 * 1 日に建つ・育つ数は少ないので、全てを並べ替えずに選ぶ（毎日の計算を軽くする）
 */
function smallest<T extends { order: number }>(items: readonly T[], k: number): T[] {
  const out: T[] = [];
  for (const it of items) {
    if (out.length === k && it.order >= (out[k - 1] as T).order) continue;
    let i = out.length;
    while (i > 0 && (out[i - 1] as T).order > it.order) i -= 1;
    out.splice(i, 0, it);
    if (out.length > k) out.pop();
  }
  return out;
}

/** 1 日分の成長 */
export function growDay(city: City, day: number, options: GrowOptions = {}): City {
  // 施設の建設が終わる
  const finishing = city.facilities.some((f) => f.state === 'constructing' && day - f.builtDay >= BUILD_DAYS_PER_STAGE * 2);
  const facilities = finishing
    ? city.facilities.map((f) => (f.state === 'constructing' && day - f.builtDay >= BUILD_DAYS_PER_STAGE * 2 ? { ...f, state: 'active' as const } : f))
    : city.facilities;
  let next: City = { ...city, day, facilities };
  const stats = statsOf(next, options.unemployedLowMid ?? 0);
  // 発展段階は下がらない。上がれば霧が晴れる
  const stage = Math.max(next.stage, stageOf(stats.techPower, options.simPopulation ? city.population : stats.population)) as Stage;
  next = { ...next, stage, revealed: stage === city.stage ? next.revealed : revealedFor(stage) };

  const demand = demandOf(stats);
  const occ = occupancyOf(next);
  const zoneById = new Map(next.zones.map((z) => [z.id, z]));
  const buildings: Building[] = [...next.buildings];
  const ids = buildings.map((b) => b.id);
  const cap = levelCap(stage);

  for (const kind of ZONE_KINDS) {
    let room = demand[kind] - stats.pending[kind];
    if (room <= 0) continue;
    // 新しく建つ: 道路に面した空きの区画のマス。場所ごとの値で順を決める
    const empty: { x: number; y: number; zoneId: string; order: number }[] = [];
    for (const z of next.zones) {
      if (z.kind !== kind) continue;
      for (const c of z.cells) {
        const k = cellKey(c.x, c.y);
        if (occ.buildings.has(k) || !isRevealed(next.revealed, c.x, c.y)) continue;
        if (!facesRoad(c, occ.roads)) continue;
        empty.push({ x: c.x, y: c.y, zoneId: z.id, order: hash01(next.seed, day, c.x * 131 + c.y, 1) });
      }
    }
    const unit = CAPACITY[kind][0];
    let built = 0;
    for (const c of smallest(empty, NEW_PER_DAY)) {
      if (room <= 0 || built >= NEW_PER_DAY) break;
      const id = nextId('b', ids);
      ids.push(id);
      buildings.push({ id, zoneId: c.zoneId, cell: { x: c.x, y: c.y }, variant: `${kind}:${String(Math.floor(hash01(next.seed, c.x, c.y, 2) * 1000))}`, level: 1, builtDay: day });
      room -= unit;
      built += 1;
    }
    // 育つ: 建ち終わった建物が、周りの良さに応じて一段上がる（建て替えとして建設の 3 段階を通る）
    if (room <= 0 || (options.upgradeKinds && !options.upgradeKinds.includes(kind))) continue;
    const candidates: { index: number; order: number }[] = [];
    buildings.forEach((b, index) => {
      if (zoneById.get(b.zoneId)?.kind !== kind || b.level >= cap || !isDone(b.builtDay, day)) return;
      if (!facesRoad(b.cell, occ.roads)) return;
      const amenity = amenityAt(next, b.cell.x, b.cell.y, occ.roads);
      if (amenity < b.level) return;
      candidates.push({ index, order: hash01(next.seed, day, b.cell.x * 131 + b.cell.y, 3) - amenity * 0.1 });
    });
    let upgraded = 0;
    for (const c of smallest(candidates, UPGRADES_PER_DAY)) {
      if (room <= 0 || upgraded >= UPGRADES_PER_DAY) break;
      const b = buildings[c.index] as Building;
      const gain = (CAPACITY[kind][b.level] ?? 0) - (CAPACITY[kind][b.level - 1] ?? 0);
      buildings[c.index] = { ...b, level: b.level + 1, builtDay: day };
      room -= gain;
      upgraded += 1;
    }
  }
  next = { ...next, buildings };
  if (options.simPopulation) {
    // 都市規模は模擬の住民の合計のまま。技術力だけを数え直す（施設の Lv の合計）
    const roads = occupancyOf(next).roads;
    let techPower = 0;
    for (const f of next.facilities) if (FACILITY_DEFS[f.type].group === 'facility' && facilityWorks(f, roads)) techPower += f.level;
    return { ...next, population: city.population, techPower };
  }
  const after = statsOf(next);
  return { ...next, population: after.population, techPower: after.techPower };
}

/**
 * 都市の日付を toDay まで進める。日付の整数をまたぐたびに 1 日分の成長を計算する。
 * 途中の小数の日付は、建設の段階と車・人の動きにだけ使う。
 */
export function advance(city: City, toDay: number): City {
  if (toDay <= city.day) return city;
  let next = city;
  for (let d = Math.floor(city.day) + 1; d <= Math.floor(toDay); d += 1) next = growDay(next, d);
  return { ...next, day: toDay };
}
