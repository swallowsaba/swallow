/**
 * Pure "deblur" / focus-recovery transform, mirrored in the GLSL shader. It's a
 * wider-radius unsharp mask with two refinements over plain sharpening:
 *   - a soft threshold, so flat areas (sensor noise) aren't amplified;
 *   - overshoot clamping, so strong settings recover edge contrast without the
 *     white/black halos plain unsharp produces.
 * `blurred` is a wide local average the shader samples; this file owns only the
 * combining formula so it can be unit-tested.
 */

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

export function isDeblurNeutral(amount: number): boolean {
  return Math.max(0, Math.min(100, amount)) <= 0;
}

/**
 * @param pixel     the current pixel value (0..1, one channel)
 * @param blurred   a wide local average of the neighborhood (0..1)
 * @param amount    0..100 strength
 * @param threshold detail magnitude below which nothing is boosted (noise floor)
 */
export function applyDeblur(
  pixel: number,
  blurred: number,
  amount: number,
  threshold = 0.02,
): number {
  const amt = Math.max(0, Math.min(100, amount)) / 100;
  if (amt === 0) return clamp01(pixel);
  const detail = pixel - blurred;
  const mag = Math.abs(detail);
  if (mag <= threshold) return clamp01(pixel); // flat area: leave noise alone
  const sign = detail < 0 ? -1 : 1;
  // Soft threshold: remove the noise floor before boosting.
  const soft = detail - sign * threshold;
  const boost = soft * amt * 2.0;
  // Halo suppression: never push further than 1.5x the real detail magnitude.
  const limit = mag * 1.5;
  const limited = Math.max(-limit, Math.min(limit, boost));
  return clamp01(pixel + limited);
}
