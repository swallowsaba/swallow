/**
 * Pure viewport geometry. No DOM, no WebGL — just the math that decides how big
 * the image is drawn and where. Kept separate so it can be unit-tested and
 * reused by both the WebGL renderer and the interaction handlers.
 */

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export type FitMode = 'fit' | 'fill' | 'custom';

export const MIN_SCALE = 0.05;
export const MAX_SCALE = 16;

/** Zoom stops exposed in the UI (Fit is handled separately). */
export const ZOOM_PRESETS = [0.25, 0.5, 1, 2, 4] as const;

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function clampScale(scale: number): number {
  return clamp(scale, MIN_SCALE, MAX_SCALE);
}

/** On-screen footprint after 90-degree orientation steps (swaps w/h at 90/270). */
export function orientedSize(size: Size, orientationDeg: number): Size {
  const norm = ((Math.round(orientationDeg / 90) * 90) % 360 + 360) % 360;
  return norm === 90 || norm === 270 ? { width: size.height, height: size.width } : size;
}

/** Largest scale at which the whole (oriented) image fits inside the container. */
export function computeFitScale(image: Size, container: Size, orientationDeg = 0): number {
  const o = orientedSize(image, orientationDeg);
  if (o.width <= 0 || o.height <= 0 || container.width <= 0 || container.height <= 0) return 1;
  return Math.min(container.width / o.width, container.height / o.height);
}

/** Smallest scale at which the (oriented) image covers the whole container. */
export function computeFillScale(image: Size, container: Size, orientationDeg = 0): number {
  const o = orientedSize(image, orientationDeg);
  if (o.width <= 0 || o.height <= 0 || container.width <= 0 || container.height <= 0) return 1;
  return Math.max(container.width / o.width, container.height / o.height);
}

/** Next zoom stop strictly greater than the current scale. */
export function nextZoom(scale: number): number {
  for (const preset of ZOOM_PRESETS) {
    if (preset > scale + 1e-4) return preset;
  }
  return clampScale(scale * 2);
}

/** Previous zoom stop strictly less than the current scale. */
export function prevZoom(scale: number): number {
  for (let i = ZOOM_PRESETS.length - 1; i >= 0; i--) {
    const preset = ZOOM_PRESETS[i];
    if (preset !== undefined && preset < scale - 1e-4) return preset;
  }
  return clampScale(scale / 2);
}

/**
 * Clamp a center-based pan offset (in pixels) so the scaled image cannot be
 * dragged completely out of the container. When an axis is smaller than the
 * container, it is locked to centered (offset 0 on that axis).
 */
export function clampOffset(offset: Point, scaledImage: Size, container: Size): Point {
  const clampAxis = (value: number, img: number, cont: number): number => {
    if (img <= cont) return 0;
    const limit = (img - cont) / 2;
    return clamp(value, -limit, limit);
  };
  return {
    x: clampAxis(offset.x, scaledImage.width, container.width),
    y: clampAxis(offset.y, scaledImage.height, container.height),
  };
}

/** Convert a mouse point (container-relative px) to a normalized image UV. */
export function screenToImageUv(
  point: Point,
  scaledImage: Size,
  container: Size,
  offset: Point,
): Point {
  const originX = (container.width - scaledImage.width) / 2 + offset.x;
  const originY = (container.height - scaledImage.height) / 2 + offset.y;
  return {
    x: scaledImage.width === 0 ? 0 : (point.x - originX) / scaledImage.width,
    y: scaledImage.height === 0 ? 0 : (point.y - originY) / scaledImage.height,
  };
}
