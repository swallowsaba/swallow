import { describe, expect, it } from 'vitest';
import { computeWhiteBalanceFromSample, previewCorrectedSample } from './white-balance-picker';

describe('computeWhiteBalanceFromSample', () => {
  it('returns ~zero correction for an already-neutral gray sample', () => {
    const { temperature, tint } = computeWhiteBalanceFromSample(128, 128, 128);
    expect(temperature).toBeCloseTo(0, 1);
    expect(tint).toBeCloseTo(0, 1);
  });

  it('a warm (yellow/orange) sample needs a cooling (negative) temperature', () => {
    const { temperature } = computeWhiteBalanceFromSample(200, 160, 100);
    expect(temperature).toBeLessThan(0);
  });

  it('a cool (blue) sample needs a warming (positive) temperature', () => {
    const { temperature } = computeWhiteBalanceFromSample(120, 150, 210);
    expect(temperature).toBeGreaterThan(0);
  });

  it('a green-tinted sample needs a positive (magenta) tint correction', () => {
    const { tint } = computeWhiteBalanceFromSample(120, 190, 120);
    expect(tint).toBeGreaterThan(0);
  });

  it('degenerate black sample falls back to a finite correction, not NaN/Infinity', () => {
    const { temperature, tint } = computeWhiteBalanceFromSample(0, 0, 0);
    expect(Number.isFinite(temperature)).toBe(true);
    expect(Number.isFinite(tint)).toBe(true);
  });
});

describe('computeWhiteBalanceFromSample round-trip', () => {
  it('applying the computed correction actually neutralizes the sample', () => {
    const cases: [number, number, number][] = [
      [200, 160, 100],
      [120, 150, 210],
      [180, 200, 150],
      [90, 100, 130],
    ];
    for (const [r, g, b] of cases) {
      const { temperature, tint } = computeWhiteBalanceFromSample(r, g, b);
      const [cr, cg, cb] = previewCorrectedSample(r, g, b, temperature, tint);
      expect(cr).toBeCloseTo(cg, 0);
      expect(cg).toBeCloseTo(cb, 0);
    }
  });

  it('does not change an already-neutral sample much', () => {
    const { temperature, tint } = computeWhiteBalanceFromSample(180, 180, 180);
    const [cr, cg, cb] = previewCorrectedSample(180, 180, 180, temperature, tint);
    expect(cr).toBeCloseTo(180, 0);
    expect(cg).toBeCloseTo(180, 0);
    expect(cb).toBeCloseTo(180, 0);
  });
});
