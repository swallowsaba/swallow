import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  InstancedMesh,
  Matrix4,
  Quaternion,
  SphereGeometry,
  Vector3,
  type BufferGeometry,
} from 'three';
import { FLOOR_METERS, SURFACES, type SurfaceName } from './palette';
import { unit } from './seed';
import type { BuildingParams } from './model';

/**
 * 建物を組み立てる。外部から 3D モデルを取ってこない。形はすべてここで作る。
 *
 * 1 棟に必ず入るもの（DESIGN.md §5）。
 * - 基壇（一段太い足元）
 * - 本体。階ごとに窓の帯。セットバックで上へ行くほど細くなる
 * - 屋上設備を 2 つ以上（貯水槽・空調・アンテナ・パラペット）
 * - 入口（扉と庇）
 * - 高さで材質が変わる（低層は石、上層はガラス）
 * - 窓は 1 棟あたり 40 枚以上
 *
 * 窓は数が多いので、形（`BufferGeometry`）ではなく置き場所（`WindowSlot`）だけを返す。
 * まとめて 1 つの `InstancedMesh` にするのは `scene.ts` の仕事。
 */

export type { BuildingParams } from './model';

/** 1 棟あたりの窓の下限。DESIGN.md §5 */
export const MIN_WINDOWS = 40;

/** 基壇の高さ（メートル） */
const BASE_HEIGHT = 1.2;

/** 基壇が本体より外へ張り出す量 */
const BASE_OVERHANG = 0.9;

/** 低層を石にする階数。ここから上はガラス */
const STONE_FLOORS = 2;

/** 円柱の分割数。DESIGN.md §11 は 24 以上を求める */
export const RADIAL_SEGMENTS = 24;

export type BuildingPart = 'base' | 'body' | 'roof' | 'parapet' | 'entrance' | 'rooftop';

export type RooftopKind = 'tank' | 'ac' | 'antenna' | 'parapet' | 'stair';

export interface BuildingPiece {
  part: BuildingPart;
  surface: SurfaceName;
  geometry: BufferGeometry;
}

/** 窓 1 枚の置き場所。建物の足元の中心を原点にしたローカル座標 */
export interface WindowSlot {
  x: number;
  y: number;
  z: number;
  /** 壁の向き（Y 軸まわり）。窓は壁に沿って立つ */
  rotationY: number;
  width: number;
  height: number;
  /** 何階か（1 始まり）。住人のいる階を灯らせるのに使う */
  floor: number;
}

export interface BuildingPieces {
  pieces: BuildingPiece[];
  windows: WindowSlot[];
  rooftop: RooftopKind[];
  /** 屋根まで含めた高さ（メートル） */
  height: number;
}

/** 階の高さ。住まいは少し低く、事務所と高層は高い */
function floorHeight(kind: BuildingParams['kind']): number {
  return kind === 'house' || kind === 'depot' ? FLOOR_METERS * 0.85 : FLOOR_METERS;
}

export interface Tier {
  /** この段に含まれる階（1 始まり、両端を含む） */
  from: number;
  to: number;
  w: number;
  d: number;
  /** 段の下端と上端（メートル） */
  y0: number;
  y1: number;
}

/**
 * セットバックで段に切り分ける。上の段ほど細い。
 * `setbacks` は「何階目で幅を絞るか」なので、そこが次の段の始まりになる。
 */
export function tiersOf(params: BuildingParams): Tier[] {
  const step = floorHeight(params.kind);
  const cuts = [...params.setbacks].filter((n) => n > 1 && n <= params.floors).sort((a, b) => a - b);
  const edges = [1, ...cuts, params.floors + 1];
  const tiers: Tier[] = [];
  for (let i = 0; i + 1 < edges.length; i += 1) {
    const from = edges[i] ?? 1;
    const next = edges[i + 1] ?? params.floors + 1;
    if (next - from <= 0) continue;
    const shrink = Math.pow(0.86, tiers.length);
    tiers.push({
      from,
      to: next - 1,
      w: params.footprint.w * shrink,
      d: params.footprint.d * shrink,
      y0: BASE_HEIGHT + (from - 1) * step,
      y1: BASE_HEIGHT + (next - 1) * step,
    });
  }
  return tiers;
}

/**
 * 窓の並べ方を決める。
 * 1 棟に 40 枚以上入るまで、間隔を詰め、足りなければ 1 階あたりの帯を増やす。
 */
