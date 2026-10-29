import { cellKindAt, facilityFacesRoad, occupancyOf, type Occupancy } from '@/city/cells';
import { FACILITY_DEFS, footprintOf } from '@/city/facilities';
import { constructionStage } from '@/city/rules';
import { heightLevel, MAP_SIZE, type Terrain } from '@/city/terrain';
import type { Building, City, Facility, Point, RoadKind, ZoneKind } from '@/city/types';
import { DISTRICT_SIZE } from './rules';

/**
 * マスと地区の単位で見た都市（docs/game-design.md 13 章・docs/architecture.md 9.2）。
 * 毎週の計算の始めに 1 回作り、各計算が読む。都市の状態は書き換えない。
 */

export const SIZE = MAP_SIZE;
export const CELLS = SIZE * SIZE;
export const DISTRICTS_PER_SIDE = Math.ceil(SIZE / DISTRICT_SIZE);
export const DISTRICT_COUNT = DISTRICTS_PER_SIDE * DISTRICTS_PER_SIDE;

export const indexOf = (x: number, y: number): number => y * SIZE + x;
export const inMap = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < SIZE && y < SIZE;
export const districtOf = (x: number, y: number): number =>
  Math.floor(Math.max(0, Math.min(SIZE - 1, y)) / DISTRICT_SIZE) * DISTRICTS_PER_SIDE + Math.floor(Math.max(0, Math.min(SIZE - 1, x)) / DISTRICT_SIZE);
export const districtOfIndex = (i: number): number => districtOf(i % SIZE, Math.floor(i / SIZE));
/** 地区の中心（マス） */
export function districtCenter(d: number): Point {
  return { x: (d % DISTRICTS_PER_SIDE) * DISTRICT_SIZE + DISTRICT_SIZE / 2, y: Math.floor(d / DISTRICTS_PER_SIDE) * DISTRICT_SIZE + DISTRICT_SIZE / 2 };
}

export const ROAD_KINDS: readonly RoadKind[] = ['lane', 'street', 'avenue', 'bridge', 'roundabout'];
/** 同じマスに道路が重なる時、速い方を採る順 */
const ROAD_RANK: Record<RoadKind, number> = { lane: 0, street: 1, bridge: 2, roundabout: 3, avenue: 4 };

const NEIGHBORS: readonly [number, number][] = [[0, 1], [1, 0], [0, -1], [-1, 0]];

/** 区画の建物（建ち終わり、道路に面している物） */
export interface ZoneBuilding {
  building: Building;
  kind: ZoneKind;
  zoneId: string;
  cell: number;
  /** 地区（前の道路のマスの地区） */
  district: number;
  /** 前の道路のマス（面している道路のうち最初の 1 つ） */
  front: number;
}

/** 働いている施設（建ち終わり、道路に面している物） */
export interface ActiveFacility {
  facility: Facility;
  center: Point;
  district: number;
  /** 周りの道路のマス */
  fronts: number[];
}

export interface Space {
  city: City;
  terrain: Terrain;
  occ: Occupancy;
  /** マス → 道路の種類の番号（ROAD_KINDS。無ければ −1） */
  roadKind: Int8Array;
  /** マス → 道路の ID（重なれば速い方） */
  roadId: (string | undefined)[];
  /** 道路のマスの番号の一覧 */
  roadCells: number[];
  residential: ZoneBuilding[];
  /** 商業・オフィス・工業の建物 */
  workplaces: ZoneBuilding[];
  facilities: ActiveFacility[];
  parks: ActiveFacility[];
  /** 公共サービスと発電所（docs/city-design.md 9.2・9.4。道路に面している完成した物） */
  civic: ActiveFacility[];
  /** 褒賞の建物（docs/game-design.md 25 章。道路に面している完成した物） */
  awards: ActiveFacility[];
  /** 区画の ID → 譲歩で変わった性質（用途地域の変更の申請で塗った区画だけ） */
  zoneMods: Map<string, Record<string, number>>;
  /** 建物の ID → 区画の建物 */
  byBuilding: Map<string, ZoneBuilding>;
}

