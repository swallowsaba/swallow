import { describe, expect, it } from 'vitest';
import { applyDeblur, isDeblurNeutral } from './deblur';

describe('isDeblurNeutral', () => {
  it('is neutral only at or below zero', () => {
    expect(isDeblurNeutral(0)).toBe(true);
    expect(isDeblurNeutral(-5)).toBe(true);
    expect(isDeblurNeutral(1)).toBe(false);
  });
});

describe('applyDeblur', () => {
  it('is the identity at amount 0', () => {
    for (const v of [0, 0.3, 0.5, 0.8, 1]) {
      expect(applyDeblur(v, 0.4, 0)).toBeCloseTo(v, 6);
    }
  });

  it('leaves flat/near-flat areas (below threshold) untouched', () => {
    // pixel very close to its neighborhood average -> treated as noise
    expect(applyDeblur(0.501, 0.5, 80)).toBeCloseTo(0.501, 6);
  });

  it('sharpens an edge: a bright pixel over a darker blur gets brighter', () => {
    const out = applyDeblur(0.7, 0.5, 60);
    expect(out).toBeGreaterThan(0.7);
  });

  it('sharpens the dark side of an edge downward', () => {
    const out = applyDeblur(0.3, 0.5, 60);
    expect(out).toBeLessThan(0.3);
  });

  it('suppresses halos: never pushes beyond 1.5x the detail magnitude', () => {
    const pixel = 0.6;
    const blurred = 0.5;
    const mag = Math.abs(pixel - blurred);
    const out = applyDeblur(pixel, blurred, 100);
    expect(out - pixel).toBeLessThanOrEqual(mag * 1.5 + 1e-9);
  });

  it('stays in range at strong settings and extremes', () => {
    for (const [p, b] of [
      [0.95, 0.4],
      [0.05, 0.6],
      [1, 0],
      [0, 1],
    ]) {
      const out = applyDeblur(p, b, 100);
      expect(out).toBeGreaterThanOrEqual(0);
      expect(out).toBeLessThanOrEqual(1);
    }
  });
});
