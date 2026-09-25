import { hashString, unit } from './seed';
import type { LayoutBuilding, Vec2 } from './model';
import type { PropPlacement } from './props';
import type { RoadNetwork } from './roads';

/**
 * 住人。ビルの中の Pod 1 人 1 人を、街の上で見えるようにする。
 *
 * 窓の灯りだけでは「入居できずにいる」「倒れている」が見えない。
 * だから、まだ入れていない住人は道からビルへ歩き、倒れた住人はその場に伏せ、
 * 担架がビルから道へ出ていく。窓が灯っているのは、もう中で暮らしている住人。
 *
 * ここは three に触れない純粋な計算。誰が歩くかは模型（住人の様子）だけが決める。
 */

/** 住人として置くものの種類 */
export type ResidentKind = 'resident' | 'fallen' | 'carrier';

export interface ResidentInput {
  roads: RoadNetwork;
  buildings: readonly LayoutBuilding[];
}

/** 置ける数の上限。増やしすぎると描くのが重くなる */
const MAX_RESIDENTS = 400;

/** 歩く速さ（m/秒）。人の歩みに合わせる */
const WALK_SPEED = 1.3;

/** 担架を運ぶ速さ。歩くより少し遅い */
const CARRY_SPEED = 0.9;

/** 玄関を建物の外壁からどれだけ離すか */
const DOOR_MARGIN = 2.2;

function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** 建物の中心から、住人が立てる所までの距離 */
function reachOf(building: LayoutBuilding): number {
  return Math.max(building.params.footprint.w, building.params.footprint.d) / 2 + DOOR_MARGIN;
}

/**
 * その建物にいちばん近い道の点。
 *
 * 住人はここからビルへ歩く。建物どうしを結ぶ細い道は端が建物の真ん中にあるので、
 * 足元より内側の点は数えない（住人が壁の中に立ってしまうため）。
 * 届く所に道が無ければ null。
 */
export function nearestRoadPoint(roads: RoadNetwork, at: Vec2, minGap: number): Vec2 | null {
  let best: Vec2 | null = null;
  let bestGap = Infinity;
  for (const road of roads.roads) {
    for (const point of road.points) {
      const gap = distance(point, at);
      if (gap < minGap || gap >= bestGap) continue;
      bestGap = gap;
      best = point;
    }
  }
  return best;
}

/**
 * 玄関の位置。建物の中心から、いちばん近い道の方へ外壁のすぐ外まで出た所。
 * 住人が壁にめり込んで見えないようにするため、必ず足元の外に出す。
 */
export function doorOf(building: LayoutBuilding, road: Vec2): Vec2 {
  const reach = reachOf(building);
  const dx = road.x - building.at.x;
  const dz = road.z - building.at.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return { x: building.at.x + reach, z: building.at.z };
  return { x: building.at.x + (dx / len) * reach, z: building.at.z + (dz / len) * reach };
}

/** 道と玄関の間に、歩く道すじを作る。近すぎるときは最低限の長さを持たせる */
function lane(door: Vec2, road: Vec2): [Vec2, Vec2] {
  if (distance(door, road) >= 4) return [road, door];
  const dx = door.x - road.x;
  const dz = door.z - road.z;
  const len = Math.max(1e-6, Math.hypot(dx, dz));
  return [{ x: door.x - (dx / len) * 6, z: door.z - (dz / len) * 6 }, door];
}

function walker(
  kind: ResidentKind,
  id: string,
  points: [Vec2, Vec2],
  speed: number,
): PropPlacement {
  const seed = hashString(id);
  const start = unit(seed, 1);
  const angle = Math.atan2(points[1].x - points[0].x, points[1].z - points[0].z);
  return {
    kind,
    at: points[0],
    rotation: angle,
    scale: 0.9 + unit(seed, 2) * 0.25,
    path: { points: [...points], offset: 0, speed, start: speed === 0 ? 0 : start },
  };
}

/**
 * 街に置く住人を決める。純粋関数。
 *
 * - まだ入居できていない住人（moving）… 道からビルへ歩く
 * - 倒れている住人（sick）… 玄関の前に伏せ、担架がビルから道へ出ていく
 * - 出ていく住人（gone）… ビルから道へ歩く
 * - 中で暮らしている住人（settled）… 姿は出さない。その階の窓が灯っている
 */
export function buildResidents(input: ResidentInput): PropPlacement[] {
  const out: PropPlacement[] = [];
  for (const building of input.buildings) {
    if (building.occupants.length === 0) continue;
    const road = nearestRoadPoint(input.roads, building.at, reachOf(building) + 1);
    if (road === null) continue;
    const door = doorOf(building, road);
    const [outer, inner] = lane(door, road);
    // 道すじに対して横向き。同じビルの住人を、この向きに少しずつずらして並べる
    const span = Math.max(1e-6, distance(outer, inner));
    const side = { x: (inner.z - outer.z) / span, z: -(inner.x - outer.x) / span };
    building.occupants.forEach((occupant, i) => {
      if (out.length >= MAX_RESIDENTS) return;
      const shift = ((i % 5) - 2) * 1.2;
      const spread = (at: Vec2): Vec2 => ({ x: at.x + side.x * shift, z: at.z + side.z * shift });
      const from = spread(outer);
      const to = spread(inner);
      if (occupant.state === 'moving') {
        out.push(walker('resident', occupant.id, [from, to], WALK_SPEED));
      } else if (occupant.state === 'gone') {
        out.push(walker('resident', `${occupant.id}/out`, [to, from], WALK_SPEED));
      } else if (occupant.state === 'sick') {
        out.push(walker('fallen', occupant.id, [to, from], 0));
        out.push(walker('carrier', `${occupant.id}/carry`, [to, from], CARRY_SPEED));
      }
    });
  }
  return out;
}