function frontRoad(x: number, y: number, roadKind: Int8Array): number {
  // cells.ts の frontOf と同じ順（+y・+x・−y・−x）
  for (const [dx, dy] of NEIGHBORS) {
    const nx = x + dx;
    const ny = y + dy;
    if (inMap(nx, ny) && (roadKind[indexOf(nx, ny)] ?? -1) >= 0) return indexOf(nx, ny);
  }
  return -1;
}

/** 施設の周り（敷地に接する）の道路のマス */
export function frontsOf(f: Facility, roadKind: Int8Array): number[] {
  const size = footprintOf(f.type, f.rotation);
  const out: number[] = [];
  for (let y = f.origin.y - 1; y <= f.origin.y + size.d; y += 1) {
    for (let x = f.origin.x - 1; x <= f.origin.x + size.w; x += 1) {
      const inside = x >= f.origin.x && x < f.origin.x + size.w && y >= f.origin.y && y < f.origin.y + size.d;
      const corner = (x === f.origin.x - 1 || x === f.origin.x + size.w) && (y === f.origin.y - 1 || y === f.origin.y + size.d);
      if (inside || corner || !inMap(x, y)) continue;
      if ((roadKind[indexOf(x, y)] ?? -1) >= 0) out.push(indexOf(x, y));
    }
  }
  return out;
}

export function facilityCenter(f: Facility): Point {
  const size = footprintOf(f.type, f.rotation);
  return { x: f.origin.x + size.w / 2, y: f.origin.y + size.d / 2 };
}

/** 都市を、マスと地区の単位で読む。day は建ち終わりの判定に使う */
export function spaceOf(city: City, terrain: Terrain): Space {
  const occ = occupancyOf(city);
  const roadKind = new Int8Array(CELLS).fill(-1);
  const roadId: (string | undefined)[] = new Array<string | undefined>(CELLS);
  const kindById = new Map(city.roads.map((r) => [r.id, r.kind]));
  for (const [key, ids] of occ.roadIds) {
    const [xs, ys] = key.split(',');
    const x = Number(xs);
    const y = Number(ys);
    if (!inMap(x, y)) continue;
    const i = indexOf(x, y);
    for (const id of ids) {
      const kind = kindById.get(id);
      if (!kind) continue;
      const cur = roadKind[i] ?? -1;
      if (cur < 0 || ROAD_RANK[kind] > ROAD_RANK[ROAD_KINDS[cur] as RoadKind]) {
        roadKind[i] = ROAD_KINDS.indexOf(kind);
        roadId[i] = id;
      }
    }
  }
  const roadCells: number[] = [];
  for (let i = 0; i < CELLS; i += 1) if ((roadKind[i] ?? -1) >= 0) roadCells.push(i);

  const zoneById = new Map(city.zones.map((z) => [z.id, z]));
  const residential: ZoneBuilding[] = [];
  const workplaces: ZoneBuilding[] = [];
  const byBuilding = new Map<string, ZoneBuilding>();
  for (const b of city.buildings) {
    const zone = zoneById.get(b.zoneId);
    if (!zone || !inMap(b.cell.x, b.cell.y)) continue;
    // 建て替え中（段が上がった建物）は、住む人も働く人も居続ける。新しく建つ途中の建物はまだ数えない
    if (b.level <= 1 && constructionStage(b.builtDay, city.day) !== 'done') continue;
    const front = frontRoad(b.cell.x, b.cell.y, roadKind);
    if (front < 0) continue;
    // 地区は前の道路のマスの地区（通勤はその道路から出る。建物のマスの地区に道路が無くても仕事に通える）
    const zb: ZoneBuilding = { building: b, kind: zone.kind, zoneId: zone.id, cell: indexOf(b.cell.x, b.cell.y), district: districtOfIndex(front), front };
    byBuilding.set(b.id, zb);
    if (zone.kind === 'residential') residential.push(zb);
    else workplaces.push(zb);
  }
  const facilities: ActiveFacility[] = [];
  const parks: ActiveFacility[] = [];
  const civic: ActiveFacility[] = [];
  const awards: ActiveFacility[] = [];
  const roadSet = occ.roads;
  for (const f of city.facilities) {
    const def = FACILITY_DEFS[f.type];
    if (f.state !== 'active' || !facilityFacesRoad(f, roadSet, def.group === 'facility')) continue;
    const center = facilityCenter(f);
    const fronts = frontsOf(f, roadKind);
    const first = fronts[0];
    const af: ActiveFacility = { facility: f, center, district: first !== undefined ? districtOfIndex(first) : districtOf(Math.floor(center.x), Math.floor(center.y)), fronts };
    if (def.group === 'facility') facilities.push(af);
    if (def.group === 'civic' || def.group === 'power') civic.push(af);
    if (def.group === 'award') awards.push(af);
    // 敷地の中に緑地を持つ施設（譲歩の green）と中央公園（緑地の行き届き。25 章）は、公園の類と同じく行き届きを足す
    if (def.group === 'park' || (def.group === 'facility' && (f.mods?.green ?? 0) > 0) || def.coverage?.kind === 'park') parks.push(af);
  }
  const zoneMods = new Map<string, Record<string, number>>();
  for (const z of city.zones) if (z.mods) zoneMods.set(z.id, z.mods);
  return { city, terrain, occ, roadKind, roadId, roadCells, residential, workplaces, facilities, parks, civic, awards, zoneMods, byBuilding };
}

