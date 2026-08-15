import type {
  Adjustments,
  BasicAdjustments,
  ColorGrading,
  ColorWheel,
  DetailAdjustments,
  EditState,
  Geometry,
  HslAdjustments,
  HslChannel,
  LensCorrections,
  ToneCurves,
} from '@/types';
import { HSL_BANDS } from '@/types';

/**
 * Neutral defaults. Every factory returns a fresh object graph (no shared
 * references) so callers can freely treat the result as their own mutable
 * working copy before it is frozen into an immutable {@link EditState}.
 */

function neutralHslChannel(): HslChannel {
  return { hue: 0, saturation: 0, luminance: 0 };
}

function neutralWheel(): ColorWheel {
  return { hue: 0, saturation: 0, luminance: 0 };
}

/** An identity tone curve: a straight line from black to white. */
function identityCurve(): readonly { x: number; y: number }[] {
  return [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
  ];
}

export function createDefaultBasicAdjustments(): BasicAdjustments {
  return {
    exposure: 0,
    contrast: 0,
    highlights: 0,
    shadows: 0,
    whites: 0,
    blacks: 0,
    brightness: 0,
    gamma: 1,
    temperature: 0,
    tint: 0,
    saturation: 0,
    vibrance: 0,
  };
}

export function createDefaultToneCurves(): ToneCurves {
  return {
    rgb: identityCurve(),
    red: identityCurve(),
    green: identityCurve(),
    blue: identityCurve(),
  };
}

export function createDefaultHsl(): HslAdjustments {
  // Build the record from the canonical band list so it can never drift.
  const entries = HSL_BANDS.map((band) => [band, neutralHslChannel()] as const);
  return Object.fromEntries(entries) as unknown as HslAdjustments;
}

export function createDefaultColorGrading(): ColorGrading {
  return {
    shadows: neutralWheel(),
    midtones: neutralWheel(),
    highlights: neutralWheel(),
    global: neutralWheel(),
    blending: 50,
    balance: 0,
  };
}

export function createDefaultDetail(): DetailAdjustments {
  return {
    clarity: 0,
    texture: 0,
    dehaze: 0,
    sharpenAmount: 0,
    sharpenRadius: 1,
    sharpenDetail: 25,
    noiseReduction: 0,
    colorNoiseReduction: 25,
  };
}

export function createDefaultLens(): LensCorrections {
  return { distortion: 0, vignetting: 0, chromaticAberration: 0, fisheye: false };
}

export function createDefaultAdjustments(): Adjustments {
  return {
    basic: createDefaultBasicAdjustments(),
    toneCurves: createDefaultToneCurves(),
    hsl: createDefaultHsl(),
    colorGrading: createDefaultColorGrading(),
    detail: createDefaultDetail(),
    lens: createDefaultLens(),
  };
}

export function createDefaultGeometry(): Geometry {
  return {
    crop: { x: 0, y: 0, width: 1, height: 1 },
    rotation: 0,
    orientation: 0,
    flip: 'none',
    aspectRatio: 'free',
  };
}

/** A pristine edit state for a freshly imported image. */
export function createDefaultEditState(imageId: string, at: number = Date.now()): EditState {
  return {
    imageId,
    adjustments: createDefaultAdjustments(),
    geometry: createDefaultGeometry(),
    masks: [],
    overlays: [],
    warp: [],
    updatedAt: at,
  };
}
