import { describe, expect, it } from 'vitest';
import { dehazeChannel, isDehazeNeutral } from './dehaze';

describe('isDehazeNeutral', () => {
  it('is neutral only at 0', () => {
    expect(isDehazeNeutral(0)).toBe(true);
    expect(isDehazeNeutral(1)).toBe(false);
    expect(isDehazeNeutral(-1)).toBe(false);
  });
});

describe('dehazeChannel', () => {
  it('is the identity at amount 0', () => {
    for (const v of [0, 0.25, 0.5, 0.75, 1]) {
      expect(dehazeChannel(v, 0)).toBeCloseTo(v, 6);
    }
  });

  it('positive dehaze deepens a dark value and raises contrast', () => {
    const dark = dehazeChannel(0.3, 60);
    expect(dark).toBeLessThan(0.3); // dark gets darker
    const bright = dehazeChannel(0.8, 60);
    expect(bright).toBeGreaterThan(0.8); // bright gets brighter (more contrast)
  });

  it('negative dehaze lifts a dark value (veil) and lowers contrast', () => {
    const dark = dehazeChannel(0.2, -60);
    expect(dark).toBeGreaterThan(0.2); // dark lifted by the veil
    const bright = dehazeChannel(0.85, -60);
    expect(bright).toBeLessThan(0.85); // bright pulled down toward mid
  });

  it('does not invert (solarize) at strong negative amounts', () => {
    // With contrast clamped at 0, order is preserved (monotone non-decreasing).
    const lo = dehazeChannel(0.3, -300);
    const hi = dehazeChannel(0.7, -300);
    expect(hi).toBeGreaterThanOrEqual(lo);
  });

  it('stays in range at the extremes', () => {
    for (const amt of [-300, -100, 100, 300]) {
      for (const v of [0, 0.5, 1]) {
        const out = dehazeChannel(v, amt);
        expect(out).toBeGreaterThanOrEqual(0);
        expect(out).toBeLessThanOrEqual(1);
      }
    }
  });
});
