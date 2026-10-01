import { clampK, type Size, type View } from '@/visual/viewportMath';

/**
 * 絵の全体が枠に収まる置き方。枠の真ん中に置く。
 * 絵が枠より小さいときは拡大して枠を埋める（街が豆粒にならないように）。
 */
export function fitCity(frame: Size, content: Size): View {
  if (frame.w <= 0 || frame.h <= 0 || content.w <= 0 || content.h <= 0) return { k: 1, x: 0, y: 0 };
  const k = clampK(Math.min(frame.w / content.w, frame.h / content.h));
  return { k, x: (frame.w - content.w * k) / 2, y: (frame.h - content.h * k) / 2 };
}
