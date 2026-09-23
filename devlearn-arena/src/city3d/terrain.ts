import { TILE_METERS } from './palette';
import { between, unit } from './seed';
import type { Vec2 } from './model';

/**
 * 地面。8m のタイルの集合で、陸地の輪郭は曲線、川は蛇行する。
 *
 * 四角や菱形の地盤にしない（DESIGN.md §11）。
 * 海岸線は波打たせ、川はスプラインの中心線に幅を持たせたリボンとして描く。
 * 岸には砂の帯を付け、道路が川を渡る所には橋を架ける。
 *
 * ここは three に触れない。形にするのは `scene.ts`。
 */

export interface Bounds {
  w: number;
  d: number;
}

export type TileKind = 'grass' | 'dirt' | 'pavement' | 'water';

export interface TerrainTile {
  /** タイルの中心（メートル） */
  x: number;
  z: number;
  kind: TileKind;
  /** 草地の起伏。水は 0 */
  height: number;
}

export interface Bridge {
  at: Vec2;
  /** 橋の向き（Y 軸まわり）。道の向きに合わせる */
  angle: number;
  /** 渡す長さ */
  span: number;
  width: number;
}

export interface Terrain {
  seed: number;
  /** 島の広さ。街の外にも陸が続く */
  size: Bounds;
  /** 街（区域が並ぶ範囲）の広さ。島の真ん中に置かれる */
  city: Bounds;
  tiles: TerrainTile[];
  /** 陸地の輪郭。閉じた曲線の点列 */
  shore: Vec2[];
  /** 川の中心線 */
  river: Vec2[];
  riverWidth: number;
  /** 岸の砂の帯の幅 */
  sandWidth: number;
  /** 街の真ん中の広場の半径（舗装） */
  plazaRadius: number;
}

/** 海岸線の点の数。少ないと角ばって見える */
const SHORE_POINTS = 160;

/** 川の中心線の点の数 */
const RIVER_POINTS = 48;

const RIVER_WIDTH = 22;
const SAND_WIDTH = 5;

/**
 * 島は街より広い。街の外側にも陸があり、その先が海になる。
 * 街の四隅まで陸が届くように、この倍率は 1.3 より大きく取る。
 */
export const ISLAND_MARGIN = 1.55;

/**
 * 海岸線の元になる形の角ばり具合。2 なら楕円、大きいほど角が張る。
 * 3 にして街の四隅まで陸を届かせつつ、波で崩して丸い島に見せる。
 */
const SHORE_EXPONENT = 3;

/** 草地の起伏（メートル）。低いポリゴンの丘 */
export function groundHeight(x: number, z: number, seed: number): number {
  const a = between(seed, 101, 0, Math.PI * 2);
  const b = between(seed, 102, 0, Math.PI * 2);
  const wave = Math.sin(x * 0.021 + a) * 0.7 + Math.cos(z * 0.027 + b) * 0.5 + Math.sin((x + z) * 0.011 + a) * 0.3;
  // 水面より必ず高くする（草地が水没して見えないように）
  return Math.max(0.35, 0.9 + wave);
}

/**
 * 陸地の輪郭。楕円をうねらせた閉じた曲線にする。
 * 角の立った多角形にしないため、3 つの波を重ねている。
 */
export function shoreOutline(size: Bounds, seed: number): Vec2[] {
  const rx = (size.w / 2) * 0.96;
  const rz = (size.d / 2) * 0.96;
  const p1 = between(seed, 11, 0, Math.PI * 2);
  const p2 = between(seed, 12, 0, Math.PI * 2);
  const p3 = between(seed, 13, 0, Math.PI * 2);
  const round = (value: number): number => Math.sign(value) * Math.pow(Math.abs(value), 2 / SHORE_EXPONENT);
  const points: Vec2[] = [];
  for (let i = 0; i < SHORE_POINTS; i += 1) {
    const angle = (i / SHORE_POINTS) * Math.PI * 2;
    const wobble =
      1 + 0.08 * Math.sin(angle * 3 + p1) + 0.05 * Math.sin(angle * 5 + p2) + 0.025 * Math.sin(angle * 8 + p3);
    points.push({ x: round(Math.cos(angle)) * rx * wobble, z: round(Math.sin(angle)) * rz * wobble });
  }
  return points;
}

/**
 * 川の中心線。北から南へ、蛇行しながら流れる。
 * 直線に正弦波を重ねただけだが、点を細かく取るので滑らかな蛇行に見える。
 */
