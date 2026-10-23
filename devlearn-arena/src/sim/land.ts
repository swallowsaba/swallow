import type { Point } from '@/city/types';
import { reach } from './network';
import {
  LAND_BASE, LAND_FACILITY, LAND_HILL_STEP, LAND_JOBS, LAND_NOISE, LAND_PARK_MAX, LAND_ROAD, LAND_WATER, NIGHT_FACILITIES, NOISE, PARK_REACH,
  piecewise,
} from './rules';
import { CELLS, DISTRICT_COUNT, districtOfIndex, hillLevels, indexOf, inMap, nearWater, NEIGHBORS, ROAD_KINDS, SIZE, type Space } from './space';
import type { CauseKind } from './types';

/**
 * 騒音・公園の行き届き・地価（docs/game-design.md 13.4・24.2）。
 * 全て足し算で書き、項ごとに原因（どの建物・道路・区画か）を持つ（0 章の因果のため）。
 */

export interface Source {
  kind: CauseKind;
  id: string;
  at: Point;
}

/** 騒音の発生源 */
export interface NoiseSource extends Source {
  value: number;
  radius: number;
}

export interface LandField {
  noise: Float32Array;
  noiseSources: NoiseSource[];
  /** 地区 → その地区に届きうる騒音の発生源（原因を探す時に使う） */
  noiseByDistrict: NoiseSource[][];
  /** 道路のマス → 公園の行き届き（0〜1）と、一番効いている公園の番号 */
  parkRoad: Float32Array;
  parkRoadSrc: Int32Array;
  /** マスごとの地価 */
  land: Float32Array;
}

/** 距離に比例して薄まり、半径で 0 */
const falloff = (d: number, r: number): number => (d >= r ? 0 : 1 - d / r);

/** 譲歩で変わった性質（docs/game-design.md 17.1。G5 で mods に入る）。夜の騒音の倍率 */
function nightNoiseFactor(mods: Record<string, number> | undefined): number {
  return mods?.nightNoise ?? 1;
}

export function noiseSourcesOf(space: Space): NoiseSource[] {
  const out: NoiseSource[] = [];
  for (const w of space.workplaces) {
    const b = w.building;
    const at = { x: b.cell.x + 0.5, y: b.cell.y + 0.5 };
    if (w.kind === 'industrial') out.push({ kind: 'building', id: b.id, at, value: b.level * NOISE.industrialPerLevel, radius: NOISE.industrialRadius });
    else if (w.kind === 'commercial') out.push({ kind: 'building', id: b.id, at, value: NOISE.commercial, radius: NOISE.commercialRadius });
  }
  for (const i of space.roadCells) {
    if (ROAD_KINDS[space.roadKind[i] as number] !== 'avenue') continue;
    out.push({ kind: 'road', id: space.roadId[i] ?? '', at: { x: (i % SIZE) + 0.5, y: Math.floor(i / SIZE) + 0.5 }, value: NOISE.avenue, radius: NOISE.avenueRadius });
  }
  for (const af of space.facilities) {
    const f = af.facility;
    if (!(NIGHT_FACILITIES as readonly string[]).includes(f.type)) continue;
    const value = (NOISE.nightBase + f.level * NOISE.nightPerLevel) * nightNoiseFactor((f as { mods?: Record<string, number> }).mods);
    if (value > 0) out.push({ kind: 'facility', id: f.id, at: af.center, value, radius: NOISE.nightRadius });
  }
  return out;
}

/** マスの中心での、発生源 1 つの騒音 */
export function noiseAt(s: NoiseSource, x: number, y: number): number {
  return s.value * falloff(Math.hypot(x + 0.5 - s.at.x, y + 0.5 - s.at.y), s.radius);
}

