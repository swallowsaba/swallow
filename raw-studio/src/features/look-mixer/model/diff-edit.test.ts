import { describe, expect, it } from 'vitest';
import type { Adjustments } from '@/types';
import { createDefaultAdjustments } from '@/features/adjustments/model/defaults';
import { diffAdjustments, diffCount, formatDelta } from './diff-edit';

function edit(mut: (a: Adjustments) => Adjustments): Adjustments {
  return mut(createDefaultAdjustments());
}

describe('diffAdjustments', () => {
  it('is empty for identical develops', () => {
    const a = createDefaultAdjustments();
    expect(diffAdjustments(a, a)).toEqual([]);
    expect(diffCount(a, a)).toBe(0);
  });

  it('reports changed basic sliders with from/to', () => {
    const a = createDefaultAdjustments();
    const b = edit((x) => ({ ...x, basic: { ...x.basic, exposure: 1.5, contrast: 40 } }));
    const d = diffAdjustments(a, b);
    const exp = d.find((e) => e.label === 'Exposure');
    expect(exp).toBeDefined();
    expect(exp?.from).toBe(0);
    expect(exp?.to).toBe(1.5);
    expect(d.some((e) => e.label === 'Contrast')).toBe(true);
    expect(diffCount(a, b)).toBe(2);
  });

  it('reports detail and lens changes', () => {
    const a = createDefaultAdjustments();
    const b = edit((x) => ({
      ...x,
      detail: { ...x.detail, clarity: 20 },
      lens: { ...x.lens, vignetting: -30, fisheye: !x.lens.fisheye },
    }));
    const d = diffAdjustments(a, b);
    expect(d.some((e) => e.label === 'Clarity')).toBe(true);
    expect(d.some((e) => e.label === 'Vignette')).toBe(true);
    expect(d.some((e) => e.label === 'Fisheye' && e.note !== undefined)).toBe(true);
  });

  it('reports HSL and color-grading wheel changes', () => {
    const a = createDefaultAdjustments();
    const b = edit((x) => ({
      ...x,
      hsl: { ...x.hsl, blue: { ...x.hsl.blue, luminance: -25 } },
      colorGrading: {
        ...x.colorGrading,
        shadows: { ...x.colorGrading.shadows, hue: 210 },
      },
    }));
    const d = diffAdjustments(a, b);
    expect(d.some((e) => e.label === 'HSL blue Lum')).toBe(true);
    expect(d.some((e) => e.label === 'Grade Shadows Hue')).toBe(true);
  });

  it('flags tone-curve changes as a note', () => {
    const a = createDefaultAdjustments();
    const b = edit((x) => ({
      ...x,
      toneCurves: {
        ...x.toneCurves,
        rgb: [
          { x: 0, y: 0.1 },
          { x: 1, y: 1 },
        ],
      },
    }));
    const d = diffAdjustments(a, b);
    const curve = d.find((e) => e.label === 'Tone curve');
    expect(curve?.note).toBe('changed');
    expect(curve?.from).toBeUndefined();
  });
});

describe('formatDelta', () => {
  it('signs and scales precision', () => {
    expect(formatDelta(0, 1.5)).toBe('+1.5');
    expect(formatDelta(0, -1.5)).toBe('-1.5');
    expect(formatDelta(0, 0.05)).toBe('+0.05');
    expect(formatDelta(0, 40)).toBe('+40');
    expect(formatDelta(10, 5)).toBe('-5.0');
  });
});
