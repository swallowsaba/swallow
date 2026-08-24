/**
 * Detail processing v2 — a ground-up rewrite of denoise + sharpen.
 *
 * The old approach did a plain box blur and a naive unsharp mask that shared the
 * same blur. That smears real detail (denoise looked "soft") and amplifies grain
 * (sharpen looked "worse") because neither distinguishes an edge from noise.
 *
 * This module provides the *per-sample math* for two established techniques that
 * do distinguish them, kept pure so they can be unit-tested; the GLSL shader
 * mirrors them across a real sample kernel.
 *
 *  1. Bilateral denoise: average neighbors weighted by how *similar* they are in
 *     value. Neighbors across an edge (large value difference) get near-zero
 *     weight, so edges are preserved while flat-area grain is averaged out.
 *
 *  2. Noise-aware sharpen: unsharp, but the boost is gated by local contrast so
 *     that low-amplitude grain is NOT amplified — only structure above the noise
 *     floor is sharpened. Applied *after* denoise.
 */

/** Gaussian-like range weight for a value difference `d` given sigma. Returns
 *  1 at d=0 and falls off smoothly; never negative. */
export function rangeWeight(d: number, sigma: number): number {
  if (sigma <= 0) return d === 0 ? 1 : 0;
  const x = d / sigma;
  return Math.exp(-0.5 * x * x);
}

/** Map a 0..100 denoise strength to a range-sigma. Stronger denoise -> larger
 *  sigma -> tolerates bigger value differences -> smooths more aggressively. */
export function denoiseSigma(strength: number): number {
  const s = Math.max(0, Math.min(100, strength)) / 100;
  // Range sigma must stay SMALL: photographic noise is low-amplitude, so a small
  // sigma smooths grain while a real edge (a large luma jump) keeps a near-zero
  // range weight and is preserved. Tuned down further after user feedback that
  // it still softened detail. 0 disables; else 0.008..0.032.
  return s === 0 ? 0 : 0.008 + s * 0.024;
}

export interface Sample {
  /** value of this neighbor (single channel, 0..1) */
  readonly v: number;
  /** spatial weight of this neighbor (e.g. Gaussian by distance) */
  readonly spatial: number;
}

/**
 * Bilateral-filter a center value against its neighbor samples. Weight of each
 * neighbor = spatial * rangeWeight(|neighbor - center|). Returns the weighted
 * average (edge-preserving). With sigma<=0 (strength 0) returns the center.
 */
export function bilateral(center: number, neighbors: readonly Sample[], sigma: number): number {
  if (sigma <= 0) return center;
  let wsum = 1; // center has spatial 1, range weight 1
  let acc = center;
  for (const n of neighbors) {
    const w = n.spatial * rangeWeight(n.v - center, sigma);
    acc += n.v * w;
    wsum += w;
  }
  return wsum > 0 ? acc / wsum : center;
}

/**
 * Noise-aware unsharp. `denoised` is the pixel AFTER denoise; `localAvg` is a
 * wider average used as the unsharp low-pass. The detail (denoised - localAvg)
 * is only boosted where its magnitude exceeds a noise floor, so residual grain
 * isn't amplified. amount is 0..100.
 */
export function noiseAwareSharpen(
  denoised: number,
  localAvg: number,
  amount: number,
  noiseFloor = 0.015,
): number {
  const amt = Math.max(0, Math.min(300, amount)) / 100;
  if (amt === 0) return clamp01(denoised);
  const detail = denoised - localAvg;
  const mag = Math.abs(detail);
  if (mag <= noiseFloor) return clamp01(denoised); // grain-level: don't touch
  // Soft-knee above the floor so there's no hard switching artifact.
  const gated = detail * (1 - noiseFloor / mag);
  return clamp01(denoised + gated * amt);
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}
