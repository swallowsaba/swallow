import { TILE_METERS } from './palette';
import { between, unit } from './seed';
import { bridgesFor, distanceToSegment, inside, type Bridge, type Terrain } from './terrain';
import type { LayoutDistrict, Vec2 } from './model';

/**
 * 道路。押し出したメッシュの元になる中心線を作る。
 *
 * 決まり（DESIGN.md §4 と §11）。
 * - 縁石・車線の白線・横断歩道を持つ
 * - 交差点では道が繋がる。行き止まりを作らない
 * - 格子の道とは別に、弧を描く大通りを 1 本通す
 * - 主要な交差点はロータリーにする
 * - 川を渡る所には橋を架ける
 *
 * ここは three に触れない。形にするのは `scene.ts`。
 */

export type RoadClass = 'boulevard' | 'street' | 'lane';

export interface RoadPath {
  id: string;
  kind: RoadClass;
  /** 中心線。点が多いほど滑らかな曲線になる */
  points: Vec2[];
  width: number;
  /** 輪になっているか（海沿いの環状路や区域を囲む道） */
  closed: boolean;
  /** いまこの道を何かが通っているか */
  active: boolean;
  /** 塞がっているか。ケーブルが抜けた道のように、通ろうとしても通れない所 */
  blocked: boolean;
}

export interface Roundabout {
  at: Vec2;
  /** 環道の外側の半径 */
  radius: number;
  /** 環道の幅 */
  laneWidth: number;
  /** 中央の緑地の半径 */
  gardenRadius: number;
}

export interface Crosswalk {
  at: Vec2;
  /** 道の向き（Y 軸まわり）。縞はこの向きに並ぶ */
  angle: number;
  /** 道を横切る長さ */
  length: number;
  /** 縞の帯の幅 */
  width: number;
}

export interface RoadNetwork {
  roads: RoadPath[];
  roundabouts: Roundabout[];
  crosswalks: Crosswalk[];
  bridges: Bridge[];
  /** 道と道が出会う所 */
  junctions: Vec2[];
}

export interface RoadInput {
  /** 街（区域が並ぶ範囲）の広さ */
  size: { w: number; d: number };
  districts: readonly LayoutDistrict[];
  terrain: Terrain;
  seed: number;
  /** 建物どうしを結ぶ道（ネットワークのリンクやバス路線） */
  links?: readonly { id: string; from: Vec2; to: Vec2; active: boolean; blocked: boolean }[];
}

export const ROAD_WIDTH: Record<RoadClass, number> = {
  boulevard: 16,
  street: 11,
  lane: 7,
};

/** ロータリーの外径 */
const ROUNDABOUT_RADIUS = 26;

/** 海沿いの環状路を、海岸線からどれだけ内側に取るか */
const COAST_INSET = 0.93;

/* ------------ 線の道具 ------------ */

function lengthOf(points: readonly Vec2[]): number {
  let sum = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    if (a === undefined || b === undefined) continue;
    sum += Math.hypot(b.x - a.x, b.z - a.z);
  }
  return sum;
}

function lerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
}

/** 輪の内側に入っている所だけを残す。いちばん長い一続きを返す */
export function clipToLoop(points: readonly Vec2[], loop: readonly Vec2[]): Vec2[] {
  const runs: Vec2[][] = [];
  let run: Vec2[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const here = points[i];
    if (here === undefined) continue;
    if (inside(loop, here)) {
      if (run.length === 0) {
        const prev = points[i - 1];
        // 外から入ってきた所は、輪との境目を足してから続ける
        if (prev !== undefined) run.push(crossing(prev, here, loop));
      }
      run.push(here);
      continue;
    }
    if (run.length > 0) {
      const prev = points[i - 1];
      if (prev !== undefined) run.push(crossing(prev, here, loop));
      runs.push(run);
      run = [];
    }
  }
  if (run.length > 0) runs.push(run);
  return runs.sort((a, b) => lengthOf(b) - lengthOf(a))[0] ?? [];
}

/**
 * 線分が輪をまたぐ所を、二分法で詰めて求める。
 * どちら向きに渡しても、必ず輪の内側の点を返す。
 */
