import { describe, expect, it } from 'vitest';
import { backgroundBlurRadiusPx } from './blur-math';

describe('backgroundBlurRadiusPx', () => {
  it('scales with image resolution at a fixed strength', () => {
    const small = backgroundBlurRadiusPx(50, 1000);
    const large = backgroundBlurRadiusPx(50, 4000);
    expect(large).toBeGreaterThan(small);
  });

  it('scales with strength at a fixed resolution', () => {
    const low = backgroundBlurRadiusPx(20, 4000);
    const high = backgroundBlurRadiusPx(80, 4000);
    expect(high).toBeGreaterThan(low);
  });

  it('is meaningfully visible (not a tiny fixed radius) on a large photo', () => {
    // Regression: a fixed 14px radius on a 4000px photo was under 0.4% of
    // its width — effectively invisible. At a reasonable default strength,
    // the radius should now be a clearly visible fraction of the image.
    const radius = backgroundBlurRadiusPx(50, 4000);
    expect(radius).toBeGreaterThan(50);
  });

  it('never goes below a small minimum, even at 0 strength', () => {
    expect(backgroundBlurRadiusPx(0, 4000)).toBeGreaterThanOrEqual(2);
  });
});
