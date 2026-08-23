import { toLuminance, sobelMagnitude, thresholdMask, dilateMask } from './edge-detect';

/**
 * Automatic detection of thin, distracting structures — power lines, cables,
 * fences and sports-net mesh — as an inpaint mask. These share three traits:
 * they are high-contrast edges, they are *thin* (a few pixels wide), and they
 * form long/repeated linear structures. The subject the photographer cares
 * about (a person, a building) is a large solid region, so a "thinness" test
 * separates the two.
 *
 * Algorithm (all pure, unit-tested):
 *   1. Sobel edge magnitude of the luminance.
 *   2. Threshold to a binary edge mask, auto-tuned to a target coverage so it
 *      adapts to the photo's contrast.
 *   3. Thinness test via morphological opening: erode then dilate. Thick blobs
 *      survive the erosion; thin lines are erased. Subtracting the opened mask
 *      from the edge mask leaves only the thin structures.
 *   4. Dilate the result slightly so the inpaint mask fully covers each wire.
 *
 * The result is a 0/255 mask the caller rasterizes to a canvas for inpaint().
 */

export interface ThinStructureOptions {
  /** Target fraction of the image the raw edge mask should cover (auto-tunes
   *  the edge threshold). Default 0.06. */
  readonly targetCoverage?: number;
  /** Erosion/dilation radius for the thinness test. Larger removes thicker
   *  structures too. Default 2 (keeps structures up to ~4px wide). */
  readonly thinnessRadius?: number;
  /** Final dilation so the mask fully covers each line. Default 2. */
  readonly growRadius?: number;
}

/** Morphological erosion: a pixel stays ON only if all neighbors within radius
 *  are ON. Thin lines (with OFF neighbors) get erased; thick blobs survive. */
export function erodeMask(
  mask: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
): Uint8ClampedArray {
  if (radius <= 0) return mask.slice();
  const out = new Uint8ClampedArray(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let all = true;
      for (let dy = -radius; dy <= radius && all; dy++) {
        const sy = y + dy;
        for (let dx = -radius; dx <= radius; dx++) {
          const sx = x + dx;
          const inside = sx >= 0 && sx < width && sy >= 0 && sy < height;
          if (!inside || (mask[sy * width + sx] ?? 0) === 0) {
            all = false;
            break;
          }
        }
      }
      out[y * width + x] = all ? 255 : 0;
    }
  }
  return out;
}

/** Auto-tune the Sobel threshold so the binary mask covers roughly
 *  `target` of the image. Returns the chosen threshold. */
export function thresholdForCoverage(
  magnitude: Float32Array,
  target: number,
): number {
  // Binary search over threshold using coverage as a monotonic function.
  let lo = 0;
  let hi = 4; // sobelMagnitude is roughly 0..4
  for (let iter = 0; iter < 16; iter++) {
    const mid = (lo + hi) / 2;
    let on = 0;
    for (let i = 0; i < magnitude.length; i++) if ((magnitude[i] ?? 0) > mid) on++;
    const cov = magnitude.length === 0 ? 0 : on / magnitude.length;
    if (cov > target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Detect thin structures in an RGBA image; returns a 0/255 mask. */
export function detectThinStructures(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  options: ThinStructureOptions = {},
): Uint8ClampedArray {
  const targetCoverage = options.targetCoverage ?? 0.06;
  const thinnessRadius = options.thinnessRadius ?? 2;
  const growRadius = options.growRadius ?? 2;

  const gray = toLuminance(rgba, width, height);
  const mag = sobelMagnitude(gray, width, height);
  const threshold = thresholdForCoverage(mag, targetCoverage);
  const edges = thresholdMask(mag, threshold);

  // Morphological opening = erode then dilate. Thick regions survive; thin ones
  // vanish. What the opening removed (edges minus opened) is the thin part.
  const eroded = erodeMask(edges, width, height, thinnessRadius);
  const opened = dilateMask(eroded, width, height, thinnessRadius);

  const thin = new Uint8ClampedArray(edges.length);
  for (let i = 0; i < edges.length; i++) {
    thin[i] = (edges[i] ?? 0) > 0 && (opened[i] ?? 0) === 0 ? 255 : 0;
  }

  return growRadius > 0 ? dilateMask(thin, width, height, growRadius) : thin;
}
