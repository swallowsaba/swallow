/**
 * Crop-based inpainting geometry (pure, unit-tested).
 *
 * LaMa only accepts a fixed square (512²). Feeding it the whole downscaled photo
 * means the erased area is reconstructed at 512/imageWidth resolution — soft on
 * big images. Instead, we crop a padded square region *around the mask* and feed
 * only that to the model. When the mask covers a small part of the frame (a
 * wire, a net, a sign) the crop is far smaller than the whole image, so the
 * effective resolution of the fill is much higher and the result is crisp.
 *
 * This module computes the crop rectangle; the caller does the actual pixel
 * work and pastes the model's result back into the crop region.
 */

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Bounding box of the "on" (alpha>0) pixels in a mask. Returns null if empty. */
export function maskBounds(
  alpha: Uint8ClampedArray,
  width: number,
  height: number,
): Rect | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if ((alpha[y * width + x] ?? 0) > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/**
 * Given the mask bounds, compute a padded SQUARE crop region within the image.
 * LaMa needs context around the hole to synthesize a plausible fill, so the
 * bounds are expanded by `padFraction` of their size (and a small minimum), then
 * squared off and clamped to the image. Returns the crop rect in image pixels.
 *
 * If the resulting crop would be nearly the whole image anyway (mask is large or
 * spread out), the caller may as well process the whole frame; `isWorthCropping`
 * reports that.
 */
export function cropRegionForMask(
  bounds: Rect,
  imageWidth: number,
  imageHeight: number,
  padFraction = 0.6,
  minPad = 16,
): Rect {
  const padX = Math.max(minPad, bounds.width * padFraction);
  const padY = Math.max(minPad, bounds.height * padFraction);
  let x0 = bounds.x - padX;
  let y0 = bounds.y - padY;
  let x1 = bounds.x + bounds.width + padX;
  let y1 = bounds.y + bounds.height + padY;

  // Square it off: expand the shorter side to match the longer.
  let w = x1 - x0;
  let h = y1 - y0;
  const side = Math.max(w, h);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  x0 = cx - side / 2;
  x1 = cx + side / 2;
  y0 = cy - side / 2;
  y1 = cy + side / 2;

  // Clamp to the image, keeping it square where possible by shifting.
  if (x0 < 0) {
    x1 -= x0;
    x0 = 0;
  }
  if (y0 < 0) {
    y1 -= y0;
    y0 = 0;
  }
  if (x1 > imageWidth) {
    x0 -= x1 - imageWidth;
    x1 = imageWidth;
  }
  if (y1 > imageHeight) {
    y0 -= y1 - imageHeight;
    y1 = imageHeight;
  }
  // Final clamp (image smaller than the square).
  x0 = Math.max(0, Math.floor(x0));
  y0 = Math.max(0, Math.floor(y0));
  x1 = Math.min(imageWidth, Math.ceil(x1));
  y1 = Math.min(imageHeight, Math.ceil(y1));

  w = Math.max(1, x1 - x0);
  h = Math.max(1, y1 - y0);
  return { x: x0, y: y0, width: w, height: h };
}

/**
 * Whether cropping is worthwhile: the crop must be meaningfully smaller than the
 * full image (otherwise there's no resolution gain). Returns true when the crop
 * area is below `maxAreaFraction` of the whole image.
 */
export function isWorthCropping(
  crop: Rect,
  imageWidth: number,
  imageHeight: number,
  maxAreaFraction = 0.5,
): boolean {
  const cropArea = crop.width * crop.height;
  const imageArea = imageWidth * imageHeight;
  if (imageArea === 0) return false;
  return cropArea / imageArea < maxAreaFraction;
}

/** The effective resolution multiplier cropping buys vs. whole-image at 512:
 *  how much finer the fill is. >1 means crisper. */
export function resolutionGain(
  crop: Rect,
  imageWidth: number,
  imageHeight: number,
): number {
  const cropMax = Math.max(crop.width, crop.height);
  const imgMax = Math.max(imageWidth, imageHeight);
  return cropMax === 0 ? 1 : imgMax / cropMax;
}

/**
 * Split a mask's bounding box into a sequence of near-square tiles for
 * high-resolution inpainting. A tall thin target (a post) squared off as one
 * crop becomes a huge region — most of it irrelevant — so the fill is low-res
 * and smears. Splitting the long axis into near-square tiles keeps each tile
 * small, so each is processed at high effective resolution. Each tile is padded
 * (for LaMa context) and clamped to the image; tiles overlap slightly via the
 * padding so seams blend. Returns one tile when the box is already near-square.
 */
export function tileRegionsForMask(
  bounds: Rect,
  imageWidth: number,
  imageHeight: number,
  padFraction = 0.5,
  minPad = 16,
): Rect[] {
  const aspect = bounds.width / Math.max(1, bounds.height);
  // Near-square (0.5..2): a single padded square crop is fine.
  if (aspect >= 0.5 && aspect <= 2) {
    return [cropRegionForMask(bounds, imageWidth, imageHeight, padFraction, minPad)];
  }

  const vertical = bounds.height > bounds.width; // tall => split along Y
  const longLen = vertical ? bounds.height : bounds.width;
  const shortLen = vertical ? bounds.width : bounds.height;
  // Tile step ~ the short side, so each tile is roughly square.
  const step = Math.max(1, shortLen);
  const count = Math.max(1, Math.ceil(longLen / step));

  const tiles: Rect[] = [];
  for (let i = 0; i < count; i++) {
    const segStart = (vertical ? bounds.y : bounds.x) + i * step;
    const segLen = Math.min(step, longLen - i * step);
    if (segLen <= 0) break;
    const segBounds: Rect = vertical
      ? { x: bounds.x, y: segStart, width: bounds.width, height: segLen }
      : { x: segStart, y: bounds.y, width: segLen, height: bounds.height };
    tiles.push(cropRegionForMask(segBounds, imageWidth, imageHeight, padFraction, minPad));
  }
  return tiles;
}
