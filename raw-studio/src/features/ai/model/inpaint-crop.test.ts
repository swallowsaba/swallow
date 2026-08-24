import { describe, expect, it } from 'vitest';
import {
  cropRegionForMask,
  isWorthCropping,
  maskBounds,
  resolutionGain,
  type Rect,
} from './inpaint-crop';

function maskWithRect(w: number, h: number, r: Rect): Uint8ClampedArray {
  const a = new Uint8ClampedArray(w * h);
  for (let y = r.y; y < r.y + r.height; y++) {
    for (let x = r.x; x < r.x + r.width; x++) a[y * w + x] = 255;
  }
  return a;
}

describe('maskBounds', () => {
  it('finds the bounding box of the painted area', () => {
    const a = maskWithRect(100, 100, { x: 20, y: 30, width: 10, height: 5 });
    expect(maskBounds(a, 100, 100)).toEqual({ x: 20, y: 30, width: 10, height: 5 });
  });

  it('returns null for an empty mask', () => {
    expect(maskBounds(new Uint8ClampedArray(100), 10, 10)).toBeNull();
  });

  it('handles a single pixel', () => {
    const a = new Uint8ClampedArray(100);
    a[55] = 255; // (5,5) in 10x10
    expect(maskBounds(a, 10, 10)).toEqual({ x: 5, y: 5, width: 1, height: 1 });
  });
});

describe('cropRegionForMask', () => {
  it('pads and squares a small mask well inside the image', () => {
    const crop = cropRegionForMask({ x: 400, y: 400, width: 20, height: 10 }, 1000, 1000, 0.6, 16);
    // square
    expect(crop.width).toBe(crop.height);
    // contains the mask
    expect(crop.x).toBeLessThanOrEqual(400);
    expect(crop.y).toBeLessThanOrEqual(400);
    expect(crop.x + crop.width).toBeGreaterThanOrEqual(420);
    expect(crop.y + crop.height).toBeGreaterThanOrEqual(410);
    // much smaller than the image
    expect(crop.width).toBeLessThan(300);
  });

  it('clamps to the image at the edges', () => {
    const crop = cropRegionForMask({ x: 0, y: 0, width: 10, height: 10 }, 500, 500, 0.6, 16);
    expect(crop.x).toBeGreaterThanOrEqual(0);
    expect(crop.y).toBeGreaterThanOrEqual(0);
    expect(crop.x + crop.width).toBeLessThanOrEqual(500);
    expect(crop.y + crop.height).toBeLessThanOrEqual(500);
  });

  it('never exceeds the image bounds even for a big mask', () => {
    const crop = cropRegionForMask({ x: 10, y: 10, width: 480, height: 480 }, 500, 500, 0.6, 16);
    expect(crop.x).toBeGreaterThanOrEqual(0);
    expect(crop.y).toBeGreaterThanOrEqual(0);
    expect(crop.x + crop.width).toBeLessThanOrEqual(500);
    expect(crop.y + crop.height).toBeLessThanOrEqual(500);
  });
});

describe('isWorthCropping', () => {
  it('is true for a small crop', () => {
    expect(isWorthCropping({ x: 0, y: 0, width: 100, height: 100 }, 1000, 1000)).toBe(true);
  });

  it('is false when the crop is most of the image', () => {
    expect(isWorthCropping({ x: 0, y: 0, width: 900, height: 900 }, 1000, 1000)).toBe(false);
  });
});

describe('resolutionGain', () => {
  it('is >1 when the crop is smaller than the image', () => {
    expect(resolutionGain({ x: 0, y: 0, width: 250, height: 250 }, 1000, 1000)).toBeCloseTo(4, 5);
  });

  it('is 1 when the crop is the whole image', () => {
    expect(resolutionGain({ x: 0, y: 0, width: 1000, height: 1000 }, 1000, 1000)).toBe(1);
  });
});
