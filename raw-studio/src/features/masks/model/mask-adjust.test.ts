import { describe, expect, it } from 'vitest';
import { createDefaultAdjustments } from '@/features/adjustments/model/defaults';
import {
  layerUniforms,
  mergeLocalIntoAdjustments,
  splitLocalAdjustments,
} from './mask-adjust';

describe('splitLocalAdjustments', () => {
  it('routes basic and detail fields to the right bucket', () => {
    const { basic, detail } = splitLocalAdjustments({
      exposure: 1,
      contrast: 20,
      clarity: 30,
      sharpenAmount: 40,
    });
    expect(basic).toEqual({ exposure: 1, contrast: 20 });
    expect(detail).toEqual({ clarity: 30, sharpenAmount: 40 });
  });

  it('ignores non-numeric values defensively', () => {
    const patch = { exposure: 2, bogus: 'x' } as unknown as Record<string, number>;
    const { basic } = splitLocalAdjustments(patch);
    expect(basic).toEqual({ exposure: 2 });
  });
});

describe('mergeLocalIntoAdjustments', () => {
  it('overrides only the fields the mask sets, leaving the rest global', () => {
    const global = createDefaultAdjustments();
    const merged = mergeLocalIntoAdjustments(global, { exposure: 1.5, clarity: 25 });
    expect(merged.basic.exposure).toBe(1.5);
    expect(merged.detail.clarity).toBe(25);
    // Untouched fields fall through from global.
    expect(merged.basic.contrast).toBe(global.basic.contrast);
    expect(merged.hsl).toBe(global.hsl);
    expect(merged.lens).toBe(global.lens);
  });

  it('does not mutate the global stack', () => {
    const global = createDefaultAdjustments();
    mergeLocalIntoAdjustments(global, { exposure: 3 });
    expect(global.basic.exposure).toBe(0);
  });
});

describe('layerUniforms', () => {
  it('reflects the local exposure override in the built uniforms', () => {
    const global = createDefaultAdjustments();
    const neutral = layerUniforms(global, {});
    const brightened = layerUniforms(global, { exposure: 2 });
    expect(brightened.uniforms.exposure).toBe(2);
    expect(neutral.uniforms.exposure).toBe(0);
  });

  it('reflects a local clarity override in the advanced uniforms', () => {
    const global = createDefaultAdjustments();
    const withClarity = layerUniforms(global, { clarity: 50 });
    expect(withClarity.advanced.clarity).not.toBe(0);
  });
});
