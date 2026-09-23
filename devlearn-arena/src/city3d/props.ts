import { TILE_METERS } from './palette';
import { hashString, stream, type Rng } from './seed';
import { isLand, type Terrain } from './terrain';
import type { RoadNetwork, RoadPath } from './roads';
import type { LayoutBuilding, Vec2 } from './model';

/**
 * 街に置くもの。街路樹・街灯・車・人・生垣・ベンチ・柵・看板。
 *
 * DESIGN.md §6 の決まり。
 * - 建物の周りには必ず植木と明かりと囲いを置く
 * - 木は数百本を `InstancedMesh` で置く
 * - 車と人は道に沿って動く
 * - 地面がむき出しのまま残っている状態を不合格とする
 *
 * 置き場所は乱数ではなく seed から決める。ここは three に触れない。
 */

export type PropKind = 'tree' | 'lamp' | 'car' | 'person' | 'hedge' | 'bench' | 'fence' | 'sign';

/** 道に沿って動くものの経路 */
export interface PropPath {
  points: Vec2[];
  /** 中心線からの横のずれ（左右の車線） */
  offset: number;
  /** 進む速さ（m/秒） */
  speed: number;
  /** 出発点（経路上の 0..1） */
  start: number;
}

export interface PropPlacement {
  kind: PropKind;
  at: Vec2;
  /** Y 軸まわりの向き */
  rotation: number;
  /** 大きさの振れ幅。1 が基準 */
  scale: number;
  /** 動くものだけが持つ */
  path?: PropPath;
}

export interface PropInput {
  seed: number;
  terrain: Terrain;
  roads: RoadNetwork;
  buildings: readonly LayoutBuilding[];
}

/** 置けるものの総数の上限。増やしすぎると描くのが重くなる */
const MAX_PROPS = 6000;

/** 置き場所が重ならないように見る網の目の細かさ（メートル） */
const CELL = 4;

/** 道と建物の「置けない所」を写す網の目。歩道と車道を分けるため、こちらは細かい */
const BLOCK_CELL = 2;

/** 道端の木の間隔 */
const TREE_SPACING = 14;

/** 街灯の間隔 */
const LAMP_SPACING = 30;

/**
 * 置ける所を覚えておく台帳。
 *
 * 道と建物は先に網の目へ写しておく（毎回すべての道との距離を測ると遅い）。
 * 置いた所も同じ網の目に印を付けるので、同じ場所に二重に置かない。
 */
class Ground {
  private readonly taken = new Set<string>();
  /** 道とロータリーの上。「道の上でもよい」ものだけが入れる */
  private readonly paved = new Set<string>();
  /** 建物の足元。ここには何も置かない */
  private readonly built = new Set<string>();
  readonly items: PropPlacement[] = [];

  constructor(
    private readonly terrain: Terrain,
    roads: RoadNetwork,
    buildings: readonly LayoutBuilding[],
  ) {
    for (const road of roads.roads) {
      const points = road.closed ? [...road.points, road.points[0] ?? { x: 0, z: 0 }] : road.points;
      // 車道の幅だけを塞ぐ。歩道のぶんは空けて、街路樹と街灯を植えられるようにする
      for (const { at } of alongPath(points, BLOCK_CELL)) this.stamp(this.paved, at, road.width / 2 + 0.5);
    }
    for (const circle of roads.roundabouts) {
      const steps = Math.max(24, Math.round(circle.radius));
      for (let i = 0; i < steps; i += 1) {
        const angle = (i / steps) * Math.PI * 2;
        const mid = (circle.radius + circle.gardenRadius) / 2;
        this.stamp(
          this.paved,
          { x: circle.at.x + Math.cos(angle) * mid, z: circle.at.z + Math.sin(angle) * mid },
          (circle.radius - circle.gardenRadius) / 2,
        );
      }
    }
    for (const building of buildings) {
      // 建物は回るので、長い辺を半径にした四角で塞ぐ
      const half = Math.max(building.params.footprint.w, building.params.footprint.d) / 2 + 1.5;
      this.stampBox(this.built, building.at, half);
    }
  }

  private key(at: Vec2): string {
    return `${String(Math.round(at.x / CELL))},${String(Math.round(at.z / CELL))}`;
  }

  /** 四角く、置けない印を付ける */
  private stampBox(into: Set<string>, at: Vec2, half: number): void {
    const span = Math.ceil(half / BLOCK_CELL);
    const cx = Math.round(at.x / BLOCK_CELL);
    const cz = Math.round(at.z / BLOCK_CELL);
    for (let dx = -span; dx <= span; dx += 1) {
      for (let dz = -span; dz <= span; dz += 1) {
        into.add(`${String(cx + dx)},${String(cz + dz)}`);
      }
    }
  }