function stampNoise(sources: readonly NoiseSource[]): { noise: Float32Array; byDistrict: NoiseSource[][] } {
  const noise = new Float32Array(CELLS);
  const byDistrict: NoiseSource[][] = Array.from({ length: DISTRICT_COUNT }, () => []);
  for (const s of sources) {
    const r = Math.ceil(s.radius);
    const cx = Math.floor(s.at.x);
    const cy = Math.floor(s.at.y);
    const touched = new Set<number>();
    for (let y = cy - r; y <= cy + r; y += 1) {
      for (let x = cx - r; x <= cx + r; x += 1) {
        if (!inMap(x, y)) continue;
        const v = noiseAt(s, x, y);
        if (v <= 0) continue;
        const i = indexOf(x, y);
        noise[i] = (noise[i] as number) + v;
        touched.add(districtOfIndex(i));
      }
    }
    for (const d of touched) byDistrict[d]?.push(s);
  }
  for (let i = 0; i < CELLS; i += 1) noise[i] = Math.min(100, noise[i] as number);
  return { noise, byDistrict };
}

/** 道路のマスごとの、公園の類の行き届き（道路の距離で 1 → 行き届く距離で 0。重なれば大きい方） */
function parkCoverage(space: Space): { cover: Float32Array; src: Int32Array } {
  const cover = new Float32Array(CELLS);
  const src = new Int32Array(CELLS).fill(-1);
  space.parks.forEach((p, n) => {
    const range = PARK_REACH[p.facility.type] ?? 0;
    if (range <= 0 || p.fronts.length === 0) return;
    for (const [i, d] of reach(space, p.fronts, range)) {
      const v = falloff(d, range);
      if (v > (cover[i] as number)) {
        cover[i] = v;
        src[i] = n;
      }
    }
  });
  return { cover, src };
}

/** マスの前の道路の、公園の行き届き（面している道路のうち一番大きい物） */
export function parkAt(field: Pick<LandField, 'parkRoad' | 'parkRoadSrc'>, x: number, y: number): { value: number; park: number } {
  let value = 0;
  let park = -1;
  for (const [dx, dy] of NEIGHBORS) {
    const nx = x + dx;
    const ny = y + dy;
    if (!inMap(nx, ny)) continue;
    const i = indexOf(nx, ny);
    const v = field.parkRoad[i] as number;
    if (v > value) {
      value = v;
      park = field.parkRoadSrc[i] as number;
    }
  }
  return { value, park };
}

/** 道路に面する値（面している道路のうち一番大きい物）と、その道路 */
function roadFront(space: Space, x: number, y: number): { value: number; id: string | undefined } {
  let value = 0;
  let id: string | undefined;
  for (const [dx, dy] of NEIGHBORS) {
    const nx = x + dx;
    const ny = y + dy;
    if (!inMap(nx, ny)) continue;
    const i = indexOf(nx, ny);
    const k = space.roadKind[i] ?? -1;
    if (k < 0) continue;
    const v = LAND_ROAD[ROAD_KINDS[k] ?? 'lane'] ?? 0;
    if (v > value || id === undefined) {
      value = Math.max(value, v);
      id = space.roadId[i];
    }
  }
  return { value, id };
}

/** 仕事への近さ（その地区からの平均の通勤時間。20 分以下で +20、60 分で 0） */
export function jobsNearValue(commuteMinutes: number): number {
  if (!Number.isFinite(commuteMinutes)) return 0;
  return piecewise([[LAND_JOBS.near, LAND_JOBS.max], [LAND_JOBS.far, 0]], commuteMinutes);
}

/** 地価の項（原因つき） */
export interface LandTerm {
  source: Source;
  value: number;
}

/**
 * マスの地価の項を全て並べる（13.4 の式の順）。合計が地価。
 * commute: 地区ごとの平均の通勤時間（分）
 */
