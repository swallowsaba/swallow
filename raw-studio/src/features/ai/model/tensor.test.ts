import { describe, expect, it } from 'vitest';
import { outputToMask, rgbaToNchw } from './tensor';

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
