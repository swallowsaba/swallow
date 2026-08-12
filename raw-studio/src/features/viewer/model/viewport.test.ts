import { describe, expect, it } from 'vitest';
import {
  clampOffset,
  clampScale,
  computeFillScale,
  computeFitScale,
  MAX_SCALE,
  MIN_SCALE,
  nextZoom,
  orientedSize,
  prevZoom,
} from './viewport';

describe('viewport math', () => {
  it('swaps dimensions at 90/270 orientation', () => {
    expect(orientedSize({ width: 100, height: 40 }, 0)).toEqual({ width: 100, height: 40 });
    expect(orientedSize({ width: 100, height: 40 }, 90)).toEqual({ width: 40, height: 100 });
    expect(orientedSize({ width: 100, height: 40 }, 270)).toEqual({ width: 40, height: 100 });
    expect(orientedSize({ width: 100, height: 40 }, 180)).toEqual({ width: 100, height: 40 });
  });

  it('computes fit scale (contain)', () => {
    // 4000x2000 into 800x800 => min(0.2, 0.4) = 0.2
    expect(computeFitScale({ width: 4000, height: 2000 }, { width: 800, height: 800 })).toBeCloseTo(
      0.2,
    );
  });

  it('computes fill scale (cover)', () => {
    // 4000x2000 into 800x800 => max(0.2, 0.4) = 0.4
    expect(
      computeFillScale({ width: 4000, height: 2000 }, { width: 800, height: 800 }),
    ).toBeCloseTo(0.4);
  });

  it('accounts for orientation in fit scale', () => {
    // oriented 2000x4000 into 800x800 => min(0.4, 0.2) = 0.2
    expect(
      computeFitScale({ width: 4000, height: 2000 }, { width: 800, height: 800 }, 90),
    ).toBeCloseTo(0.2);
  });

  it('guards against zero-sized inputs', () => {
    expect(computeFitScale({ width: 0, height: 0 }, { width: 800, height: 600 })).toBe(1);
    expect(computeFitScale({ width: 100, height: 100 }, { width: 0, height: 0 })).toBe(1);
  });

  it('clamps scale to bounds', () => {
    expect(clampScale(100)).toBe(MAX_SCALE);
    expect(clampScale(0.0001)).toBe(MIN_SCALE);
    expect(clampScale(1)).toBe(1);
  });

  it('steps through zoom presets', () => {
    expect(nextZoom(1)).toBe(2);
    expect(nextZoom(0.3)).toBe(0.5);
    expect(prevZoom(1)).toBe(0.5);
    expect(prevZoom(0.25)).toBeCloseTo(0.125); // below smallest preset -> halve
    expect(nextZoom(4)).toBe(8); // above largest preset -> double
  });

  it('locks small axes to centered and clamps large ones', () => {
    // image smaller than container on X, larger on Y
    const out = clampOffset(
      { x: 999, y: 999 },
      { width: 400, height: 1200 },
      { width: 800, height: 800 },
    );
    expect(out.x).toBe(0); // 400 <= 800 -> centered
    expect(out.y).toBe(200); // (1200-800)/2 = 200 limit
  });
});