export function landTermsAt(space: Space, field: Pick<LandField, 'parkRoad' | 'parkRoadSrc' | 'noise' | 'noiseByDistrict'>, commute: Float32Array, x: number, y: number, zoneId: string): LandTerm[] {
  const at = { x: x + 0.5, y: y + 0.5 };
  const here: Source = { kind: 'zone', id: zoneId, at };
  const terms: LandTerm[] = [{ source: here, value: LAND_BASE }];
  const road = roadFront(space, x, y);
  if (road.value > 0 && road.id) terms.push({ source: { kind: 'road', id: road.id, at }, value: road.value });
  const park = parkAt(field, x, y);
  const parkFacility = park.park >= 0 ? space.parks[park.park] : undefined;
  if (park.value > 0 && parkFacility) terms.push({ source: { kind: 'facility', id: parkFacility.facility.id, at: parkFacility.center }, value: park.value * LAND_PARK_MAX });
  const jobs = jobsNearValue(commute[districtOfIndex(indexOf(x, y))] ?? Infinity);
  if (jobs > 0) terms.push({ source: { kind: 'demand', id: 'jobs-near', at }, value: jobs });
  if (nearWater(space.terrain, LAND_WATER.range)[indexOf(x, y)]) terms.push({ source: here, value: LAND_WATER.value });
  const hill = hillLevels(space.terrain)[indexOf(x, y)] as number;
  if (hill > 0) terms.push({ source: here, value: hill * LAND_HILL_STEP });
  for (const af of space.facilities) {
    const d = Math.hypot(at.x - af.center.x, at.y - af.center.y);
    const v = af.facility.level * LAND_FACILITY.perLevel * falloff(d, LAND_FACILITY.radius);
    if (v > 0) terms.push({ source: { kind: 'facility', id: af.facility.id, at: af.center }, value: v });
  }
  const i = indexOf(x, y);
  if ((field.noise[i] as number) > 0) {
    for (const s of field.noiseByDistrict[districtOfIndex(i)] ?? []) {
      const v = noiseAt(s, x, y);
      if (v > 0) terms.push({ source: s, value: -v * LAND_NOISE });
    }
  }
  return terms;
}

/** 騒音の原因（マスの騒音を、発生源ごとに分ける） */
export function noiseTermsAt(field: Pick<LandField, 'noise' | 'noiseByDistrict'>, x: number, y: number): LandTerm[] {
  const i = indexOf(x, y);
  if ((field.noise[i] as number) <= 0) return [];
  const out: LandTerm[] = [];
  for (const s of field.noiseByDistrict[districtOfIndex(i)] ?? []) {
    const v = noiseAt(s, x, y);
    if (v > 0) out.push({ source: s, value: v });
  }
  return out;
}

/** 騒音・公園の行き届き・地価を、全てのマスで計算する */
export function landFieldOf(space: Space, commute: Float32Array): LandField {
  const noiseSources = noiseSourcesOf(space);
  const { noise, byDistrict } = stampNoise(noiseSources);
  const { cover, src } = parkCoverage(space);
  const field = { noise, noiseByDistrict: byDistrict, parkRoad: cover, parkRoadSrc: src };
  const land = new Float32Array(CELLS);
  const water = nearWater(space.terrain, LAND_WATER.range);
  const hills = hillLevels(space.terrain);
  // 全てのマスの地価（ヒートマップ用）。原因は持たず、値だけを足す
  const facilityBoost = new Float32Array(CELLS);
  for (const af of space.facilities) {
    const r = LAND_FACILITY.radius;
    for (let y = Math.floor(af.center.y - r); y <= Math.ceil(af.center.y + r); y += 1) {
      for (let x = Math.floor(af.center.x - r); x <= Math.ceil(af.center.x + r); x += 1) {
        if (!inMap(x, y)) continue;
        const v = af.facility.level * LAND_FACILITY.perLevel * falloff(Math.hypot(x + 0.5 - af.center.x, y + 0.5 - af.center.y), r);
        if (v > 0) facilityBoost[indexOf(x, y)] = (facilityBoost[indexOf(x, y)] as number) + v;
      }
    }
  }
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const i = indexOf(x, y);
      let v = LAND_BASE + roadFront(space, x, y).value + parkAt(field, x, y).value * LAND_PARK_MAX;
      v += jobsNearValue(commute[districtOfIndex(i)] ?? Infinity);
      if (water[i]) v += LAND_WATER.value;
      v += (hills[i] as number) * LAND_HILL_STEP;
      v += facilityBoost[i] as number;
      v -= (noise[i] as number) * LAND_NOISE;
      land[i] = v;
    }
  }
  return { ...field, noiseSources, land };
}
