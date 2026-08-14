import { describe, expect, it } from 'vitest';
import type { Adjustments } from '@/types';
import { createDefaultAdjustments } from '@/features/adjustments/model/defaults';
import {
  bilinearWeights,
  blendAdjustments,
  lerpAdjustments,
  normalizeWeights,
  sampleCurveAt,
} from './blend-edit';

function withBasic(patch: Partial<Adjustments['basic']>): Adjustments {
  const base = createDefaultAdjustments();
  return { ...base, basic: { ...base.basic, ...patch } };
}

describe('normalizeWeights', () => {
  it('scales to sum 1 and clamps negatives', () => {
    expect(normalizeWeights([1, 1])).toEqual([0.5, 0.5]);
    expect(normalizeWeights([2, 0, 2])).toEqual([0.5, 0, 0.5]);
    expect(normalizeWeights([-1, 3])).toEqual([0, 1]);
  });

  it('returns all-zero for a degenerate set', () => {
    expect(normalizeWeights([0, 0])).toEqual([0, 0]);
  });
});

describe('sampleCurveAt', () => {
  const identity = [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
  ];
  it('evaluates the identity curve', () => {
    expect(sampleCurveAt(identity, 0.5)).toBeCloseTo(0.5, 5);
    expect(sampleCurveAt(identity, 0)).toBe(0);
    expect(sampleCurveAt(identity, 1)).toBe(1);
  });
  it('clamps beyond the ends', () => {
    expect(sampleCurveAt(identity, -1)).toBe(0);
    expect(sampleCurveAt(identity, 2)).toBe(1);
  });
  it('interpolates a bent curve', () => {
    const bent = [
      { x: 0, y: 0 },
      { x: 0.5, y: 0.8 },
      { x: 1, y: 1 },
    ];
    expect(sampleCurveAt(bent, 0.25)).toBeCloseTo(0.4, 5);
  });
});

describe('lerpAdjustments', () => {
  const a = withBasic({ exposure: 0, contrast: 0 });
  const b = withBasic({ exposure: 2, contrast: 100 });

  it('returns endpoints at t=0 and t=1', () => {
    expect(lerpAdjustments(a, b, 0).basic.exposure).toBe(0);
    expect(lerpAdjustments(a, b, 1).basic.exposure).toBe(2);
  });

  it('blends the midpoint', () => {
    const mid = lerpAdjustments(a, b, 0.5);
    expect(mid.basic.exposure).toBeCloseTo(1, 5);
    expect(mid.basic.contrast).toBeCloseTo(50, 5);
  });

  it('clamps t outside 0..1', () => {
    expect(lerpAdjustments(a, b, -1).basic.exposure).toBe(0);
    expect(lerpAdjustments(a, b, 5).basic.exposure).toBe(2);
  });

  it('does not mutate inputs', () => {
    lerpAdjustments(a, b, 0.5);
    expect(a.basic.exposure).toBe(0);
    expect(b.basic.exposure).toBe(2);
  });
});

describe('blendAdjustments', () => {
  it('averages three looks by weight', () => {
    const x = withBasic({ exposure: 0 });
    const y = withBasic({ exposure: 3 });
    const z = withBasic({ exposure: 6 });
    const out = blendAdjustments([
      { adjustments: x, weight: 1 },
      { adjustments: y, weight: 1 },
      { adjustments: z, weight: 1 },
    ]);
    expect(out.basic.exposure).toBeCloseTo(3, 5);
  });

  it('falls back to the first entry when all weights are zero', () => {
    const x = withBasic({ exposure: 1 });
    const y = withBasic({ exposure: 9 });
    const out = blendAdjustments([
      { adjustments: x, weight: 0 },
      { adjustments: y, weight: 0 },
    ]);
    expect(out.basic.exposure).toBe(1);
  });

  it('resolves booleans toward the dominant look', () => {
    const base = createDefaultAdjustments();
    const flat: Adjustments = { ...base, lens: { ...base.lens, fisheye: false } };
    const fish: Adjustments = { ...base, lens: { ...base.lens, fisheye: true } };
    const out = blendAdjustments([
      { adjustments: flat, weight: 0.2 },
      { adjustments: fish, weight: 0.8 },
    ]);
    expect(out.lens.fisheye).toBe(true);
  });

  it('blends tone-curve output while keeping the dominant grid', () => {
    const base = createDefaultAdjustments();
    const lifted: Adjustments = {
      ...base,
      toneCurves: {
        ...base.toneCurves,
        rgb: [
          { x: 0, y: 0.2 },
          { x: 1, y: 1 },
        ],
      },
    };
    const out = blendAdjustments([
      { adjustments: base, weight: 0.5 },
      { adjustments: lifted, weight: 0.5 },
    ]);
    // At x=0, base y=0 and lifted y=0.2 → blended ~0.1.
    expect(sampleCurveAt(out.toneCurves.rgb, 0)).toBeCloseTo(0.1, 5);
  });

  it('single entry returns unchanged', () => {
    const x = withBasic({ exposure: 4 });
    expect(blendAdjustments([{ adjustments: x, weight: 1 }])).toBe(x);
  });
});

describe('bilinearWeights', () => {
  it('sums to 1 and picks corners', () => {
    expect(bilinearWeights(0, 0)).toEqual([1, 0, 0, 0]);
    expect(bilinearWeights(1, 0)).toEqual([0, 1, 0, 0]);
    expect(bilinearWeights(1, 1)).toEqual([0, 0, 0, 1]);
    const center = bilinearWeights(0.5, 0.5);
    center.forEach((w) => expect(w).toBeCloseTo(0.25, 5));
  });

  it('clamps out-of-range positions', () => {
    expect(bilinearWeights(-1, 2)).toEqual([0, 0, 1, 0]);
  });
});
