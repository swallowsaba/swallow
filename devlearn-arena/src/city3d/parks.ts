import { TILE_METERS } from './palette';
import { stream } from './seed';
import { distanceToRiver, inside, type Terrain } from './terrain';
import type { LayoutBuilding, Vec2 } from './model';
import { distanceToRoad, type RoadNetwork } from './roads';

/**
 * 公園。曲がった小道と池を置く（DESIGN.md §11）。
 *
 * three には触れない。形は `scene.ts` が組む。
 * 位置も形も seed から決めるので、同じ街からは必ず同じ公園になる。
 */

/** 池。丸をゆがませた閉じた曲線 */
export interface Pond {
  at: Vec2;
  radius: number;
  /** 岸の線。閉じた曲線の点列 */
  outline: Vec2[];
}

export interface Park {
  id: string;
  at: Vec2;
  radius: number;
  /** 曲がった小道。中心線の点列を何本か */
  paths: Vec2[][];
  ponds: Pond[];
}

/** 公園の数。街が広いほど増える */
const PARKS_PER_AREA = 1 / 22000;

/** 公園の広さ（半径・メートル） */
const PARK_RADIUS = { min: TILE_METERS * 3, max: TILE_METERS * 5 };

/** 池と小道の点の数。少ないと角ばって見える */
const POND_POINTS = 40;
const PATH_POINTS = 28;

/** 小道の幅 */
export const PATH_WIDTH = 2.6;

/**
 * 池の岸。丸を 3 つの波でゆがませる。海岸線と同じ作り方なので、角が立たない。
 */
export function pondOutline(at: Vec2, radius: number, seed: number): Vec2[] {
  const rng = stream(seed);
  const p1 = rng.between(0, Math.PI * 2);
  const p2 = rng.between(0, Math.PI * 2);
  const squash = rng.between(0.62, 0.88);
  const points: Vec2[] = [];
  for (let i = 0; i < POND_POINTS; i += 1) {
    const angle = (i / POND_POINTS) * Math.PI * 2;
    const wobble = 1 + 0.12 * Math.sin(angle * 2 + p1) + 0.06 * Math.sin(angle * 3 + p2);
    points.push({
      x: at.x + Math.cos(angle) * radius * wobble,
      z: at.z + Math.sin(angle) * radius * squash * wobble,
    });
  }
  return points;
}

/**
 * 公園を横切る小道。まっすぐ引かず、正弦波でうねらせる。
 * 端は公園の縁に出るので、外の歩道とつながって見える。
 */
export function parkPath(at: Vec2, radius: number, seed: number): Vec2[] {
  const rng = stream(seed);
  const heading = rng.between(0, Math.PI * 2);
  const sway = rng.between(0.22, 0.42) * radius;
  const turns = rng.between(1.4, 2.6);
  const phase = rng.between(0, Math.PI * 2);
  const cos = Math.cos(heading);
  const sin = Math.sin(heading);
  const points: Vec2[] = [];
  for (let i = 0; i < PATH_POINTS; i += 1) {
    const t = i / (PATH_POINTS - 1);
    // 進む向きの座標と、それに直交する向きのうねり
    const along = (t - 0.5) * radius * 2;
    const across = Math.sin(t * Math.PI * turns + phase) * sway;
    points.push({
      x: at.x + cos * along - sin * across,
      z: at.z + sin * along + cos * across,
    });
  }
  return points;
}

interface ParkInput {
  terrain: Terrain;
  roads: RoadNetwork;
  buildings: readonly LayoutBuilding[];
  seed: number;
}

/** そこに公園を置けるか。陸の上で、川・道・建物から離れていること */
function free(at: Vec2, radius: number, input: ParkInput): boolean {
  const { terrain, roads, buildings } = input;
  if (!inside(terrain.land, at)) return false;
  if (distanceToRiver(terrain, at) < radius + terrain.riverWidth) return false;
  for (const road of roads.roads) {
    if (distanceToRoad(road, at) < radius + road.width / 2) return false;
  }
  for (const circle of roads.roundabouts) {
    if (Math.hypot(at.x - circle.at.x, at.z - circle.at.z) < radius + circle.radius) return false;
  }
  for (const building of buildings) {
    const reach = Math.max(building.params.footprint.w, building.params.footprint.d) / 2;
    if (Math.hypot(at.x - building.at.x, at.z - building.at.z) < radius + reach) return false;
  }
  return true;
}

/**
 * 公園を置く。街の空いている所を探し、そこに小道と池を作る。
 * 探す順も seed から決まるので、同じ街からは必ず同じ公園になる。
 */
export function buildParks(input: ParkInput): Park[] {
  const { terrain, seed } = input;
  const want = Math.max(2, Math.round(terrain.city.w * terrain.city.d * PARKS_PER_AREA));
  const rng = stream(seed).fork('parks');
  const parks: Park[] = [];
  // 試す回数には上限を置く。置けない街でも必ず終わる
  for (let attempt = 0; attempt < want * 40 && parks.length < want; attempt += 1) {
    const radius = rng.between(PARK_RADIUS.min, PARK_RADIUS.max);
    const at = {
      x: rng.between(-terrain.city.w / 2, terrain.city.w / 2),
      z: rng.between(-terrain.city.d / 2, terrain.city.d / 2),
    };
    if (!free(at, radius, input)) continue;
    // 公園どうしも重ねない
    if (parks.some((p) => Math.hypot(p.at.x - at.x, p.at.z - at.z) < p.radius + radius)) continue;

    const mark = rng.int(1, 0xffff);
    const pondRadius = radius * rng.between(0.26, 0.4);
    const pondAt = {
      x: at.x + rng.between(-radius * 0.35, radius * 0.35),
      z: at.z + rng.between(-radius * 0.35, radius * 0.35),
    };
    parks.push({
      id: `park:${String(parks.length)}`,
      at,
      radius,
      paths: [parkPath(at, radius, mark), parkPath(at, radius, mark + 977)],
      ponds: [{ at: pondAt, radius: pondRadius, outline: pondOutline(pondAt, pondRadius, mark + 31) }],
    });
  }
  return parks;
}