function crossing(from: Vec2, to: Vec2, loop: readonly Vec2[]): Vec2 {
  const fromInside = inside(loop, from);
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i += 1) {
    const mid = (lo + hi) / 2;
    if (inside(loop, lerp(from, to, mid)) === fromInside) lo = mid;
    else hi = mid;
  }
  return lerp(from, to, fromInside ? lo : hi);
}

/** 円の中を抜く。ロータリーの中へ道を突っ込ませない */
export function clipCircle(points: readonly Vec2[], at: Vec2, radius: number): Vec2[][] {
  const far = (p: Vec2): boolean => Math.hypot(p.x - at.x, p.z - at.z) >= radius;
  const runs: Vec2[][] = [];
  let run: Vec2[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const here = points[i];
    if (here === undefined) continue;
    if (far(here)) {
      if (run.length === 0) {
        const prev = points[i - 1];
        if (prev !== undefined) run.push(onCircle(here, prev, at, radius));
      }
      run.push(here);
      continue;
    }
    if (run.length > 0) {
      const prev = points[i - 1];
      if (prev !== undefined) run.push(onCircle(prev, here, at, radius));
      runs.push(run);
      run = [];
    }
  }
  if (run.length > 0) runs.push(run);
  return runs.filter((r) => r.length >= 2 && lengthOf(r) > 1);
}

/** 円の外にある点 `from` と中にある点 `to` を結ぶ線が、円のふちを切る所 */
function onCircle(from: Vec2, to: Vec2, at: Vec2, radius: number): Vec2 {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i += 1) {
    const mid = (lo + hi) / 2;
    if (Math.hypot(lerp(from, to, mid).x - at.x, lerp(from, to, mid).z - at.z) < radius) hi = mid;
    else lo = mid;
  }
  return lerp(from, to, lo);
}

/** 角の丸い四角の輪。区域を囲む道に使う */
function roundedLoop(at: Vec2, w: number, d: number, corner: number): Vec2[] {
  const r = Math.min(corner, w / 2, d / 2);
  const points: Vec2[] = [];
  const corners: [number, number, number][] = [
    [at.x + w / 2 - r, at.z + d / 2 - r, 0],
    [at.x - w / 2 + r, at.z + d / 2 - r, Math.PI / 2],
    [at.x - w / 2 + r, at.z - d / 2 + r, Math.PI],
    [at.x + w / 2 - r, at.z - d / 2 + r, -Math.PI / 2],
  ];
  for (const [cx, cz, start] of corners) {
    for (let i = 0; i <= 6; i += 1) {
      const angle = start + (i / 6) * (Math.PI / 2);
      points.push({ x: cx + Math.cos(angle) * r, z: cz + Math.sin(angle) * r });
    }
  }
  return points;
}

/** 海岸線を内側へ縮めた輪。海沿いの環状路 */
function coastLoop(terrain: Terrain): Vec2[] {
  return terrain.shore.map((p) => ({ x: p.x * COAST_INSET, z: p.z * COAST_INSET }));
}

/** 端から端まで貫く直線。輪の内側だけを残す */
function spanLine(from: Vec2, to: Vec2, loop: readonly Vec2[], steps = 120): Vec2[] {
  const points: Vec2[] = [];
  for (let i = 0; i <= steps; i += 1) points.push(lerp(from, to, i / steps));
  return clipToLoop(points, loop);
}

/**
 * 弧を描く大通り。格子の道路とは別に、必ず 1 本通す。
 * 街の外に中心を置いた大きな円の一部なので、緩やかな弧になる。
 */
export function arcBoulevard(size: { w: number; d: number }, loop: readonly Vec2[], seed: number): Vec2[] {
  const radius = size.w * between(seed, 41, 0.75, 0.95);
  const center: Vec2 = { x: between(seed, 42, -0.1, 0.1) * size.w, z: radius * 0.72 };
  const from = between(seed, 43, Math.PI * 1.12, Math.PI * 1.2);
  const to = between(seed, 44, Math.PI * 1.88, Math.PI * 1.96);
  const points: Vec2[] = [];
  for (let i = 0; i <= 140; i += 1) {
    const angle = from + ((to - from) * i) / 140;
    points.push({ x: center.x + Math.cos(angle) * radius, z: center.z + Math.sin(angle) * radius });
  }
  return clipToLoop(points, loop);
}