  /** 置けない所を写す網の目の升目 */
  private blockKey(at: Vec2): string {
    return `${String(Math.round(at.x / BLOCK_CELL))},${String(Math.round(at.z / BLOCK_CELL))}`;
  }

  /**
   * 中心から半径ぶんに、置けない印を付ける。
   * 升目の中心が半径の内側に入るものだけを塞ぐので、縁石の外側は空いたままになる。
   */
  private stamp(into: Set<string>, at: Vec2, radius: number): void {
    const span = Math.ceil(radius / BLOCK_CELL);
    const cx = Math.round(at.x / BLOCK_CELL);
    const cz = Math.round(at.z / BLOCK_CELL);
    for (let dx = -span; dx <= span; dx += 1) {
      for (let dz = -span; dz <= span; dz += 1) {
        const center = { x: (cx + dx) * BLOCK_CELL, z: (cz + dz) * BLOCK_CELL };
        if (Math.hypot(center.x - at.x, center.z - at.z) > radius) continue;
        into.add(`${String(cx + dx)},${String(cz + dz)}`);
      }
    }
  }

  /** そこは空いているか。水の上と建物の足元と道の上には置かない */
  free(at: Vec2, options: { onRoad?: boolean } = {}): boolean {
    if (this.items.length >= MAX_PROPS) return false;
    const key = this.key(at);
    if (this.taken.has(key)) return false;
    const spot = this.blockKey(at);
    if (this.built.has(spot)) return false;
    if (options.onRoad !== true && this.paved.has(spot)) return false;
    return isLand(this.terrain, at);
  }

  put(kind: PropKind, at: Vec2, rotation: number, scale: number, options: { onRoad?: boolean } = {}): boolean {
    if (!this.free(at, options)) return false;
    this.taken.add(this.key(at));
    this.items.push({ kind, at, rotation, scale });
    return true;
  }

  /** 動くもの。道の上を走るので、空きの決まりに縛られない */
  move(kind: PropKind, at: Vec2, rotation: number, scale: number, path: PropPath): void {
    if (this.items.length >= MAX_PROPS) return;
    this.items.push({ kind, at, rotation, scale, path });
  }
}

/** 点列に沿って、等間隔の位置と向きを取る */
export function alongPath(points: readonly Vec2[], spacing: number): { at: Vec2; angle: number }[] {
  const out: { at: Vec2; angle: number }[] = [];
  let carry = spacing / 2;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    if (a === undefined || b === undefined) continue;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) continue;
    const angle = Math.atan2(dx, dz);
    for (let t = carry; t < len; t += spacing) {
      out.push({ at: { x: a.x + (dx / len) * t, z: a.z + (dz / len) * t }, angle });
    }
    carry = ((carry - len) % spacing + spacing) % spacing;
  }
  return out;
}

/** 中心線から横へずらす */
function sideways(at: Vec2, angle: number, distance: number): Vec2 {
  return { x: at.x + Math.cos(angle) * distance, z: at.z - Math.sin(angle) * distance };
}

/** 道端に街路樹と街灯を植える */
function alongRoads(ground: Ground, roads: readonly RoadPath[], rng: Rng): void {
  for (const road of roads) {
    if (road.kind === 'lane') continue;
    // 街灯が先。木より数が少ないので、先に場所を取らせる
    if (road.kind === 'boulevard') {
      let flip = 1;
      for (const { at, angle } of alongPath(road.points, LAMP_SPACING)) {
        ground.put('lamp', sideways(at, angle, (road.width / 2 + 1.2) * flip), angle + (flip > 0 ? 0 : Math.PI), 1);
        flip = -flip;
      }
    }
    const edge = road.width / 2 + 3.5;
    for (const { at, angle } of alongPath(road.points, TREE_SPACING)) {
      for (const side of [-1, 1]) {
        ground.put('tree', sideways(at, angle, edge * side), rng.between(0, Math.PI * 2), rng.between(0.8, 1.35));
      }
    }
  }
}

/** 交差点の角にベンチと看板を置く */
function atJunctions(ground: Ground, roads: RoadNetwork, rng: Rng): void {
  for (const junction of roads.junctions) {
    for (const [dx, dz] of [
      [1, 1],
      [-1, -1],
    ] as const) {
      const at = { x: junction.x + dx * 12, z: junction.z + dz * 12 };
      const kind: PropKind = rng.chance(0.5) ? 'bench' : 'sign';
      ground.put(kind, at, rng.between(0, Math.PI * 2), 1);
    }
  }
}

