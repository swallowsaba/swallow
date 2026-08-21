import type { ColorGrading, ColorWheel } from '@/types';

/**
 * Pure color-grading math, mirrored in the GLSL shader the same way
 * adjustment-math.ts is. Covers the wheel UI's polar<->value conversion, the
 * shadow/midtone/highlight weighting across luma, and applying a wheel's tint.
 *
 * Wheel convention: hue 0..360 (0 = red, increasing counter-clockwise on the
 * UI wheel), saturation -100..100 (negative is unused by the wheel UI but kept
 * for symmetry with the type), luminance -100..100.
 */

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

const clamp01 = (v: number): number => clamp(v, 0, 1);

export const NEUTRAL_WHEEL: ColorWheel = { hue: 0, saturation: 0, luminance: 0 };

/** True when a wheel does nothing (no saturation and no luminance shift). */
export function isNeutralWheel(w: ColorWheel): boolean {
  return w.saturation === 0 && w.luminance === 0;
}

/**
 * Wheel UI position (a point in the unit disc, x right / y up) from a wheel's
 * hue+saturation. Radius maps to saturation 0..100.
 */
export function wheelToPoint(w: ColorWheel): { x: number; y: number } {
  const r = clamp(Math.abs(w.saturation), 0, 100) / 100;
  const rad = (w.hue * Math.PI) / 180;
  return { x: Math.cos(rad) * r, y: Math.sin(rad) * r };
}

/** Hue+saturation from a wheel UI position; radius is clamped to the disc. */
export function pointToWheel(x: number, y: number): { hue: number; saturation: number } {
  const r = Math.min(1, Math.hypot(x, y));
  let deg = (Math.atan2(y, x) * 180) / Math.PI;
  if (deg < 0) deg += 360;
  return { hue: Math.round(deg), saturation: Math.round(r * 100) };
}

/**
 * Weights for the shadow / midtone / highlight wheels at a given luma (0..1).
 * `balance` (-100..100) slides the split point: positive favours highlights.
 * The three weights always sum to 1 so the grade can't blow out totals.
 */
export function tonalWeights(
  luma: number,
  balance: number,
): { shadows: number; midtones: number; highlights: number } {
  const l = clamp01(luma);
  // Balance shifts the midpoint between 0.3 and 0.7. Positive balance raises
  // the split point, so more of the image counts as "shadows".
  const mid = 0.5 + clamp(balance, -100, 100) / 500;
  // Smooth ramps: shadows fall off below mid, highlights rise above it.
  const shadows = 1 - smoothstep(0, mid, l);
  const highlights = smoothstep(mid, 1, l);
  const midtones = Math.max(0, 1 - shadows - highlights);
  const sum = shadows + midtones + highlights;
  if (sum <= 0) return { shadows: 0, midtones: 1, highlights: 0 };
  return { shadows: shadows / sum, midtones: midtones / sum, highlights: highlights / sum };
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x >= edge1 ? 1 : 0;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** The RGB tint a wheel contributes, as a 0..1 color (hue at full value). */
export function wheelTint(w: ColorWheel): { r: number; g: number; b: number } {
  const h = ((w.hue % 360) + 360) % 360;
  const c = 1;
  const x = 1 - Math.abs(((h / 60) % 2) - 1);
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return { r, g, b };
}

/**
 * Apply one wheel to a linear-ish RGB color: mixes toward the wheel's tint by
 * `saturation`, then offsets by `luminance`. `weight` scales the whole effect
 * (used for the tonal blend).
 */
export function applyWheel(
  rgb: { r: number; g: number; b: number },
  w: ColorWheel,
  weight: number,
): { r: number; g: number; b: number } {
  if (weight <= 0 || isNeutralWheel(w)) return rgb;
  const tint = wheelTint(w);
  const sat = (clamp(w.saturation, -100, 100) / 100) * weight;
  const lum = (clamp(w.luminance, -100, 100) / 100) * weight * 0.5;
  const mixed = {
    r: rgb.r + (tint.r - rgb.r) * Math.max(0, sat) * 0.5,
    g: rgb.g + (tint.g - rgb.g) * Math.max(0, sat) * 0.5,
    b: rgb.b + (tint.b - rgb.b) * Math.max(0, sat) * 0.5,
  };
  return {
    r: clamp01(mixed.r + lum),
    g: clamp01(mixed.g + lum),
    b: clamp01(mixed.b + lum),
  };
}

/** True when the whole grading group is a no-op (so the shader can skip it). */
export function isNeutralGrading(g: ColorGrading): boolean {
  return (
    isNeutralWheel(g.shadows) &&
    isNeutralWheel(g.midtones) &&
    isNeutralWheel(g.highlights) &&
    isNeutralWheel(g.global)
  );
}

/**
 * Apply the full grading stack to a color: the three tonal wheels weighted by
 * luma, then the global wheel over everything. `blending` (0..100) scales how
 * strongly the tonal wheels mix.
 */
export function applyColorGrading(
  rgb: { r: number; g: number; b: number },
  g: ColorGrading,
): { r: number; g: number; b: number } {
  if (isNeutralGrading(g)) return rgb;
  const luma = 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;
  const w = tonalWeights(luma, g.balance);
  const blend = clamp(g.blending, 0, 100) / 100;
  let out = rgb;
  out = applyWheel(out, g.shadows, w.shadows * blend);
  out = applyWheel(out, g.midtones, w.midtones * blend);
  out = applyWheel(out, g.highlights, w.highlights * blend);
  out = applyWheel(out, g.global, 1);
  return out;
}
