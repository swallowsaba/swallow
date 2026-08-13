import type { Adjustments } from '@/types';
import { HSL_BANDS } from '@/types';

/**
 * Tone curve, HSL color-band, and lens math for the Tone/Color/Lens panels.
 * Pure and unit-tested; mirrored line-for-line in the GLSL fragment shader
 * (see webgl-renderer.ts) the same way adjustment-math.ts is.
 */

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

/* --------------------------- tone curve --------------------------- */

/**
 * A simplified 3-point tone curve (shadows/midtones/highlights sliders,
 * -100..100) rather than the full free-form point editor. Quadratic
 * interpolation through (0, y0), (0.5, y1), (1, y2).
 */
export interface ToneCurveDeltas {
  shadows: number; // -100..100
  midtones: number; // -100..100
  highlights: number; // -100..100
}

export const NEUTRAL_TONE_CURVE: ToneCurveDeltas = { shadows: 0, midtones: 0, highlights: 0 };

/** Evaluate the 3-point curve at input x (0..1), given slider deltas. */
export function evalToneCurve(x: number, d: ToneCurveDeltas): number {
  const y0 = clamp01(0 + d.shadows / 200);
  const y1 = clamp01(0.5 + d.midtones / 200);
  const y2 = clamp01(1 + d.highlights / 200);
  // Piecewise-quadratic through the 3 points, continuous at x=0.5.
  if (x <= 0.5) {
    const t = x / 0.5;
    return clamp01(y0 + (y1 - y0) * t * (2 - t));
  }
  const t = (x - 0.5) / 0.5;
  return clamp01(y1 + (y2 - y1) * t);
}

/** Build a 3-point CurvePoint[] from slider deltas (for storing into
 *  Adjustments.toneCurves.rgb). */
export function curveFromToneSliders(d: ToneCurveDeltas): { x: number; y: number }[] {
  return [
    { x: 0, y: clamp01(0 + d.shadows / 200) },
    { x: 0.5, y: clamp01(0.5 + d.midtones / 200) },
    { x: 1, y: clamp01(1 + d.highlights / 200) },
  ];
}

function nearestY(curve: readonly { x: number; y: number }[], x: number): number | undefined {
  let best: { x: number; y: number } | undefined;
  let bestDist = Infinity;
  for (const p of curve) {
    const dist = Math.abs(p.x - x);
    if (dist < bestDist) {
      bestDist = dist;
      best = p;
    }
  }
  return best?.y;
}

/** Read slider deltas back out of a curve (e.g. to restore UI state). Curves
 *  with fewer than 3 points (like the default identity line) yield 0
 *  midtones since there's no explicit midpoint to read. */
export function toneSlidersFromCurve(curve: readonly { x: number; y: number }[]): ToneCurveDeltas {
  const y0 = nearestY(curve, 0) ?? 0;
  const y2 = nearestY(curve, 1) ?? 1;
  const y1 = curve.length >= 3 ? (nearestY(curve, 0.5) ?? 0.5) : 0.5;
  return {
    shadows: (y0 - 0) * 200,
    midtones: (y1 - 0.5) * 200,
    highlights: (y2 - 1) * 200,
  };
}

/** Everything the shader needs beyond Basic: tone curve, HSL bands, detail,
 *  and lens corrections, flattened to shader-ready shapes. */
export interface AdvancedUniforms {
  toneShadows: number;
  toneMid: number;
  toneHighlights: number;
  hslHue: number[]; // length 8, HSL_BANDS order
  hslSat: number[]; // length 8
  hslLum: number[]; // length 8
  clarity: number;
  texture: number;
  dehaze: number;
  sharpenAmount: number;
  sharpenRadius: number;
  noiseReduction: number;
  colorNoiseReduction: number;
  distortion: number;
  vignetting: number;
  chromaticAberration: number;
}

export const NEUTRAL_ADVANCED: AdvancedUniforms = {
  toneShadows: 0,
  toneMid: 0,
  toneHighlights: 0,
  hslHue: new Array<number>(8).fill(0),
  hslSat: new Array<number>(8).fill(0),
  hslLum: new Array<number>(8).fill(0),
  clarity: 0,
  texture: 0,
  dehaze: 0,
  sharpenAmount: 0,
  sharpenRadius: 1,
  noiseReduction: 0,
  colorNoiseReduction: 0,
  distortion: 0,
  vignetting: 0,
  chromaticAberration: 0,
};

/** Map the full Adjustments object (Tone/Color/Detail/Lens groups) to the
 *  flat shape the shader's uniforms expect. */
