import { describe, expect, it } from 'vitest';
import { denoiseWorkSize, floorToMultiple, maxEdgeForDevice } from './denoise-size';

describe('floorToMultiple', () => {
  it('rounds down to the nearest multiple', () => {
    expect(floorToMultiple(100, 8)).toBe(96);
    expect(floorToMultiple(103, 8)).toBe(96);
    expect(floorToMultiple(104, 8)).toBe(104);
  });

  it('never returns below the multiple itself', () => {
    expect(floorToMultiple(3, 8)).toBe(8);
    expect(floorToMultiple(0, 8)).toBe(8);
  });
});

describe('denoiseWorkSize', () => {
  it('keeps small images as-is (rounded to multiple of 8)', () => {
    const s = denoiseWorkSize(640, 480, 1024, 8);
    expect(s.width).toBe(640);
    expect(s.height).toBe(480);
  });

  it('scales down large images to fit maxEdge on the longer side', () => {
    const s = denoiseWorkSize(4000, 3000, 1024, 8);
    expect(Math.max(s.width, s.height)).toBeLessThanOrEqual(1024);
    // aspect ratio roughly preserved
    expect(s.width).toBeGreaterThan(s.height);
  });

  it('always returns multiples of 8', () => {
    const s = denoiseWorkSize(1333, 777, 1024, 8);
    expect(s.width % 8).toBe(0);
    expect(s.height % 8).toBe(0);
  });

  it('does not upscale', () => {
    const s = denoiseWorkSize(300, 200, 1024, 8);
    expect(s.width).toBeLessThanOrEqual(300);
    expect(s.height).toBeLessThanOrEqual(200);
  });
});

describe('maxEdgeForDevice', () => {
  it('caps mobile tighter than desktop', () => {
    expect(maxEdgeForDevice(true, 1024)).toBeLessThan(maxEdgeForDevice(false, 1024));
  });

  it('never exceeds the model max edge', () => {
    expect(maxEdgeForDevice(false, 1024)).toBe(1024);
    expect(maxEdgeForDevice(true, 512)).toBeLessThanOrEqual(512);
  });
});