/* ---------- 地形から決まる物（地形ごとに 1 回） ---------- */

const waterCache = new WeakMap<Terrain, Uint8Array>();

/** マスから 3 マス以内に水（海・川）があるか（地価の水辺。13.4） */
export function nearWater(terrain: Terrain, range: number): Uint8Array {
  const hit = waterCache.get(terrain);
  if (hit) return hit;
  const water = new Uint8Array(CELLS);
  for (let y = 0; y < SIZE; y += 1) for (let x = 0; x < SIZE; x += 1) {
    const k = cellKindAt(terrain, x, y);
    if (k === 'sea' || k === 'river') water[indexOf(x, y)] = 1;
  }
  const out = new Uint8Array(CELLS);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      if (water[indexOf(x, y)]) continue;
      let near = 0;
      for (let dy = -range; dy <= range && !near; dy += 1) {
        for (let dx = -range; dx <= range; dx += 1) {
          if (dx * dx + dy * dy > range * range) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (inMap(nx, ny) && water[indexOf(nx, ny)]) {
            near = 1;
            break;
          }
        }
      }
      out[indexOf(x, y)] = near;
    }
  }
  waterCache.set(terrain, out);
  return out;
}

const hillCache = new WeakMap<Terrain, Uint8Array>();

/** マスの中心の丘の段（地価の丘。13.4） */
export function hillLevels(terrain: Terrain): Uint8Array {
  const hit = hillCache.get(terrain);
  if (hit) return hit;
  const out = new Uint8Array(CELLS);
  for (let y = 0; y < SIZE; y += 1) for (let x = 0; x < SIZE; x += 1) out[indexOf(x, y)] = heightLevel(terrain, { x: x + 0.5, y: y + 0.5 });
  hillCache.set(terrain, out);
  return out;
}

/**
 * 海底ケーブルの陸揚げ所（docs/city-design.md 9.4）。初めに使える範囲（中央 24×24）の海岸のうち、中央に最も近いマス。
 * 範囲の中に海岸が無ければ、島の全体の海岸から中央に最も近いマス
 */
export function landingOf(terrain: Terrain, start: { x: number; y: number; w: number; h: number }): Point {
  const cx = start.x + start.w / 2;
  const cy = start.y + start.h / 2;
  let best: { p: Point; d: number; inside: boolean } | null = null;
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      if (cellKindAt(terrain, x, y) !== 'land') continue;
      const coast = NEIGHBORS.some(([dx, dy]) => cellKindAt(terrain, x + dx, y + dy) === 'sea');
      if (!coast) continue;
      const inside = x >= start.x && x < start.x + start.w && y >= start.y && y < start.y + start.h;
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (!best || (inside && !best.inside) || (inside === best.inside && d < best.d)) best = { p: { x, y }, d, inside };
    }
  }
  return best?.p ?? { x: 0, y: 0 };
}

export { NEIGHBORS };
