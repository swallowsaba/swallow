import { describe, expect, it } from 'vitest';
import {
  bilateral,
  denoiseSigma,
  noiseAwareSharpen,
  rangeWeight,
  type Sample,
} from './detail-v2';

describe('rangeWeight', () => {
  it('is 1 at zero difference and decreases with distance', () => {
    expect(rangeWeight(0, 0.1)).toBeCloseTo(1, 6);
    expect(rangeWeight(0.1, 0.1)).toBeLessThan(1);
    expect(rangeWeight(0.3, 0.1)).toBeLessThan(rangeWeight(0.1, 0.1));
  });

  it('never goes negative', () => {
    for (const d of [-1, -0.5, 0, 0.5, 1]) {
      expect(rangeWeight(d, 0.1)).toBeGreaterThanOrEqual(0);
    }
  });

  it('degenerates sanely at sigma 0', () => {
    expect(rangeWeight(0, 0)).toBe(1);
    expect(rangeWeight(0.2, 0)).toBe(0);
  });
});

describe('denoiseSigma', () => {
  it('is 0 (disabled) at strength 0 and rises with strength', () => {
    expect(denoiseSigma(0)).toBe(0);
    expect(denoiseSigma(50)).toBeGreaterThan(0);
    expect(denoiseSigma(100)).toBeGreaterThan(denoiseSigma(50));
  });
});

describe('bilateral', () => {
  const near = (v: number): Sample => ({ v, spatial: 1 });

  it('returns the center unchanged when disabled', () => {
    expect(bilateral(0.5, [near(0.1), near(0.9)], 0)).toBe(0.5);
  });

  it('averages flat-area noise (all neighbors similar)', () => {
    // center is a noisy spike; neighbors cluster around 0.5
    const out = bilateral(0.6, [near(0.5), near(0.5), near(0.5), near(0.5)], 0.2);
    // should be pulled toward 0.5, away from the 0.6 spike
    expect(out).toBeLessThan(0.6);
    expect(out).toBeGreaterThan(0.5);
  });

  it('preserves an edge: neighbors across a big jump are ignored', () => {
    // center 0.2 (dark side), neighbors split: two dark (0.2), two bright (0.9)
    const out = bilateral(0.2, [near(0.2), near(0.2), near(0.9), near(0.9)], 0.1);
    // the bright neighbors are across an edge (diff 0.7 >> sigma 0.1) so they're
    // down-weighted; result stays close to the dark side.
    expect(out).toBeLessThan(0.35);
  });

  it('with a huge sigma behaves like a plain average', () => {
    const out = bilateral(0.2, [near(0.4), near(0.6)], 100);
    // (0.2 + 0.4 + 0.6) / 3 = 0.4
    expect(out).toBeCloseTo(0.4, 2);
  });
});

describe('noiseAwareSharpen', () => {
  it('is identity at amount 0', () => {
    expect(noiseAwareSharpen(0.5, 0.4, 0)).toBeCloseTo(0.5, 6);
  });

  it('does NOT amplify sub-noise-floor detail (grain)', () => {
    // detail = 0.505 - 0.5 = 0.005, below the 0.015 floor
    expect(noiseAwareSharpen(0.505, 0.5, 100)).toBeCloseTo(0.505, 6);
  });

  it('sharpens real structure above the floor', () => {
    // detail = 0.7 - 0.5 = 0.2, well above floor -> brighten
    expect(noiseAwareSharpen(0.7, 0.5, 80)).toBeGreaterThan(0.7);
  });

  it('sharpens the dark side of an edge downward', () => {
    expect(noiseAwareSharpen(0.3, 0.5, 80)).toBeLessThan(0.3);
  });

  it('stays in range at strong settings', () => {
    for (const [p, a] of [
      [0.9, 0.4],
      [0.1, 0.6],
      [0.95, 0.2],
    ]) {
      const out = noiseAwareSharpen(p, a, 300);
      expect(out).toBeGreaterThanOrEqual(0);
      expect(out).toBeLessThanOrEqual(1);
    }
  });
});

describe('denoiseSigma stays edge-preserving', () => {
  const near = (v: number) => ({ v, spatial: 1 });

  it('keeps sigma small even at full strength', () => {
    expect(denoiseSigma(100)).toBeLessThanOrEqual(0.04);
  });

  it('preserves a strong edge at full denoise strength', () => {
    // center on the dark side of a high-contrast edge (helmet vs background):
    // half the neighbors are bright (across the edge). With the corrected small
    // sigma, those bright neighbors get ~0 weight, so the center barely moves.
    const sigma = denoiseSigma(100);
    const out = bilateral(0.15, [near(0.16), near(0.14), near(0.85), near(0.88)], sigma);
    expect(Math.abs(out - 0.15)).toBeLessThan(0.03); // edge preserved
  });

  it('still smooths low-amplitude grain in a flat area', () => {
    const sigma = denoiseSigma(80);
    // center is a small grain spike; neighbors cluster tightly around 0.5
    const out = bilateral(0.53, [near(0.5), near(0.49), near(0.51), near(0.5)], sigma);
    expect(out).toBeLessThan(0.53); // pulled toward the flat neighborhood
    expect(out).toBeGreaterThan(0.5);
  });
});
