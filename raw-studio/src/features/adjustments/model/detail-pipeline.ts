/**
 * Multipass detail pipeline — kernel math (pure, unit-tested).
 *
 * The GPU denoise is a *separable* bilateral filter run as several passes
 * (horizontal, then vertical, optionally iterated) into ping-pong FBOs. Each
 * pass, for one output pixel, walks a 1-D window of taps and accumulates a
 * range+spatial weighted average. This file owns that 1-D accumulation and the
 * weight tables so the exact math is testable off-GPU; the GLSL mirrors it.
 *
 * Separable bilateral is an approximation of the true 2-D bilateral, but with
 * enough taps and 1-2 iterations it's visually equivalent and dramatically
 * cheaper — which is what makes a large radius affordable in real time.
 */

/** Precompute Gaussian spatial weights for a window of the given radius.
 *  Index 0 is the center; entry i is the weight at distance i. */
export function spatialWeights(radius: number, sigmaSpatial: number): number[] {
  const r = Math.max(0, Math.floor(radius));
  const sig = sigmaSpatial <= 0 ? 1e-6 : sigmaSpatial;
  const out: number[] = [];
  for (let i = 0; i <= r; i++) {
    out.push(Math.exp(-0.5 * (i / sig) * (i / sig)));
  }
  return out;
}

/** Range (value-similarity) weight. 1 at 0 difference, smooth falloff. */
export function rangeWeight(diff: number, sigmaRange: number): number {
  if (sigmaRange <= 0) return diff === 0 ? 1 : 0;
  const x = diff / sigmaRange;
  return Math.exp(-0.5 * x * x);
}

export interface Tap {
  /** channel value at this tap (0..1) */
  readonly v: number;
  /** luma at this tap, used for the range weight (edge stopping) */
  readonly luma: number;
  /** distance from center in pixels (>=0) */
  readonly dist: number;
}

/**
 * One separable-bilateral pass for a single output pixel. `centerLuma` drives
 * the range weight; taps include both sides of the window. Returns the weighted
 * average of tap values (plus the center). With sigmaRange<=0 returns center.
 */
export function bilateralPass1D(
  center: number,
  centerLuma: number,
  taps: readonly Tap[],
  radius: number,
  sigmaSpatial: number,
  sigmaRange: number,
): number {
  if (sigmaRange <= 0) return center;
  const sw = spatialWeights(radius, sigmaSpatial);
  let acc = center * (sw[0] ?? 1);
  let wsum = sw[0] ?? 1;
  for (const t of taps) {
    const di = Math.round(t.dist);
    const spatial = sw[di] ?? 0;
    if (spatial === 0) continue;
    const w = spatial * rangeWeight(t.luma - centerLuma, sigmaRange);
    acc += t.v * w;
    wsum += w;
  }
  return wsum > 0 ? acc / wsum : center;
}

/** Map denoise strength (0..100) to a pixel radius for the kernel. Larger
 *  strength -> wider window -> smooths coarser noise. */
export function denoiseRadius(strength: number): number {
  const s = Math.max(0, Math.min(100, strength)) / 100;
  // 0 disables; 1px at low strength up to ~8px at full.
  return s === 0 ? 0 : Math.round(1 + s * 7);
}

/** Map denoise strength (0..100) to the range sigma (edge-stopping tolerance). */
export function denoiseRangeSigma(strength: number): number {
  const s = Math.max(0, Math.min(100, strength)) / 100;
  return s === 0 ? 0 : 0.04 + s * 0.16; // 0.04..0.20
}

/** Number of iterations (H+V pairs) for a given strength — stronger denoise
 *  benefits from a second sweep to clear coarse blotches. */
export function denoiseIterations(strength: number): number {
  const s = Math.max(0, Math.min(100, strength));
  return s <= 0 ? 0 : s < 60 ? 1 : 2;
}

/** Inputs the renderer already has (strengths in 0..100 / 0..300). */
export interface DetailStrengths {
  readonly noiseReduction: number; // 0..100 luminance
  readonly colorNoiseReduction: number; // 0..100 chroma
  readonly sharpenAmount: number; // 0..300
  readonly sharpenRadius: number; // texels
}

export interface ResolvedDetailParams {
  readonly denoiseRadius: number;
  readonly denoiseRange: number;
  readonly sigmaSpatial: number;
  readonly denoiseIterations: number;
  readonly colorDenoise: number; // 0..1
  readonly sharpenAmount: number; // 0..300
  readonly sharpenRadius: number;
  readonly noiseFloor: number;
}

/** Resolve user strengths into concrete multipass parameters (pure). */
export function resolveDetailParams(s: DetailStrengths): ResolvedDetailParams {
  const radius = denoiseRadius(s.noiseReduction);
  return {
    denoiseRadius: radius,
    denoiseRange: denoiseRangeSigma(s.noiseReduction),
    sigmaSpatial: Math.max(1, radius / 2), // spatial sigma ~ half the radius
    denoiseIterations: denoiseIterations(s.noiseReduction),
    colorDenoise: Math.max(0, Math.min(100, s.colorNoiseReduction)) / 100,
    sharpenAmount: Math.max(0, Math.min(300, s.sharpenAmount)),
    sharpenRadius: Math.max(0.5, s.sharpenRadius),
    noiseFloor: 0.015,
  };
}
