function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

/** Blur radius (CSS px), scaled to the image's resolution, given a 0..100
 *  strength. A fixed small radius looks imperceptible on a large photo — 14px
 *  of blur on a 4000px-wide image (an earlier version) is under 0.4% of its
 *  width — so this scales with the image's long edge instead. */
export function backgroundBlurRadiusPx(strength: number, longEdge: number): number {
  return Math.max(2, Math.round((longEdge * clamp01(strength / 100)) / 20));
}
