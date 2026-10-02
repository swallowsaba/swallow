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
  techPower: number;
}

const ZONE_KINDS: ZoneKind[] = ['residential', 'commercial', 'office'];

function isDone(builtDay: number, day: number): boolean {
  return constructionStage(builtDay, day) === 'done';
}

/** 施設が働いているか（建設が終わり、道路に面している） */
function facilityWorks(f: Facility, roads: Set<string>): boolean {
  return f.state === 'active' && facilityFacesRoad(f, roads, FACILITY_DEFS[f.type].group === 'facility');
}

/** 都市規模・雇用・技術力。建ち終わり、道路に面した物だけを数える */
export function statsOf(city: City): CityStats {
  const occ = occupancyOf(city);
  const zoneKind = new Map(city.zones.map((z) => [z.id, z.kind]));
  let population = 0;
  let commercialJobs = 0;
  let officeJobs = 0;
  const pending: Record<ZoneKind, number> = { residential: 0, commercial: 0, office: 0 };
  for (const b of city.buildings) {
    const kind = zoneKind.get(b.zoneId);
    if (!kind || frontOf(b.cell, occ.roads) === null) continue;
    const amount = CAPACITY[kind][b.level - 1] ?? 0;
    if (!isDone(b.builtDay, city.day)) {
      pending[kind] += amount;
      continue;
    }
    if (kind === 'residential') population += amount;
    else if (kind === 'commercial') commercialJobs += amount;
    else officeJobs += amount;
  }
  let techPower = 0;
  let facilityJobs = 0;
  for (const f of city.facilities) {
    if (FACILITY_DEFS[f.type].group !== 'facility' || !facilityWorks(f, occ.roads)) continue;
    techPower += f.level;
    facilityJobs += f.level * FACILITY_JOBS_PER_LEVEL;
  }
  return { population, pending, jobs: commercialJobs + officeJobs + facilityJobs, commercialJobs, officeJobs, techPower };
}

/** マスの周りの良さ（近くの公園と施設の数）。区画の建物が育つ条件になる */
export function amenityAt(city: City, x: number, y: number, roads: Set<string>): number {
  let score = 0;
  for (const f of city.facilities) {
    if (!facilityWorks(f, roads)) continue;
    const def = FACILITY_DEFS[f.type];
    const cx = f.origin.x + def.w / 2;
    const cy = f.origin.y + def.d / 2;
    const dist = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
    if (def.group === 'park' && dist <= PARK_RADIUS + def.w / 2) score += 1;
    else if (def.group === 'facility' && dist <= FACILITY_RADIUS + def.w / 2) score += 1;
  }
  return score;
}

/** 1 日分の成長 */
function growOneDay(city: City, day: number): City {
  // 施設の建設が終わる
  const facilities = city.facilities.map((f) =>
    f.state === 'constructing' && day - f.builtDay >= BUILD_DAYS_PER_STAGE * 2 ? { ...f, state: 'active' as const } : f);
  let next: City = { ...city, day, facilities };
  const stats = statsOf(next);
  // 発展段階は下がらない。上がれば霧が晴れる
  const stage = Math.max(next.stage, stageOf(stats.techPower, stats.population)) as Stage;
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
        if (frontOf(c, occ.roads) === null) continue;
        empty.push({ x: c.x, y: c.y, zoneId: z.id, order: hash01(next.seed, day, c.x * 131 + c.y, 1) });
      }
    }
    empty.sort((a, b) => a.order - b.order);
    const unit = CAPACITY[kind][0];
    let built = 0;
    for (const c of empty) {
      if (room <= 0 || built >= NEW_PER_DAY) break;
      const id = nextId('b', ids);
      ids.push(id);
      buildings.push({ id, zoneId: c.zoneId, cell: { x: c.x, y: c.y }, variant: `${kind}:${String(Math.floor(hash01(next.seed, c.x, c.y, 2) * 1000))}`, level: 1, builtDay: day });
      room -= unit;
      built += 1;
    }
    // 育つ: 建ち終わった建物が、周りの良さに応じて一段上がる（建て替えとして建設の 3 段階を通る）
    if (room <= 0) continue;
    const candidates: { index: number; order: number }[] = [];
    buildings.forEach((b, index) => {
      if (zoneById.get(b.zoneId)?.kind !== kind || b.level >= cap || !isDone(b.builtDay, day)) return;
      if (frontOf(b.cell, occ.roads) === null) return;
      const amenity = amenityAt(next, b.cell.x, b.cell.y, occ.roads);
      if (amenity < b.level) return;
      candidates.push({ index, order: hash01(next.seed, day, b.cell.x * 131 + b.cell.y, 3) - amenity * 0.1 });
    });
    candidates.sort((a, b) => a.order - b.order);
    let upgraded = 0;
    for (const c of candidates) {
      if (room <= 0 || upgraded >= UPGRADES_PER_DAY) break;
      const b = buildings[c.index] as Building;
      const gain = (CAPACITY[kind][b.level] ?? 0) - (CAPACITY[kind][b.level - 1] ?? 0);
      buildings[c.index] = { ...b, level: b.level + 1, builtDay: day };
      room -= gain;
      upgraded += 1;
    }
  }
  next = { ...next, buildings };
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
  for (let d = Math.floor(city.day) + 1; d <= Math.floor(toDay); d += 1) next = growOneDay(next, d);
  return { ...next, day: toDay };
}
