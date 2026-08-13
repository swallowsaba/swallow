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
  const distFromExtreme = Math.min(pixel, 1 - pixel);
  const midWeight = clamp01(distFromExtreme / 0.12);
  return clamp01(pixel + (pixel - blurred) * (amount / 100) * 0.6 * midWeight);
}

/** Noise reduction: blend the pixel toward its local blur. */
export function applyDenoise(pixel: number, blurred: number, amount: number): number {
  const t = clamp01(amount / 100);
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
