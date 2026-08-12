import type { BasicAdjustments, PresetAdjustments } from '@/types';
import type { ImageStats } from './image-stats';

/**
 * Classic "AI Auto" adjustments. Each function derives Basic settings from image
 * statistics. Pure and unit-tested — these are the reliable, model-free auto
 * corrections that feed directly into the shader pipeline.
 */

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
function round(n: number, dp = 0): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/** Push median luma toward a pleasing mid-tone (~0.45). */
export function autoExposure(stats: ImageStats): Partial<BasicAdjustments> {
  const target = 0.45;
  const median = Math.max(0.02, stats.medianLuma);
  const ev = clamp(Math.log2(target / median), -3, 3);
  return { exposure: round(ev, 2) };
}

/** Gray-world white balance: neutralize the average color cast. */
export function autoWhiteBalance(stats: ImageStats): Partial<BasicAdjustments> {
  const warm = stats.meanR - stats.meanB; // >0 => too warm
  const green = stats.meanG - (stats.meanR + stats.meanB) / 2; // >0 => too green
  const temperature = clamp(-warm * 220, -100, 100); // cool down a warm cast
  const tint = clamp(green * 220, -100, 100); // add magenta to counter green
  return { temperature: round(temperature), tint: round(tint) };
}

/** Stretch tonal range: recover clipped ends and add mild contrast. */
export function autoContrast(stats: ImageStats): Partial<BasicAdjustments> {
  const spread = stats.p99 - stats.p01;
  const blacks = clamp(-stats.p01 * 200, -60, 0); // deepen lifted shadows
  const whites = clamp((1 - stats.p99) * 200, 0, 60); // brighten dull highlights
  const contrast = clamp((0.85 - spread) * 120, 0, 40); // more contrast if flat
  return { blacks: round(blacks), whites: round(whites), contrast: round(contrast) };
}

/** Add vibrance when the image is under-saturated (never over-saturate). */
export function autoColor(stats: ImageStats): Partial<BasicAdjustments> {
  const vibrance = clamp((0.32 - stats.meanSat) * 220, -15, 45);
  return { vibrance: round(vibrance) };
}

/** Everything at once, merged into a single Basic overlay. */
export function autoAll(stats: ImageStats): PresetAdjustments {
  return {
    basic: {
      ...autoExposure(stats),
      ...autoWhiteBalance(stats),
      ...autoContrast(stats),
      ...autoColor(stats),
    },
  };
}

export type AutoKind = 'tone' | 'wb' | 'color' | 'all';

/** Dispatch a named auto correction to a Basic overlay. */
export function runAuto(kind: AutoKind, stats: ImageStats): PresetAdjustments {
  switch (kind) {
    case 'tone':
      return { basic: { ...autoExposure(stats), ...autoContrast(stats) } };
    case 'wb':
      return { basic: autoWhiteBalance(stats) };
    case 'color':
      return { basic: autoColor(stats) };
    case 'all':
      return autoAll(stats);
  }
}