export function toAdvancedUniforms(a: Adjustments): AdvancedUniforms {
  const tone = toneSlidersFromCurve(a.toneCurves.rgb);
  const hslHue: number[] = [];
  const hslSat: number[] = [];
  const hslLum: number[] = [];
  for (const band of HSL_BANDS) {
    const c = a.hsl[band];
    hslHue.push(c.hue);
    hslSat.push(c.saturation);
    hslLum.push(c.luminance);
  }
  return {
    toneShadows: tone.shadows,
    toneMid: tone.midtones,
    toneHighlights: tone.highlights,
    hslHue,
    hslSat,
    hslLum,
    clarity: a.detail.clarity,
    texture: a.detail.texture,
    dehaze: a.detail.dehaze,
    sharpenAmount: a.detail.sharpenAmount,
    sharpenRadius: a.detail.sharpenRadius,
    noiseReduction: a.detail.noiseReduction,
    colorNoiseReduction: a.detail.colorNoiseReduction,
    distortion: a.lens.distortion,
    vignetting: a.lens.vignetting,
    chromaticAberration: a.lens.chromaticAberration,
  };
}

export const HSL_BAND_HUES: readonly number[] = [0, 30, 60, 120, 180, 240, 280, 320];
// red,   orange, yellow, green, aqua,  blue,  purple, magenta

export interface HslBandAdjust {
  hue: number; // -100..100 (maps to -/+ 30deg)
  saturation: number; // -100..100
  luminance: number; // -100..100
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return [h, s, l];
}

function hueToRgbChannel(p: number, q: number, t0: number): number {
  let t = t0;
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hn = ((h % 360) + 360) / 360;
  return [
    hueToRgbChannel(p, q, hn + 1 / 3),
    hueToRgbChannel(p, q, hn),
    hueToRgbChannel(p, q, hn - 1 / 3),
  ];
}

/** Circular distance in degrees between two hues, 0..180. */
function hueDist(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * Apply the 8-band HSL adjustments to one RGB color. Each band's influence
 * falls off smoothly (triangular window, 60deg half-width) so bands blend
 * rather than hard-cut.
 */
export function applyHslBands(
  rgb: readonly [number, number, number],
  bands: readonly HslBandAdjust[],
): [number, number, number] {
  const [r, g, b] = rgb;
  const [h, s, l] = rgbToHsl(r, g, b);
  if (s < 1e-4) return [r, g, b]; // achromatic: hue is undefined, nothing to shift

  let hueShift = 0;
  let satAdd = 0;
  let lumAdd = 0;
  for (let i = 0; i < bands.length; i++) {
    const band = bands[i];
    const center = HSL_BAND_HUES[i];
    if (!band || center === undefined) continue;
    const dist = hueDist(h, center);
    const weight = Math.max(0, 1 - dist / 60); // triangular falloff over +-60deg
    if (weight <= 0) continue;
    hueShift += band.hue * 0.3 * weight; // -100..100 -> up to +-30deg per band
    satAdd += (band.saturation / 100) * weight;
    lumAdd += (band.luminance / 100) * 0.25 * weight;
  }

  const [nr, ng, nb] = hslToRgb(h + hueShift, clamp01(s * (1 + satAdd)), clamp01(l + lumAdd));
  return [nr, ng, nb];
}

/* ------------------------------ lens ------------------------------- */

/**
 * Remap a sample UV for barrel/pincushion distortion, centered at (0.5,0.5).
 * `amount` -100..100 (negative = pincushion, positive = barrel).
 */
export function distortUv(
  uv: readonly [number, number],
  amount: number,
  aspect: number,
): [number, number] {
  const k = amount / 300; // keep the effect subtle across the -100..100 range
  const cx = uv[0] - 0.5;
  const cy = (uv[1] - 0.5) / aspect;
  const r2 = cx * cx + cy * cy;
  const f = 1 + k * r2;
  return [0.5 + cx * f, 0.5 + cy * f * aspect];
}

/** Radial vignette multiplier: 1 at center; darkens (amount>0) or brightens
 *  (amount<0) toward the corners. */
export function vignetteFactor(uv: readonly [number, number], amount: number): number {
  const cx = uv[0] - 0.5;
  const cy = uv[1] - 0.5;
  const dist = Math.min(1, Math.sqrt(cx * cx + cy * cy) / Math.SQRT1_2); // 0 center..1 corner
  const strength = amount / 100; // -1..1
  const falloff = dist * dist;
  return Math.max(0, 1 - strength * falloff * 0.8);
}
