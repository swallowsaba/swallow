import { footprintOf } from './facilities';
import type { Rotation } from './projection';
import { heightLevel, inRiver, pointInPolygon, type Terrain } from './terrain';
import type { Building, City, Facility, Point, Road, Zone } from './types';

/**
 * マスの単位で見た都市（docs/city-design.md 1 章: 1 マス = 道路 1 本分の幅）。
 * 地形の種類と、どのマスを何が使っているかを数える。配置の判定・成長・描く物が共有する。
 */

export const cellKey = (x: number, y: number): string => `${String(x)},${String(y)}`;

/* ---------- 地形の種類 ---------- */

export type CellKind = 'land' | 'river' | 'sea' | 'hill';
const KINDS: CellKind[] = ['land', 'river', 'sea', 'hill'];
const kindCache = new WeakMap<Terrain, Uint8Array>();

/**
 * マスの地形。中心と 4 隅の近くを調べ、1 つでも海なら海、川なら川、丘なら丘とする
 * （建物や道路が水や段差にはみ出さないように）。
 */
export function cellKindAt(t: Terrain, x: number, y: number): CellKind {
  if (x < 0 || y < 0 || x >= t.size || y >= t.size) return 'sea';
  let grid = kindCache.get(t);
  if (!grid) {
    grid = classify(t);
    kindCache.set(t, grid);
  }
  return KINDS[grid[y * t.size + x] ?? 2] as CellKind;
}

function classify(t: Terrain): Uint8Array {
  const out = new Uint8Array(t.size * t.size);
  const offsets: [number, number][] = [[0.5, 0.5], [0.15, 0.15], [0.85, 0.15], [0.85, 0.85], [0.15, 0.85]];
  for (let y = 0; y < t.size; y += 1) {
    for (let x = 0; x < t.size; x += 1) {
      const pts = offsets.map(([dx, dy]) => ({ x: x + dx, y: y + dy }));
      let kind = 0;
      if (pts.some((p) => !pointInPolygon(p, t.coast))) kind = 2;
      else if (pts.some((p) => inRiver(t, p))) kind = 1;
      else if (pts.some((p) => heightLevel(t, p) > 0)) kind = 3;
      out[y * t.size + x] = kind;
    }
  }
  return out;
}

/* ---------- 道路のマス ---------- */

/** 1 本の道路が通るマス（中心から道路の線までが道幅の半分未満）。ロータリーは中心の周りの 3×3 */
export function roadCellsOf(road: Road): Point[] {
  const out: Point[] = [];
  if (road.kind === 'roundabout') {
    const c = road.path[0];
    if (!c) return out;
    for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) out.push({ x: Math.floor(c.x) + dx, y: Math.floor(c.y) + dy });
    return out;
  }
  // 線の上を細かく歩き、通ったマスを集める。斜めに移る所は、間のマスを 1 つ足して上下左右につなげる
  const lanes = road.kind === 'avenue' ? [-0.49, 0.49] : [0];
  const seen = new Set<string>();
  const add = (x: number, y: number): void => {
    const k = cellKey(x, y);
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ x, y });
  };
  for (const lane of lanes) {
    let prev: Point | null = null;
    for (let i = 0; i + 1 < road.path.length; i += 1) {
      const a = road.path[i] as Point;
      const b = road.path[i + 1] as Point;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const nx = len > 0 ? -(b.y - a.y) / len : 0;
      const ny = len > 0 ? (b.x - a.x) / len : 0;
      const n = Math.max(1, Math.ceil(len / 0.05));
      for (let k = 0; k <= n; k += 1) {
        const t = k / n;
        const px = a.x + (b.x - a.x) * t + nx * lane;
        const py = a.y + (b.y - a.y) * t + ny * lane;
        const cell = { x: Math.floor(px), y: Math.floor(py) };
        if (prev && prev.x !== cell.x && prev.y !== cell.y) {
          // 斜めの隣: 線に近い方の角のマスでつなぐ
          const c1 = { x: cell.x, y: prev.y };
          const c2 = { x: prev.x, y: cell.y };
          const d1 = Math.hypot(c1.x + 0.5 - px, c1.y + 0.5 - py);
          const d2 = Math.hypot(c2.x + 0.5 - px, c2.y + 0.5 - py);
          const mid = d1 <= d2 ? c1 : c2;
          add(mid.x, mid.y);
        }
        add(cell.x, cell.y);
        prev = cell;
      }
    }
  }
  return out;
}

