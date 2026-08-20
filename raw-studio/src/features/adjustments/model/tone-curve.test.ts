import { describe, expect, it } from 'vitest';
import {
  addPoint,
  buildCurveLut,
  evalCurve,
  findPoint,
  IDENTITY_CURVE,
  isIdentityCurve,
  movePoint,
  normalizeCurve,
  packCurveLutRgba,
  removePoint,
} from './tone-curve';

describe('normalizeCurve', () => {
  it('sorts by x and clamps to the unit square', () => {
    const n = normalizeCurve([
      { x: 1.2, y: -0.3 },
      { x: 0.5, y: 0.5 },
      { x: -0.1, y: 2 },
    ]);
    expect(n.map((p) => p.x)).toEqual([0, 0.5, 1]);
    expect(n[0]!.y).toBe(1); // clamped from 2
    expect(n[2]!.y).toBe(0); // clamped from -0.3
  });

  it('fills in endpoints for degenerate input', () => {
    expect(normalizeCurve([])).toEqual([{ x: 0, y: 0 }, { x: 1, y: 1 }]);
    expect(normalizeCurve([{ x: 0.5, y: 0.3 }])).toEqual([
      { x: 0, y: 0.3 },
      { x: 1, y: 0.3 },
    ]);
  });
});

describe('isIdentityCurve', () => {
  it('detects identity', () => {
    expect(isIdentityCurve(IDENTITY_CURVE)).toBe(true);
    expect(isIdentityCurve([{ x: 0, y: 0.1 }, { x: 1, y: 1 }])).toBe(false);
    expect(isIdentityCurve([{ x: 0, y: 0 }, { x: 0.5, y: 0.5 }, { x: 1, y: 1 }])).toBe(false);
  });
});

describe('evalCurve', () => {
  it('is the identity for the default curve', () => {
    for (const x of [0, 0.25, 0.5, 0.75, 1]) {
      expect(evalCurve(IDENTITY_CURVE, x)).toBeCloseTo(x, 6);
    }
  });

  it('interpolates linearly between points', () => {
    const c = [{ x: 0, y: 0 }, { x: 0.5, y: 0.8 }, { x: 1, y: 1 }];
    expect(evalCurve(c, 0.25)).toBeCloseTo(0.4, 6);
    expect(evalCurve(c, 0.75)).toBeCloseTo(0.9, 6);
  });

  it('clamps outside the point range', () => {
    const c = [{ x: 0.2, y: 0.3 }, { x: 0.8, y: 0.7 }];
    expect(evalCurve(c, 0)).toBeCloseTo(0.3, 6);
    expect(evalCurve(c, 1)).toBeCloseTo(0.7, 6);
  });
});

describe('buildCurveLut', () => {
  it('produces an identity ramp for the default curve', () => {
    const lut = buildCurveLut(IDENTITY_CURVE, 256);
    expect(lut.length).toBe(256);
    expect(lut[0]).toBe(0);
    expect(lut[255]).toBe(255);
    expect(lut[128]).toBeCloseTo(128, 0);
  });

  it('reflects a lifted curve', () => {
    const lut = buildCurveLut([{ x: 0, y: 0.2 }, { x: 1, y: 1 }], 256);
    expect(lut[0]).toBe(Math.round(0.2 * 255));
  });
});

describe('packCurveLutRgba', () => {
  it('packs red/green/blue/master into RGBA', () => {
    const rgba = packCurveLutRgba(
      IDENTITY_CURVE, // rgb -> A
      [{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }], // red flat 0.5 -> R
      IDENTITY_CURVE, // green -> G
      IDENTITY_CURVE, // blue -> B
      256,
    );
    expect(rgba.length).toBe(256 * 4);
    expect(rgba[0]).toBe(Math.round(0.5 * 255)); // red curve flat
    expect(rgba[1]).toBe(0); // green identity at 0
    expect(rgba[255 * 4 + 3]).toBe(255); // master identity at 255
  });
});

describe('point editing', () => {
  it('adds a point in sorted order', () => {
    const c = addPoint(IDENTITY_CURVE, 0.5, 0.7);
    expect(c.length).toBe(3);
    expect(c[1]).toEqual({ x: 0.5, y: 0.7 });
  });

  it('pins endpoints in x but lets them move in y', () => {
    const c = movePoint(IDENTITY_CURVE, 0, 0.4, 0.3);
    expect(c[0]).toEqual({ x: 0, y: 0.3 });
    const c2 = movePoint(IDENTITY_CURVE, 1, 0.4, 0.9);
    expect(c2[c2.length - 1]).toEqual({ x: 1, y: 0.9 });
  });

  it('keeps interior points between their neighbors', () => {
    const c = [{ x: 0, y: 0 }, { x: 0.5, y: 0.5 }, { x: 1, y: 1 }];
    const moved = movePoint(c, 1, 1.5, 0.6); // try to shove past the right end
    expect(moved[1]!.x).toBeLessThan(1);
    expect(moved[1]!.x).toBeGreaterThan(0);
  });

  it('removes interior points but never endpoints', () => {
    const c = [{ x: 0, y: 0 }, { x: 0.5, y: 0.5 }, { x: 1, y: 1 }];
    expect(removePoint(c, 1).length).toBe(2);
    expect(removePoint(c, 0).length).toBe(3); // endpoint kept
    expect(removePoint(c, 2).length).toBe(3);
  });

  it('finds the nearest point within tolerance', () => {
    const c = [{ x: 0, y: 0 }, { x: 0.5, y: 0.5 }, { x: 1, y: 1 }];
    expect(findPoint(c, 0.51, 0.49, 0.05)).toBe(1);
    expect(findPoint(c, 0.3, 0.3, 0.05)).toBe(-1);
  });
});
