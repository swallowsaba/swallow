import { describe, expect, it } from 'vitest';
import { createDefaultEditState } from '@/features/adjustments/model/defaults';
import { applyAdjustments, applyGeometry, mergeAdjustments } from './apply';

describe('editor apply', () => {
  it('merges only the groups present in the patch', () => {
    const base = createDefaultEditState('img', 0).adjustments;
    const merged = mergeAdjustments(base, { basic: { exposure: 1.5 } });
    expect(merged.basic.exposure).toBe(1.5);
    // Untouched values remain neutral.
    expect(merged.basic.contrast).toBe(0);
    // Other groups are untouched (same reference).
    expect(merged.detail).toBe(base.detail);
    expect(merged.toneCurves).toBe(base.toneCurves);
  });

  it('merges a toneCurves patch (regression: this used to be silently dropped)', () => {
    const base = createDefaultEditState('img', 0).adjustments;
    const newRgb = [
      { x: 0, y: 0.1 },
      { x: 0.5, y: 0.5 },
      { x: 1, y: 0.9 },
    ];
    const merged = mergeAdjustments(base, { toneCurves: { rgb: newRgb } });
    expect(merged.toneCurves.rgb).toEqual(newRgb);
    // Untouched channels remain.
    expect(merged.toneCurves.red).toBe(base.toneCurves.red);
    // Other groups are untouched (same reference).
    expect(merged.basic).toBe(base.basic);
  });

  it('does not mutate the source state', () => {
    const state = createDefaultEditState('img', 0);
    const next = applyAdjustments(state, { basic: { saturation: 20 } }, 123);
    expect(state.adjustments.basic.saturation).toBe(0);
    expect(next.adjustments.basic.saturation).toBe(20);
    expect(next.updatedAt).toBe(123);
    expect(next).not.toBe(state);
  });

  it('applies a geometry patch without touching adjustments', () => {
    const state = createDefaultEditState('img', 0);
    const next = applyGeometry(state, { rotation: 5, flip: 'horizontal' }, 7);
    expect(next.geometry.rotation).toBe(5);
    expect(next.geometry.flip).toBe('horizontal');
    expect(next.geometry.crop).toEqual(state.geometry.crop);
    expect(next.adjustments).toBe(state.adjustments);
  });
});
