import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  Shape,
  SphereGeometry,
  Vector3,
  type BufferGeometry,
  type Material,
} from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildingPieces } from './buildings';
import { offsetPath, raisedRibbon, ribbon } from './geometry';
import { LIGHT, SURFACES, TILE_METERS, type SurfaceName } from './palette';
import { unit } from './seed';
import { heightAt, riverBanks, type Terrain } from './terrain';
import type { CityLayout, LayoutBuilding, Vec2 } from './model';
import { PATH_WIDTH } from './parks';
import type { PropPath, PropPlacement } from './props';
import type { RoadPath } from './roads';

/**
 * 街の配置を three の形にする。
 *
 * 同じ形はすべて `InstancedMesh` にまとめ、同じ材質の形は 1 つに融合する。
 * 1 棟ごとに個別のメッシュを作らない。描画呼び出しは `DRAW_CALL_LIMIT` 以下に保つ。
 *
 * ここはデータを受け取って形にするだけ。何をどこに置くかは `model.ts` が決めている。
 */

/** 描画呼び出しの上限。DESIGN.md §8 */
export const DRAW_CALL_LIMIT = 200;

/** 水面の高さ */
const WATER_LEVEL = 0.12;

/** 道路の面の高さ。ならした地面（CITY_LEVEL）のすぐ上 */
const ROAD_LEVEL = 0.34;

/** 窓を省き始める距離（メートル）。ここより遠い建物は窓を間引く */
const DETAIL_RADIUS = 260;

export interface SceneOptions {
  /** 寄っている所。ここから遠い建物は窓を省く */
  focus?: Vec2;
  /** 窓を省き始める距離 */
  detailRadius?: number;
}

/**
 * 動くもの（車と人）のひと組。
 * 部品の位置は形そのものに焼き込んであるので、部品はどれも同じ行列で動かせる。
 */
export interface MoverSet {
  meshes: InstancedMesh[];
  items: { path: PropPath; scale: number }[];
  /** 地面からの持ち上げ */
  lift: number;
}

export interface BuiltScene {
  group: Group;
  /** 描画呼び出しの数 */
  drawCalls: number;
  /** 窓の数（灯っているもの / 全部） */
  windows: { lit: number; total: number };
  /** 夜に灯るものの材質。時間帯で emissiveIntensity を変える */
  glow: MeshStandardMaterial;
  /** 車と人。毎フレーム動かす */
  movers: MoverSet[];
  dispose(): void;
}

/* ------------ 形をためる ------------ */

class Parts {
  private readonly bySurface = new Map<SurfaceName, BufferGeometry[]>();

  add(surface: SurfaceName, geometry: BufferGeometry | null): void {
    if (geometry === null) return;
    const list = this.bySurface.get(surface);
    if (list === undefined) this.bySurface.set(surface, [geometry]);
    else list.push(geometry);
  }

  /** 材質ごとに 1 つへ融合する */
  merge(): { surface: SurfaceName; geometry: BufferGeometry }[] {
    const out: { surface: SurfaceName; geometry: BufferGeometry }[] = [];
    for (const [surface, list] of [...this.bySurface].sort(([a], [b]) => (a < b ? -1 : 1))) {
      const merged = list.length === 1 ? list[0] : mergeGeometries(list);
      if (merged == null) continue;
      if (list.length > 1) for (const piece of list) piece.dispose();
      out.push({ surface, geometry: merged });
    }
    return out;
  }
}

function box(w: number, h: number, d: number, x: number, y: number, z: number, rotationY = 0): BufferGeometry {
  const geometry = new BoxGeometry(w, h, d);
  if (rotationY !== 0) geometry.rotateY(rotationY);
  geometry.translate(x, y, z);
  return geometry;
}

/* ------------ 地面 ------------ */

/**
 * 閉じた曲線を押し出して板にする。海岸線の曲線をそのまま island の縁にする。
 *
 * `Shape` は XY 平面なので、押し出してから寝かせる。
 * 形の y に -z を入れておくと、寝かせたあとに元の z へ戻る。
 */
