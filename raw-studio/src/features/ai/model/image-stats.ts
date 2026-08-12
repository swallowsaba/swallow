/**
 * Image analysis used by the "Auto" adjustments. The heavy part —
 * `analyzePixels` — is pure and unit-tested; `computeImageStats` only handles
 * downsampling the bitmap to a small RGBA buffer to feed it.
 */

export interface ImageStats {
  meanR: number; // 0..1
  meanG: number;
  meanB: number;
  medianLuma: number; // 0..1
  p01: number; // 1st percentile luma
  p99: number; // 99th percentile luma
  meanSat: number; // 0..1 average saturation
  sampleCount: number;
}

const LUMA_R = 0.2126;
const LUMA_G = 0.7152;
const LUMA_B = 0.0722;

/** Compute channel means, luma percentiles and mean saturation from RGBA. */
export function analyzePixels(data: Uint8ClampedArray): ImageStats {
  const histogram = new Float64Array(256);
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let sumSat = 0;
  let count = 0;

  for (let i = 0; i + 3 < data.length; i += 4) {
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    sumR += r;
    sumG += g;
    sumB += b;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    sumSat += max === 0 ? 0 : (max - min) / max;
    const luma = Math.round(LUMA_R * r + LUMA_G * g + LUMA_B * b);
    histogram[Math.min(255, Math.max(0, luma))] += 1;
    count += 1;
  }

  if (count === 0) {
    return {
      meanR: 0.5,
      meanG: 0.5,
      meanB: 0.5,
      medianLuma: 0.5,
      p01: 0,
      p99: 1,
      meanSat: 0,
      sampleCount: 0,
    };
  }

  const percentile = (fraction: number): number => {
    const target = fraction * count;
    let acc = 0;
    for (let v = 0; v < 256; v++) {
      acc += histogram[v] ?? 0;
      if (acc >= target) return v / 255;
    }
    return 1;
  };

  return {
    meanR: sumR / count / 255,
    meanG: sumG / count / 255,
    meanB: sumB / count / 255,
    medianLuma: percentile(0.5),
    p01: percentile(0.01),
    p99: percentile(0.99),
    meanSat: sumSat / count,
    sampleCount: count,
  };
}

/** Downsample a bitmap to at most `maxEdge` px and analyze it. */
export function computeImageStats(bitmap: ImageBitmap, maxEdge = 256): ImageStats {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable for image stats.');
  ctx.drawImage(bitmap, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  return analyzePixels(data);
}
