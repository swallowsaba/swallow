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

/** 矩形と凸な多角形が重なるか（分離軸で調べる）。毎フレーム何千回も呼ぶので、配列を作らずに数える */
export function rectHitsPolygon(r: ScreenRect, poly: readonly { x: number; y: number }[]): boolean {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  if (maxX <= r.x0 || minX >= r.x1 || maxY <= r.y0 || minY >= r.y1) return false;
  const n = poly.length;
  for (let i = 0; i < n; i += 1) {
    const a = poly[i] as { x: number; y: number };
    const b = poly[(i + 1) % n] as { x: number; y: number };
    const nx = b.y - a.y;
    const ny = a.x - b.x;
    let p0 = Infinity;
    let p1 = -Infinity;
    for (const p of poly) {
      const v = p.x * nx + p.y * ny;
      if (v < p0) p0 = v;
      if (v > p1) p1 = v;
    }
    // 矩形の 4 隅の射影の幅
    const ax = nx * r.x0;
    const bx = nx * r.x1;
    const ay = ny * r.y0;
    const by = ny * r.y1;
    const q0 = Math.min(ax, bx) + Math.min(ay, by);
    const q1 = Math.max(ax, bx) + Math.max(ay, by);
    if (p1 <= q0 || q1 <= p0) return false;
  }
  return true;
}

/** 障害物の外接矩形を先に求めておく（名札 1 枚ごとに何十もの位置を試すので、毎回求め直さない） */
interface Prepared extends ScreenRect {
  poly: readonly { x: number; y: number }[] | null;
}

function prepare(o: Obstacle): Prepared {
  if ('x0' in o) return { x0: o.x0, y0: o.y0, x1: o.x1, y1: o.y1, poly: null };
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of o) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  return { x0, y0, x1, y1, poly: o };
}

/** rectHitsPolygon・overlaps と同じ判定（外接矩形で先にふるい落とす） */
function hits(rect: ScreenRect, o: Prepared): boolean {
  if (!o.poly) return overlaps(rect, o);
  if (o.x1 <= rect.x0 || o.x0 >= rect.x1 || o.y1 <= rect.y0 || o.y0 >= rect.y1) return false;
  return rectHitsPolygon(rect, o.poly);
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
  const blocks = obstacles.map(prepare);
  const tries = new Map<string, { dx: number; dy: number }[]>();
  for (const r of order) {
    const key = `${String(r.width)}x${String(r.height)}`;
    const list = tries.get(key) ?? candidates(r.width, r.height);
    tries.set(key, list);
    for (const c of list) {
      const x = r.ax - r.width / 2 + c.dx;
      const y = r.ay - r.height - GAP + c.dy;
      const rect = { x0: x, y0: y, x1: x + r.width, y1: y + r.height };
      if (rect.x0 < left || rect.x1 > right || rect.y0 < top || rect.y1 > bottom) continue;
      if (placed.some((p) => overlaps(rect, { x0: p.x, y0: p.y, x1: p.x + p.width, y1: p.y + p.height }, PAD))) continue;
      if (blocks.some((o) => hits(rect, o))) continue;
      placed.push({ id: r.id, x, y, width: r.width, height: r.height, ax: r.ax, ay: r.ay, leader: c.dx !== 0 || c.dy !== 0 });
      break;
    }
  }
  return placed;
}
