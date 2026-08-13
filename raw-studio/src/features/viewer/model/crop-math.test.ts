import { describe, expect, it } from 'vitest';
import {
  aspectRatioValue,
  clampCropRect,
  cropRectForAspect,
  croppedImageSize,
  FULL_CROP,
} from './crop-math';

describe('aspectRatioValue', () => {
  it('free and original are unconstrained (null)', () => {
    expect(aspectRatioValue('free')).toBeNull();
    expect(aspectRatioValue('original')).toBeNull();
  });

  it('resolves numeric ratios', () => {
    expect(aspectRatioValue('1:1')).toBeCloseTo(1);
    expect(aspectRatioValue('16:9')).toBeCloseTo(16 / 9);
    expect(aspectRatioValue('9:16')).toBeCloseTo(9 / 16);
  });
});

describe('clampCropRect', () => {
  it('leaves an in-bounds rect unchanged', () => {
    expect(clampCropRect({ x: 0.1, y: 0.1, width: 0.5, height: 0.5 })).toEqual({
      x: 0.1,
      y: 0.1,
      width: 0.5,
      height: 0.5,
    });
  });

  it('pulls an out-of-bounds origin back inside', () => {
    const r = clampCropRect({ x: 0.8, y: 0.9, width: 0.5, height: 0.5 });
    expect(r.x).toBeCloseTo(0.5, 5);
    expect(r.y).toBeCloseTo(0.5, 5);
  });

  it('never exceeds the full frame', () => {
    const r = clampCropRect({ x: -0.5, y: -0.5, width: 2, height: 2 });
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
    expect(r.width).toBe(1);
    expect(r.height).toBe(1);
  });

  it('enforces a minimum size', () => {
    const r = clampCropRect({ x: 0.5, y: 0.5, width: 0, height: 0 });
    expect(r.width).toBeGreaterThan(0);
    expect(r.height).toBeGreaterThan(0);
  });
});

describe('cropRectForAspect', () => {
  it('free aspect returns the full frame', () => {
    expect(cropRectForAspect(null, 1.5)).toEqual(FULL_CROP);
  });

  it('centers a square crop inside a landscape image', () => {
    const r = cropRectForAspect(1, 1.5); // image is 3:2, want 1:1
    expect(r.width).toBeCloseTo(1 / 1.5, 5);
    expect(r.height).toBeCloseTo(1, 5);
    expect(r.x).toBeCloseTo((1 - r.width) / 2, 5);
    expect(r.y).toBeCloseTo(0, 5);
  });

  it('centers a portrait 9:16 crop inside a landscape image', () => {
    const r = cropRectForAspect(9 / 16, 16 / 9);
    expect(r.height).toBeCloseTo(1, 5);
    expect(r.width).toBeLessThan(1);
  });

  it('the resulting rect stays within bounds', () => {
    const r = cropRectForAspect(16 / 9, 1);
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.y).toBeGreaterThanOrEqual(0);
    expect(r.x + r.width).toBeLessThanOrEqual(1.0001);
    expect(r.y + r.height).toBeLessThanOrEqual(1.0001);
  });
});

describe('croppedImageSize', () => {
  it('full crop returns the original size', () => {
    expect(croppedImageSize({ width: 4000, height: 3000 }, FULL_CROP)).toEqual({
      width: 4000,
      height: 3000,
    });
  });

  it('scales down for a partial crop', () => {
    const size = croppedImageSize({ width: 4000, height: 3000 }, { x: 0, y: 0, width: 0.5, height: 0.5 });
    expect(size.width).toBe(2000);
    expect(size.height).toBe(1500);
  });

  it('never returns a zero dimension', () => {
    const size = croppedImageSize({ width: 10, height: 10 }, { x: 0, y: 0, width: 0.01, height: 0.01 });
    expect(size.width).toBeGreaterThanOrEqual(1);
    expect(size.height).toBeGreaterThanOrEqual(1);
  });
});
