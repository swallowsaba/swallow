import type { Adjustments } from '@/types';
import { HSL_BANDS } from '@/types';
import { IDENTITY_CURVE, packCurveLutRgba } from './tone-curve';
import { isNeutralGrading } from './color-grading';
import { grainAmplitude, grainFrequency, isGrainNeutral } from './grain';
import { isVignetteNeutral } from './postcrop-vignette';

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
 * A simplified 5-point tone curve (shadows/midtones/highlights sliders,
 * -100..100) rather than the full free-form point editor: (0,0) and (1,1) are
 * fixed (pure black/white never move), and the three sliders control interior
 * points at x=0.25 (shadows), x=0.5 (midtones), x=0.75 (highlights).
 *
 * Anchoring shadows/highlights at the curve's absolute endpoints (0 and 1)
 * instead of interior points was a real bug in an earlier version: a point
 * that already sits at y=0 has no room to move further down, so a negative
 * "shadows" delta always clamped straight back to 0 (and symmetrically for a
 * positive "highlights" delta at y=1). Interior anchors fix that.
 */
export interface ToneCurveDeltas {
  shadows: number; // -100..100
  midtones: number; // -100..100
  highlights: number; // -100..100
}

export const NEUTRAL_TONE_CURVE: ToneCurveDeltas = { shadows: 0, midtones: 0, highlights: 0 };

interface CurvePointLike {
  x: number;
  y: number;
}

/** Evaluate an arbitrary set of curve points (sorted by x) as a piecewise
 *  linear curve at a given x, clamping to the end points outside their range. */
function evalCurveAt(curve: readonly CurvePointLike[], x: number): number {
  if (curve.length === 0) return x;
  const sorted = [...curve].sort((a, b) => a.x - b.x);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) return x;
  if (x <= first.x) return first.y;
  if (x >= last.x) return last.y;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (!a || !b) continue;
    if (x >= a.x && x <= b.x) {
      const t = b.x === a.x ? 0 : (x - a.x) / (b.x - a.x);
      return a.y + (b.y - a.y) * t;
    }
  }
  return x;
}

/** Build the 5-point curve from slider deltas (for storing into
 *  Adjustments.toneCurves.rgb). */
export function curveFromToneSliders(d: ToneCurveDeltas): CurvePointLike[] {
  return [
    { x: 0, y: 0 },
    { x: 0.25, y: clamp01(0.25 + d.shadows / 200) },
    { x: 0.5, y: clamp01(0.5 + d.midtones / 200) },
    { x: 0.75, y: clamp01(0.75 + d.highlights / 200) },
    { x: 1, y: 1 },
  ];
}

/** Evaluate the tone curve at input x (0..1), given slider deltas. Built from
 *  the same points {@link curveFromToneSliders} stores, so the preview and
 *  the stored curve can never disagree. */
export function evalToneCurve(x: number, d: ToneCurveDeltas): number {
  return clamp01(evalCurveAt(curveFromToneSliders(d), x));
}

/** Read slider deltas back out of an arbitrary curve (e.g. to restore UI
 *  state). Uses interpolated evaluation at x=0.25/0.5/0.75 rather than a
 *  nearest-point search, so it degrades gracefully for curves that don't
 *  happen to have a point at exactly those x values (like the default
 *  2-point identity line, which correctly reads back as all-zero deltas). */