function slab(outline: readonly Vec2[], bottom: number, top: number): BufferGeometry {
  const shape = new Shape();
  outline.forEach((point, i) => {
    if (i === 0) shape.moveTo(point.x, -point.z);
    else shape.lineTo(point.x, -point.z);
  });
  shape.closePath();
  const geometry = new ExtrudeGeometry(shape, { depth: top - bottom, bevelEnabled: false, curveSegments: 24 });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, bottom, 0);
  // 押し出した形は索引を持たない。ほかの形とまとめられるよう、頂点を寄せて索引を付ける
  return mergeVertices(geometry);
}

function ground(terrain: Terrain, parts: Parts): void {
  // 島の土台。海岸線をそのまま押し出すので、輪郭は曲線になる。
  // タイルはこの内側にしか置かないので、角が海に出て階段状に見えることがない
  parts.add('sand', slab(terrain.shore, WATER_LEVEL - 1.4, WATER_LEVEL + 0.22));
  parts.add('grass', slab(terrain.land, WATER_LEVEL + 0.2, WATER_LEVEL + 0.3));

  for (const tile of terrain.tiles) {
    if (tile.kind === 'water') continue;
    const surface: SurfaceName =
      tile.kind === 'grass'
        ? unit(Math.round(tile.x) * 31 + Math.round(tile.z), 7) < 0.3
          ? 'grassDark'
          : 'grass'
        : tile.kind === 'dirt'
          ? 'dirt'
          : 'pavement';
    parts.add(surface, box(TILE_METERS, tile.height, TILE_METERS, tile.x, tile.height / 2, tile.z));
  }

  // 海。島の外まで広く張る。陸のタイルが上に載るので、川の所だけ水が見える
  const sea = new PlaneGeometry(terrain.size.w * 1.8, terrain.size.d * 1.8);
  sea.rotateX(-Math.PI / 2);
  sea.translate(0, WATER_LEVEL, 0);
  parts.add('water', sea);

  // 川。タイルの刻みを均すため、中心線に幅を持たせた帯を重ねる
  const banks = riverBanks(terrain, terrain.riverWidth);
  parts.add('water', ribbon(terrain.river, terrain.riverWidth, WATER_LEVEL + 0.03));
  parts.add('sand', ribbon(banks.left, terrain.sandWidth, WATER_LEVEL + 0.04));
  parts.add('sand', ribbon(banks.right, terrain.sandWidth, WATER_LEVEL + 0.04));
}

/* ------------ 道路 ------------ */

function pointsOf(road: RoadPath): Vec2[] {
  const first = road.points[0];
  return road.closed && first !== undefined ? [...road.points, first] : road.points;
}

function roads(layout: CityLayout, parts: Parts): void {
  for (const road of layout.roads.roads) {
    const points = pointsOf(road);
    if (points.length < 2) continue;
    parts.add('pavement', ribbon(points, road.width, ROAD_LEVEL));

    // 縁石。道の両側に一段上げて回す
    for (const side of [1, -1]) {
      parts.add('curb', raisedRibbon(offsetPath(points, (road.width / 2 + 0.4) * side), 0.9, ROAD_LEVEL - 0.1, ROAD_LEVEL + 0.22));
    }

    // 車線の白線。大通りと街路にだけ引く
    if (road.kind === 'lane') continue;
    let carry = 0;
    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1];
      const b = points[i];
      if (a === undefined || b === undefined) continue;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      if (len < 1e-6) continue;
      const angle = Math.atan2(dx, dz);
      for (let t = carry; t < len; t += 8) {
        parts.add(
          'paint',
          box(0.25, 0.04, 3.4, a.x + (dx / len) * t, ROAD_LEVEL + 0.03, a.z + (dz / len) * t, angle),
        );
      }
      carry = Math.max(0, carry - len + 8 * Math.ceil((len - carry) / 8));
    }
  }

  // 横断歩道。縞を並べる
  for (const walk of layout.roads.crosswalks) {
    const stripes = Math.max(3, Math.round(walk.length / 1.4));
    for (let i = 0; i < stripes; i += 1) {
      const across = (-walk.length / 2 + ((i + 0.5) / stripes) * walk.length) * 0.9;
      parts.add(
        'paint',
        box(
          0.55,
          0.05,
          walk.width,
          walk.at.x + Math.cos(walk.angle) * across,
          ROAD_LEVEL + 0.04,
          walk.at.z - Math.sin(walk.angle) * across,
          walk.angle,
        ),
      );
    }
  }

  // ロータリー。環道と中央の緑地
  for (const circle of layout.roads.roundabouts) {
    const ring: Vec2[] = [];
    const mid = (circle.radius + circle.gardenRadius) / 2;
    for (let i = 0; i <= 48; i += 1) {
      const angle = (i / 48) * Math.PI * 2;
      ring.push({ x: circle.at.x + Math.cos(angle) * mid, z: circle.at.z + Math.sin(angle) * mid });
    }
    parts.add('pavement', ribbon(ring, circle.radius - circle.gardenRadius, ROAD_LEVEL));
    const garden = new CylinderGeometry(circle.gardenRadius, circle.gardenRadius, 0.5, 32);
    garden.translate(circle.at.x, 0.25, circle.at.z);
    parts.add('grass', garden);
    parts.add(
      'curb',
      raisedRibbon(ring.map((p) => ({ x: (p.x - circle.at.x) * 0.82 + circle.at.x, z: (p.z - circle.at.z) * 0.82 + circle.at.z })), 0.9, ROAD_LEVEL - 0.1, ROAD_LEVEL + 0.25),
    );
  }

  // 橋。桁と欄干
  for (const bridge of layout.roads.bridges) {
    const deck = box(bridge.width, 0.6, bridge.span, bridge.at.x, ROAD_LEVEL - 0.1, bridge.at.z, bridge.angle);
    parts.add('stone', deck);
    for (const side of [1, -1]) {
      const rail = new BoxGeometry(0.3, 1, bridge.span);
      rail.translate((bridge.width / 2) * side, ROAD_LEVEL + 0.7, 0);
      rail.rotateY(bridge.angle);
      rail.translate(bridge.at.x, 0, bridge.at.z);
      parts.add('metal', rail);
    }
  }
}

