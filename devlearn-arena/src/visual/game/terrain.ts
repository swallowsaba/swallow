import { textWidth, type Box } from '../sceneKit';

/** ゲーム画面の景色を決める計算。描画から切り離し、同じ場所に同じ飾りが出ることをテストで確かめる */

/** 座標から決まる疑似乱数（0〜1）。同じ場所には必ず同じ飾りが出る */
export function cellNoise(x: number, y: number): number {
  let h = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const overlaps = (a: Box, b: Box): boolean =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export type Deco = 'tree' | 'bush' | 'flower' | 'tuft';

/** 空いている場所に置く飾り。avoid の箱（建物や道）には重ねない */
export function decorations(width: number, height: number, avoid: readonly Box[], cell = 48): { kind: Deco; x: number; y: number }[] {
  const out: { kind: Deco; x: number; y: number }[] = [];
  for (let cy = 0; cy * cell < height; cy += 1) {
    for (let cx = 0; cx * cell < width; cx += 1) {
      const box = { x: cx * cell, y: cy * cell, w: cell, h: cell };
      if (box.x + cell > width || box.y + cell > height) continue;
      if (avoid.some((a) => overlaps(box, { x: a.x - 10, y: a.y - 10, w: a.w + 20, h: a.h + 20 }))) continue;
      const n = cellNoise(cx, cy);
      const kind: Deco | null = n < 0.1 ? 'tree' : n < 0.18 ? 'bush' : n < 0.3 ? 'flower' : n < 0.55 ? 'tuft' : null;
      if (kind === null) continue;
      const jitter = Math.floor(cellNoise(cy + 7, cx + 3) * 12);
      out.push({ kind, x: box.x + jitter, y: box.y + jitter / 2 });
    }
  }
  return out;
}

export function signWidth(text: string, size = 12): number {
  return textWidth(text, size) + 16;
}
