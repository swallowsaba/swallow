import type {
  Adjustments,
  BasicAdjustments,
  ColorGrading,
  ColorWheel,
  CurvePoint,
  DetailAdjustments,
  HslAdjustments,
  HslBand,
  HslChannel,
  LensCorrections,
  RgbChannel,
  ToneCurves,
} from '@/types';
import { HSL_BANDS } from '@/types';

/**
 * Weighted blending of complete adjustment stacks — the math behind the Look
 * Mixer. Because an entire develop is just a bag of serializable numbers, any
 * set of "looks" (snapshots, presets, the current edit, neutral) can be mixed
 * by a weighted average, producing a new, valid develop that sits continuously
 * between them. This is something an opaque catalog can't offer and this app's
 * pure-numeric EditState makes natural.
 *
 * All functions are pure and framework-free so the interpolation is unit-tested
 * rather than eyeballed. Non-numeric fields (booleans) and tone curves are
 * resolved toward the highest-weight entry; everything else is a true weighted
 * average.
 */

export interface BlendEntry {
  readonly adjustments: Adjustments;
  readonly weight: number;
}

/** Normalize weights to sum to 1. Negative weights are clamped to 0. If every
 *  weight is 0 (or the list is empty) the result is empty and callers fall back
 *  to the first entry. */
export function normalizeWeights(weights: readonly number[]): number[] {
  const clamped = weights.map((w) => (w > 0 ? w : 0));
  const sum = clamped.reduce((a, b) => a + b, 0);
  if (sum === 0) return clamped;
  return clamped.map((w) => w / sum);
}

/** Index of the highest-weight entry (ties resolve to the earliest). */
function dominantIndex(entries: readonly BlendEntry[]): number {
  let best = 0;
  let bestW = -Infinity;
  for (let i = 0; i < entries.length; i++) {
    const w = entries[i]?.weight ?? 0;
    if (w > bestW) {
      bestW = w;
      best = i;
    }
  }
  return best;
}

/** Weighted average of a scalar extracted from each entry. */
function wavg(
  entries: readonly BlendEntry[],
  norm: readonly number[],
  get: (a: Adjustments) => number,
): number {
  let acc = 0;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (!e) continue;
    acc += get(e.adjustments) * (norm[i] ?? 0);
  }
  return acc;
}

function blendBasic(e: readonly BlendEntry[], n: readonly number[]): BasicAdjustments {
  const g =
    (k: keyof BasicAdjustments) =>
    (a: Adjustments): number =>
      a.basic[k];
  return {
    exposure: wavg(e, n, g('exposure')),
    contrast: wavg(e, n, g('contrast')),
    highlights: wavg(e, n, g('highlights')),
    shadows: wavg(e, n, g('shadows')),
    whites: wavg(e, n, g('whites')),
    blacks: wavg(e, n, g('blacks')),
    brightness: wavg(e, n, g('brightness')),
    gamma: wavg(e, n, g('gamma')),
    temperature: wavg(e, n, g('temperature')),
    tint: wavg(e, n, g('tint')),
    saturation: wavg(e, n, g('saturation')),
    vibrance: wavg(e, n, g('vibrance')),
  };
}

function blendDetail(e: readonly BlendEntry[], n: readonly number[]): DetailAdjustments {
  const g =
    (k: keyof DetailAdjustments) =>
    (a: Adjustments): number =>
      a.detail[k];
  return {
    clarity: wavg(e, n, g('clarity')),
    texture: wavg(e, n, g('texture')),
    dehaze: wavg(e, n, g('dehaze')),
    sharpenAmount: wavg(e, n, g('sharpenAmount')),
    sharpenRadius: wavg(e, n, g('sharpenRadius')),
    sharpenDetail: wavg(e, n, g('sharpenDetail')),
    noiseReduction: wavg(e, n, g('noiseReduction')),
    colorNoiseReduction: wavg(e, n, g('colorNoiseReduction')),
    deblur: wavg(e, n, g('deblur')),
    grain: wavg(e, n, g('grain')),
    grainSize: wavg(e, n, g('grainSize')),
    vignetteAmount: wavg(e, n, g('vignetteAmount')),
    vignetteMidpoint: wavg(e, n, g('vignetteMidpoint')),
    vignetteRoundness: wavg(e, n, g('vignetteRoundness')),
    vignetteFeather: wavg(e, n, g('vignetteFeather')),
  };
}

function blendLens(
  e: readonly BlendEntry[],
  n: readonly number[],
  dom: number,
): LensCorrections {
  const g =
    (k: 'distortion' | 'vignetting' | 'chromaticAberration') =>
    (a: Adjustments): number =>
      a.lens[k];
  return {
    distortion: wavg(e, n, g('distortion')),
    vignetting: wavg(e, n, g('vignetting')),
    chromaticAberration: wavg(e, n, g('chromaticAberration')),
    // A boolean can't be averaged; take the dominant look's setting.
    fisheye: e[dom]?.adjustments.lens.fisheye ?? false,
  };
}

