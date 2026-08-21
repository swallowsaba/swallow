/**
 * Adjustment parameter model.
 *
 * Every value here is a plain, serializable number/enum so that a full set of
 * adjustments can be stored in IndexedDB, exported to JSON as a preset, and
 * diffed for history — the core of non-destructive editing. Nothing in this
 * file references pixels; it only describes *what* to do to them.
 */

/** A single control point on a tone curve, normalized to the unit square. */
export interface CurvePoint {
  /** Input, 0..1 */
  readonly x: number;
  /** Output, 0..1 */
  readonly y: number;
}

export type RgbChannel = 'rgb' | 'red' | 'green' | 'blue';

/** Point-based curves for the master (rgb) channel and each color channel. */
export type ToneCurves = Readonly<Record<RgbChannel, readonly CurvePoint[]>>;

/** The eight color bands used by the HSL / color mixer panel. */
export const HSL_BANDS = [
  'red',
  'orange',
  'yellow',
  'green',
  'aqua',
  'blue',
  'purple',
  'magenta',
] as const;

export type HslBand = (typeof HSL_BANDS)[number];

export interface HslChannel {
  /** -100..100 */
  readonly hue: number;
  /** -100..100 */
  readonly saturation: number;
  /** -100..100 */
  readonly luminance: number;
}

export type HslAdjustments = Readonly<Record<HslBand, HslChannel>>;

/** A single color-grading wheel (hue 0..360, saturation/luminance -100..100). */
export interface ColorWheel {
  readonly hue: number;
  readonly saturation: number;
  readonly luminance: number;
}

/**
 * Color grading. The shadows and highlights wheels also cover the classic
 * "split toning" workflow, so split toning is represented here rather than as
 * a separate group.
 */
export interface ColorGrading {
  readonly shadows: ColorWheel;
  readonly midtones: ColorWheel;
  readonly highlights: ColorWheel;
  readonly global: ColorWheel;
  /** Blend between the wheels, 0..100. */
  readonly blending: number;
  /** Shadow/highlight balance, -100..100. */
  readonly balance: number;
}

/** Global light & color sliders (Lightroom "Basic" panel). */
export interface BasicAdjustments {
  /** Exposure in stops (EV), -5..+5. */
  readonly exposure: number;
  /** -100..100 */
  readonly contrast: number;
  /** -100..100 */
  readonly highlights: number;
  /** -100..100 */
  readonly shadows: number;
  /** -100..100 */
  readonly whites: number;
  /** -100..100 */
  readonly blacks: number;
  /** -100..100 */
  readonly brightness: number;
  /** Output gamma, 0.1..3.0 (1.0 = neutral). */
  readonly gamma: number;
  /**
   * White balance temperature. For RAW this is Kelvin (2000..50000);
   * for non-RAW it is a relative offset (-100..100). See colorSpace/kind.
   */
  readonly temperature: number;
  /** -100..100 */
  readonly tint: number;
  /** -100..100 */
  readonly saturation: number;
  /** -100..100 */
  readonly vibrance: number;
}

/** Local contrast, detail and noise controls. */
export interface DetailAdjustments {
  /** -100..100 */
  readonly clarity: number;
  /** -100..100 */
  readonly texture: number;
  /** -100..100 */
  readonly dehaze: number;
  /** 0..100 */
  readonly sharpenAmount: number;
  /** 0.5..3.0 px */
  readonly sharpenRadius: number;
  /** 0..100 */
  readonly sharpenDetail: number;
  /** 0..100 (luminance) */
  readonly noiseReduction: number;
  /** 0..100 (chroma) */
  readonly colorNoiseReduction: number;
}

/** Lens-based geometric and optical corrections. */
export interface LensCorrections {
  /** -100..100 */
  readonly distortion: number;
  /** -100..100 */
  readonly vignetting: number;
  /** -100..100 */
  readonly chromaticAberration: number;
  /** When true, the Distortion slider produces a strong spherical fisheye
   *  bulge instead of a subtle barrel/pincushion correction curve. */
  readonly fisheye: boolean;
}

/**
 * The complete, global adjustment stack for an image. Mask-local adjustments
 * are stored separately on each {@link Mask}.
 */
export interface Adjustments {
  readonly basic: BasicAdjustments;
  readonly toneCurves: ToneCurves;
  readonly hsl: HslAdjustments;
  readonly colorGrading: ColorGrading;
  readonly detail: DetailAdjustments;
  readonly lens: LensCorrections;
}

/**
 * The subset of adjustments a local mask may carry. Kept intentionally small:
 * masks tune light/color/clarity, not lens geometry.
 */
export type LocalAdjustments = Partial<BasicAdjustments> &
  Partial<Pick<DetailAdjustments, 'clarity' | 'texture' | 'sharpenAmount' | 'noiseReduction'>> & {
    /** Optional RGB tone curve applied only within the mask. */
    readonly toneCurve?: readonly CurvePoint[];
  };
