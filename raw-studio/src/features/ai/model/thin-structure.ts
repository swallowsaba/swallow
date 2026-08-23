import { toLuminance, sobelMagnitude, thresholdMask, dilateMask } from './edge-detect';

/**
 * Automatic detection of thin, distracting structures — power lines, cables,
 * fences and sports-net mesh — as an inpaint mask. These share three traits:
 * high-contrast edges, thin cross-section (a few px), and long/repeated linear
 * runs. The subject the photographer cares about (a person, a building, a wall)
 * is a large solid region, so the detector keeps only components that are both
 * thin AND elongated, and discards everything large — this is what stops walls
 * and textured backgrounds from being "removed" and smeared.
 *
 * Pipeline (all pure, unit-tested):
 *   1. Sobel edge magnitude of luminance.
 *   2. Threshold, auto-tuned toward a (deliberately small) target coverage.
 *   3. Morphological opening (erode->dilate) to drop thin structures, then
 *      subtract to isolate the thin part.
 *   4. Connected-component analysis: keep only components that are thin
 *      (low filled-fraction of their bounding box) and elongated (long bbox
 *      diagonal relative to area), and drop tiny specks and big blobs.
 *   5. Dilate survivors slightly to fully cover each line.
 */

export interface ThinStructureOptions {
  /** Target fraction of the image the raw edge mask should cover (auto-tunes
   *  the edge threshold). Kept small so we don't over-select. Default 0.03. */
  readonly targetCoverage?: number;
  /** Erosion/dilation radius for the thinness test. Default 1 (keeps structures
   *  up to ~2px wide — real wires/mesh). */
  readonly thinnessRadius?: number;
  /** Final dilation so the mask fully covers each line. Default 1. */
  readonly growRadius?: number;
  /** A component is "thin" only if its filled pixels occupy at most this
   *  fraction of its bounding-box area. Walls/blobs fill most of their box and
   *  are rejected. Default 0.35. */
  readonly maxFillFraction?: number;
  /** A component must be at least this elongated (bbox diagonal / sqrt(area)).
   *  Lines have a large value; compact blobs ~1.5. Default 3. */
  readonly minElongation?: number;
  /** Reject components larger than this fraction of the image (never remove big
   *  regions automatically — that's what smears). Default 0.02. */
  readonly maxComponentFraction?: number;
  /** Ignore components smaller than this many pixels (specks/noise). Default 12. */
  readonly minComponentPixels?: number;
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

/** Auto-tune the Sobel threshold so the binary mask covers roughly `target`. */
export function thresholdForCoverage(magnitude: Float32Array, target: number): number {
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

export interface Component {
  readonly pixels: number[];
  readonly area: number;
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/** Label 4-connected ON components of a binary mask. */
export function connectedComponents(
  mask: Uint8ClampedArray,
  width: number,
  height: number,
): Component[] {
  const seen = new Uint8Array(mask.length);
  const comps: Component[] = [];
  const stack: number[] = [];
  for (let start = 0; start < mask.length; start++) {
    if ((mask[start] ?? 0) === 0 || seen[start]) continue;
    stack.length = 0;
    stack.push(start);
    seen[start] = 1;
    const pixels: number[] = [];
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    while (stack.length > 0) {
      const idx = stack.pop()!;
      pixels.push(idx);
      const x = idx % width;
      const y = (idx - x) / width;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      // 4-neighbors
      const nb = [
        x > 0 ? idx - 1 : -1,
        x < width - 1 ? idx + 1 : -1,
        y > 0 ? idx - width : -1,
        y < height - 1 ? idx + width : -1,
      ];
      for (const n of nb) {
        if (n >= 0 && (mask[n] ?? 0) > 0 && !seen[n]) {
          seen[n] = 1;
          stack.push(n);
        }
      }
    }
    comps.push({ pixels, area: pixels.length, minX, minY, maxX, maxY });
  }
  return comps;
}

/** Decide whether a component looks like a thin, elongated structure. */
export function isThinElongated(
  c: Component,
  imagePixels: number,
  opts: Required<
    Pick<
      ThinStructureOptions,
      'maxFillFraction' | 'minElongation' | 'maxComponentFraction' | 'minComponentPixels'
    >
  >,
): boolean {
  if (c.area < opts.minComponentPixels) return false;
  if (c.area > imagePixels * opts.maxComponentFraction) return false; // too big -> reject
  const bw = c.maxX - c.minX + 1;
  const bh = c.maxY - c.minY + 1;
  const boxArea = bw * bh;
  const fill = boxArea === 0 ? 1 : c.area / boxArea;
  if (fill > opts.maxFillFraction) return false; // fills its box -> a blob, reject
  const diag = Math.hypot(bw, bh);
  const elongation = diag / Math.max(1, Math.sqrt(c.area));
  return elongation >= opts.minElongation;
}

/** Detect thin structures in an RGBA image; returns a 0/255 mask. */
export function detectThinStructures(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  options: ThinStructureOptions = {},
): Uint8ClampedArray {
  const targetCoverage = options.targetCoverage ?? 0.03;
  const thinnessRadius = options.thinnessRadius ?? 1;
  const growRadius = options.growRadius ?? 1;
  const filter = {
    maxFillFraction: options.maxFillFraction ?? 0.35,
    minElongation: options.minElongation ?? 3,
    maxComponentFraction: options.maxComponentFraction ?? 0.02,
    minComponentPixels: options.minComponentPixels ?? 12,
  };

  const gray = toLuminance(rgba, width, height);
  const mag = sobelMagnitude(gray, width, height);
  const threshold = thresholdForCoverage(mag, targetCoverage);
  const edges = thresholdMask(mag, threshold);

  // Opening removes thin structures; subtract to isolate them.
  const eroded = erodeMask(edges, width, height, thinnessRadius);
  const opened = dilateMask(eroded, width, height, thinnessRadius);
  const thin = new Uint8ClampedArray(edges.length);
  for (let i = 0; i < edges.length; i++) {
    thin[i] = (edges[i] ?? 0) > 0 && (opened[i] ?? 0) === 0 ? 255 : 0;
  }

  // Keep only thin, elongated, not-too-big components.
  const comps = connectedComponents(thin, width, height);
  const kept = new Uint8ClampedArray(thin.length);
  const imagePixels = width * height;
  for (const c of comps) {
    if (isThinElongated(c, imagePixels, filter)) {
      for (const idx of c.pixels) kept[idx] = 255;
    }
  }

  return growRadius > 0 ? dilateMask(kept, width, height, growRadius) : kept;
}