/** 建物の周りに生垣と柵を回す。むき出しの足元を残さない */
function aroundBuildings(ground: Ground, buildings: readonly LayoutBuilding[], rng: Rng): void {
  buildings.forEach((building, index) => {
    const half = {
      w: building.params.footprint.w / 2 + 3.5,
      d: building.params.footprint.d / 2 + 3.5,
    };
    // 生垣と柵を交互に。どちらかに偏らせない
    const fence = index % 2 === 1;
    const steps = 4;
    let placed = 0;
    for (let i = 0; i <= steps; i += 1) {
      const t = -1 + (2 * i) / steps;
      const spots: [Vec2, number][] = [
        [{ x: building.at.x + t * half.w, z: building.at.z + half.d }, 0],
        [{ x: building.at.x + t * half.w, z: building.at.z - half.d }, 0],
        [{ x: building.at.x + half.w, z: building.at.z + t * half.d }, Math.PI / 2],
        [{ x: building.at.x - half.w, z: building.at.z + t * half.d }, Math.PI / 2],
      ];
      for (const [at, angle] of spots) {
        if (ground.put(fence ? 'fence' : 'hedge', at, angle, rng.between(0.9, 1.1))) placed += 1;
      }
    }
    // 入口のそばには必ず木を 1 本
    const yard = { x: building.at.x + half.w + 2, z: building.at.z + half.d + 2 };
    if (ground.put('tree', yard, rng.between(0, 6.28), rng.between(0.9, 1.3))) placed += 1;

    // 道に囲まれていて何も置けなかったときは、庭の角に 1 本だけ無理にでも植える
    if (placed > 0) return;
    for (const corner of [
      { x: building.at.x + half.w, z: building.at.z + half.d },
      { x: building.at.x - half.w, z: building.at.z - half.d },
      { x: building.at.x + half.w, z: building.at.z - half.d },
      { x: building.at.x - half.w, z: building.at.z + half.d },
    ]) {
      if (ground.put(fence ? 'fence' : 'hedge', corner, rng.between(0, 6.28), 1, { onRoad: true })) break;
    }
  });
}

/** 道に車を流す。人は歩道を歩く */
function traffic(ground: Ground, roads: RoadNetwork, rng: Rng): void {
  for (const road of roads.roads) {
    const points = road.closed ? [...road.points, road.points[0] ?? { x: 0, z: 0 }] : road.points;
    if (points.length < 2 || !road.active) continue;
    const cars = road.kind === 'boulevard' ? 6 : road.kind === 'street' ? 3 : 1;
    for (let i = 0; i < cars; i += 1) {
      const start = (i + 0.5) / cars;
      const offset = (road.width / 4) * (i % 2 === 0 ? 1 : -1);
      const spot = pointAt(points, start);
      ground.move('car', spot.at, spot.angle, rng.between(0.9, 1.1), {
        points,
        offset,
        speed: rng.between(6, 11) * (i % 2 === 0 ? 1 : -1),
        start,
      });
    }
    if (road.kind === 'lane') continue;
    for (let i = 0; i < 3; i += 1) {
      const start = (i + 0.25) / 3;
      const spot = pointAt(points, start);
      ground.move('person', spot.at, spot.angle, rng.between(0.9, 1.1), {
        points,
        offset: (road.width / 2 + 2.2) * (i % 2 === 0 ? 1 : -1),
        speed: rng.between(1.1, 1.7) * (i % 2 === 0 ? 1 : -1),
        start,
      });
    }
  }
}

/** 経路上の位置（0..1）から、点と向きを取る */
export function pointAt(points: readonly Vec2[], t: number): { at: Vec2; angle: number } {
  const total = points.length - 1;
  const where = Math.min(Math.max(t, 0), 0.999) * total;
  const index = Math.floor(where);
  const a = points[index] ?? { x: 0, z: 0 };
  const b = points[index + 1] ?? a;
  const f = where - index;
  const angle = Math.atan2(b.x - a.x, b.z - a.z);
  return { at: { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f }, angle };
}

