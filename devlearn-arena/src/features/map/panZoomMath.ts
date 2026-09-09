export interface Viewport {
  /** 拡大率 */
  k: number;
  /** 画面座標での平行移動量（px） */
  x: number;
  y: number;
}

export const MIN_K = 0.5;
export const MAX_K = 6;
export const IDENTITY: Viewport = { k: 1, x: 0, y: 0 };

export function clampK(k: number): number {
  return Math.min(MAX_K, Math.max(MIN_K, k));
}

/**
 * 拡大しても中身が枠の外へ行き過ぎないよう、平行移動量を丸める。
 * 等倍以下では動かす余地がないので中央に戻す。
 */
export function clampPan(v: Viewport, w: number, h: number): Viewport {
  const overflowX = Math.max(0, (w * v.k - w) / 2);
  const overflowY = Math.max(0, (h * v.k - h) / 2);
  // 0 に丸めたときの符号を揃えるため、最後に +0 する（-0 を作らない）
  return {
    k: v.k,
    x: Math.min(overflowX, Math.max(-overflowX, v.x)) + 0,
    y: Math.min(overflowY, Math.max(-overflowY, v.y)) + 0,
  };
}

/**
 * 画面上の一点 (cx, cy) を動かさずに拡大率を変える。
 * cx, cy は枠の中心を原点とした座標。
 */
export function zoomAt(prev: Viewport, factor: number, cx: number, cy: number): Viewport {
  const k = clampK(prev.k * factor);
  if (k === prev.k) return prev;
  const ratio = k / prev.k;
  return { k, x: cx - (cx - prev.x) * ratio, y: cy - (cy - prev.y) * ratio };
}

/** ホイールの回転量を拡大率の倍率に直す。上へ回すと拡大 */
export function wheelFactor(deltaY: number): number {
  return Math.exp(-deltaY * 0.0016);
}

/** 矢印キーでの移動量。押している向きと逆に中身を動かす */
export function keyPan(key: string, step: number): { dx: number; dy: number } | null {
  switch (key) {
    case 'ArrowLeft':
      return { dx: step, dy: 0 };
    case 'ArrowRight':
      return { dx: -step, dy: 0 };
    case 'ArrowUp':
      return { dx: 0, dy: step };
    case 'ArrowDown':
      return { dx: 0, dy: -step };
    default:
      return null;
  }
}
