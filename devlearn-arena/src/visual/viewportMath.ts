/**
 * 図を枠に収め、拡大縮小・平行移動するための計算。
 * 図は左上を原点に描き、translate(x, y) scale(k) で枠の中へ置く（transform-origin は左上）。
 */

export interface View {
  /** 拡大率 */
  k: number;
  /** 枠の左上から見た、図の左上の位置（px） */
  x: number;
  y: number;
}

export interface Size {
  w: number;
  h: number;
}

export const MIN_K = 0.15;
export const MAX_K = 4;
export const IDENTITY: View = { k: 1, x: 0, y: 0 };

export function clampK(k: number): number {
  return Math.min(MAX_K, Math.max(MIN_K, k));
}

/**
 * 図の全体が枠に入る置き方。
 * 小さい図は等倍のまま（読める大きさを保つ）、大きい図は枠に合わせて縮める。
 * 横は真ん中に寄せ、縦は上から並べる（上から読む図が多いため）。
 */
export function fitView(frame: Size, content: Size): View {
  if (frame.w <= 0 || frame.h <= 0 || content.w <= 0 || content.h <= 0) return IDENTITY;
  const k = clampK(Math.min(1, frame.w / content.w, frame.h / content.h));
  return { k, x: Math.max(0, (frame.w - content.w * k) / 2), y: 0 };
}

/** 枠の中の一点 (px, py) を動かさずに拡大率を変える */
export function zoomAround(prev: View, factor: number, px: number, py: number): View {
  const k = clampK(prev.k * factor);
  if (k === prev.k) return prev;
  const ratio = k / prev.k;
  return { k, x: px - (px - prev.x) * ratio, y: py - (py - prev.y) * ratio };
}

/**
 * 図が枠の外へ行き過ぎないよう、平行移動を丸める。
 * 図の端が少なくとも margin だけ枠の中に残るようにする（見失わない）。
 */
export function clampView(view: View, frame: Size, content: Size, margin = 48): View {
  const w = content.w * view.k;
  const h = content.h * view.k;
  const minX = Math.min(0, frame.w - w) - Math.max(0, w - margin);
  const maxX = Math.max(0, frame.w - w) + Math.max(0, frame.w - margin);
  const minY = Math.min(0, frame.h - h) - Math.max(0, h - margin);
  const maxY = Math.max(0, frame.h - h) + Math.max(0, frame.h - margin);
  return {
    k: view.k,
    x: Math.min(maxX, Math.max(minX, view.x)) + 0,
    y: Math.min(maxY, Math.max(minY, view.y)) + 0,
  };
}

/** ホイールの回転量を倍率に直す。上へ回すと拡大 */
export function wheelFactor(deltaY: number): number {
  return Math.exp(-deltaY * 0.0016);
}
