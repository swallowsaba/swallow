import type { Adjustments, ColorWheel, HslChannel } from '@/types';
import { HSL_BANDS } from '@/types';

/**
 * A human-readable, parametric diff between two complete develops. Because an
 * entire develop is just numbers, we can show exactly which controls differ
 * between two looks and by how much — a "what changed" readout no opaque-catalog
 * editor offers. Pure and unit-tested.
 */

export interface DiffEntry {
  /** Short, stable label for the changed control. */
  readonly label: string;
  /** Numeric before/after (omitted for non-numeric changes). */
  readonly from?: number;
  readonly to?: number;
  /** Set for non-numeric changes (tone curves, booleans). */
  readonly note?: string;
}

const EPS = 1e-6;

function pushNum(
  out: DiffEntry[],
  label: string,
  from: number,
  to: number,
): void {
  if (Math.abs(from - to) > EPS) out.push({ label, from, to });
}

function diffWheel(out: DiffEntry[], name: string, a: ColorWheel, b: ColorWheel): void {
  pushNum(out, `${name} Hue`, a.hue, b.hue);
  pushNum(out, `${name} Sat`, a.saturation, b.saturation);
  pushNum(out, `${name} Lum`, a.luminance, b.luminance);
}

function diffHslChannel(out: DiffEntry[], band: string, a: HslChannel, b: HslChannel): void {
  pushNum(out, `HSL ${band} Hue`, a.hue, b.hue);
  pushNum(out, `HSL ${band} Sat`, a.saturation, b.saturation);
  pushNum(out, `HSL ${band} Lum`, a.luminance, b.luminance);
}

const BASIC_LABELS: Record<keyof Adjustments['basic'], string> = {
  exposure: 'Exposure',
  contrast: 'Contrast',
  highlights: 'Highlights',
  shadows: 'Shadows',
  whites: 'Whites',
  blacks: 'Blacks',
  brightness: 'Brightness',
  gamma: 'Gamma',
  temperature: 'Temp',
  tint: 'Tint',
  saturation: 'Saturation',
  vibrance: 'Vibrance',
};

const DETAIL_LABELS: Record<keyof Adjustments['detail'], string> = {
  clarity: 'Clarity',
  texture: 'Texture',
  dehaze: 'Dehaze',
  sharpenAmount: 'Sharpen',
  sharpenRadius: 'Sharpen radius',
  sharpenDetail: 'Sharpen detail',
  noiseReduction: 'Noise',
  colorNoiseReduction: 'Color noise',
  grain: 'Grain',
  grainSize: 'Grain size',
  vignetteAmount: 'Vignette',
  vignetteMidpoint: 'Vignette midpoint',
  vignetteRoundness: 'Vignette roundness',
  vignetteFeather: 'Vignette feather',
};

function curvesEqual(a: Adjustments['toneCurves'], b: Adjustments['toneCurves']): boolean {
  const channels = ['rgb', 'red', 'green', 'blue'] as const;
  for (const ch of channels) {
    const ca = a[ch];
    const cb = b[ch];
    if (ca.length !== cb.length) return false;
    for (let i = 0; i < ca.length; i++) {
      const pa = ca[i];
      const pb = cb[i];
      if (!pa || !pb) return false;
      if (Math.abs(pa.x - pb.x) > EPS || Math.abs(pa.y - pb.y) > EPS) return false;
    }
  }
  return true;
}

/**
 * Diff two develops, most-structural first. Returns numeric entries (with
 * from/to) for changed sliders and note entries for tone-curve/boolean changes.
 */
export function diffAdjustments(a: Adjustments, b: Adjustments): DiffEntry[] {
  const out: DiffEntry[] = [];

  (Object.keys(BASIC_LABELS) as (keyof Adjustments['basic'])[]).forEach((k) => {
    pushNum(out, BASIC_LABELS[k], a.basic[k], b.basic[k]);
  });

  (Object.keys(DETAIL_LABELS) as (keyof Adjustments['detail'])[]).forEach((k) => {
    pushNum(out, DETAIL_LABELS[k], a.detail[k], b.detail[k]);
  });

  pushNum(out, 'Lens distortion', a.lens.distortion, b.lens.distortion);
  pushNum(out, 'Vignette', a.lens.vignetting, b.lens.vignetting);
  pushNum(out, 'Chromatic aberration', a.lens.chromaticAberration, b.lens.chromaticAberration);
  if (a.lens.fisheye !== b.lens.fisheye) {
    out.push({ label: 'Fisheye', note: b.lens.fisheye ? 'on' : 'off' });
  }

  diffWheel(out, 'Grade Shadows', a.colorGrading.shadows, b.colorGrading.shadows);
  diffWheel(out, 'Grade Midtones', a.colorGrading.midtones, b.colorGrading.midtones);
  diffWheel(out, 'Grade Highlights', a.colorGrading.highlights, b.colorGrading.highlights);
  diffWheel(out, 'Grade Global', a.colorGrading.global, b.colorGrading.global);
  pushNum(out, 'Grade blending', a.colorGrading.blending, b.colorGrading.blending);
  pushNum(out, 'Grade balance', a.colorGrading.balance, b.colorGrading.balance);

  for (const band of HSL_BANDS) {
    diffHslChannel(out, band, a.hsl[band], b.hsl[band]);
  }

  if (!curvesEqual(a.toneCurves, b.toneCurves)) {
    out.push({ label: 'Tone curve', note: 'changed' });
  }

  return out;
}

/** Count of changed controls — handy for a compact summary. */
export function diffCount(a: Adjustments, b: Adjustments): number {
  return diffAdjustments(a, b).length;
}

/** Format a numeric delta with a sign, at a sensible precision for the value. */
export function formatDelta(from: number, to: number): string {
  const delta = to - from;
  const abs = Math.abs(delta);
  const digits = abs < 1 ? 2 : abs < 10 ? 1 : 0;
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta.toFixed(digits)}`;
}
