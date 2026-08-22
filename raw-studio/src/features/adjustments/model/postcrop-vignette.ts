/**
 * Pure post-crop vignette: a per-pixel brightness multiplier applied in the
 * final (cropped) image space. Mirrored line-for-line in the GLSL shader.
 *
 * - amount   -100..100  positive darkens the corners, negative brightens them
 * - midpoint    0..100  how far out the effect starts (bigger = larger clear center)
 * - roundness -100..100  -100 = rectangular falloff, +100 = circular
 * - feather     0..100  edge softness
 */

export interface VignetteParams {
  readonly amount: number;
  readonly midpoint: number;
  readonly roundness: number;
  readonly feather: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x >= edge1 ? 1 : 0;
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function isVignetteNeutral(amount: number): boolean {
  return clamp(amount, -100, 100) === 0;
}

/** Brightness multiplier at normalized position (u,v) in 0..1. 1 = unchanged. */
export function postCropVignetteFactor(u: number, v: number, p: VignetteParams): number {
  const amt = clamp(p.amount, -100, 100) / 100;
  if (amt === 0) return 1;
  const cx = u - 0.5;
  const cy = v - 0.5;
  const circular = Math.min(1, Math.hypot(cx, cy) / 0.7071067811865476);
  const rect = Math.min(1, Math.max(Math.abs(cx), Math.abs(cy)) / 0.5);
  const round = clamp(p.roundness, -100, 100) / 100; // -1 rect .. +1 circular
  const r = rect + (circular - rect) * ((round + 1) / 2);
  const mid = clamp(p.midpoint, 0, 100) / 100;
  const feather = Math.max(0.001, clamp(p.feather, 0, 100) / 100);
  const t = smoothstep(mid, Math.min(1, mid + feather), r);
  // amt>0 darkens edges (factor<1); amt<0 brightens (factor>1).
  return 1 - amt * t;
}
