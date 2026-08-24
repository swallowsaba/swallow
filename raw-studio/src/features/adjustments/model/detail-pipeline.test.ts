import { describe, expect, it } from 'vitest';
import {
  bilateralPass1D,
  denoiseIterations,
  denoiseRadius,
  denoiseRangeSigma,
  rangeWeight,
  resolveDetailParams,
  spatialWeights,
  type Tap,
} from './detail-pipeline';

describe('spatialWeights', () => {
  it('starts at 1 and decreases with distance', () => {
    const w = spatialWeights(4, 2);
    expect(w[0]).toBeCloseTo(1, 6);
    expect(w[1]!).toBeLessThan(w[0]!);
    expect(w[4]!).toBeLessThan(w[1]!);
    expect(w.length).toBe(5);
  });

  it('handles radius 0', () => {
    expect(spatialWeights(0, 2)).toEqual([1]);
  });
});

describe('rangeWeight', () => {
  it('is 1 at 0 and falls off', () => {
    expect(rangeWeight(0, 0.1)).toBeCloseTo(1, 6);
    expect(rangeWeight(0.2, 0.1)).toBeLessThan(rangeWeight(0.05, 0.1));
  });
});

describe('bilateralPass1D', () => {
  const flatTaps = (vals: number[]): Tap[] =>
    vals.map((v, i) => ({ v, luma: v, dist: i + 1 }));

  it('returns center when disabled (sigmaRange<=0)', () => {
    expect(bilateralPass1D(0.5, 0.5, flatTaps([0.1, 0.9]), 4, 2, 0)).toBe(0.5);
  });

  it('smooths a spike surrounded by a flat region', () => {
    // center is a bright spike at 0.6; neighbors all 0.5
    const taps = flatTaps([0.5, 0.5, 0.5, 0.5]);
    const out = bilateralPass1D(0.6, 0.6, taps, 4, 2, 0.2);
    expect(out).toBeLessThan(0.6);
    expect(out).toBeGreaterThan(0.5);
  });

  it('preserves an edge: taps across a big luma jump are ignored', () => {
    // center dark 0.2; taps: near dark (0.2) then bright across edge (0.9)
    const taps: Tap[] = [
      { v: 0.2, luma: 0.2, dist: 1 },
      { v: 0.2, luma: 0.2, dist: 2 },
      { v: 0.9, luma: 0.9, dist: 3 },
      { v: 0.9, luma: 0.9, dist: 4 },
    ];
    const out = bilateralPass1D(0.2, 0.2, taps, 4, 2, 0.08);
    expect(out).toBeLessThan(0.35); // stays near the dark side
  });

  it('ignores taps beyond the radius', () => {
    const taps: Tap[] = [{ v: 0.9, luma: 0.9, dist: 10 }]; // outside radius 4
    const out = bilateralPass1D(0.3, 0.3, taps, 4, 2, 0.2);
    expect(out).toBeCloseTo(0.3, 6);
  });
});

describe('strength mappings', () => {
  it('radius is 0 disabled, grows with strength', () => {
    expect(denoiseRadius(0)).toBe(0);
    expect(denoiseRadius(50)).toBeGreaterThan(0);
    expect(denoiseRadius(100)).toBeGreaterThan(denoiseRadius(50));
  });

  it('range sigma is 0 disabled, grows with strength', () => {
    expect(denoiseRangeSigma(0)).toBe(0);
    expect(denoiseRangeSigma(100)).toBeGreaterThan(denoiseRangeSigma(50));
  });

  it('iterations: 0 off, 1 for mild, 2 for strong', () => {
    expect(denoiseIterations(0)).toBe(0);
    expect(denoiseIterations(30)).toBe(1);
    expect(denoiseIterations(80)).toBe(2);
  });
});

describe('resolveDetailParams', () => {
  it('maps strong strengths to concrete params', () => {
    const r = resolveDetailParams({
      noiseReduction: 80,
      colorNoiseReduction: 50,
      sharpenAmount: 120,
      sharpenRadius: 1,
    });
    expect(r.denoiseRadius).toBeGreaterThan(0);
    expect(r.denoiseRange).toBeGreaterThan(0);
    expect(r.denoiseIterations).toBe(2);
    expect(r.colorDenoise).toBeCloseTo(0.5, 6);
    expect(r.sharpenAmount).toBe(120);
    expect(r.noiseFloor).toBeCloseTo(0.015, 6);
  });

  it('is fully neutral at zero', () => {
    const z = resolveDetailParams({
      noiseReduction: 0,
      colorNoiseReduction: 0,
      sharpenAmount: 0,
      sharpenRadius: 1,
    });
    expect(z.denoiseRadius).toBe(0);
    expect(z.colorDenoise).toBe(0);
    expect(z.sharpenAmount).toBe(0);
  });

  it('spatial sigma is at least 1', () => {
    const r = resolveDetailParams({
      noiseReduction: 10,
      colorNoiseReduction: 0,
      sharpenAmount: 0,
      sharpenRadius: 1,
    });
    expect(r.sigmaSpatial).toBeGreaterThanOrEqual(1);
  });
});