function blendWheel(
  e: readonly BlendEntry[],
  n: readonly number[],
  pick: (a: Adjustments) => ColorWheel,
): ColorWheel {
  return {
    hue: wavg(e, n, (a) => pick(a).hue),
    saturation: wavg(e, n, (a) => pick(a).saturation),
    luminance: wavg(e, n, (a) => pick(a).luminance),
  };
}

function blendColorGrading(e: readonly BlendEntry[], n: readonly number[]): ColorGrading {
  return {
    shadows: blendWheel(e, n, (a) => a.colorGrading.shadows),
    midtones: blendWheel(e, n, (a) => a.colorGrading.midtones),
    highlights: blendWheel(e, n, (a) => a.colorGrading.highlights),
    global: blendWheel(e, n, (a) => a.colorGrading.global),
    blending: wavg(e, n, (a) => a.colorGrading.blending),
    balance: wavg(e, n, (a) => a.colorGrading.balance),
  };
}

function blendHsl(e: readonly BlendEntry[], n: readonly number[]): HslAdjustments {
  const out = {} as Record<HslBand, HslChannel>;
  for (const band of HSL_BANDS) {
    out[band] = {
      hue: wavg(e, n, (a) => a.hsl[band].hue),
      saturation: wavg(e, n, (a) => a.hsl[band].saturation),
      luminance: wavg(e, n, (a) => a.hsl[band].luminance),
    };
  }
  return out;
}

/** Piecewise-linear evaluation of a tone curve at input x (clamped at ends). */
export function sampleCurveAt(points: readonly CurvePoint[], x: number): number {
  if (points.length === 0) return x;
  const first = points[0];
  if (!first) return x;
  if (x <= first.x) return first.y;
  const last = points[points.length - 1];
  if (!last) return x;
  if (x >= last.x) return last.y;
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (!a || !b) continue;
    if (x >= a.x && x <= b.x) {
      const span = b.x - a.x;
      const t = span === 0 ? 0 : (x - a.x) / span;
      return a.y + (b.y - a.y) * t;
    }
  }
  return last.y;
}

/**
 * Blend one tone-curve channel. Point counts may differ across looks, so we
 * take the dominant look's x positions and, at each, weight-average every
 * look's sampled y. The result reuses the dominant x grid, keeping curve shape
 * stable while its output morphs.
 */
function blendCurveChannel(
  e: readonly BlendEntry[],
  n: readonly number[],
  dom: number,
  channel: RgbChannel,
): readonly CurvePoint[] {
  const domCurve = e[dom]?.adjustments.toneCurves[channel] ?? [];
  return domCurve.map((pt) => ({
    x: pt.x,
    y: (() => {
      let y = 0;
      for (let i = 0; i < e.length; i++) {
        const entry = e[i];
        if (!entry) continue;
        y += sampleCurveAt(entry.adjustments.toneCurves[channel], pt.x) * (n[i] ?? 0);
      }
      return y;
    })(),
  }));
}

function blendToneCurves(e: readonly BlendEntry[], n: readonly number[], dom: number): ToneCurves {
  const channels: readonly RgbChannel[] = ['rgb', 'red', 'green', 'blue'];
  const out = {} as Record<RgbChannel, readonly CurvePoint[]>;
  for (const ch of channels) {
    out[ch] = blendCurveChannel(e, n, dom, ch);
  }
  return out;
}

/**
 * Blend a set of adjustment stacks by weight into one valid stack. Returns the
 * first entry's adjustments unchanged when weights are degenerate (all zero) so
 * the caller always gets something sensible.
 */
export function blendAdjustments(entries: readonly BlendEntry[]): Adjustments {
  if (entries.length === 0) {
    throw new Error('blendAdjustments requires at least one entry');
  }
  const first = entries[0];
  if (!first) throw new Error('blendAdjustments requires at least one entry');
  if (entries.length === 1) return first.adjustments;

  const norm = normalizeWeights(entries.map((e) => e.weight));
  if (norm.every((w) => w === 0)) return first.adjustments;
  const dom = dominantIndex(entries);

  return {
    basic: blendBasic(entries, norm),
    toneCurves: blendToneCurves(entries, norm, dom),
    hsl: blendHsl(entries, norm),
    colorGrading: blendColorGrading(entries, norm),
    detail: blendDetail(entries, norm),
    lens: blendLens(entries, norm, dom),
  };
}

/** Linear interpolation between two adjustment stacks (t: 0 = a, 1 = b). */
export function lerpAdjustments(a: Adjustments, b: Adjustments, t: number): Adjustments {
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  return blendAdjustments([
    { adjustments: a, weight: 1 - clamped },
    { adjustments: b, weight: clamped },
  ]);
}

/**
 * Bilinear weights for a puck at (x,y) in the unit square over four corners
 * ordered [topLeft, topRight, bottomLeft, bottomRight]. Handy for a 2D "look
 * space" pad.
 */
export function bilinearWeights(x: number, y: number): [number, number, number, number] {
  const cx = x < 0 ? 0 : x > 1 ? 1 : x;
  const cy = y < 0 ? 0 : y > 1 ? 1 : y;
  return [(1 - cx) * (1 - cy), cx * (1 - cy), (1 - cx) * cy, cx * cy];
}
