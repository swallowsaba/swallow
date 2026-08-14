/**
 * Classical (non-AI) edge detection used to suggest a starting mask for the
 * Remove Object tool — e.g. a chain-link fence or sports net shows up as a
 * dense, regular pattern of thin edges. This is a *suggestion* the person
 * reviews and refines with the brush, not a blind "AI recognizes a net"
 * black box: there's no reliable free model for that specific object class,
 * and a wrong automatic mask silently erasing the wrong thing would be worse
 * than no suggestion at all. Every function here is pure and deterministic
 * so it can be verified against synthetic pixel data without a browser.
 */

/** Convert RGBA to a single-channel luminance array (0..1). */
export function toLuminance(rgba: Uint8ClampedArray, width: number, height: number): Float32Array {
  const out = new Float32Array(width * height);
  for (let p = 0; p < out.length; p++) {
    const r = rgba[p * 4] ?? 0;
    const g = rgba[p * 4 + 1] ?? 0;
    const b = rgba[p * 4 + 2] ?? 0;
    out[p] = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  }
  return out;
}

function at(gray: Float32Array, w: number, h: number, x: number, y: number): number {
  const cx = Math.min(w - 1, Math.max(0, x));
  const cy = Math.min(h - 1, Math.max(0, y));
  return gray[cy * w + cx] ?? 0;
}

/** Sobel gradient magnitude at every pixel, roughly 0..~4 (unnormalized). */
export function sobelMagnitude(gray: Float32Array, width: number, height: number): Float32Array {
  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const gx =
        -at(gray, width, height, x - 1, y - 1) +
        at(gray, width, height, x + 1, y - 1) +
        -2 * at(gray, width, height, x - 1, y) +
        2 * at(gray, width, height, x + 1, y) +
        -at(gray, width, height, x - 1, y + 1) +
        at(gray, width, height, x + 1, y + 1);
      const gy =
        -at(gray, width, height, x - 1, y - 1) -
        2 * at(gray, width, height, x, y - 1) -
        at(gray, width, height, x + 1, y - 1) +
        at(gray, width, height, x - 1, y + 1) +
        2 * at(gray, width, height, x, y + 1) +
        at(gray, width, height, x + 1, y + 1);
      out[y * width + x] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  return out;
}

/** Binary mask (0 or 255) of pixels whose gradient magnitude exceeds `threshold`. */
export function thresholdMask(magnitude: Float32Array, threshold: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(magnitude.length);
  for (let i = 0; i < magnitude.length; i++) {
    out[i] = (magnitude[i] ?? 0) > threshold ? 255 : 0;
  }
  return out;
}

/**
 * Morphological dilation: grows each 255 pixel outward by `radius` pixels
 * (square structuring element). Connects nearby thin edges (like the wires
 * of a net) into one solid, paintable/selectable region.
 */
export function dilateMask(
  mask: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
): Uint8ClampedArray {
  if (radius <= 0) return mask.slice();
  const out = new Uint8ClampedArray(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let hit = false;
      for (let dy = -radius; dy <= radius && !hit; dy++) {
        const sy = y + dy;
        if (sy < 0 || sy >= height) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const sx = x + dx;
          if (sx < 0 || sx >= width) continue;
          if ((mask[sy * width + sx] ?? 0) > 0) {
            hit = true;
            break;
          }
        }
      }
      out[y * width + x] = hit ? 255 : 0;
    }
  }
  return out;
}

/**
 * Fraction (0..1) of ON pixels in a mask — used to auto-tune the threshold
 * so the suggested mask covers a reasonable portion of the image regardless
 * of overall contrast (a fixed threshold would over- or under-select
 * depending on the photo).
 */
export function maskCoverage(mask: Uint8ClampedArray): number {
  if (mask.length === 0) return 0;
  let on = 0;
  for (let i = 0; i < mask.length; i++) if ((mask[i] ?? 0) > 0) on++;
  return on / mask.length;
}

/**
 * Pick the lowest threshold (finest detail) whose resulting mask coverage
 * stays within [minCoverage, maxCoverage], searching a fixed candidate list
 * from strict to lenient. Falls back to the most lenient candidate if none
 * land in range (better to over-suggest slightly than return nothing).
 */
export function autoThreshold(
  magnitude: Float32Array,
  candidates: readonly number[],
  minCoverage: number,
  maxCoverage: number,
): number {
  let fallback = candidates[candidates.length - 1] ?? 0;
  for (const t of candidates) {
    const coverage = maskCoverage(thresholdMask(magnitude, t));
    if (coverage >= minCoverage && coverage <= maxCoverage) return t;
    fallback = t;
  }
  return fallback;
}
