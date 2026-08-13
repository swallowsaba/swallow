/**
 * Types describing a decoded source image and its immutable metadata.
 * These never change once an image is imported — edits live in {@link EditState}.
 */

/** EXIF orientation flag (1..8) as stored in the original file. */
export type ExifOrientation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** Working / output color spaces the pipeline understands. */
export type ImageColorSpace = 'srgb' | 'display-p3' | 'rec2020' | 'prophoto-rgb';

/** Which decoder produced the pixels. */
export type SourceImageKind = 'raw' | 'jpeg' | 'png' | 'tiff' | 'webp' | 'avif';

export interface ImageDimensions {
  readonly width: number;
  readonly height: number;
}

/** Immutable description of an imported image. */
export interface SourceImageMeta {
  readonly id: string;
  readonly fileName: string;
  readonly kind: SourceImageKind;
  readonly byteSize: number;
  readonly dimensions: ImageDimensions;
  readonly colorSpace: ImageColorSpace;
  readonly exifOrientation: ExifOrientation;
  /** Epoch millis when the image was imported into the app. */
  readonly importedAt: number;
  readonly camera?: CameraMeta;
}

/** Camera/shooting metadata, available for RAW files (read via LibRaw). */
export interface CameraMeta {
  readonly make?: string;
  readonly model?: string;
  readonly iso?: number;
  readonly shutter?: number;
  readonly aperture?: number;
  readonly focalLength?: number;
  readonly capturedAt?: number;
}
