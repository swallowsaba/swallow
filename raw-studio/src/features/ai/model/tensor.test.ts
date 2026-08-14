import { describe, expect, it } from 'vitest';
import { chw255ToRgba, maskToNchw1, outputToMask, rgbaToNchw } from './tensor';

function solid(r: number, g: number, b: number, n: number): Uint8ClampedArray {
  const a = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    a[i * 4] = r;
    a[i * 4 + 1] = g;
    a[i * 4 + 2] = b;
    a[i * 4 + 3] = 255;
  }
  return a;
}

const NORM = { mean: [0, 0, 0] as const, std: [1, 1, 1] as const };

describe('tensor pre/post-processing', () => {
  it('lays out RGBA into planar NCHW', () => {
    const t = rgbaToNchw(solid(255, 0, 0, 4), 2, NORM);
    expect(t.length).toBe(12);
    expect(t[0]).toBe(1); // R plane
    expect(t[4]).toBe(0); // G plane
    expect(t[8]).toBe(0); // B plane
  });

  it('normalizes a [0,1] output to an 8-bit mask', () => {
    const mask = outputToMask(new Float32Array([0, 0.5, 1, 0.25]), 2);
    expect(mask[0]).toBe(0);
    expect(mask[2]).toBe(255);
  });

  it('applies sigmoid to logit outputs', () => {
    const mask = outputToMask(new Float32Array([-10, 10, 0, 0]), 2);
    expect(mask[0]).toBeLessThan(5);
    expect(mask[1]).toBeGreaterThan(250);
  });
});

describe('inpainting tensor helpers', () => {
  it('maskToNchw1 converts 0..255 alpha to 0..1 float', () => {
    const mask = new Uint8ClampedArray([0, 255, 128, 0]);
    const t = maskToNchw1(mask, 2);
    expect(t.length).toBe(4);
    expect(t[0]).toBeCloseTo(0, 3);
    expect(t[1]).toBeCloseTo(1, 3);
    expect(t[2]).toBeCloseTo(128 / 255, 3);
  });

  it('chw255ToRgba round-trips a planar 0..255 tensor back to interleaved RGBA', () => {
    // 2x2 image, CHW layout, already in 0..255 (LaMa's output contract).
    const plane = 4;
    const chw = new Float32Array(3 * plane);
    // Pixel 0: pure red (255,0,0). Pixel 1: pure green. Others black.
    chw[0] = 255; // R plane, pixel0
    chw[plane + 1] = 255; // G plane, pixel1
    const rgba = chw255ToRgba(chw, 2);
    expect(rgba.length).toBe(16);
    expect(rgba[0]).toBe(255); // pixel0 R
    expect(rgba[1]).toBe(0); // pixel0 G
    expect(rgba[3]).toBe(255); // pixel0 alpha opaque
    expect(rgba[4]).toBe(0); // pixel1 R
    expect(rgba[5]).toBe(255); // pixel1 G
  });
});
