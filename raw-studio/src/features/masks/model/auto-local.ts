import type { LocalAdjustments } from '@/types';
import { clamp01, smoothstep } from './mask-alpha';

/**
 * Auto Local: analyze an image and propose a *set* of corrective local masks —
 * one per detected region (sky, shadows, blown highlights) — each with sensible
 * adjustments. Ordinary "auto" tools only nudge the whole frame; proposing
 * separate region masks in one click is the differentiator, and it falls out of
 * the raster-mask machinery for free.
 *
 * Everything here is pure pixel math (no model, no canvas), so the region logic
 * is fully unit-tested. Input is downscaled RGBA in the cropped image's space;
 * outputs are 8-bit coverage buffers in that same space.
 */

export type AutoRegionKind = 'sky' | 'shadows' | 'highlights';

export interface AutoLocalProposal {
  readonly kind: AutoRegionKind;
  readonly adjustments: LocalAdjustments;
  readonly alpha: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
  /** Mean coverage 0..1 (how much of the frame the region occupies). */
  readonly coverage: number;
}

function luma255(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function saturation01(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max <= 0 ? 0 : (max - min) / max;
}

/** Mean of an 8-bit coverage buffer, 0..1. */
export function meanCoverage(alpha: Uint8ClampedArray): number {
  if (alpha.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < alpha.length; i++) sum += alpha[i] ?? 0;
  return sum / (alpha.length * 255);
}

/**
 * Sky: bright, low-saturation, blue-leaning pixels weighted toward the top of
 * the frame. Returns a soft coverage buffer.
 */
export function detectSkyAlpha(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y++) {
    const vpos = height <= 1 ? 0 : y / (height - 1);
    // 1 at the very top, fading out by ~65% down the frame.
    const vertical = 1 - smoothstep(0.15, 0.65, vpos);
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const i = (row + x) * 4;
      const r = rgba[i] ?? 0;
      const g = rgba[i + 1] ?? 0;
      const b = rgba[i + 2] ?? 0;
      const bright = smoothstep(120, 190, luma255(r, g, b));
      const lowSat = 1 - smoothstep(0.15, 0.5, saturation01(r, g, b));
      const blue = smoothstep(-10, 25, b - r); // b noticeably ≥ r
      const score = vertical * bright * lowSat * blue;
      out[row + x] = Math.round(clamp01(score) * 255);
    }
  }
  return out;
}

/** Shadows: dark pixels, feathered around a mid-low luma threshold. */
export function detectShadowAlpha(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height);
  for (let i = 0; i < width * height; i++) {
    const p = i * 4;
    const l = luma255(rgba[p] ?? 0, rgba[p + 1] ?? 0, rgba[p + 2] ?? 0);
    // 1 when very dark, 0 by mid tones.
    const score = 1 - smoothstep(40, 110, l);
    out[i] = Math.round(score * 255);
  }
  return out;
}

/** Highlights: very bright pixels (potentially blown), feathered. */
export function detectHighlightAlpha(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height);
  for (let i = 0; i < width * height; i++) {
    const p = i * 4;
    const l = luma255(rgba[p] ?? 0, rgba[p + 1] ?? 0, rgba[p + 2] ?? 0);
    const score = smoothstep(205, 245, l);
    out[i] = Math.round(score * 255);
  }
  return out;
}

const REGION_ADJUSTMENTS: Record<AutoRegionKind, LocalAdjustments> = {
  sky: { exposure: -0.2, vibrance: 12, clarity: 6 },
  shadows: { exposure: 0.2, shadows: 25, noiseReduction: 10 },
  highlights: { highlights: -30, whites: -12 },
};

/** Minimum/maximum region coverage worth proposing — skip near-empty or
 *  near-whole-frame detections (those are better handled globally). */
const MIN_COVERAGE = 0.02;
const MAX_COVERAGE = 0.75;

/**
 * Propose Auto Local masks for a downscaled cropped RGBA image. Only regions
 * with a meaningful, non-degenerate footprint are returned.
 */
export function proposeAutoLocalMasks(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): AutoLocalProposal[] {
  const detectors: Record<AutoRegionKind, Uint8ClampedArray> = {
    sky: detectSkyAlpha(rgba, width, height),
    shadows: detectShadowAlpha(rgba, width, height),
    highlights: detectHighlightAlpha(rgba, width, height),
  };
  const out: AutoLocalProposal[] = [];
  for (const kind of ['sky', 'shadows', 'highlights'] as AutoRegionKind[]) {
    const alpha = detectors[kind];
    const coverage = meanCoverage(alpha);
    if (coverage < MIN_COVERAGE || coverage > MAX_COVERAGE) continue;
    out.push({
      kind,
      adjustments: REGION_ADJUSTMENTS[kind],
      alpha,
      width,
      height,
      coverage,
    });
  }
  return out;
}
