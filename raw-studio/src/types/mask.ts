import type { LocalAdjustments } from './adjustments';

/**
 * Masks. Geometry is stored as normalized (0..1) coordinates relative to the
 * cropped image so masks survive zoom, resize and export unchanged.
 */

export type MaskKind = 'brush' | 'radial' | 'linear' | 'raster';

export interface MaskStrokePoint {
  readonly x: number;
  readonly y: number;
  /** Pen pressure 0..1 (1 for mouse/touch without pressure). */
  readonly pressure: number;
}

export interface BrushMaskData {
  readonly kind: 'brush';
  readonly size: number;
  readonly feather: number;
  readonly flow: number;
  /** Additive strokes. Each stroke is a polyline of points. */
  readonly strokes: readonly (readonly MaskStrokePoint[])[];
  /** Subtractive (eraser) strokes. */
  readonly erase: readonly (readonly MaskStrokePoint[])[];
}

export interface RadialMaskData {
  readonly kind: 'radial';
  readonly centerX: number;
  readonly centerY: number;
  readonly radiusX: number;
  readonly radiusY: number;
  /** Rotation in degrees. */
  readonly rotation: number;
  readonly feather: number;
  /** When true, affects outside the ellipse instead of inside. */
  readonly inverted: boolean;
}

export interface LinearMaskData {
  readonly kind: 'linear';
  readonly startX: number;
  readonly startY: number;
  readonly endX: number;
  readonly endY: number;
  readonly feather: number;
}

/**
 * A pixel-precise coverage bitmap (e.g. from AI subject detection), stored at a
 * bounded resolution in the cropped-image's normalized space. `data` is the
 * base64 of a width×height 8-bit alpha buffer, row-major, row 0 = image top.
 * `feather` softens the edge (0..1) and `invert` selects the complement.
 */
export interface RasterMaskData {
  readonly kind: 'raster';
  /** Where the bitmap came from, e.g. 'ai-subject'. Informational. */
  readonly source: string;
  readonly width: number;
  readonly height: number;
  readonly data: string;
  readonly feather: number;
  readonly invert: boolean;
}

export type MaskGeometry = BrushMaskData | RadialMaskData | LinearMaskData | RasterMaskData;

export interface Mask {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly geometry: MaskGeometry;
  /** Adjustments applied only inside this mask. */
  readonly adjustments: LocalAdjustments;
}
