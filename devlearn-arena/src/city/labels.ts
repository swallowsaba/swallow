/**
 * 名札の配置（docs/ui-design.md 8 章: 名札は互いに重ならず、建物を隠さない。
 * 重なりそうなら位置をずらし、引き出し線で結ぶ。遠い名札は小さくせずに間引く）。
 * 画面の座標（画素）だけで計算する純粋な関数。
 */

export interface ScreenRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface LabelRequest {
  id: string;
  /** 名札が指す点（建物の上） */
  ax: number;
  ay: number;
  width: number;
  height: number;
  /** 大きいほど先に場所を取る（選んでいる施設・大きな施設） */
  priority: number;
}

export interface PlacedLabel {
  id: string;
  /** 名札の左上 */
  x: number;
  y: number;
  width: number;
  height: number;
  ax: number;
  ay: number;
  /** 指す点から離して置いたので、引き出し線で結ぶ */
  leader: boolean;
}

export interface LabelArea {
  width: number;
  height: number;
  /** 上下左右の、名札を置かない幅（上の帯・建設メニューなど） */
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
}

const GAP = 6;
const PAD = 3;

export function overlaps(a: ScreenRect, b: ScreenRect, pad = 0): boolean {
  return a.x0 < b.x1 + pad && b.x0 < a.x1 + pad && a.y0 < b.y1 + pad && b.y0 < a.y1 + pad;
}

/** 建物の画面の上の輪郭（凸な多角形）。矩形でもよい */
export type Obstacle = ScreenRect | readonly { x: number; y: number }[];

function corners(r: ScreenRect): { x: number; y: number }[] {
  return [{ x: r.x0, y: r.y0 }, { x: r.x1, y: r.y0 }, { x: r.x1, y: r.y1 }, { x: r.x0, y: r.y1 }];
}

/** 矩形と凸な多角形が重なるか（分離軸で調べる） */
export function rectHitsPolygon(r: ScreenRect, poly: readonly { x: number; y: number }[]): boolean {
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  if (Math.max(...xs) <= r.x0 || Math.min(...xs) >= r.x1 || Math.max(...ys) <= r.y0 || Math.min(...ys) >= r.y1) return false;
  const box = corners(r);
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i] as { x: number; y: number };
    const b = poly[(i + 1) % poly.length] as { x: number; y: number };
    const nx = b.y - a.y;
    const ny = a.x - b.x;
    const project = (pts: readonly { x: number; y: number }[]): [number, number] => {
      let lo = Infinity;
      let hi = -Infinity;
      for (const p of pts) {
        const v = p.x * nx + p.y * ny;
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
      return [lo, hi];
    };
    const [p0, p1] = project(poly);
    const [q0, q1] = project(box);
    if (p1 <= q0 || q1 <= p0) return false;
  }
  return true;
}

function hits(rect: ScreenRect, o: Obstacle): boolean {
  return 'x0' in o ? overlaps(rect, o) : rectHitsPolygon(rect, o);
}

/** 試す位置（指す点の真上から、近い順に上・左右・下へ離れていく） */
function candidates(w: number, h: number): { dx: number; dy: number }[] {
  const out: { dx: number; dy: number }[] = [];
  for (let ring = 0; ring <= 7; ring += 1) {
    for (let col = -3; col <= 3; col += 1) {
      for (const dir of [-1, 1]) {
        if (ring === 0 && dir === 1) continue;
        out.push({ dx: col * (w / 2 + 10), dy: dir * ring * (h + 6) });
      }
    }
  }
  // 指す点から近い順（同じなら上を先に）
  return out
    .map((c, i) => ({ ...c, i, d: Math.hypot(c.dx, c.dy * 1.4) + (c.dy > 0 ? h : 0) }))
    .sort((a, b) => a.d - b.d || a.i - b.i)
    .map(({ dx, dy }) => ({ dx, dy }));
}

/**
 * 名札を置く。優先の高い順に、他の名札と建物（obstacles）に重ならない最初の位置を取る。
 * どこにも置けない名札は間引く（返さない）。同じ入力からは同じ配置になる。
 */
export function layoutLabels(requests: readonly LabelRequest[], obstacles: readonly Obstacle[], area: LabelArea): PlacedLabel[] {
  const placed: PlacedLabel[] = [];
  const top = area.top ?? 0;
  const bottom = area.height - (area.bottom ?? 0);
  const left = area.left ?? 0;
  const right = area.width - (area.right ?? 0);
  const order = [...requests].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  for (const r of order) {
    for (const c of candidates(r.width, r.height)) {
      const x = r.ax - r.width / 2 + c.dx;
      const y = r.ay - r.height - GAP + c.dy;
      const rect = { x0: x, y0: y, x1: x + r.width, y1: y + r.height };
      if (rect.x0 < left || rect.x1 > right || rect.y0 < top || rect.y1 > bottom) continue;
      if (placed.some((p) => overlaps(rect, { x0: p.x, y0: p.y, x1: p.x + p.width, y1: p.y + p.height }, PAD))) continue;
      if (obstacles.some((o) => hits(rect, o))) continue;
      placed.push({ id: r.id, x, y, width: r.width, height: r.height, ax: r.ax, ay: r.ay, leader: c.dx !== 0 || c.dy !== 0 });
      break;
    }
  }
  return placed;
}