/** 道路が通るマスの集まり */
export function roadCells(roads: readonly Road[]): Set<string> {
  const out = new Set<string>();
  for (const road of roads) for (const c of roadCellsOf(road)) out.add(cellKey(c.x, c.y));
  return out;
}

/** 区画のマスが、どちらの道路に面しているか。面していなければ null（0: +y、3: +x、2: -y、1: -x） */
export function frontOf(cell: Point, roads: Set<string>): Rotation | null {
  if (roads.has(cellKey(cell.x, cell.y + 1))) return 0;
  if (roads.has(cellKey(cell.x + 1, cell.y))) return 3;
  if (roads.has(cellKey(cell.x, cell.y - 1))) return 2;
  if (roads.has(cellKey(cell.x - 1, cell.y))) return 1;
  return null;
}

/* ---------- 施設のマス ---------- */

export function facilityCells(f: Pick<Facility, 'type' | 'origin' | 'rotation'>): Point[] {
  const size = footprintOf(f.type, f.rotation);
  const out: Point[] = [];
  for (let y = 0; y < size.d; y += 1) for (let x = 0; x < size.w; x += 1) out.push({ x: f.origin.x + x, y: f.origin.y + y });
  return out;
}

/**
 * 施設の入口の前のマス（向き 0 は +y、90 は -x、180 は -y、270 は +x。scene の向きと同じ）。
 * 入口がこのマスの道路に面していれば、施設は道路に面している。
 */
export function entranceCells(f: Pick<Facility, 'type' | 'origin' | 'rotation'>): Point[] {
  const size = footprintOf(f.type, f.rotation);
  const { x: ox, y: oy } = f.origin;
  const out: Point[] = [];
  switch (f.rotation) {
    case 0:
      for (let x = 0; x < size.w; x += 1) out.push({ x: ox + x, y: oy + size.d });
      break;
    case 90:
      for (let y = 0; y < size.d; y += 1) out.push({ x: ox - 1, y: oy + y });
      break;
    case 180:
      for (let x = 0; x < size.w; x += 1) out.push({ x: ox + x, y: oy - 1 });
      break;
    case 270:
      for (let y = 0; y < size.d; y += 1) out.push({ x: ox + size.w, y: oy + y });
      break;
  }
  return out;
}

/** 敷地の周りの全てのマス（向きの無い公園の類が道路に面しているか） */
export function aroundCells(f: Pick<Facility, 'type' | 'origin' | 'rotation'>): Point[] {
  return ([0, 90, 180, 270] as const).flatMap((rotation) => entranceCells({ ...f, rotation }));
}

/* ---------- 使われているマス ---------- */

export interface Occupancy {
  roads: Set<string>;
  /** マス → 道路の ID */
  roadIds: Map<string, string[]>;
  zones: Map<string, Zone>;
  buildings: Map<string, Building>;
  facilities: Map<string, Facility>;
}

export function occupancyOf(city: City): Occupancy {
  const roads = new Set<string>();
  const roadIds = new Map<string, string[]>();
  for (const road of city.roads) {
    for (const c of roadCellsOf(road)) {
      const k = cellKey(c.x, c.y);
      roads.add(k);
      const list = roadIds.get(k);
      if (list) list.push(road.id);
      else roadIds.set(k, [road.id]);
    }
  }
  const zones = new Map<string, Zone>();
  for (const z of city.zones) for (const c of z.cells) zones.set(cellKey(c.x, c.y), z);
  const buildings = new Map<string, Building>();
  for (const b of city.buildings) buildings.set(cellKey(b.cell.x, b.cell.y), b);
  const facilities = new Map<string, Facility>();
  for (const f of city.facilities) for (const c of facilityCells(f)) facilities.set(cellKey(c.x, c.y), f);
  return { roads, roadIds, zones, buildings, facilities };
}

/** 施設が道路に面しているか（分野の施設は入口が、公園の類はどこかの辺が） */
export function facilityFacesRoad(f: Pick<Facility, 'type' | 'origin' | 'rotation'>, roads: Set<string>, needsEntrance: boolean): boolean {
  const cells = needsEntrance ? entranceCells(f) : aroundCells(f);
  return cells.some((c) => roads.has(cellKey(c.x, c.y)));
}