/* ------------ 交差点 ------------ */

function segmentsOf(road: RoadPath): [Vec2, Vec2][] {
  const out: [Vec2, Vec2][] = [];
  const points = road.closed ? [...road.points, road.points[0]] : road.points;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    if (a === undefined || b === undefined) continue;
    out.push([a, b]);
  }
  return out;
}

function crossPoint(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): Vec2 | null {
  const d = (a2.x - a1.x) * (b2.z - b1.z) - (a2.z - a1.z) * (b2.x - b1.x);
  if (Math.abs(d) < 1e-9) return null;
  const t = ((b1.x - a1.x) * (b2.z - b1.z) - (b1.z - a1.z) * (b2.x - b1.x)) / d;
  const u = ((b1.x - a1.x) * (a2.z - a1.z) - (b1.z - a1.z) * (a2.x - a1.x)) / d;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: a1.x + (a2.x - a1.x) * t, z: a1.z + (a2.z - a1.z) * t };
}

/** 道と道が出会う所を集める。近すぎるものは 1 つにまとめる */
export function junctionsOf(roads: readonly RoadPath[]): Vec2[] {
  const found: Vec2[] = [];
  for (let i = 0; i < roads.length; i += 1) {
    for (let j = i + 1; j < roads.length; j += 1) {
      const a = roads[i];
      const b = roads[j];
      if (a === undefined || b === undefined) continue;
      if (a.kind === 'lane' || b.kind === 'lane') continue;
      for (const [a1, a2] of segmentsOf(a)) {
        for (const [b1, b2] of segmentsOf(b)) {
          const at = crossPoint(a1, a2, b1, b2);
          if (at === null) continue;
          if (found.some((made) => Math.hypot(made.x - at.x, made.z - at.z) < TILE_METERS)) continue;
          found.push(at);
        }
      }
    }
  }
  return found;
}

/** 道までの距離 */
export function distanceToRoad(road: RoadPath, point: Vec2): number {
  let best = Infinity;
  for (const [a, b] of segmentsOf(road)) best = Math.min(best, distanceToSegment(point, a, b));
  return best;
}

/**
 * 行き止まり。開いた道の端が、他の道にもロータリーにも繋がっていない所。
 * 街として成り立っていれば空になる。
 */
export function deadEnds(network: RoadNetwork): Vec2[] {
  const out: Vec2[] = [];
  for (const road of network.roads) {
    if (road.closed || road.kind === 'lane') continue;
    const ends = [road.points[0], road.points[road.points.length - 1]];
    for (const end of ends) {
      if (end === undefined) continue;
      const tolerance = road.width;
      const onRoundabout = network.roundabouts.some(
        (circle) => Math.abs(Math.hypot(end.x - circle.at.x, end.z - circle.at.z) - circle.radius) < tolerance,
      );
      if (onRoundabout) continue;
      const onOther = network.roads.some((other) => other.id !== road.id && distanceToRoad(other, end) < tolerance);
      if (!onOther) out.push(end);
    }
  }
  return out;
}

/** 交差点の手前に横断歩道を置く */
function crosswalksAt(junction: Vec2, roads: readonly RoadPath[]): Crosswalk[] {
  const out: Crosswalk[] = [];
  for (const road of roads) {
    if (road.kind === 'lane') continue;
    let nearest: [Vec2, Vec2] | null = null;
    let best = Infinity;
    for (const segment of segmentsOf(road)) {
      const d = distanceToSegment(junction, segment[0], segment[1]);
      if (d < best) {
        best = d;
        nearest = segment;
      }
    }
    if (nearest === null || best > road.width) continue;
    const [a, b] = nearest;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    const back = road.width * 0.75 + 3;
    for (const side of [-1, 1]) {
      out.push({
        at: { x: junction.x + (dx / len) * back * side, z: junction.z + (dz / len) * back * side },
        angle: Math.atan2(dx, dz),
        length: road.width,
        width: 4,
      });
    }
  }
  return out;
}

/* ------------ 組み立て ------------ */

