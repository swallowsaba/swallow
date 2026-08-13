import type { AspectRatioLock, CropRect } from '@/types';

/** Full-frame crop (no cropping). */
export const FULL_CROP: CropRect = { x: 0, y: 0, width: 1, height: 1 };

/**
 * The numeric aspect ratio (width/height) for a lock mode, or null for
 * 'free' (no constraint) and 'original' (whatever the source image's ratio
 * already is — resolved by the caller, since it needs the image size).
 */
export function aspectRatioValue(lock: AspectRatioLock): number | null {
  switch (lock) {
    case 'free':
    case 'original':
      return null;
    case '1:1':
      return 1;
    case '3:2':
      return 3 / 2;
    case '4:3':
      return 4 / 3;
    case '5:4':
      return 5 / 4;
    case '7:5':
      return 7 / 5;
    case '16:9':
      return 16 / 9;
    case '9:16':
      return 9 / 16;
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Clamp a crop rect so it stays fully within the 0..1 source image bounds. */
export function clampCropRect(rect: CropRect): CropRect {
  const width = clamp(rect.width, 0.02, 1);
  const height = clamp(rect.height, 0.02, 1);
  const x = clamp(rect.x, 0, 1 - width);
  const y = clamp(rect.y, 0, 1 - height);
  return { x, y, width, height };
}

/**
 * Build the largest centered crop rect matching a target aspect ratio
 * (image-pixel aspect, i.e. imageWidth/imageHeight), or the full frame when
 * `aspect` is null.
 */
export function cropRectForAspect(
  aspect: number | null,
  imageAspect: number,
): CropRect {
  if (aspect === null) return FULL_CROP;
  let width: number;
  let height: number;
  if (aspect >= imageAspect) {
    // Target is wider than the source: full width, letterboxed height.
    width = 1;
    height = imageAspect / aspect;
  } else {
    height = 1;
    width = aspect / imageAspect;
  }
  return clampCropRect({ x: (1 - width) / 2, y: (1 - height) / 2, width, height });
}

/** The image size a cropped image "acts like" for fit/fill/zoom purposes. */
export function croppedImageSize(
  imageSize: { width: number; height: number },
  crop: CropRect,
): { width: number; height: number } {
  return {
    width: Math.max(1, Math.round(imageSize.width * crop.width)),
    height: Math.max(1, Math.round(imageSize.height * crop.height)),
  };
}