export function riverCenter(size: Bounds, seed: number): Vec2[] {
  const p1 = between(seed, 21, 0, Math.PI * 2);
  const p2 = between(seed, 22, 0, Math.PI * 2);
  const lean = between(seed, 23, -0.06, 0.06);
  const base = size.w * between(seed, 24, 0.23, 0.27);
  const points: Vec2[] = [];
  for (let i = 0; i < RIVER_POINTS; i += 1) {
    const t = i / (RIVER_POINTS - 1);
    const z = -size.d / 2 - TILE_METERS + t * (size.d + TILE_METERS * 2);
    const meander = Math.sin(t * Math.PI * 2.4 + p1) * size.w * 0.055 + Math.sin(t * Math.PI * 4.7 + p2) * size.w * 0.02;
    points.push({ x: base + meander + lean * z, z });
  }
  return points;
}

/** 点が閉じた輪郭の内側にあるか（交差数の偶奇で決める） */
export function inside(outline: readonly Vec2[], point: Vec2): boolean {
  let hit = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i, i += 1) {
    const a = outline[i];
    const b = outline[j];
    if (a === undefined || b === undefined) continue;
    const crosses = a.z > point.z !== b.z > point.z;
    if (!crosses) continue;
    const at = a.x + ((point.z - a.z) / (b.z - a.z)) * (b.x - a.x);
    if (point.x < at) hit = !hit;
  }
  return hit;
}

/** 線分と点の距離 */
export function distanceToSegment(point: Vec2, a: Vec2, b: Vec2): number {
  const vx = b.x - a.x;
  const vz = b.z - a.z;
  const len = vx * vx + vz * vz;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * vx + (point.z - a.z) * vz) / len));
  const dx = a.x + vx * t - point.x;
  const dz = a.z + vz * t - point.z;
  return Math.hypot(dx, dz);
}

/** 川の中心線までの距離 */
export function distanceToRiver(terrain: Terrain, point: Vec2): number {
  let best = Infinity;
  for (let i = 0; i + 1 < terrain.river.length; i += 1) {
    const a = terrain.river[i];
    const b = terrain.river[i + 1];
    if (a === undefined || b === undefined) continue;
    best = Math.min(best, distanceToSegment(point, a, b));
  }
  return best;
}

/** そこが陸か。海の外側でも川の中でもない所 */
export function isLand(terrain: Terrain, point: Vec2): boolean {
  if (!inside(terrain.shore, point)) return false;
  return distanceToRiver(terrain, point) > terrain.riverWidth / 2;
}

/** 建物を置いてよい所か。川岸の砂と水際は空けておく */
export function isBuildable(terrain: Terrain, point: Vec2): boolean {
  if (!inside(terrain.shore, point)) return false;
  return distanceToRiver(terrain, point) > terrain.riverWidth / 2 + terrain.sandWidth;
}

/** 川のリボン。中心線の両岸を返す */
export function riverBanks(terrain: Terrain, width: number): { left: Vec2[]; right: Vec2[] } {
  const left: Vec2[] = [];
  const right: Vec2[] = [];
  for (let i = 0; i < terrain.river.length; i += 1) {
    const here = terrain.river[i];
    const prev = terrain.river[Math.max(0, i - 1)];
    const next = terrain.river[Math.min(terrain.river.length - 1, i + 1)];
    if (here === undefined || prev === undefined || next === undefined) continue;
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len;
    const nz = dx / len;
    left.push({ x: here.x + nx * (width / 2), z: here.z + nz * (width / 2) });
    right.push({ x: here.x - nx * (width / 2), z: here.z - nz * (width / 2) });
  }
  return { left, right };
}

/** 2 本の線分の交点。交わらなければ null */
function crossPoint(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): Vec2 | null {
  const d = (a2.x - a1.x) * (b2.z - b1.z) - (a2.z - a1.z) * (b2.x - b1.x);
  if (Math.abs(d) < 1e-9) return null;
  const t = ((b1.x - a1.x) * (b2.z - b1.z) - (b1.z - a1.z) * (b2.x - b1.x)) / d;
  const u = ((b1.x - a1.x) * (a2.z - a1.z) - (b1.z - a1.z) * (a2.x - a1.x)) / d;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: a1.x + (a2.x - a1.x) * t, z: a1.z + (a2.z - a1.z) * t };
}

/**
 * 道が川を渡る所に橋を架ける。行き止まりを作らないための決まり。
 * 同じ場所に何本も架けないよう、近すぎる橋はまとめる。
 */
