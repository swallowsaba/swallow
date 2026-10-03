import type { DrawOp } from './mesh';

/**
 * 施設の SVG を 30KB に収めるための、描く命令の詰め方（docs/visual-design.md 5 章）。純粋な計算。
 *
 * 1. 隠れて見えない命令を省く: 奥から手前へ細かい格子に塗り、1 マスも残らなかった命令は描いても見えない
 * 2. 同じ色の命令を 1 つの path にまとめる: 間に重なる命令が無ければ、前の同じ色の命令と一緒に描いてよい
 * どちらも描いた結果の見た目を変えない。
 */

/** 半透明の命令（影など）。下の物を隠さない */
const translucent = (op: DrawOp): boolean => (op.alpha !== undefined && op.alpha < 1) || /^rgba\(/.test(op.fill) && !/,\s*1\)$/.test(op.fill);

type Box = [number, number, number, number];

function boxOf(op: DrawOp): Box {
  if (op.kind === 'ellipse') return [op.cx - op.rx, op.cy - op.ry, op.cx + op.rx, op.cy + op.ry];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < op.pts.length; i += 2) {
    const x = op.pts[i] as number;
    const y = op.pts[i + 1] as number;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  return [x0, y0, x1, y1];
}

/** 命令が塗る格子のマス（マスの中心が中に入るか）を、1 行ずつ visit に渡す */
function scan(op: DrawOp, scale: number, ox: number, oy: number, visit: (row: number, c0: number, c1: number) => void): void {
  const [, by0, bx1, by1] = boxOf(op);
  const r0 = Math.max(0, Math.ceil((by0 - oy) * scale - 0.5));
  const r1 = Math.floor((by1 - oy) * scale - 0.5);
  for (let r = r0; r <= r1; r += 1) {
    const y = oy + (r + 0.5) / scale;
    const xs: number[] = [];
    if (op.kind === 'ellipse') {
      const t = 1 - ((y - op.cy) / op.ry) ** 2;
      if (t < 0) continue;
      const half = op.rx * Math.sqrt(t);
      xs.push(op.cx - half, op.cx + half);
    } else {
      const n = op.pts.length / 2;
      for (let i = 0; i < n; i += 1) {
        const ax = op.pts[i * 2] as number, ay = op.pts[i * 2 + 1] as number;
        const j = (i + 1) % n;
        const bx = op.pts[j * 2] as number, by = op.pts[j * 2 + 1] as number;
        if ((ay <= y && by > y) || (by <= y && ay > y)) xs.push(ax + ((y - ay) / (by - ay)) * (bx - ax));
      }
      xs.sort((a, b) => a - b);
    }
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const c0 = Math.max(0, Math.ceil(((xs[k] as number) - ox) * scale - 0.5));
      const c1 = Math.min(Math.floor((bx1 - ox) * scale), Math.floor(((xs[k + 1] as number) - ox) * scale - 0.5));
      if (c1 >= c0) visit(r, c0, c1);
    }
  }
}

/**
 * 手前の物に全て隠される命令を省く。scale は 1 画素を何マスに分けて調べるか。
 * 半透明の命令は省かず、下の物を隠したことにもしない
 */
export function dropHidden(ops: readonly DrawOp[], scale = 4): DrawOp[] {
  if (ops.length === 0) return [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const op of ops) {
    const b = boxOf(op);
    x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]);
  }
  const w = Math.ceil((x1 - x0) * scale) + 2;
  const h = Math.ceil((y1 - y0) * scale) + 2;
  const owner = new Int32Array(w * h).fill(-1);
  ops.forEach((op, i) => {
    if (translucent(op)) return;
    scan(op, scale, x0, y0, (row, c0, c1) => owner.fill(i, row * w + c0, row * w + c1 + 1));
  });
  const seen = new Uint8Array(ops.length);
  for (const i of owner) if (i >= 0) seen[i] = 1;
  return ops.filter((op, i) => seen[i] === 1 || translucent(op));
}

/** 1 つの path にまとめる命令の組（同じ色・不透明の多角形だけをまとめる） */
export interface OpGroup {
  fill: string;
  alpha?: number | undefined;
  ops: DrawOp[];
}

const overlaps = (a: Box, b: Box): boolean => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

/**
 * 描く順を保ったまま、同じ色の多角形を前の組へまとめる。
 * 前の組とこの命令の間に、この命令と重なる命令が無い時だけまとめる（重ならない物どうしは描く順を入れ替えても同じ見た目）
 */
export function groupOps(ops: readonly DrawOp[]): OpGroup[] {
  const groups: (OpGroup & { boxes: Box[]; mergeable: boolean })[] = [];
  for (const op of ops) {
    const box = boxOf(op);
    const mergeable = op.kind === 'poly' && !translucent(op);
    let target = -1;
    if (mergeable) {
      for (let i = groups.length - 1; i >= 0; i -= 1) {
        const g = groups[i] as (typeof groups)[number];
        if (g.mergeable && g.fill === op.fill) {
          target = i;
          break;
        }
        if (g.boxes.some((b) => overlaps(b, box))) break;
      }
    }
    const t = groups[target];
    if (t) {
      t.ops.push(op);
      t.boxes.push(box);
    } else {
      groups.push({ fill: op.fill, alpha: op.alpha, ops: [op], boxes: [box], mergeable });
    }
  }
  return groups.map(({ fill, alpha, ops: list }) => ({ fill, alpha, ops: list }));
}

/** 多角形の点を、向き（画面の上で時計回り）を揃えて返す。まとめた path の重なりが抜けないように */
export function clockwise(pts: readonly number[]): number[] {
  let area = 0;
  const n = pts.length / 2;
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    area += (pts[i * 2] as number) * (pts[j * 2 + 1] as number) - (pts[j * 2] as number) * (pts[i * 2 + 1] as number);
  }
  if (area >= 0) return [...pts];
  const out: number[] = [];
  for (let i = n - 1; i >= 0; i -= 1) out.push(pts[i * 2] as number, pts[i * 2 + 1] as number);
  return out;
}
