import { project } from './projection';

/**
 * 奥から手前への描画順（docs/city-design.md 1 章の層「建物と木」）。
 * 重ならない箱どうしは、分ける軸（x・y・z）で前後が決まる。画面の上で重なる組だけを比べ、
 * 位相順に並べる。回した後の座標（見る向き）で渡すこと。
 */

export interface DepthBox {
  min: readonly [number, number, number];
  max: readonly [number, number, number];
}

const EPS = 1e-6;

/** a を b より先に描くなら負、後なら正、決まらなければ 0 */
export function compareBoxes(a: DepthBox, b: DepthBox): number {
  if (a.max[0] <= b.min[0] + EPS) return -1;
  if (b.max[0] <= a.min[0] + EPS) return 1;
  if (a.max[1] <= b.min[1] + EPS) return -1;
  if (b.max[1] <= a.min[1] + EPS) return 1;
  if (a.max[2] <= b.min[2] + EPS) return -1;
  if (b.max[2] <= a.min[2] + EPS) return 1;
  return 0;
}

interface Range {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

function screenRange(b: DepthBox): Range {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const x of [b.min[0], b.max[0]]) for (const y of [b.min[1], b.max[1]]) for (const z of [b.min[2], b.max[2]]) {
    const s = project({ x, y, z });
    x0 = Math.min(x0, s.sx); x1 = Math.max(x1, s.sx); y0 = Math.min(y0, s.sy); y1 = Math.max(y1, s.sy);
  }
  return { x0, x1, y0, y1 };
}

function centerKey(b: DepthBox): number {
  return ((b.min[0] + b.max[0] + b.min[1] + b.max[1]) / 2) * 1000 + b.min[2];
}

/** 小さい順に取り出す二分ヒープ */
class Heap {
  private items: number[] = [];
  constructor(private readonly key: (i: number) => number) {}
  get size(): number {
    return this.items.length;
  }
  push(i: number): void {
    const a = this.items;
    a.push(i);
    let c = a.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (this.key(a[p] as number) <= this.key(a[c] as number)) break;
      [a[p], a[c]] = [a[c] as number, a[p] as number];
      c = p;
    }
  }
  pop(): number {
    const a = this.items;
    const top = a[0] as number;
    const last = a.pop() as number;
    if (a.length > 0) {
      a[0] = last;
      let p = 0;
      for (;;) {
        const l = p * 2 + 1;
        const r = l + 1;
        let m = p;
        if (l < a.length && this.key(a[l] as number) < this.key(a[m] as number)) m = l;
        if (r < a.length && this.key(a[r] as number) < this.key(a[m] as number)) m = r;
        if (m === p) break;
        [a[p], a[m]] = [a[m] as number, a[p] as number];
        p = m;
      }
    }
    return top;
  }
}

/** 箱の並びを、奥から手前の描画順に並べた番号の列を返す */
export function depthOrder(boxes: readonly DepthBox[]): number[] {
  const n = boxes.length;
  const ranges = boxes.map(screenRange);
  const keys = boxes.map(centerKey);
  const after: number[][] = boxes.map(() => []);
  const indeg = new Array<number>(n).fill(0);

  // 画面の x の範囲で掃いて、重なりうる組だけを比べる
  const byX = boxes.map((_, i) => i).sort((i, j) => (ranges[i] as Range).x0 - (ranges[j] as Range).x0);
  for (let s = 0; s < n; s += 1) {
    const i = byX[s] as number;
    const ri = ranges[i] as Range;
    for (let t = s + 1; t < n; t += 1) {
      const j = byX[t] as number;
      const rj = ranges[j] as Range;
      if (rj.x0 >= ri.x1) break;
      if (rj.y0 >= ri.y1 || ri.y0 >= rj.y1) continue;
      let c = compareBoxes(boxes[i] as DepthBox, boxes[j] as DepthBox);
      if (c === 0) c = (keys[i] as number) - (keys[j] as number);
      if (c < 0) {
        (after[i] as number[]).push(j);
        indeg[j] = (indeg[j] as number) + 1;
      } else if (c > 0) {
        (after[j] as number[]).push(i);
        indeg[i] = (indeg[i] as number) + 1;
      }
    }
  }

  const heap = new Heap((i) => keys[i] as number);
  for (let i = 0; i < n; i += 1) if (indeg[i] === 0) heap.push(i);
  const out: number[] = [];
  const done = new Array<boolean>(n).fill(false);
  while (out.length < n) {
    if (heap.size === 0) {
      // 循環した時は、残りで一番奥の物から出す
      let best = -1;
      for (let i = 0; i < n; i += 1) if (!done[i] && (best < 0 || (keys[i] as number) < (keys[best] as number))) best = i;
      indeg[best] = 0;
      heap.push(best);
    }
    const i = heap.pop();
    if (done[i]) continue;
    done[i] = true;
    out.push(i);
    for (const j of after[i] as number[]) {
      indeg[j] = (indeg[j] as number) - 1;
      if (indeg[j] === 0 && !done[j]) heap.push(j);
    }
  }
  return out;
}