export function windowLayout(params: BuildingParams, tiers: readonly Tier[]): { spacing: number; bands: number } {
  const countFor = (spacing: number, bands: number): number =>
    tiers.reduce((sum, tier) => {
      const floors = tier.to - tier.from + 1;
      const perFloor =
        params.shape === 'cylinder'
          ? Math.max(8, Math.floor((Math.PI * tier.w) / spacing))
          : 2 * (Math.max(1, Math.floor(tier.w / spacing)) + Math.max(1, Math.floor(tier.d / spacing)));
      return sum + floors * perFloor * bands;
    }, 0);

  for (let bands = 1; bands <= 3; bands += 1) {
    for (let spacing = 2.4; spacing >= 0.45; spacing -= 0.1) {
      if (countFor(spacing, bands) >= MIN_WINDOWS) return { spacing: Math.round(spacing * 100) / 100, bands };
    }
  }
  return { spacing: 0.45, bands: 3 };
}

/** 四角い段の窓。4 つの壁に均等に並べる */
function boxWindows(tier: Tier, spacing: number, bands: number, step: number, out: WindowSlot[]): void {
  const perW = Math.max(1, Math.floor(tier.w / spacing));
  const perD = Math.max(1, Math.floor(tier.d / spacing));
  const width = spacing * 0.55;
  const height = Math.min(1.5, (step * 0.5) / bands);
  for (let floor = tier.from; floor <= tier.to; floor += 1) {
    for (let band = 0; band < bands; band += 1) {
      const y = tier.y0 + (floor - tier.from) * step + step * ((band + 1) / (bands + 1));
      for (let i = 0; i < perW; i += 1) {
        const x = (-tier.w / 2) * 0.9 + ((i + 0.5) / perW) * tier.w * 0.9;
        out.push({ x, y, z: tier.d / 2 + 0.06, rotationY: 0, width, height, floor });
        out.push({ x, y, z: -tier.d / 2 - 0.06, rotationY: Math.PI, width, height, floor });
      }
      for (let i = 0; i < perD; i += 1) {
        const z = (-tier.d / 2) * 0.9 + ((i + 0.5) / perD) * tier.d * 0.9;
        out.push({ x: tier.w / 2 + 0.06, y, z, rotationY: Math.PI / 2, width, height, floor });
        out.push({ x: -tier.w / 2 - 0.06, y, z, rotationY: -Math.PI / 2, width, height, floor });
      }
    }
  }
}

/** 円柱の段の窓。ぐるりと一周させる */
function roundWindows(tier: Tier, spacing: number, bands: number, step: number, out: WindowSlot[]): void {
  const radius = tier.w / 2;
  const count = Math.max(8, Math.floor((Math.PI * tier.w) / spacing));
  const width = spacing * 0.55;
  const height = Math.min(1.5, (step * 0.5) / bands);
  for (let floor = tier.from; floor <= tier.to; floor += 1) {
    for (let band = 0; band < bands; band += 1) {
      const y = tier.y0 + (floor - tier.from) * step + step * ((band + 1) / (bands + 1));
      for (let i = 0; i < count; i += 1) {
        const angle = (i / count) * Math.PI * 2;
        out.push({
          x: Math.sin(angle) * (radius + 0.06),
          y,
          z: Math.cos(angle) * (radius + 0.06),
          rotationY: angle,
          width,
          height,
          floor,
        });
      }
    }
  }
}

/** 段の本体。低層は石、上層はガラス */
function tierBody(params: BuildingParams, tier: Tier, pieces: BuildingPiece[]): void {
  const step = floorHeight(params.kind);
  const stoneTop = BASE_HEIGHT + Math.min(STONE_FLOORS, params.floors) * step;
  const cut = Math.min(Math.max(tier.y0, stoneTop), tier.y1);
  const spans: { surface: SurfaceName; y0: number; y1: number }[] = [];
  if (cut > tier.y0) spans.push({ surface: 'stone', y0: tier.y0, y1: cut });
  if (tier.y1 > cut) spans.push({ surface: 'glass', y0: cut, y1: tier.y1 });

  for (const span of spans) {
    const h = span.y1 - span.y0;
    const geometry =
      params.shape === 'cylinder'
        ? new CylinderGeometry(tier.w / 2, tier.w / 2, h, RADIAL_SEGMENTS)
        : new BoxGeometry(tier.w, h, tier.d);
    geometry.translate(0, span.y0 + h / 2, 0);
    pieces.push({ part: 'body', surface: span.surface, geometry });
  }
}

/** 基壇。一段太い足元 */
function basePiece(params: BuildingParams): BuildingPiece {
  const w = params.footprint.w + BASE_OVERHANG * 2;
  const d = params.footprint.d + BASE_OVERHANG * 2;
  const geometry =
    params.shape === 'cylinder'
      ? new CylinderGeometry(w / 2, w / 2, BASE_HEIGHT, RADIAL_SEGMENTS)
      : new BoxGeometry(w, BASE_HEIGHT, d);
  geometry.translate(0, BASE_HEIGHT / 2, 0);
  return { part: 'base', surface: 'stone', geometry };
}