/**
 * 街の道を作る。同じ入力からは必ず同じ道になる。
 * 解放されていない区域には道を通さない（原野のまま）。
 */
export function buildRoads(input: RoadInput): RoadNetwork {
  const { terrain, seed, size } = input;
  const loop = coastLoop(terrain);
  const roads: RoadPath[] = [];

  // 海沿いの環状路。島をぐるりと回る。輪なので端が無い
  roads.push({ id: 'road:coast', kind: 'boulevard', points: loop, width: ROAD_WIDTH.boulevard, closed: true, active: true, blocked: false });

  // 南北と東西の大通り。端は海沿いの環状路に着く
  const half = { w: size.w / 2, d: size.d / 2 };
  const avenues: [string, Vec2, Vec2][] = [
    ['road:ns-center', { x: 0, z: -half.d * 3 }, { x: 0, z: half.d * 3 }],
    ['road:ns-west', { x: -TILE_METERS * 6, z: -half.d * 3 }, { x: -TILE_METERS * 6, z: half.d * 3 }],
    ['road:ns-east', { x: TILE_METERS * 5, z: -half.d * 3 }, { x: TILE_METERS * 5, z: half.d * 3 }],
    ['road:ew-center', { x: -half.w * 3, z: 0 }, { x: half.w * 3, z: 0 }],
  ];
  for (const [id, from, to] of avenues) {
    const points = spanLine(from, to, loop);
    if (points.length >= 2) {
      roads.push({ id, kind: 'boulevard', points, width: ROAD_WIDTH.boulevard, closed: false, active: true, blocked: false });
    }
  }

  // 弧を描く大通り。格子だけの街にしない
  const arc = arcBoulevard(size, loop, seed);
  if (arc.length >= 2) {
    roads.push({ id: 'road:arc', kind: 'boulevard', points: arc, width: ROAD_WIDTH.boulevard, closed: false, active: true, blocked: false });
  }

  // 解放された区域を囲む道
  for (const district of input.districts) {
    if (!district.unlocked || district.id === 'center') continue;
    roads.push({
      id: `road:${district.id}`,
      kind: 'street',
      points: roundedLoop(district.at, district.w + TILE_METERS, district.d + TILE_METERS, TILE_METERS * 1.5),
      width: ROAD_WIDTH.street,
      closed: true,
      active: true,
      blocked: false,
    });
  }

  // 建物どうしを結ぶ道（ネットワークのリンクやバス路線）
  for (const link of input.links ?? []) {
    roads.push({
      id: `road:link:${link.id}`,
      kind: 'lane',
      points: [link.from, link.to],
      width: ROAD_WIDTH.lane,
      closed: false,
      active: link.active,
      blocked: link.blocked,
    });
  }

  // 街の真ん中の交差点はロータリーにする
  const roundabouts: Roundabout[] = [
    {
      at: { x: 0, z: 0 },
      radius: ROUNDABOUT_RADIUS,
      laneWidth: ROAD_WIDTH.boulevard * 0.8,
      gardenRadius: ROUNDABOUT_RADIUS - ROAD_WIDTH.boulevard * 0.8,
    },
  ];

  // ロータリーの中を通さない。手前で切って、環道に着けさせる
  const clipped: RoadPath[] = [];
  for (const road of roads) {
    const circle = roundabouts.find((r) => !road.closed && distanceToRoad(road, r.at) < r.radius);
    if (circle === undefined || road.kind === 'lane') {
      clipped.push(road);
      continue;
    }
    const runs = clipCircle(road.points, circle.at, circle.radius);
    runs.forEach((points, i) => {
      clipped.push({ ...road, id: `${road.id}/${String(i)}`, points });
    });
  }

  const junctions = junctionsOf(clipped);
  const crosswalks = junctions.flatMap((junction) => crosswalksAt(junction, clipped)).slice(0, 240);

  // 川を渡る所に橋を架ける
  const spans: [Vec2, Vec2][] = clipped
    .filter((road) => road.kind !== 'lane')
    .flatMap((road) => segmentsOf(road));
  const bridges = bridgesFor(terrain, spans, ROAD_WIDTH.boulevard + unit(seed, 45) * 4);

  return { roads: clipped, roundabouts, crosswalks, bridges, junctions };
}
