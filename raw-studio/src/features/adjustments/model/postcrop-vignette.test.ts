import { describe, expect, it } from 'vitest';
import {
  isVignetteNeutral,
  postCropVignetteFactor,
  type VignetteParams,
} from './postcrop-vignette';

const params = (over: Partial<VignetteParams> = {}): VignetteParams => ({
  amount: 0,
  midpoint: 50,
  roundness: 0,
  feather: 50,
  ...over,
});

describe('isVignetteNeutral', () => {
  it('is neutral only at amount 0', () => {
    expect(isVignetteNeutral(0)).toBe(true);
    expect(isVignetteNeutral(1)).toBe(false);
    expect(isVignetteNeutral(-1)).toBe(false);
  });
});

describe('postCropVignetteFactor', () => {
  it('is 1 everywhere when amount is 0', () => {
    expect(postCropVignetteFactor(0.5, 0.5, params())).toBe(1);
    expect(postCropVignetteFactor(0, 0, params())).toBe(1);
  });

  it('leaves the center unchanged and darkens the corner for positive amount', () => {
    const p = params({ amount: 80 });
    expect(postCropVignetteFactor(0.5, 0.5, p)).toBeCloseTo(1, 6);
    expect(postCropVignetteFactor(0, 0, p)).toBeLessThan(1);
  });

  it('brightens the corner for negative amount', () => {
    const p = params({ amount: -80 });
    expect(postCropVignetteFactor(0, 0, p)).toBeGreaterThan(1);
  });

  it('a larger midpoint keeps more of the frame clear', () => {
    // A point partway out is affected less when the midpoint pushes outward.
    const near = postCropVignetteFactor(0.2, 0.2, params({ amount: 80, midpoint: 20 }));
    const far = postCropVignetteFactor(0.2, 0.2, params({ amount: 80, midpoint: 80 }));
    expect(far).toBeGreaterThan(near); // less darkening with the bigger clear center
  });

  it('roundness changes the corner-vs-edge balance', () => {
    // On an axis (edge midpoint) vs the diagonal corner, rectangular vs circular
    // falloff weight the two differently.
    const edgeCircular = postCropVignetteFactor(0.5, 0.0, params({ amount: 80, roundness: 100, feather: 80 }));
    const edgeRect = postCropVignetteFactor(0.5, 0.0, params({ amount: 80, roundness: -100, feather: 80 }));
    expect(edgeRect).not.toBeCloseTo(edgeCircular, 3);
  });

  it('stays finite and sensible at the extremes', () => {
    const f = postCropVignetteFactor(0, 0, params({ amount: 100, midpoint: 0, roundness: 0, feather: 0 }));
    expect(Number.isFinite(f)).toBe(true);
    expect(f).toBeGreaterThanOrEqual(0);
  });
});