/* ------------ 公園 ------------ */

/**
 * 公園。曲がった小道と池（DESIGN.md §11）。
 * 池は輪郭を押し出した窪みにして、岸に砂の縁を付ける。
 */
function parks(layout: CityLayout, parts: Parts): void {
  for (const park of layout.parks) {
    // 芝の広場。まわりより一段だけ濃くして、公園と分かるようにする
    const lawn = new CylinderGeometry(park.radius, park.radius, 0.36, 48);
    lawn.translate(park.at.x, 0.18, park.at.z);
    parts.add('grassDark', lawn);

    // 曲がった小道
    for (const path of park.paths) {
      parts.add('dirt', ribbon(path, PATH_WIDTH, 0.38));
    }

    // 池。岸に砂の縁を付け、水面をその内側に張る
    for (const pond of park.ponds) {
      parts.add('sand', slab(pond.outline, 0.1, 0.4));
      const shrunk = pond.outline.map((point) => ({
        x: pond.at.x + (point.x - pond.at.x) * 0.86,
        z: pond.at.z + (point.z - pond.at.z) * 0.86,
      }));
      parts.add('water', slab(shrunk, 0.1, 0.34));
    }
  }
}

/* ------------ 建物 ------------ */

interface WindowInstance {
  matrix: Matrix4;
  lit: boolean;
}

/** 遠い建物ほど窓を省く（LOD） */
export function windowStride(distance: number, detailRadius: number): number {
  if (distance <= detailRadius) return 1;
  if (distance <= detailRadius * 2) return 2;
  return 0;
}

function buildings(layout: CityLayout, parts: Parts, options: SceneOptions): WindowInstance[] {
  const level = heightAt(layout.terrain);
  const focus = options.focus ?? { x: 0, z: 0 };
  const detail = options.detailRadius ?? DETAIL_RADIUS;
  const windows: WindowInstance[] = [];
  const place = new Matrix4();
  const local = new Matrix4();
  const spin = new Quaternion();
  const up = new Vector3(0, 1, 0);
  const scale = new Vector3();
  const at = new Vector3();

  for (const building of layout.buildings) {
    const base = level(building.at);
    const made = buildingPieces(building.params);
    const rising = building.progress < 1;
    place.compose(
      at.set(building.at.x, base, building.at.z),
      spin.setFromAxisAngle(up, building.rotation),
      scale.set(1, rising ? building.progress : 1, 1),
    );

    for (const piece of made.pieces) {
      // 建設中は基礎と骨組みだけ。屋根も屋上設備もまだ載らない
      if (rising && piece.part !== 'base' && piece.part !== 'body') {
        piece.geometry.dispose();
        continue;
      }
      piece.geometry.applyMatrix4(place);
      parts.add(rising && piece.part === 'body' ? 'metal' : piece.surface, piece.geometry);
    }
    if (rising) continue;

    const stride = windowStride(Math.hypot(building.at.x - focus.x, building.at.z - focus.z), detail);
    if (stride === 0) continue;
    const lively = litFloors(building);
    made.windows.forEach((slot, i) => {
      if (i % stride !== 0) return;
      local.compose(
        at.set(slot.x, slot.y, slot.z),
        spin.setFromAxisAngle(up, slot.rotationY),
        scale.set(slot.width, slot.height, 1),
      );
      windows.push({
        matrix: new Matrix4().multiplyMatrices(place, local),
        // 住人のいる階は必ず灯る。ほかは seed で決めた一部だけ
        lit: lively.has(slot.floor) || unit(building.params.seed, i) < 0.18,
      });
    });
  }
  return windows;
}

