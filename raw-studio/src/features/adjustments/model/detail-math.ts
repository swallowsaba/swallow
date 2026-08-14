/**
 * Detail-panel combining formulas: clarity, sharpening, and noise reduction
 * are all "push away from / blend toward a local blur" operations. The blur
 * itself is a multi-texel sample only the GPU can do; what's pure and tested
 * here is the *combining formula* — given a pixel and its local average, how
 * much to push or pull. The shader uses these exact formulas with a real
 * neighborhood sample.
 */

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

/** Unsharp-style sharpen: push the pixel away from its local blur. */
export function applySharpen(pixel: number, blurred: number, amount: number): number {
  return clamp01(pixel + (pixel - blurred) * (amount / 100) * 1.5);
}

/** Clarity: same idea as sharpen but a gentler, wider-radius push (midtones). */
export function applyClarity(pixel: number, blurred: number, amount: number): number {
  // Only taper the push down near the TRUE extremes (within ~12% of pure
  // black/white) to avoid clipping/halos there. An earlier version tapered
  // linearly across the whole 0..1 range, which attenuated clarity across
  // most of a typical photo and made the slider feel like it did nothing.
  //
  // Mirrors GLSL's smoothstep() exactly (cubic Hermite) — an earlier version
  // here used a plain linear ramp, which shares the same two endpoints as
  // the shader's smoothstep() but not the same curve shape in between.
  const distFromExtreme = Math.min(pixel, 1 - pixel);
  const t = clamp01(distFromExtreme / 0.12);
  const midWeight = t * t * (3 - 2 * t);
  return clamp01(pixel + (pixel - blurred) * (amount / 100) * 0.6 * midWeight);
}

/** Noise reduction: blend the pixel toward its local blur. */
/** Edge-aware weight (0..1): 1 in flat, low-detail areas (likely noise), 0
 *  near a genuine edge (a large difference between the pixel and its local
 *  average is much more likely to be real detail than grain). `localDiff` is
 *  the magnitude of the difference between the pixel and its neighborhood
 *  average. */
export function edgeAwareWeight(localDiff: number): number {
  // Real photographic noise easily creates local differences in the
  // 0.02-0.12 range (an earlier, too-tight threshold), so that range
  // suppressed noise reduction almost everywhere it was actually needed.
  // Widened: typical noise stays fully smoothable, and only much larger
  // local jumps (genuine edges) get protected.
  //
  // Mirrors GLSL's smoothstep() exactly (cubic Hermite, not a linear ramp) —
  // an earlier version here used a plain linear interpolation between the
  // same two edges, which shares the same endpoints as the shader's
  // smoothstep() but not the same curve shape in between, so it wasn't
  // actually a faithful test of the shader's real behavior.
  const t = clamp01((localDiff - 0.06) / (0.3 - 0.06));
  return 1 - t * t * (3 - 2 * t);
}

/** Noise reduction: blend the pixel toward its local blur, scaled down near
 *  edges so real detail isn't smoothed away along with the noise (an earlier
 *  version had no edge awareness at all, so any real strength just blurred
 *  the whole image, indistinguishable from a plain blur tool). */
export function applyDenoise(
  pixel: number,
  blurred: number,
  amount: number,
  edgeWeight = 1,
): number {
  const t = clamp01(amount / 100) * clamp01(edgeWeight);
  return pixel + (blurred - pixel) * t;
}

/** Simple global dehaze approximation: raise contrast and pull down a haze
 *  tint, proportional to amount. Not a dark-channel-prior implementation. */
export function applyDehaze(pixel: number, amount: number): number {
  const t = amount / 100;
  const contrasted = (pixel - 0.5) * (1 + Math.max(0, t) * 0.5) + 0.5;
  const dehazed = contrasted - Math.max(0, t) * 0.1 * (1 - pixel);
  return clamp01(dehazed);
}
