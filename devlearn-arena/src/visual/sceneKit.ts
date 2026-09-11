/**
 * 図の部品を置くための小さな道具。
 * 図はどれも「状態 → 位置の決まった部品の一覧」を純粋な関数で作り、描画はそれをなぞるだけにする。
 * 位置を先に決め切るので、画面の大きさを測らずに線が引け、テストで位置関係を確かめられる。
 */

export interface Point {
  x: number;
  y: number;
}

export interface Box extends Point {
  w: number;
  h: number;
}

/** 等幅の文字を並べたときのおおよその幅。全角は半角の倍で数える */
export function textWidth(text: string, size = 12): number {
  let units = 0;
  for (const ch of text) units += isWide(ch) ? 1 : 0.62;
  return Math.ceil(units * size);
}

/** 全角として数える文字（CJK・全角記号） */
function isWide(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  return (code >= 0x3000 && code <= 0x9fff) || (code >= 0xff00 && code <= 0xffef);
}

/** 長すぎる文字を、指定の幅に収まるよう末尾を … にする */
export function clip(text: string, maxWidth: number, size = 12): string {
  if (textWidth(text, size) <= maxWidth) return text;
  let out = '';
  for (const ch of text) {
    if (textWidth(`${out}${ch}…`, size) > maxWidth) break;
    out += ch;
  }
  return `${out}…`;
}

export const center = (box: Box): Point => ({ x: box.x + box.w / 2, y: box.y + box.h / 2 });
export const bottomOf = (box: Box): Point => ({ x: box.x + box.w / 2, y: box.y + box.h });
export const topOf = (box: Box): Point => ({ x: box.x + box.w / 2, y: box.y });

/** 上から下へ垂れる曲線。親子の線に使う */
export function drop(from: Point, to: Point): string {
  const mid = (from.y + to.y) / 2;
  return `M ${String(from.x)} ${String(from.y)} C ${String(from.x)} ${String(mid)}, ${String(to.x)} ${String(mid)}, ${String(to.x)} ${String(to.y)}`;
}

/** 左から右へ流れる曲線 */
export function flow(from: Point, to: Point): string {
  const mid = (from.x + to.x) / 2;
  return `M ${String(from.x)} ${String(from.y)} C ${String(mid)} ${String(from.y)}, ${String(mid)} ${String(to.y)}, ${String(to.x)} ${String(to.y)}`;
}

/** 図で使う塗り色。文字（濃い茶）が読める明るさにそろえる */
export const FILL = {
  ok: '#a9d892',
  bad: '#f0a293',
  warn: '#f6d27a',
  idle: '#e7dcc4',
  sky: '#bfe3f5',
  old: '#b8c6d9',
  glow: '#f2c14e',
} as const;