/** 住人がいて、暮らしている階。ここの窓が灯る */
function litFloors(building: LayoutBuilding): Set<number> {
  const out = new Set<number>();
  for (const occupant of building.occupants) {
    if (occupant.state === 'gone') continue;
    out.add(occupant.floor);
  }
  return out;
}

/* ------------ 置くもの ------------ */

/** 置くものの形。部品ごとに材質が違う */
function propShapes(): Record<string, { surface: SurfaceName; geometry: BufferGeometry }[]> {
  const tree = [
    { surface: 'wood' as const, geometry: box(0.45, 3.2, 0.45, 0, 1.6, 0) },
    // 葉は丸い塊を 3 つ重ねる
    { surface: 'leaf' as const, geometry: blob(1.7, 0, 4.1, 0) },
    { surface: 'leaf' as const, geometry: blob(1.25, 0.9, 3.3, 0.35) },
    { surface: 'leaf' as const, geometry: blob(1.1, -0.7, 3.6, -0.5) },
  ];
  const lamp = [
    { surface: 'metal' as const, geometry: box(0.22, 5, 0.22, 0, 2.5, 0) },
    { surface: 'metal' as const, geometry: box(0.16, 0.16, 1.4, 0, 4.9, 0.7) },
    { surface: 'window' as const, geometry: box(0.5, 0.3, 0.9, 0, 4.7, 1.2) },
  ];
  const car = [
    { surface: 'car' as const, geometry: box(1.9, 0.8, 4.3, 0, 0.7, 0) },
    { surface: 'carGlass' as const, geometry: box(1.7, 0.7, 2.1, 0, 1.4, -0.2) },
  ];
  const person = [
    { surface: 'person' as const, geometry: box(0.45, 1.1, 0.3, 0, 0.55, 0) },
    { surface: 'person' as const, geometry: blob(0.22, 0, 1.28, 0) },
  ];
  const hedge = [{ surface: 'hedge' as const, geometry: box(2.4, 1.1, 1.1, 0, 0.55, 0) }];
  const bench = [
    { surface: 'wood' as const, geometry: box(1.9, 0.14, 0.6, 0, 0.5, 0) },
    { surface: 'wood' as const, geometry: box(1.9, 0.5, 0.12, 0, 0.75, -0.24) },
    { surface: 'metal' as const, geometry: box(0.12, 0.5, 0.5, 0.8, 0.25, 0) },
    { surface: 'metal' as const, geometry: box(0.12, 0.5, 0.5, -0.8, 0.25, 0) },
  ];
  const fence = [
    { surface: 'wood' as const, geometry: box(0.16, 1.2, 0.16, -1.1, 0.6, 0) },
    { surface: 'wood' as const, geometry: box(0.16, 1.2, 0.16, 1.1, 0.6, 0) },
    { surface: 'wood' as const, geometry: box(2.4, 0.12, 0.08, 0, 1.05, 0) },
    { surface: 'wood' as const, geometry: box(2.4, 0.12, 0.08, 0, 0.6, 0) },
  ];
  const sign = [
    { surface: 'metal' as const, geometry: box(0.14, 2.6, 0.14, 0, 1.3, 0) },
    { surface: 'paint' as const, geometry: box(1.3, 0.8, 0.08, 0, 2.4, 0) },
  ];
  return { tree, lamp, car, person, hedge, bench, fence, sign };
}

