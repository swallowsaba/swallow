import { describe, expect, it } from 'vitest';
import type { ColorGrading, ColorWheel } from '@/types';
import {
  applyColorGrading,
  applyWheel,
  isNeutralGrading,
  isNeutralWheel,
  NEUTRAL_WHEEL,
  pointToWheel,
  tonalWeights,
  wheelTint,
  wheelToPoint,
} from './color-grading';

const grading = (over: Partial<ColorGrading> = {}): ColorGrading => ({
  shadows: NEUTRAL_WHEEL,
  midtones: NEUTRAL_WHEEL,
  highlights: NEUTRAL_WHEEL,
  global: NEUTRAL_WHEEL,
  blending: 50,
  balance: 0,
  ...over,
});

describe('wheel <-> point', () => {
  it('round-trips hue and saturation', () => {
    const w: ColorWheel = { hue: 120, saturation: 80, luminance: 0 };
    const p = wheelToPoint(w);
    const back = pointToWheel(p.x, p.y);
    expect(back.hue).toBe(120);
    expect(back.saturation).toBe(80);
  });

  it('puts hue 0 on the +x axis and clamps outside the disc', () => {
    const p = wheelToPoint({ hue: 0, saturation: 100, luminance: 0 });
    expect(p.x).toBeCloseTo(1, 6);
    expect(p.y).toBeCloseTo(0, 6);
    expect(pointToWheel(5, 0).saturation).toBe(100); // clamped to the rim
  });

  it('normalizes negative angles to 0..360', () => {
    expect(pointToWheel(0, -1).hue).toBe(270);
  });
});

describe('isNeutralWheel / isNeutralGrading', () => {
  it('detects no-ops', () => {
    expect(isNeutralWheel(NEUTRAL_WHEEL)).toBe(true);
    expect(isNeutralWheel({ hue: 200, saturation: 0, luminance: 0 })).toBe(true); // hue alone does nothing
    expect(isNeutralWheel({ hue: 0, saturation: 10, luminance: 0 })).toBe(false);
    expect(isNeutralGrading(grading())).toBe(true);
    expect(isNeutralGrading(grading({ shadows: { hue: 220, saturation: 30, luminance: 0 } }))).toBe(
      false,
    );
  });
});

describe('tonalWeights', () => {
  it('weights sum to 1 across the range', () => {
    for (const l of [0, 0.25, 0.5, 0.75, 1]) {
      const w = tonalWeights(l, 0);
      expect(w.shadows + w.midtones + w.highlights).toBeCloseTo(1, 6);
    }
  });

  it('favours shadows in the dark and highlights in the bright', () => {
    const dark = tonalWeights(0.02, 0);
    const bright = tonalWeights(0.98, 0);
    expect(dark.shadows).toBeGreaterThan(dark.highlights);
    expect(bright.highlights).toBeGreaterThan(bright.shadows);
  });

  it('positive balance raises the split, so mid-grey leans more to shadows', () => {
    const mid = 0.5;
    const neutral = tonalWeights(mid, 0);
    const pushed = tonalWeights(mid, 100);
    expect(pushed.shadows).toBeGreaterThan(neutral.shadows);
  });
});

describe('wheelTint', () => {
  it('maps primary hues to primary colors', () => {
    expect(wheelTint({ hue: 0, saturation: 100, luminance: 0 })).toEqual({ r: 1, g: 0, b: 0 });
    expect(wheelTint({ hue: 120, saturation: 100, luminance: 0 })).toEqual({ r: 0, g: 1, b: 0 });
    expect(wheelTint({ hue: 240, saturation: 100, luminance: 0 })).toEqual({ r: 0, g: 0, b: 1 });
  });
});

describe('applyWheel', () => {
  const gray = { r: 0.5, g: 0.5, b: 0.5 };

  it('is a no-op at zero weight or for a neutral wheel', () => {
    expect(applyWheel(gray, { hue: 0, saturation: 100, luminance: 0 }, 0)).toEqual(gray);
    expect(applyWheel(gray, NEUTRAL_WHEEL, 1)).toEqual(gray);
  });

  it('pushes gray toward the wheel hue', () => {
    const out = applyWheel(gray, { hue: 0, saturation: 100, luminance: 0 }, 1);
    expect(out.r).toBeGreaterThan(gray.r);
    expect(out.b).toBeLessThan(gray.b);
  });

  it('luminance lifts or lowers the color', () => {
    const up = applyWheel(gray, { hue: 0, saturation: 0, luminance: 100 }, 1);
    const down = applyWheel(gray, { hue: 0, saturation: 0, luminance: -100 }, 1);
    expect(up.r).toBeGreaterThan(gray.r);
    expect(down.r).toBeLessThan(gray.r);
  });
});

describe('applyColorGrading', () => {
  const gray = { r: 0.5, g: 0.5, b: 0.5 };

  it('is a no-op when every wheel is neutral', () => {
    expect(applyColorGrading(gray, grading())).toEqual(gray);
  });

  it('tints shadows without touching a bright pixel much', () => {
    const g = grading({ shadows: { hue: 240, saturation: 100, luminance: 0 } });
    const dark = applyColorGrading({ r: 0.05, g: 0.05, b: 0.05 }, g);
    const bright = applyColorGrading({ r: 0.95, g: 0.95, b: 0.95 }, g);
    expect(dark.b).toBeGreaterThan(0.05); // shadows pushed blue
    expect(bright.b - 0.95).toBeLessThan(dark.b - 0.05); // highlights barely moved
  });

  it('the global wheel affects everything', () => {
    const g = grading({ global: { hue: 0, saturation: 100, luminance: 0 } });
    const out = applyColorGrading(gray, g);
    expect(out.r).toBeGreaterThan(out.b);
  });

  it('keeps output in range', () => {
    const g = grading({ global: { hue: 60, saturation: 100, luminance: 100 } });
    const out = applyColorGrading({ r: 0.9, g: 0.9, b: 0.9 }, g);
    for (const v of [out.r, out.g, out.b]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
