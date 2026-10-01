import { faceLight, hud, rgbaOf, shade } from '@/ui/tokens';
import { depthOrder } from '../depth';
import { project, TILE_W, type Rotation } from '../projection';

/**
 * 建物を描くための小さな 3D の模型（docs/city-design.md 7 章・docs/visual-design.md 5 章）。
 *
 * 建物は凸な立体（部品）を組み合わせて作る。部品の面を、見る向きに回し、
 * 光（左上から）で陰を付け、奥から手前の順に並べて「描く命令」の列にする。
 * 描く命令は Canvas（src/city/render）と SVG（施設の素材）の両方で使う。
 *
 * 座標の単位はマス（1 マス = 道路 1 本分）。原点は敷地の奥の角、z は高さ。
 */

export type V3 = readonly [number, number, number];

export interface Poly {
  kind: 'poly';
  pts: readonly V3[];
  color: string;
  /** 自分で光る（窓の灯り・看板）。陰を付けない */
  lit?: boolean;
  alpha?: number;
  /** 0 = 立体の面、1 以上 = 面に貼る物（窓・扉）。同じ部品の中で、面より後に描く */
  layer?: number;
  /** 薄い板。裏からも見える */
  double?: boolean;
  /** 細い棒の面。部品の中で見える面を 1 枚だけ描く（画面では線と変わらないため） */
  thin?: boolean;
}

/** 画面の上で丸く見える物（木の葉の塊・灯り） */
export interface Blob {
  kind: 'blob';
  center: V3;
  /** 横の半径（マス） */
  r: number;
  /** 縦の半径の、横に対する比 */
  squash?: number;
  color: string;
  lit?: boolean;
  alpha?: number;
  layer?: number;
}

export type Shape = Poly | Blob;

export interface Part {
  shapes: Shape[];
  /** 描画順の判定に使う、部品の範囲（見る前の座標） */
  min: V3;
  max: V3;
}

export interface Model {
  /** 敷地の大きさ（マス） */
  w: number;
  d: number;
  parts: Part[];
  /** 地面に貼る物（敷地の舗装・芝・白線）。影より先に描く */
  ground?: Poly[];
  /** 接地の影を落とす高さ（マス）。0 なら影なし */
  shadowHeight: number;
}

/* ---------- 描く命令 ---------- */

export type DrawOp =
  | { kind: 'poly'; pts: number[]; fill: string; alpha?: number }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number; fill: string; alpha?: number };

export interface Drawing {
  ops: DrawOp[];
  /** 画面の上での範囲（ズーム 1、接地の中心が原点） */
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

/* ---------- 回転 ---------- */

/** 敷地の中で、見る向きに回す。w×d の敷地は奇数回で d×w になる */
export function rotateLocal(p: V3, rotation: Rotation, w: number, d: number): V3 {
  const [x, y, z] = p;
  switch (rotation) {
    case 0:
      return [x, y, z];
    case 1:
      return [d - y, x, z];
    case 2:
      return [w - x, d - y, z];
    case 3:
      return [y, w - x, z];
  }
}

export function rotatedSize(rotation: Rotation, w: number, d: number): { w: number; d: number } {
  return rotation % 2 === 0 ? { w, d } : { w: d, d: w };
}

/* ---------- 光 ---------- */

/** 面の法線（Newell の方法）。長さ 1 */
export function normalOf(pts: readonly V3[]): V3 {
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    if (!a || !b) continue;
    nx += (a[1] - b[1]) * (a[2] + b[2]);
    ny += (a[2] - b[2]) * (a[0] + b[0]);
    nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
}

/** 見る人の方向（この投影で 1 点に潰れる向き） */
const VIEW: V3 = [1, 1, 1];

/** 法線が見る人の側を向いているか */
export function facesViewer(n: V3): boolean {
  return n[0] * VIEW[0] + n[1] * VIEW[1] + n[2] * VIEW[2] > 1e-6;
}

/**
 * 面の明るさ。光は画面の左上から。
 * 上面 1.0・左面（+y を向く）0.8・右面（+x を向く）0.6（docs/visual-design.md 5 章）
 */
export function brightness(n: V3): number {
  const base = faceLight.right;
  return base + (faceLight.left - base) * Math.max(0, n[1]) + (faceLight.top - base) * Math.max(0, n[2])
    - 0.1 * Math.max(0, -n[1]) - 0.1 * Math.max(0, -n[0]);
}

/* ---------- 並べ替え ---------- */

function boundsOf(points: readonly V3[]): { min: V3; max: V3 } {
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (const [x, y, z] of points) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); z0 = Math.min(z0, z);
    x1 = Math.max(x1, x); y1 = Math.max(y1, y); z1 = Math.max(z1, z);
  }
  return { min: [x0, y0, z0], max: [x1, y1, z1] };
}