export function toneSlidersFromCurve(curve: readonly CurvePointLike[]): ToneCurveDeltas {
  const yShadow = evalCurveAt(curve, 0.25);
  const yMid = evalCurveAt(curve, 0.5);
  const yHighlight = evalCurveAt(curve, 0.75);
  return {
    shadows: (yShadow - 0.25) * 200,
    midtones: (yMid - 0.5) * 200,
    highlights: (yHighlight - 0.75) * 200,
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
  fisheye: boolean;
  /** 256×1 RGBA tone-curve LUT: .r/.g/.b = R/G/B curves, .a = master (rgb). */
  curveLut: Uint8ClampedArray;
  /** Color grading: [hue, sat, lum] per wheel, plus blending/balance. */
  gradeShadows: readonly number[];
  gradeMidtones: readonly number[];
  gradeHighlights: readonly number[];
  gradeGlobal: readonly number[];
  gradeBlending: number;
  gradeBalance: number;
  /** 0 when every wheel is neutral, so the shader can skip the whole block. */
  gradeActive: boolean;
  /** Film grain: noise amplitude, cell frequency, and an active flag. */
  grainAmount: number;
  grainFrequency: number;
  grainActive: boolean;
  /** Post-crop vignette params + active flag. */
  pcvAmount: number;
  pcvMidpoint: number;
  pcvRoundness: number;
  pcvFeather: number;
  pcvActive: boolean;
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
  fisheye: false,
  curveLut: packCurveLutRgba(IDENTITY_CURVE, IDENTITY_CURVE, IDENTITY_CURVE, IDENTITY_CURVE),
  gradeShadows: [0, 0, 0],
  gradeMidtones: [0, 0, 0],
  gradeHighlights: [0, 0, 0],
  gradeGlobal: [0, 0, 0],
  gradeBlending: 50,
  gradeBalance: 0,
  gradeActive: false,
  grainAmount: 0,
  grainFrequency: grainFrequency(40),
  grainActive: false,
  pcvAmount: 0,
  pcvMidpoint: 50,
  pcvRoundness: 0,
  pcvFeather: 50,
  pcvActive: false,
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
    fisheye: a.lens.fisheye,
    curveLut: packCurveLutRgba(
      a.toneCurves.rgb,
      a.toneCurves.red,
      a.toneCurves.green,
      a.toneCurves.blue,
    ),
    gradeShadows: wheelArray(a.colorGrading.shadows),
    gradeMidtones: wheelArray(a.colorGrading.midtones),
    gradeHighlights: wheelArray(a.colorGrading.highlights),
    gradeGlobal: wheelArray(a.colorGrading.global),
    gradeBlending: a.colorGrading.blending,
    gradeBalance: a.colorGrading.balance,
    gradeActive: !isNeutralGrading(a.colorGrading),
    grainAmount: grainAmplitude(a.detail.grain),
    grainFrequency: grainFrequency(a.detail.grainSize),
    grainActive: !isGrainNeutral(a.detail.grain),
    pcvAmount: a.detail.vignetteAmount,
    pcvMidpoint: a.detail.vignetteMidpoint,
    pcvRoundness: a.detail.vignetteRoundness,
    pcvFeather: a.detail.vignetteFeather,
    pcvActive: !isVignetteNeutral(a.detail.vignetteAmount),
  };
}

/** Flatten a wheel to the [hue, saturation, luminance] the shader expects. */
function wheelArray(w: { hue: number; saturation: number; luminance: number }): number[] {
  return [w.hue, w.saturation, w.luminance];
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
    // Bands sit only 30-40deg apart, so a wide falloff radius makes adjacent
    // sliders visibly affect each other's colors — confusing behavior. 20deg
    // keeps each band mostly independent while still blending smoothly
    // rather than cutting off hard.
    const weight = Math.max(0, 1 - dist / 20);
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
/**
 * Remap a sample UV for barrel/pincushion distortion, centered at (0.5,0.5).
 * `amount` -100..100 (negative = pincushion, positive = barrel). When
 * `fisheye` is true, uses a stronger, higher-order bulge (a much more
 * pronounced spherical-lens look) instead of the subtle correction curve.
 */
export function distortUv(
  uv: readonly [number, number],
  amount: number,
  aspect: number,
  fisheye = false,
): [number, number] {
  const cx = uv[0] - 0.5;
  const cy = (uv[1] - 0.5) / aspect;
  const r2 = cx * cx + cy * cy;
  let f: number;
  if (fisheye) {
    // A stronger, higher-order bulge: quartic term on top of the quadratic
    // one gives the exaggerated, curved-toward-the-edges fisheye look.
    const k = amount / 120;
    f = 1 + k * r2 + k * k * r2 * r2 * 2;
  } else {
    const k = amount / 300; // keep the effect subtle across the -100..100 range
    f = 1 + k * r2;
  }
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
