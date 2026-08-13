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

  it('merges only one field of an HSL band without erasing its siblings (regression)', () => {
    // A shallow `{...base.hsl, ...patch.hsl}` merge used to replace the whole
    // band object, silently dropping hue/luminance when only saturation was
    // patched. That corrupted value later fed the shader as NaN, which is
    // why editing just the red band's saturation visibly darkened the image.
    const base = createDefaultEditState('img', 0).adjustments;
    const withHue = mergeAdjustments(base, { hsl: { red: { hue: 20 } } });
    const merged = mergeAdjustments(withHue, { hsl: { red: { saturation: -50 } } });
    expect(merged.hsl.red.saturation).toBe(-50);
    expect(merged.hsl.red.hue).toBe(20); // must survive the second, unrelated patch
    expect(merged.hsl.red.luminance).toBe(base.hsl.red.luminance);
    // Other bands are untouched (same reference).
    expect(merged.hsl.blue).toBe(base.hsl.blue);
  });

  it('merges only one field of a colorGrading wheel without erasing its siblings', () => {
    const base = createDefaultEditState('img', 0).adjustments;
    const withHue = mergeAdjustments(base, { colorGrading: { shadows: { hue: 200 } } });
    const merged = mergeAdjustments(withHue, {
      colorGrading: { shadows: { saturation: 30 } },
    });
    expect(merged.colorGrading.shadows.saturation).toBe(30);
    expect(merged.colorGrading.shadows.hue).toBe(200);
    expect(merged.colorGrading.midtones).toBe(base.colorGrading.midtones);
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