/** 入口。扉と庇 */
function entrancePieces(params: BuildingParams, pieces: BuildingPiece[]): void {
  const d = params.footprint.d;
  const doorW = Math.min(2.2, params.footprint.w * 0.4);
  const door = new BoxGeometry(doorW, 2.4, 0.3);
  door.translate(0, BASE_HEIGHT + 1.2, d / 2 + 0.1);
  pieces.push({ part: 'entrance', surface: 'window', geometry: door });

  const awning = new BoxGeometry(doorW + 1.2, 0.2, 1.4);
  awning.translate(0, BASE_HEIGHT + 2.7, d / 2 + 0.6);
  pieces.push({ part: 'entrance', surface: 'stone', geometry: awning });
}

/** 屋根。平らな屋根にはパラペット、住まいには切妻、事務所には寄棟を載せる */
function roofPieces(params: BuildingParams, top: Tier, pieces: BuildingPiece[], rooftop: RooftopKind[]): number {
  const y = top.y1;
  if (params.roof === 'gable') {
    // 切妻。三角柱を横に倒して載せる
    const height = Math.max(1.6, top.d * 0.28);
    const prism = new ConeGeometry(top.d / 2 / Math.cos(Math.PI / 4), height, 4);
    prism.rotateY(Math.PI / 4);
    prism.scale((top.w / top.d) * 1.06, 1, 1.06);
    prism.translate(0, y + height / 2, 0);
    pieces.push({ part: 'roof', surface: 'roof', geometry: prism });
    return y + height;
  }
  if (params.roof === 'hip') {
    const height = Math.max(1.2, Math.min(top.w, top.d) * 0.22);
    const cone = new ConeGeometry(
      Math.max(top.w, top.d) / 2 / Math.cos(Math.PI / 4),
      height,
      params.shape === 'cylinder' ? RADIAL_SEGMENTS : 4,
    );
    if (params.shape !== 'cylinder') cone.rotateY(Math.PI / 4);
    cone.translate(0, y + height / 2, 0);
    pieces.push({ part: 'roof', surface: 'roof', geometry: cone });
    return y + height;
  }

  // 平らな屋根。ふちにパラペットを回す
  const deck =
    params.shape === 'cylinder'
      ? new CylinderGeometry(top.w / 2, top.w / 2, 0.3, RADIAL_SEGMENTS)
      : new BoxGeometry(top.w, 0.3, top.d);
  deck.translate(0, y + 0.15, 0);
  pieces.push({ part: 'roof', surface: 'stone', geometry: deck });

  if (params.shape === 'cylinder') {
    const ring = new CylinderGeometry(top.w / 2 + 0.2, top.w / 2 + 0.2, 1, RADIAL_SEGMENTS, 1, true);
    ring.translate(0, y + 0.5, 0);
    pieces.push({ part: 'parapet', surface: 'stone', geometry: ring });
  } else {
    const wall = 0.25;
    for (const [w, d, x, z] of [
      [top.w + wall, wall, 0, top.d / 2],
      [top.w + wall, wall, 0, -top.d / 2],
      [wall, top.d + wall, top.w / 2, 0],
      [wall, top.d + wall, -top.w / 2, 0],
    ] as [number, number, number, number][]) {
      const bar = new BoxGeometry(w, 1, d);
      bar.translate(x, y + 0.5, z);
      pieces.push({ part: 'parapet', surface: 'stone', geometry: bar });
    }
  }
  rooftop.push('parapet');
  return y + 1;
}

