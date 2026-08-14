import { linearToSrgb, srgbToLinear } from './adjustment-math';

/**
 * The classic Lightroom/Camera Raw "white balance selector": the person
 * clicks a spot in the photo that should be neutral gray/white (e.g. a wall,
 * a shirt, a gray card), and this computes the exact temperature/tint that
 * makes that sample neutral (r == g == b), inverting the same formula the
 * shader uses for white balance:
 *
 *   rMul = 1 + 0.4*temp + 0.1*tint
 *   gMul = 1 - 0.3*tint
 *   bMul = 1 - 0.4*temp + 0.1*tint
 *
 * Solved in LINEAR light (matching where the shader applies these
 * multipliers), not sRGB, for accuracy at larger corrections.
 */
export interface WhiteBalanceResult {
  temperature: number;
  tint: number;
}

/** Solve a 2x2 linear system [[a11,a12],[a21,a22]] * [x,y] = [b1,b2]. */
function solve2x2(
  a11: number,
  a12: number,
  a21: number,
  a22: number,
  b1: number,
  b2: number,
): [number, number] | null {
  const det = a11 * a22 - a12 * a21;
  if (Math.abs(det) < 1e-9) return null;
  const x = (b1 * a22 - a12 * b2) / det;
  const y = (a11 * b2 - b1 * a21) / det;
  return [x, y];
}

/**
 * Compute the temperature/tint that neutralizes a sampled sRGB color
 * (0..255 per channel). Returns {temperature: 0, tint: 0} for a
 * degenerate/already-neutral sample.
 */
export function computeWhiteBalanceFromSample(
  r255: number,
  g255: number,
  b255: number,
): WhiteBalanceResult {
  const r = Math.max(1e-4, srgbToLinear(r255 / 255));
  const g = Math.max(1e-4, srgbToLinear(g255 / 255));
  const b = Math.max(1e-4, srgbToLinear(b255 / 255));

  const a11 = 0.4 * r;
  const a12 = 0.1 * r + 0.3 * g;
  const b1 = g - r;
  const a21 = -0.4 * b;
  const a22 = 0.1 * b + 0.3 * g;
  const b2 = g - b;

  const solved = solve2x2(a11, a12, a21, a22, b1, b2);
  if (!solved) return { temperature: 0, tint: 0 };
  const [t, u] = solved;
  return { temperature: t * 100, tint: u * 100 };
}

/** Apply the same WB formula the shader uses, for verifying a solution. */
export function applyWhiteBalanceLinear(
  rgbLinear: readonly [number, number, number],
  temperature: number,
  tint: number,
): [number, number, number] {
  const t = temperature / 100;
  const u = tint / 100;
  const rMul = Math.max(0, 1 + 0.4 * t + 0.1 * u);
  const gMul = Math.max(0, 1 - 0.3 * u);
  const bMul = Math.max(0, 1 - 0.4 * t + 0.1 * u);
  return [rgbLinear[0] * rMul, rgbLinear[1] * gMul, rgbLinear[2] * bMul];
}

/** Convenience: sample (0..255 sRGB) -> corrected sRGB, for visual checks. */
export function previewCorrectedSample(
  r255: number,
  g255: number,
  b255: number,
  temperature: number,
  tint: number,
): [number, number, number] {
  const lin: [number, number, number] = [
    srgbToLinear(r255 / 255),
    srgbToLinear(g255 / 255),
    srgbToLinear(b255 / 255),
  ];
  const corrected = applyWhiteBalanceLinear(lin, temperature, tint);
  return [
    linearToSrgb(corrected[0]) * 255,
    linearToSrgb(corrected[1]) * 255,
    linearToSrgb(corrected[2]) * 255,
  ];
}