/** ロータリーの中央の緑地。木と生垣を置く */
function garden(ground: Ground, roads: RoadNetwork, rng: Rng): void {
  for (const circle of roads.roundabouts) {
    const count = Math.max(6, Math.floor(circle.gardenRadius));
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2;
      const radius = circle.gardenRadius * (0.35 + 0.5 * ((i % 3) / 3));
      ground.put(
        i % 3 === 0 ? 'tree' : 'hedge',
        { x: circle.at.x + Math.cos(angle) * radius, z: circle.at.z + Math.sin(angle) * radius },
        angle,
        rng.between(0.9, 1.4),
        { onRoad: true },
      );
    }
  }
}

/**
 * 空いている草地を埋める。原っぱをむき出しのまま残さない。
 * タイルごとに seed から決めるので、毎回同じ林になる。
 */
function fillGrass(ground: Ground, terrain: Terrain): void {
  for (const tile of terrain.tiles) {
    if (tile.kind !== 'grass') continue;
    const seed = hashString(`${String(Math.round(tile.x))}:${String(Math.round(tile.z))}`);
    const rng = stream(seed);
    const jitter = { x: rng.between(-2.5, 2.5), z: rng.between(-2.5, 2.5) };
    const kind: PropKind = rng.chance(0.72) ? 'tree' : 'hedge';
    const angle = rng.between(0, Math.PI * 2);
    const scale = rng.between(0.7, 1.5);
    // ぶつかったら少しずつずらして試す。原っぱをむき出しのまま残さない
    for (const [dx, dz] of [
      [jitter.x, jitter.z],
      [0, 0],
      [3, 0],
      [-3, 0],
      [0, 3],
      [0, -3],
      [3, 3],
      [-3, -3],
    ] as const) {
      if (ground.put(kind, { x: tile.x + dx, z: tile.z + dz }, angle, scale)) break;
    }
  }
}

/**
 * 街に置くものを決める。純粋関数。
 * 道端 → 交差点 → 建物の周り → 車と人 → 緑地 → 空き地 の順に置く。
 * 順番が決まっているので、同じ入力からは必ず同じ並びになる。
 */
export function buildProps(input: PropInput): PropPlacement[] {
  const ground = new Ground(input.terrain, input.roads, input.buildings);
  const rng = stream(input.seed);
  alongRoads(ground, input.roads.roads, rng.fork('roads'));
  atJunctions(ground, input.roads, rng.fork('junctions'));
  aroundBuildings(ground, input.buildings, rng.fork('buildings'));
  traffic(ground, input.roads, rng.fork('traffic'));
  garden(ground, input.roads, rng.fork('garden'));
  fillGrass(ground, input.terrain);
  return ground.items;
}

/** 種類ごとの数を数える。テストと診断に使う */
export function countProps(items: readonly PropPlacement[]): Record<PropKind, number> {
  const out: Record<PropKind, number> = { tree: 0, lamp: 0, car: 0, person: 0, hedge: 0, bench: 0, fence: 0, sign: 0 };
  for (const item of items) out[item.kind] += 1;
  return out;
}

/** 木 1 本あたりの葉の塊の数。丸い塊を重ねる */
export const FOLIAGE_PER_TREE = 3;

/** 何も無い原っぱとみなす距離 */
export const BARE_TOLERANCE = TILE_METERS * 1.5;

/**
 * むき出しのまま残った草地を探す。
 * 道や建物が載っているタイルは数えない（そこは道と建物が埋めている）。
 * 返り値が空でなければ、その街は DESIGN.md §6 に反している。
 */
export function bareSpots(input: PropInput, items: readonly PropPlacement[]): Vec2[] {
  const ground = new Ground(input.terrain, input.roads, input.buildings);
  const cell = BARE_TOLERANCE;
  const near = new Map<string, Vec2[]>();
  for (const item of items) {
    const key = `${String(Math.floor(item.at.x / cell))},${String(Math.floor(item.at.z / cell))}`;
    const list = near.get(key);
    if (list === undefined) near.set(key, [item.at]);
    else list.push(item.at);
  }
  const out: Vec2[] = [];
  for (const tile of input.terrain.tiles) {
    if (tile.kind !== 'grass') continue;
    const at = { x: tile.x, z: tile.z };
    if (!ground.free(at)) continue;
    const cx = Math.floor(at.x / cell);
    const cz = Math.floor(at.z / cell);
    let found = false;
    for (let dx = -1; dx <= 1 && !found; dx += 1) {
      for (let dz = -1; dz <= 1 && !found; dz += 1) {
        for (const other of near.get(`${String(cx + dx)},${String(cz + dz)}`) ?? []) {
          if (Math.hypot(other.x - at.x, other.z - at.z) <= BARE_TOLERANCE) {
            found = true;
            break;
          }
        }
      }
    }
    if (!found) out.push(at);
  }
  return out;
}
