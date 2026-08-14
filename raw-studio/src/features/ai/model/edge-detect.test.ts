import { describe, expect, it } from 'vitest';
import {
  autoThreshold,
  dilateMask,
  maskCoverage,
  sobelMagnitude,
  thresholdMask,
  toLuminance,
} from './edge-detect';

function solidRgba(width: number, height: number, gray = 128): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let p = 0; p < width * height; p++) {
    out[p * 4] = gray;
    out[p * 4 + 1] = gray;
    out[p * 4 + 2] = gray;
    out[p * 4 + 3] = 255;
  }
  return out;
}

function stripedRgba(width: number, height: number, period: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = Math.floor(x / period) % 2 === 0 ? 20 : 235;
      const p = y * width + x;
      out[p * 4] = v;
      out[p * 4 + 1] = v;
      out[p * 4 + 2] = v;
      out[p * 4 + 3] = 255;
    }
  }
  return out;
}

describe('toLuminance', () => {
  it('converts a solid gray image to a uniform luminance array', () => {
    const lum = toLuminance(solidRgba(4, 4, 128), 4, 4);
    expect(lum.length).toBe(16);
    for (const v of lum) expect(v).toBeCloseTo(128 / 255, 2);
  });
});

describe('sobelMagnitude', () => {
  it('is near zero everywhere on a flat image', () => {
    const lum = toLuminance(solidRgba(20, 20), 20, 20);
    const mag = sobelMagnitude(lum, 20, 20);
    for (const v of mag) expect(v).toBeLessThan(0.01);
  });

  it('has strong response at stripe boundaries and near-zero within a stripe', () => {
    const lum = toLuminance(stripedRgba(40, 10, 8), 40, 10);
    const mag = sobelMagnitude(lum, 40, 10);
    const midStripeIndex = 5 * 40 + 3;
    expect(mag[midStripeIndex]).toBeLessThan(0.5);
    const boundaryIndex = 5 * 40 + 8;
    expect(mag[boundaryIndex]).toBeGreaterThan(1);
  });
});

describe('thresholdMask', () => {
  it('produces an all-zero mask for a flat image at any reasonable threshold', () => {
    const lum = toLuminance(solidRgba(20, 20), 20, 20);
    const mag = sobelMagnitude(lum, 20, 20);
    const mask = thresholdMask(mag, 0.5);
    expect(maskCoverage(mask)).toBe(0);
  });

  it('flags a meaningful fraction of pixels for a fine striped pattern', () => {
    const lum = toLuminance(stripedRgba(80, 40, 6), 80, 40);
    const mag = sobelMagnitude(lum, 80, 40);
    const mask = thresholdMask(mag, 0.5);
    expect(maskCoverage(mask)).toBeGreaterThan(0);
    expect(maskCoverage(mask)).toBeLessThan(1);
  });
});

describe('dilateMask', () => {
  it('grows a single on-pixel into a (2r+1)x(2r+1) block', () => {
    const size = 11;
    const mask = new Uint8ClampedArray(size * size);
    const center = 5 * size + 5;
    mask[center] = 255;
    const dilated = dilateMask(mask, size, size, 2);
    let onCount = 0;
    for (const v of dilated) if (v > 0) onCount++;
    expect(onCount).toBe(25);
    expect(dilated[3 * size + 5]).toBe(255);
    expect(dilated[1 * size + 5]).toBe(0);
  });

  it('is a no-op at radius 0', () => {
    const mask = new Uint8ClampedArray([0, 255, 0, 0]);
    expect(dilateMask(mask, 2, 2, 0)).toEqual(mask);
  });

  it('connects two nearby thin lines into one region', () => {
    const size = 20;
    const mask = new Uint8ClampedArray(size * size);
    for (let y = 0; y < size; y++) {
      mask[y * size + 5] = 255;
      mask[y * size + 8] = 255;
    }
    const dilated = dilateMask(mask, size, size, 2);
    expect(dilated[10 * size + 6]).toBe(255);
    expect(dilated[10 * size + 7]).toBe(255);
  });
});

describe('maskCoverage', () => {
  it('is 0 for an all-off mask and 1 for an all-on mask', () => {
    expect(maskCoverage(new Uint8ClampedArray(10))).toBe(0);
    expect(maskCoverage(new Uint8ClampedArray(10).fill(255))).toBe(1);
  });

  it('handles an empty mask without dividing by zero', () => {
    expect(maskCoverage(new Uint8ClampedArray(0))).toBe(0);
  });
});

describe('autoThreshold', () => {
  it('picks a threshold that keeps coverage within the target range', () => {
    const lum = toLuminance(stripedRgba(100, 50, 6), 100, 50);
    const mag = sobelMagnitude(lum, 100, 50);
    const candidates = [2, 1.5, 1, 0.5, 0.2, 0.05];
    const chosen = autoThreshold(mag, candidates, 0.05, 0.6);
    const coverage = maskCoverage(thresholdMask(mag, chosen));
    expect(coverage).toBeGreaterThanOrEqual(0.05);
    expect(coverage).toBeLessThanOrEqual(0.6);
  });

  it('falls back to the most lenient candidate for a flat image (no edges at all)', () => {
    const lum = toLuminance(solidRgba(30, 30), 30, 30);
    const mag = sobelMagnitude(lum, 30, 30);
    const candidates = [2, 1, 0.5];
    expect(autoThreshold(mag, candidates, 0.1, 0.9)).toBe(0.5);
  });
});
