/**
 * 説明に添える絵の、斜め見下ろしの座標計算。
 * 街の地図と同じ見え方（等角投影）でそろえるための数式だけを置く。
 */

/** 1 マスの幅・高さ、高さ 1 あたりの長さ */
export const TW = 40;
export const TH = 20;
export const HU = 18;

/** マス座標（x, y, 高さ z）→ 絵の中の位置 */
export const iso = (x: number, y: number, z = 0): { x: number; y: number } => ({
  x: (x - y) * (TW / 2),
  y: (x + y) * (TH / 2) - z * HU,
});

/** 明るさを変える。面ごとの陰に使う */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) =>
    Math.max(0, Math.min(255, Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount))),
  );
  return `#${ch.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}