function blob(radius: number, x: number, y: number, z: number): BufferGeometry {
  const geometry = new SphereGeometry(radius, 8, 6);
  geometry.translate(x, y, z);
  return geometry;
}

/* ------------ 組み立て ------------ */

export function buildCityScene(layout: CityLayout, options: SceneOptions = {}): BuiltScene {
  const group = new Group();
  const parts = new Parts();
  const geometries: BufferGeometry[] = [];
  const materials: Material[] = [];

  const glow = new MeshStandardMaterial({
    ...SURFACES.window,
    emissive: new Color(LIGHT.window),
    emissiveIntensity: 0,
  });
  materials.push(glow);

  const surfaceMaterial = (surface: SurfaceName): MeshStandardMaterial => {
    const made = new MeshStandardMaterial(SURFACES[surface]);
    materials.push(made);
    return made;
  };

  ground(layout.terrain, parts);
  roads(layout, parts);
  parks(layout, parts);
  const windows = buildings(layout, parts, options);

  // 開いていない区域は暗く沈める
  for (const district of layout.districts) {
    if (district.unlocked) continue;
    parts.add('locked', box(district.w, 0.6, district.d, district.at.x, 0.55, district.at.z));
  }

  for (const { surface, geometry } of parts.merge()) {
    const mesh = new Mesh(geometry, surfaceMaterial(surface));
    mesh.castShadow = surface !== 'water' && surface !== 'grass' && surface !== 'grassDark' && surface !== 'pavement';
    mesh.receiveShadow = true;
    mesh.userData = { surface };
    geometries.push(geometry);
    group.add(mesh);
  }

  // 窓。灯っているものと暗いものを 2 つの InstancedMesh に分ける
  const pane = new BoxGeometry(1, 1, 0.1);
  geometries.push(pane);
  const litList = windows.filter((w) => w.lit);
  const darkList = windows.filter((w) => !w.lit);
  for (const [list, material] of [
    [litList, glow],
    [darkList, surfaceMaterial('window')],
  ] as const) {
    const mesh = new InstancedMesh(pane, material, Math.max(1, list.length));
    mesh.count = list.length;
    mesh.receiveShadow = true;
    list.forEach((item, i) => {
      mesh.setMatrixAt(i, item.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.userData = { part: 'window' };
    group.add(mesh);
  }

  // 置くもの。種類ごと・部品ごとに 1 つの InstancedMesh へまとめる
  const shapes = propShapes();
  const level = heightAt(layout.terrain);
  const movers: MoverSet[] = [];
  const local = new Matrix4();
  const spin = new Quaternion();
  const up = new Vector3(0, 1, 0);
  const at = new Vector3();
  const size = new Vector3();

  const byKind = new Map<string, PropPlacement[]>();
  for (const item of layout.props) {
    const list = byKind.get(item.kind);
    if (list === undefined) byKind.set(item.kind, [item]);
    else list.push(item);
  }

  for (const [kind, shape] of Object.entries(shapes)) {
    const items = byKind.get(kind) ?? [];
    if (items.length === 0) continue;
    const moving = items[0]?.path !== undefined;
    const meshes: InstancedMesh[] = [];
    for (const piece of shape) {
      const mesh = new InstancedMesh(piece.geometry, surfaceMaterial(piece.surface), items.length);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData = { prop: kind };
      geometries.push(piece.geometry);
      items.forEach((item, i) => {
        local.compose(
          at.set(item.at.x, moving ? ROAD_LEVEL : level(item.at), item.at.z),
          spin.setFromAxisAngle(up, item.rotation),
          size.set(item.scale, item.scale, item.scale),
        );
        mesh.setMatrixAt(i, local);
      });
      mesh.instanceMatrix.needsUpdate = true;
      group.add(mesh);
      if (moving) meshes.push(mesh);
    }
    if (moving) {
      const paths = items.flatMap((item) => (item.path === undefined ? [] : [{ path: item.path, scale: item.scale }]));
      movers.push({ meshes, items: paths, lift: ROAD_LEVEL });
    }
  }

  let drawCalls = 0;
  group.traverse((node) => {
    if (node instanceof Mesh) drawCalls += 1;
  });

  return {
    group,
    drawCalls,
    windows: { lit: litList.length, total: windows.length },
    glow,
    movers,
    dispose(): void {
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
    },
  };
}
