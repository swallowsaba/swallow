/**
 * Pure dehaze transform, mirrored in the GLSL shader. Bidirectional: positive
 * clears haze (more contrast, deeper blacks), negative adds haze (a light veil
 * that lifts blacks and lowers contrast). Previously the shader clamped the
 * amount to >= 0, so negative values did nothing; this restores the negative
 * side while keeping the exact positive behavior.
 */

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

const clamp01 = (v: number): number => clamp(v, 0, 1);

export function isDehazeNeutral(amount: number): boolean {
  return clamp(amount, -300, 300) === 0;
}

/** Transform one channel value (0..1) by the dehaze amount (-300..300). */
export function dehazeChannel(value: number, amount: number): number {
  const t = clamp(amount, -300, 300) / 100;
  if (t === 0) return clamp01(value);
  // Contrast never inverts (clamped at 0), so strong negative dehaze flattens to
  // a veil rather than solarizing.
  const contrast = Math.max(0, 1 + t * 0.5);
  // The black-lift slope can't exceed the contrast slope, or order would invert
  // when contrast collapses; clamp it so the transform stays monotone.
  const blackShift = Math.max(t * 0.1, -contrast);
  const out = (value - 0.5) * contrast + 0.5 - blackShift * (1 - value);
  return clamp01(out);
}
