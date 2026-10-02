import type { DepthBox } from './depth';
import { project, type Screen } from './projection';

/**
 * 建物の選択（docs/ui-design.md 4 章: 左クリックで選ぶ）。
 * 画面の点の下にある立体のうち、一番手前に描いた物を選ぶ。背の高い建物の上の方を押しても、その建物が選ばれる。
 */

/** 立体（見る向きの座標の箱）の、画面の上の輪郭（凸包）。拡大率 1 の画素 */
export function boxOutline(b: DepthBox): Screen[] {
  const pts: [number, number][] = [];
  for (const x of [b.min[0], b.max[0]]) for (const y of [b.min[1], b.max[1]]) for (const z of [b.min[2], b.max[2]]) {
    const s = project({ x, y, z });
    pts.push([s.sx, s.sy]);
  }
  pts.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const cross = (o: [number, number], a: [number, number], c: [number, number]): number => (a[0] - o[0]) * (c[1] - o[1]) - (a[1] - o[1]) * (c[0] - o[0]);
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
  return [...lower.slice(0, -1), ...upper.slice(0, -1)].map(([sx, sy]) => ({ sx, sy }));
}

export function insidePolygon(p: Screen, poly: readonly Screen[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = poly[i] as Screen;
    const b = poly[j] as Screen;
    if (a.sy > p.sy !== b.sy > p.sy && p.sx < ((b.sx - a.sx) * (p.sy - a.sy)) / (b.sy - a.sy) + a.sx) inside = !inside;
  }
  return inside;
}

export interface Pickable {
  box: DepthBox;
  /** 描く順の位置（大きいほど手前） */
  position: number;
}

/**
 * 点（拡大率 1 の画素、見る向きの投影の座標）の下にある物の番号。無ければ -1。
 * 重なっていれば、描く順で一番手前の物。
 */
export function pickAt(items: readonly Pickable[], point: Screen): number {
  let best = -1;
  let bestPos = -Infinity;
  items.forEach((item, i) => {
    if (item.position <= bestPos) return;
    if (insidePolygon(point, boxOutline(item.box))) {
      best = i;
      bestPos = item.position;
    }
  });
  return best;
}
