import type { BasicAdjustments } from '@/types';

/**
 * The color pipeline, written in plain TypeScript so it can be unit-tested.
 *
 * IMPORTANT: `processColor` below is a line-for-line mirror of the GLSL
 * fragment shader in `@/features/viewer/model/webgl-renderer`. When you change
 * one, change the other. The shader runs this exact math on the GPU; these
 * functions let us verify the math on the CPU where there is no GPU.
 */

export interface AdjustmentUniforms {
  exposure: number; // EV (stops)
  contrast: number; // -1..1
  highlights: number; // -1..1
  shadows: number; // -1..1
  whites: number; // -1..1
  blacks: number; // -1..1
  brightness: number; // -1..1
  gamma: number; // 0.1..3 (1 = neutral)
  temp: number; // -1..1
  tint: number; // -1..1
  saturation: number; // -1..1
  vibrance: number; // -1..1
}

export const NEUTRAL_UNIFORMS: AdjustmentUniforms = {
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  brightness: 0,
  gamma: 1,
  temp: 0,
  tint: 0,
  saturation: 0,
  vibrance: 0,
};

/** Map the UI's Basic adjustments (mostly -100..100) to normalized uniforms. */
export function toAdjustmentUniforms(b: BasicAdjustments): AdjustmentUniforms {
  return {
    exposure: b.exposure,
    contrast: b.contrast / 100,
    highlights: b.highlights / 100,
    shadows: b.shadows / 100,
    whites: b.whites / 100,
    blacks: b.blacks / 100,
    brightness: b.brightness / 100,
    gamma: b.gamma,
    temp: b.temperature / 100,
    tint: b.tint / 100,
    saturation: b.saturation / 100,
    vibrance: b.vibrance / 100,
  };
}

type Rgb = readonly [number, number, number];

const LUMA: Rgb = [0.2126, 0.7152, 0.0722];

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

function dot(a: Rgb, b: Rgb): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** Apply the full adjustment pipeline to one sRGB color in 0..1. */
export function processColor(input: Rgb, u: AdjustmentUniforms): [number, number, number] {
  // to linear
  let r = srgbToLinear(input[0]);
  let g = srgbToLinear(input[1]);
  let b = srgbToLinear(input[2]);

  // white balance (linear channel gains)
  const rMul = Math.max(0, 1 + 0.4 * u.temp + 0.1 * u.tint);
  const gMul = Math.max(0, 1 - 0.3 * u.tint);
  const bMul = Math.max(0, 1 - 0.4 * u.temp + 0.1 * u.tint);
  r *= rMul;
  g *= gMul;
  b *= bMul;

  // exposure
  const e = Math.pow(2, u.exposure);
  r *= e;
  g *= e;
  b *= e;

  // back to perceptual
  let s: [number, number, number] = [linearToSrgb(r), linearToSrgb(g), linearToSrgb(b)];

  // blacks / whites (weighted to shadows / highlights)
  s = s.map((x) => x + 0.5 * u.blacks * (1 - x) * (1 - x)) as [number, number, number];
  s = s.map((x) => x + 0.5 * u.whites * x * x) as [number, number, number];

  // shadows / highlights (regional)
  s = s.map((x) => x + 0.3 * u.shadows * smoothstep(0.5, 0.0, x)) as [number, number, number];
  s = s.map((x) => x + 0.3 * u.highlights * smoothstep(0.5, 1.0, x)) as [number, number, number];

  // brightness (additive) and contrast (pivot 0.5)
  s = s.map((x) => x + 0.5 * u.brightness) as [number, number, number];
  s = s.map((x) => (x - 0.5) * (1 + u.contrast) + 0.5) as [number, number, number];
  s = s.map(clamp01) as [number, number, number];

  // saturation
  let lum = dot(s, LUMA);
  s = s.map((x) => lum + (x - lum) * (1 + u.saturation)) as [number, number, number];

  // vibrance (weighted by how unsaturated the pixel already is)
  lum = dot(s, LUMA);
  const mx = Math.max(s[0], s[1], s[2]);
  const mn = Math.min(s[0], s[1], s[2]);
  const sat = (mx - mn) / (mx + 1e-4);
  const vibF = 1 + u.vibrance * (1 - sat);
  s = s.map((x) => lum + (x - lum) * vibF) as [number, number, number];

  // gamma
  s = s.map((x) => Math.pow(Math.max(x, 0), 1 / u.gamma)) as [number, number, number];

  return s.map(clamp01) as [number, number, number];
}
