import { describe, expect, it } from 'vitest';
import type { CropRect, RasterMaskData } from '@/types';
import {
  alphaToCroppedRaster,
  boxBlurAlpha,
  decodeBase64,
  decodeRaster,
  encodeBase64,
  rasterizeRaster,
  sampleRasterAt,
} from './raster-mask';

describe('base64 codec', () => {
  it('round-trips arbitrary bytes', () => {
    const bytes = new Uint8ClampedArray([0, 1, 2, 253, 254, 255, 128, 64]);
    const round = decodeBase64(encodeBase64(bytes));
    expect(Array.from(round)).toEqual(Array.from(bytes));
  });

  it('handles lengths not divisible by 3 (padding)', () => {
    for (const len of [1, 2, 4, 5, 7, 100]) {
      const bytes = new Uint8ClampedArray(len);
      for (let i = 0; i < len; i++) bytes[i] = (i * 37) % 256;
      const round = decodeBase64(encodeBase64(bytes));
      expect(Array.from(round)).toEqual(Array.from(bytes));
    }
  });

  it('produces standard base64 (multiple of 4 chars, padded)', () => {
    expect(encodeBase64(new Uint8ClampedArray([77, 97, 110])).length % 4).toBe(0);
    expect(encodeBase64(new Uint8ClampedArray([1])).endsWith('==')).toBe(true);
  });

  it('decodeRaster memoizes to the same instance', () => {
    const s = encodeBase64(new Uint8ClampedArray([10, 20, 30, 40]));
    expect(decodeRaster(s)).toBe(decodeRaster(s));
  });
});

describe('sampleRasterAt', () => {
  // 2x2: top row 0,255 ; bottom row 255,0
  const buf = new Uint8ClampedArray([0, 255, 255, 0]);
  it('reads corners exactly', () => {
    expect(sampleRasterAt(buf, 2, 2, 0, 0)).toBeCloseTo(0, 5);
    expect(sampleRasterAt(buf, 2, 2, 1, 0)).toBeCloseTo(1, 5);
    expect(sampleRasterAt(buf, 2, 2, 0, 1)).toBeCloseTo(1, 5);
    expect(sampleRasterAt(buf, 2, 2, 1, 1)).toBeCloseTo(0, 5);
  });
  it('bilerps the center to 0.5', () => {
    expect(sampleRasterAt(buf, 2, 2, 0.5, 0.5)).toBeCloseTo(0.5, 5);
  });
});

describe('rasterizeRaster', () => {
  function makeRaster(alpha: number[], w: number, h: number, patch: Partial<RasterMaskData> = {}): RasterMaskData {
    return {
      kind: 'raster',
      source: 'test',
      width: w,
      height: h,
      data: encodeBase64(new Uint8ClampedArray(alpha)),
      feather: 0,
      invert: false,
      ...patch,
    };
  }

  it('resamples up to a larger grid preserving the gradient direction', () => {
    // 4x1 left-dark → right-bright; pixel-center sampling never hits the exact
    // corners, so assert the ends land dark/bright rather than exact 0/255.
    const m = makeRaster([0, 0, 255, 255], 4, 1);
    const out = rasterizeRaster(m, 8, 1);
    expect(out.length).toBe(8);
    expect(out[0]).toBeLessThan(50);
    expect(out[7]).toBeGreaterThan(200);
  });

  it('inverts coverage', () => {
    const m = makeRaster([255, 255, 255, 255], 2, 2, { invert: true });
    const out = rasterizeRaster(m, 2, 2);
    expect(Array.from(out)).toEqual([0, 0, 0, 0]);
  });

  it('feather blurs a hard edge (reduces the max toward neighbours)', () => {
    // 4x1 hard step 0,0,255,255 → after blur the interior softens.
    const m = makeRaster([0, 0, 255, 255, 0, 0, 255, 255], 4, 2, { feather: 1 });
    const out = rasterizeRaster(m, 4, 2);
    // Some pixel that was 0 or 255 should now be an intermediate value.
    expect(Array.from(out).some((v) => v > 0 && v < 255)).toBe(true);
  });
});

describe('boxBlurAlpha', () => {
  it('radius 0 is a no-op (same reference)', () => {
    const src = new Uint8ClampedArray([1, 2, 3, 4]);
    expect(boxBlurAlpha(src, 2, 2, 0)).toBe(src);
  });
  it('averages a single bright pixel outward', () => {
    const src = new Uint8ClampedArray([0, 0, 0, 0, 255, 0, 0, 0, 0]);
    const out = boxBlurAlpha(src, 3, 3, 1);
    // Center reduced, neighbours raised.
    expect(out[4]).toBeLessThan(255);
    expect(out[1]).toBeGreaterThan(0);
  });
});

describe('alphaToCroppedRaster', () => {
  // 2x2 seg: left column 255, right column 0.
  const seg = new Uint8ClampedArray([255, 0, 255, 0]);
  const avg = (a: Uint8ClampedArray) => Array.from(a).reduce((s, v) => s + v, 0) / a.length;

  it('identity crop keeps left brighter than right', () => {
    const full: CropRect = { x: 0, y: 0, width: 1, height: 1 };
    const out = alphaToCroppedRaster(seg, 2, full, 2, 2);
    expect(out[0]).toBeGreaterThan(out[1] ?? 0); // left col > right col
  });

  it('a right-half crop is darker than a left-half crop', () => {
    const left = alphaToCroppedRaster(seg, 2, { x: 0, y: 0, width: 0.5, height: 1 }, 4, 4);
    const right = alphaToCroppedRaster(seg, 2, { x: 0.5, y: 0, width: 0.5, height: 1 }, 4, 4);
    expect(avg(right)).toBeLessThan(avg(left));
  });
});