export function bridgesFor(terrain: Terrain, segments: readonly (readonly [Vec2, Vec2])[], width = 12): Bridge[] {
  const bridges: Bridge[] = [];
  for (const [a, b] of segments) {
    for (let i = 0; i + 1 < terrain.river.length; i += 1) {
      const r1 = terrain.river[i];
      const r2 = terrain.river[i + 1];
      if (r1 === undefined || r2 === undefined) continue;
      const at = crossPoint(a, b, r1, r2);
      if (at === null) continue;
      if (bridges.some((made) => Math.hypot(made.at.x - at.x, made.at.z - at.z) < terrain.riverWidth)) continue;
      bridges.push({
        at,
        angle: Math.atan2(b.x - a.x, b.z - a.z),
        span: terrain.riverWidth + terrain.sandWidth * 2 + TILE_METERS,
        width,
      });
      break;
    }
  }
  return bridges;
}

/** 地面のタイル。8m 四方で敷き詰める */
function tilesOf(terrain: Omit<Terrain, 'tiles'>): TerrainTile[] {
  const cols = Math.ceil(terrain.size.w / TILE_METERS) + 2;
  const rows = Math.ceil(terrain.size.d / TILE_METERS) + 2;
  const tiles: TerrainTile[] = [];
  const full: Terrain = { ...terrain, tiles: [] };
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = -terrain.size.w / 2 - TILE_METERS + (col + 0.5) * TILE_METERS;
      const z = -terrain.size.d / 2 - TILE_METERS + (row + 0.5) * TILE_METERS;
      const point = { x, z };
      const toRiver = distanceToRiver(full, point);
      let kind: TileKind = 'grass';
      if (!inside(terrain.shore, point) || toRiver <= terrain.riverWidth / 2) kind = 'water';
      else if (toRiver <= terrain.riverWidth / 2 + terrain.sandWidth) kind = 'dirt';
      else if (Math.hypot(x, z) <= terrain.plazaRadius) kind = 'pavement';
      tiles.push({
        x,
        z,
        kind,
        height: kind === 'water' ? 0 : kind === 'grass' ? groundHeight(x, z, terrain.seed) : 0.35,
      });
    }
  }
  return tiles;
}

/** その場所の地面の高さを引く。タイルの外（海の上）は 0 */
export function heightAt(terrain: Terrain): (point: Vec2) => number {
  const cell = TILE_METERS;
  const map = new Map<string, number>();
  for (const tile of terrain.tiles) {
    map.set(`${String(Math.round(tile.x / cell))},${String(Math.round(tile.z / cell))}`, tile.height);
  }
  return (point) => map.get(`${String(Math.round(point.x / cell))},${String(Math.round(point.z / cell))}`) ?? 0;
}

/** 街が載る所の高さ。道と建物の下はここまでならす */
export const CITY_LEVEL = 0.3;

/**
 * 街が載る所を平らにならす。
 * 道と建物の下が起伏していると、道が丘に埋まったり建物が浮いたりする。
 */
export function flatten(terrain: Terrain, spots: readonly { at: Vec2; radius: number }[]): Terrain {
  const cell = TILE_METERS;
  const level = new Set<string>();
  for (const spot of spots) {
    const span = Math.ceil(spot.radius / cell);
    const cx = Math.round(spot.at.x / cell);
    const cz = Math.round(spot.at.z / cell);
    for (let dx = -span; dx <= span; dx += 1) {
      for (let dz = -span; dz <= span; dz += 1) level.add(`${String(cx + dx)},${String(cz + dz)}`);
    }
  }
  return {
    ...terrain,
    tiles: terrain.tiles.map((tile) => {
      if (tile.kind === 'water') return tile;
      const key = `${String(Math.round(tile.x / cell))},${String(Math.round(tile.z / cell))}`;
      return level.has(key) ? { ...tile, height: CITY_LEVEL } : tile;
    }),
  };
}

/**
 * 地面を作る。街の広さを渡すと、その外側にも陸を広げた島になる。
 * 同じ広さと同じ seed からは必ず同じ地面になる。
 */
export function buildTerrain(city: Bounds, seed: number): Terrain {
  const size: Bounds = { w: city.w * ISLAND_MARGIN, d: city.d * ISLAND_MARGIN };
  const base: Omit<Terrain, 'tiles'> = {
    seed,
    size,
    city,
    shore: shoreOutline(size, seed),
    river: riverCenter(size, seed),
    riverWidth: RIVER_WIDTH + unit(seed, 31) * 6,
    sandWidth: SAND_WIDTH,
    plazaRadius: TILE_METERS * 2.5,
  };
  return { ...base, tiles: tilesOf(base) };
}