/* ---------- 影 ---------- */

/** 凸包（画面の点の組） */
function hull(points: [number, number][]): [number, number][] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]): number =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2] as [number, number], lower[lower.length - 1] as [number, number], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: [number, number][] = [];
  for (const p of [...pts].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2] as [number, number], upper[upper.length - 1] as [number, number], p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

export const SHADOW_COLOR = rgbaOf(hud.bg, 0.3);

/* ---------- 組み立て ---------- */

/**
 * 模型を、見る向き rotation で描く命令の列にする。
 * 原点は敷地の中心の地面。ズーム 1 の画素。
 */
export function meshModel(model: Model, rotation: Rotation): Drawing {
  const size = rotatedSize(rotation, model.w, model.d);
  const ox = size.w / 2;
  const oy = size.d / 2;
  const toScreen = (p: V3): [number, number] => {
    const s = project({ x: p[0] - ox, y: p[1] - oy, z: p[2] });
    return [s.sx, s.sy];
  };

  const ops: DrawOp[] = [];

  for (const g of model.ground ?? []) {
    const pts = g.pts.map((p) => rotateLocal(p, rotation, model.w, model.d));
    ops.push({ kind: 'poly', pts: pts.flatMap(toScreen), fill: g.color, alpha: g.alpha });
  }

  // 接地の影: 敷地の矩形と、それを右下（見る向きの +x）へずらした矩形の凸包
  if (model.shadowHeight > 0) {
    const len = model.shadowHeight * 0.9;
    const corners: V3[] = [[0, 0, 0], [size.w, 0, 0], [size.w, size.d, 0], [0, size.d, 0]];
    const pts: [number, number][] = [];
    for (const c of corners) {
      pts.push(toScreen(c));
      pts.push(toScreen([c[0] + len, c[1] + len * 0.25, 0]));
    }
    ops.push({ kind: 'poly', pts: hull(pts).flat(), fill: SHADOW_COLOR });
  }

  const placed = model.parts.map((part) => {
    const a = rotateLocal(part.min, rotation, model.w, model.d);
    const b = rotateLocal(part.max, rotation, model.w, model.d);
    return { part, ...boundsOf([a, b]) };
  });

  for (const index of depthOrder(placed)) {
    const { part } = placed[index] as (typeof placed)[number];
    const shapes = part.shapes
      .map((shape, index) => ({ shape, index }))
      .sort((p, q) => (p.shape.layer ?? 0) - (q.shape.layer ?? 0) || p.index - q.index);
    let thinDone = false;
    for (const { shape } of shapes) {
      if (shape.kind === 'poly' && shape.thin && thinDone) continue;
      if (shape.kind === 'blob') {
        const c = rotateLocal(shape.center, rotation, model.w, model.d);
        const [cx, cy] = toScreen(c);
        const rx = shape.r * (TILE_W / 2) * Math.SQRT2 * 0.72;
        ops.push({ kind: 'ellipse', cx, cy, rx, ry: rx * (shape.squash ?? 0.9), fill: shape.color, alpha: shape.alpha });
        continue;
      }
      const pts = shape.pts.map((p) => rotateLocal(p, rotation, model.w, model.d));
      const n = normalOf(pts);
      if (!shape.double && !facesViewer(n)) continue;
      const lightN: V3 = facesViewer(n) ? n : [-n[0], -n[1], -n[2]];
      const fill = shape.lit ? shape.color : shade(shape.color, brightness(lightN));
      ops.push({ kind: 'poly', pts: pts.flatMap(toScreen), fill, alpha: shape.alpha });
      if (shape.thin) thinDone = true;
    }
  }

  return { ops, bounds: boundsOfOps(ops) };
}

export function boundsOfOps(ops: readonly DrawOp[]): Drawing['bounds'] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const op of ops) {
    if (op.kind === 'poly') {
      for (let i = 0; i < op.pts.length; i += 2) {
        const x = op.pts[i] as number;
        const y = op.pts[i + 1] as number;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
    } else {
      minX = Math.min(minX, op.cx - op.rx); maxX = Math.max(maxX, op.cx + op.rx);
      minY = Math.min(minY, op.cy - op.ry); maxY = Math.max(maxY, op.cy + op.ry);
    }
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return { minX, minY, maxX, maxY };
}
