import { describe, expect, it } from 'vitest';
import {
  applyHslBands,
  distortUv,
  evalToneCurve,
  hslToRgb,
  NEUTRAL_TONE_CURVE,
  rgbToHsl,
  vignetteFactor,
} from './advanced-math';
import { applyClarity, applyDehaze, applyDenoise, applySharpen } from './detail-math';

describe('tone curve', () => {
  it('is the identity line when all deltas are 0', () => {
    expect(evalToneCurve(0, NEUTRAL_TONE_CURVE)).toBeCloseTo(0, 3);
    expect(evalToneCurve(0.5, NEUTRAL_TONE_CURVE)).toBeCloseTo(0.5, 3);
    expect(evalToneCurve(1, NEUTRAL_TONE_CURVE)).toBeCloseTo(1, 3);
  });

  it('raising shadows lifts the low end without moving the highlight end', () => {
    const d = { shadows: 50, midtones: 0, highlights: 0 };
    expect(evalToneCurve(0, d)).toBeGreaterThan(0);
    expect(evalToneCurve(1, d)).toBeCloseTo(1, 3);
  });

  it('lowering highlights pulls the top end down', () => {
    const d = { shadows: 0, midtones: 0, highlights: -50 };
    expect(evalToneCurve(1, d)).toBeLessThan(1);
  });

  it('stays within 0..1', () => {
    const d = { shadows: 100, midtones: 100, highlights: 100 };
    for (const x of [0, 0.25, 0.5, 0.75, 1]) {
      const y = evalToneCurve(x, d);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(1);
    }
  });
});

describe('HSL round trip', () => {
  it('rgbToHsl -> hslToRgb reproduces the original color', () => {
    const cases: [number, number, number][] = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
      [0.8, 0.4, 0.2],
      [0.5, 0.5, 0.5],
    ];
    for (const [r, g, b] of cases) {
      const [h, s, l] = rgbToHsl(r, g, b);
      const [r2, g2, b2] = hslToRgb(h, s, l);
      expect(r2).toBeCloseTo(r, 2);
      expect(g2).toBeCloseTo(g, 2);
      expect(b2).toBeCloseTo(b, 2);
    }
  });
});

describe('applyHslBands', () => {
  const bands = Array.from({ length: 8 }, () => ({ hue: 0, saturation: 0, luminance: 0 }));

  it('leaves the pixel unchanged when all bands are neutral', () => {
    const [r, g, b] = applyHslBands([0.8, 0.2, 0.2], bands);
    expect(r).toBeCloseTo(0.8, 2);
    expect(g).toBeCloseTo(0.2, 2);
    expect(b).toBeCloseTo(0.2, 2);
  });

  it('desaturating the red band fades a red pixel toward gray', () => {
    const custom = bands.map((b, i) => (i === 0 ? { ...b, saturation: -100 } : b));
    const [r, g, b] = applyHslBands([0.9, 0.1, 0.1], custom);
    const spread = Math.max(r, g, b) - Math.min(r, g, b);
    expect(spread).toBeLessThan(0.8 - 0.1); // less saturated than the original 0.8 spread
  });

  it('leaves achromatic (gray) pixels untouched regardless of band settings', () => {
    const custom = bands.map((b) => ({ ...b, saturation: 100, hue: 50 }));
    const [r, g, b] = applyHslBands([0.5, 0.5, 0.5], custom);
    expect(r).toBeCloseTo(0.5, 3);
    expect(g).toBeCloseTo(0.5, 3);
    expect(b).toBeCloseTo(0.5, 3);
  });

  it('only affects bands within its hue falloff window', () => {
    // Boost only the green band (index 3); a pure red pixel should be unaffected.
    const custom = bands.map((b, i) => (i === 3 ? { ...b, luminance: 100 } : b));
    const [r, g, b] = applyHslBands([0.8, 0.1, 0.1], custom);
    expect(r).toBeCloseTo(0.8, 2);
    expect(g).toBeCloseTo(0.1, 2);
    expect(b).toBeCloseTo(0.1, 2);
  });
});

describe('lens: distortUv', () => {
  it('leaves the center point unchanged', () => {
    const [u, v] = distortUv([0.5, 0.5], 80, 1.5);
    expect(u).toBeCloseTo(0.5, 5);
    expect(v).toBeCloseTo(0.5, 5);
  });

  it('is a no-op at amount 0', () => {
    const [u, v] = distortUv([0.9, 0.2], 0, 1.5);
    expect(u).toBeCloseTo(0.9, 5);
    expect(v).toBeCloseTo(0.2, 5);
  });

  it('pushes corners outward for positive (barrel) amounts', () => {
    const [u] = distortUv([1, 0.5], 100, 1);
    expect(u).toBeGreaterThan(1);
  });

  it('pulls corners inward for negative (pincushion) amounts', () => {
    const [u] = distortUv([1, 0.5], -100, 1);
    expect(u).toBeLessThan(1);
  });
});

describe('lens: vignetteFactor', () => {
  it('is 1 at the exact center regardless of amount', () => {
    expect(vignetteFactor([0.5, 0.5], 80)).toBeCloseTo(1, 5);
    expect(vignetteFactor([0.5, 0.5], -80)).toBeCloseTo(1, 5);
  });

  it('darkens the corners for a positive amount', () => {
    expect(vignetteFactor([0, 0], 80)).toBeLessThan(1);
  });

  it('brightens the corners for a negative amount', () => {
    expect(vignetteFactor([0, 0], -80)).toBeGreaterThan(1);
  });

  it('never goes negative', () => {
    expect(vignetteFactor([0, 0], 1000)).toBeGreaterThanOrEqual(0);
  });
});

describe('detail combining formulas', () => {
  it('sharpen pushes a pixel away from its local blur', () => {
    // Pixel brighter than its surroundings gets pushed brighter still.
    expect(applySharpen(0.6, 0.5, 50)).toBeGreaterThan(0.6);
    // Pixel darker than its surroundings gets pushed darker still.
    expect(applySharpen(0.4, 0.5, 50)).toBeLessThan(0.4);
  });

  it('sharpen at amount 0 is a no-op', () => {
    expect(applySharpen(0.6, 0.5, 0)).toBeCloseTo(0.6, 5);
  });

  it('clarity is gentler than sharpen at the same amount', () => {
    const s = applySharpen(0.6, 0.5, 50) - 0.6;
    const c = applyClarity(0.6, 0.5, 50) - 0.6;
    expect(c).toBeLessThan(s);
  });

  it('clarity fades out near black and white to avoid clipping', () => {
    const midPush = applyClarity(0.55, 0.5, 100) - 0.55;
    const highlightPush = applyClarity(0.98, 0.9, 100) - 0.98;
    expect(Math.abs(highlightPush)).toBeLessThan(Math.abs(midPush));
  });

  it('denoise blends toward the local blur, full amount snaps to it', () => {
    expect(applyDenoise(0.8, 0.5, 100)).toBeCloseTo(0.5, 5);
    expect(applyDenoise(0.8, 0.5, 0)).toBeCloseTo(0.8, 5);
    expect(applyDenoise(0.8, 0.5, 50)).toBeCloseTo(0.65, 5);
  });

  it('dehaze at 0 amount is a no-op', () => {
    expect(applyDehaze(0.4, 0)).toBeCloseTo(0.4, 5);
  });

  it('dehaze increases contrast for positive amounts', () => {
    const lo = applyDehaze(0.2, 80);
    const hi = applyDehaze(0.8, 80);
    expect(hi - lo).toBeGreaterThan(0.6); // spread increased from the original 0.6
  });
});
