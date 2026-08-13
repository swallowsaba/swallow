/**
 * Crop, rotation and flip. All expressed relative to the original decoded image
 * so the operation is resolution-independent and fully non-destructive.
 */

export type FlipMode = 'none' | 'horizontal' | 'vertical' | 'both';

/** Crop rectangle in normalized (0..1) coordinates of the source image. */
export interface CropRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type AspectRatioLock =
  | 'free'
  | 'original'
  | '1:1'
  | '3:2'
  | '4:3'
  | '5:4'
  | '7:5'
  | '16:9'
  | '9:16';

/** 90-degree orientation steps applied on top of EXIF orientation. */
export type OrientationStep = 0 | 90 | 180 | 270;

export interface Geometry {
  readonly crop: CropRect;
  /** Fine rotation in degrees, -45..45 (straightening). */
  readonly rotation: number;
  readonly orientation: OrientationStep;
  readonly flip: FlipMode;
  readonly aspectRatio: AspectRatioLock;
}
