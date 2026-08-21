import type { BasicAdjustments } from '@/types';

/**
 * Pure histogram model: per-channel bin counts, an SVG polyline builder for the
 * display, clipping detection, and the mapping from a drag over one of the five
 * tonal zones to a Basic-adjustment change (Lightroom-style). All deterministic
 * and unit-tested; obtaining the downscaled RGBA is done by the component.
 */

const LUMA_R = 0.2126;
const LUMA_G = 0.7152;
const LUMA_B = 0.0722;

export interface ChannelHistogram {
  readonly r: Uint32Array; // 256 bins
  readonly g: Uint32Array;
  readonly b: Uint32Array;
  readonly luma: Uint32Array;
  readonly total: number;
  /** Fraction (0..1) of pixels crushed to 0 / blown to 255, by luma. */
  readonly clipLow: number;
  readonly clipHigh: number;
}

/** Compute per-channel + luma histograms from an RGBA buffer. */
export function computeChannelHistogram(data: Uint8ClampedArray): ChannelHistogram {
  const r = new Uint32Array(256);
  const g = new Uint32Array(256);
  const b = new Uint32Array(256);
  const luma = new Uint32Array(256);
  let total = 0;
  for (let i = 0; i + 3 < data.length; i += 4) {
    const rv = data[i] ?? 0;
    const gv = data[i + 1] ?? 0;
    const bv = data[i + 2] ?? 0;
    r[rv] = (r[rv] ?? 0) + 1;
    g[gv] = (g[gv] ?? 0) + 1;
    b[bv] = (b[bv] ?? 0) + 1;
    const l = Math.min(255, Math.max(0, Math.round(LUMA_R * rv + LUMA_G * gv + LUMA_B * bv)));
    luma[l] = (luma[l] ?? 0) + 1;
    total += 1;
  }
  const clipLow = total === 0 ? 0 : (luma[0] ?? 0) / total;
  const clipHigh = total === 0 ? 0 : (luma[255] ?? 0) / total;
  return { r, g, b, luma, total, clipLow, clipHigh };
}

/** The largest bin count across the given channel (for normalizing height). */
export function peakCount(bins: Uint32Array, ignoreEnds = true): number {
  let peak = 0;
  const start = ignoreEnds ? 1 : 0;
  const end = ignoreEnds ? 255 : 256;
  for (let i = start; i < end; i++) peak = Math.max(peak, bins[i] ?? 0);
  return peak;
}

/**
 * The mean level of a channel as a percentage (0..100) of full scale — a quick
 * read on colour balance (equal R/G/B means a neutral image; a high R with low
 * B means a warm cast). Empty channel -> 0.
 */
export function channelMeanPercent(bins: Uint32Array): number {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < 256; i++) {
    const c = bins[i] ?? 0;
    sum += i * c;
    count += c;
  }
  if (count === 0) return 0;
  return (sum / count / 255) * 100;
}

/**
 * Build an SVG polyline `points` string for a channel over a `width`×`height`
 * box, using a log-ish scale so small populations stay visible. The path spans
 * x=0..width (256 bins) and y=height (0 count) up to y=0 (peak).
 */
export function histogramPolyline(
  bins: Uint32Array,
  width: number,
  height: number,
  peak: number,
): string {
  if (peak <= 0) return `0,${String(height)} ${String(width)},${String(height)}`;
  const logPeak = Math.log1p(peak);
  const pts: string[] = [];
  for (let i = 0; i < 256; i++) {
    const x = (i / 255) * width;
    const norm = Math.log1p(bins[i] ?? 0) / logPeak;
    const y = height - norm * height;
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return pts.join(' ');
}

/** The five draggable tonal zones, left→right, each bound to a Basic field. */
export type ToneZone = 'blacks' | 'shadows' | 'exposure' | 'highlights' | 'whites';

export const TONE_ZONES: readonly { zone: ToneZone; field: keyof BasicAdjustments; from: number; to: number }[] = [
  { zone: 'blacks', field: 'blacks', from: 0.0, to: 0.2 },
  { zone: 'shadows', field: 'shadows', from: 0.2, to: 0.4 },
  { zone: 'exposure', field: 'exposure', from: 0.4, to: 0.6 },
  { zone: 'highlights', field: 'highlights', from: 0.6, to: 0.8 },
  { zone: 'whites', field: 'whites', from: 0.8, to: 1.0 },
];

/** Which zone a normalized x (0..1) falls in. */
export function zoneAt(xNorm: number): ToneZone {
  const x = xNorm < 0 ? 0 : xNorm > 1 ? 1 : xNorm;
  for (const z of TONE_ZONES) {
    if (x >= z.from && x < z.to) return z.zone;
  }
  return 'whites';
}

/**
 * Convert a horizontal drag (in pixels, right = brighten) over a zone into a
 * delta for its Basic field. Exposure is on a -5..5 EV-ish scale; the others are
 * -100..100 sliders, so they scale differently.
 */
export function zoneDragDelta(zone: ToneZone, dragPx: number, trackWidthPx: number): number {
  const frac = trackWidthPx <= 0 ? 0 : dragPx / trackWidthPx;
  if (zone === 'exposure') return frac * 4; // full track ≈ 4 EV
  return frac * 200; // full track ≈ ±100 slider swing
}

/** Clamp a Basic field's value to its valid range after a histogram drag. */
export function clampBasicField(field: keyof BasicAdjustments, value: number): number {
  if (field === 'exposure') return Math.max(-5, Math.min(5, value));
  if (field === 'gamma') return Math.max(0.1, Math.min(4, value));
  return Math.max(-100, Math.min(100, value));
}