/** 屋上設備。貯水槽・空調・アンテナ・階段室から 2 つ以上を載せる */
function rooftopPieces(params: BuildingParams, top: Tier, y: number, pieces: BuildingPiece[], rooftop: RooftopKind[]): number {
  const small = Math.min(top.w, top.d);
  let highest = y;

  // 貯水槽。どの建物にも載る
  const tankR = Math.max(0.6, small * 0.13);
  const tank = new CylinderGeometry(tankR, tankR, tankR * 2, RADIAL_SEGMENTS);
  tank.translate(-small * 0.22, y + tankR, -small * 0.18);
  pieces.push({ part: 'rooftop', surface: 'metal', geometry: tank });
  rooftop.push('tank');
  highest = Math.max(highest, y + tankR * 2);

  // 空調の箱。2 台並べる
  const acW = Math.max(0.7, small * 0.16);
  for (let i = 0; i < 2; i += 1) {
    const ac = new BoxGeometry(acW, acW * 0.6, acW);
    ac.translate(small * 0.2, y + acW * 0.3, small * (0.1 + i * 0.22) - small * 0.2);
    pieces.push({ part: 'rooftop', surface: 'metal', geometry: ac });
  }
  rooftop.push('ac');

  // 階段室。低い建物にも屋上の起伏を作る
  if (params.kind !== 'monument') {
    const hut = new BoxGeometry(small * 0.24, 1.6, small * 0.24);
    hut.translate(0, y + 0.8, small * 0.2);
    pieces.push({ part: 'rooftop', surface: 'stone', geometry: hut });
    rooftop.push('stair');
    highest = Math.max(highest, y + 1.6);
  }

  // アンテナ。高い建物にだけ立てる
  if (params.floors >= 10 || params.kind === 'monument') {
    const height = 3 + unit(params.seed, 9) * 4;
    const mast = new CylinderGeometry(0.12, 0.12, height, 8);
    mast.translate(small * 0.1, y + height / 2, -small * 0.1);
    pieces.push({ part: 'rooftop', surface: 'metal', geometry: mast });
    const tip = new SphereGeometry(0.22, 8, 6);
    tip.translate(small * 0.1, y + height, -small * 0.1);
    pieces.push({ part: 'rooftop', surface: 'metal', geometry: tip });
    rooftop.push('antenna');
    highest = Math.max(highest, y + height);
  }
  return highest;
}

/**
 * パラメータから建物の部品を作る。純粋関数。
 * 同じパラメータからは必ず同じ形になる。
 */
export function buildingPieces(params: BuildingParams): BuildingPieces {
  const pieces: BuildingPiece[] = [];
  const windows: WindowSlot[] = [];
  const rooftop: RooftopKind[] = [];
  const tiers = tiersOf(params);
  const step = floorHeight(params.kind);

  pieces.push(basePiece(params));
  for (const tier of tiers) tierBody(params, tier, pieces);

  const { spacing, bands } = windowLayout(params, tiers);
  for (const tier of tiers) {
    if (params.shape === 'cylinder') roundWindows(tier, spacing, bands, step, windows);
    else boxWindows(tier, spacing, bands, step, windows);
  }

  entrancePieces(params, pieces);

  const top = tiers[tiers.length - 1];
  let height = BASE_HEIGHT;
  if (top !== undefined) {
    height = roofPieces(params, top, pieces, rooftop);
    height = rooftopPieces(params, top, height, pieces, rooftop);
  }

  return { pieces, windows, rooftop, height };
}

/**
 * パラメータから建物を組み立てる。DESIGN.md §5 の API。
 * 1 棟だけを見たいとき（試しに描くとき）に使う。
 * 街として並べるときは `scene.ts` が `buildingPieces` を集めて `InstancedMesh` にまとめる。
 */
export function buildMesh(params: BuildingParams): Group {
  const group = new Group();
  const { pieces, windows } = buildingPieces(params);
  const materials = new Map<SurfaceName, MeshStandardMaterial>();
  const materialFor = (surface: SurfaceName): MeshStandardMaterial => {
    const found = materials.get(surface);
    if (found !== undefined) return found;
    const made = new MeshStandardMaterial(SURFACES[surface]);
    materials.set(surface, made);
    return made;
  };

  for (const piece of pieces) {
    const mesh = new Mesh(piece.geometry, materialFor(piece.surface));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { part: piece.part, surface: piece.surface };
    group.add(mesh);
  }

  // 窓は数が多い。1 枚ずつのメッシュにせず、1 つの InstancedMesh にまとめる
  const pane = new BoxGeometry(1, 1, 0.08);
  const windowMesh = new InstancedMesh(pane, materialFor('window'), Math.max(1, windows.length));
  windowMesh.castShadow = false;
  windowMesh.receiveShadow = true;
  const matrix = new Matrix4();
  const quaternion = new Quaternion();
  const position = new Vector3();
  const scale = new Vector3();
  windows.forEach((slot, i) => {
    position.set(slot.x, slot.y, slot.z);
    quaternion.setFromAxisAngle(new Vector3(0, 1, 0), slot.rotationY);
    scale.set(slot.width, slot.height, 1);
    windowMesh.setMatrixAt(i, matrix.compose(position, quaternion, scale));
  });
  windowMesh.instanceMatrix.needsUpdate = true;
  windowMesh.userData = { part: 'window', count: windows.length };
  group.add(windowMesh);
  group.userData = { windows };
  return group;
}
