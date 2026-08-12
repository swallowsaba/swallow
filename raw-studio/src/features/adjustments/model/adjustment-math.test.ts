import { describe, expect, it } from 'vitest';
import {
  NEUTRAL_UNIFORMS,
  processColor,
  linearToSrgb,
  srgbToLinear,
  toAdjustmentUniforms,
} from './adjustment-math';
import { createDefaultBasicAdjustments } from './defaults';

const mid = [0.5, 0.5, 0.5] as const;

describe('adjustment math', () => {
  it('neutral uniforms are (almost) identity', () => {
    const out = processColor([0.2, 0.5, 0.8], NEUTRAL_UNIFORMS);
    expect(out[0]).toBeCloseTo(0.2, 3);
    expect(out[1]).toBeCloseTo(0.5, 3);
    expect(out[2]).toBeCloseTo(0.8, 3);
  });

  it('default Basic maps to neutral uniforms', () => {
    const u = toAdjustmentUniforms(createDefaultBasicAdjustments());
    expect(u).toEqual(NEUTRAL_UNIFORMS);
  });

  it('sRGB<->linear round-trips', () => {
    for (const v of [0, 0.02, 0.25, 0.5, 0.9, 1]) {
      expect(linearToSrgb(srgbToLinear(v))).toBeCloseTo(v, 6);
    }
  });

  it('positive exposure brightens, negative darkens', () => {
    const up = processColor(mid, { ...NEUTRAL_UNIFORMS, exposure: 1 });
    const down = processColor(mid, { ...NEUTRAL_UNIFORMS, exposure: -1 });
    expect(up[0]).toBeGreaterThan(0.5);
    expect(down[0]).toBeLessThan(0.5);
  });

  it('saturation -1 produces grayscale (r=g=b)', () => {
    const out = processColor([0.8, 0.3, 0.1], { ...NEUTRAL_UNIFORMS, saturation: -1 });
    expect(out[0]).toBeCloseTo(out[1], 5);
    expect(out[1]).toBeCloseTo(out[2], 5);
  });

  it('contrast increases separation around mid-gray', () => {
    const lo = processColor([0.3, 0.3, 0.3], { ...NEUTRAL_UNIFORMS, contrast: 0.5 });
    const hi = processColor([0.7, 0.7, 0.7], { ...NEUTRAL_UNIFORMS, contrast: 0.5 });
    expect(lo[0]).toBeLessThan(0.3);
    expect(hi[0]).toBeGreaterThan(0.7);
  });

  it('positive temperature warms (more red than blue)', () => {
    const out = processColor(mid, { ...NEUTRAL_UNIFORMS, temp: 0.5 });
    expect(out[0]).toBeGreaterThan(out[2]);
  });

  it('gamma < 1 darkens midtones, gamma > 1 lifts them', () => {
    const darker = processColor(mid, { ...NEUTRAL_UNIFORMS, gamma: 0.5 });
    const lifted = processColor(mid, { ...NEUTRAL_UNIFORMS, gamma: 2 });
    expect(darker[0]).toBeLessThan(0.5);
    expect(lifted[0]).toBeGreaterThan(0.5);
  });

  it('always outputs values within [0,1]', () => {
    const out = processColor([1, 1, 1], {
      ...NEUTRAL_UNIFORMS,
      exposure: 3,
      whites: 1,
      brightness: 1,
    });
    for (const v of out) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
