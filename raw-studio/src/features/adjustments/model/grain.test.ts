import { describe, expect, it } from 'vitest';
import { grainAmplitude, grainFrequency, isGrainNeutral } from './grain';

describe('grainAmplitude', () => {
  it('is 0 at amount 0 and max at 100', () => {
    expect(grainAmplitude(0)).toBe(0);
    expect(grainAmplitude(100)).toBeCloseTo(0.12, 6);
    expect(grainAmplitude(50)).toBeCloseTo(0.06, 6);
  });

  it('clamps out-of-range input', () => {
    expect(grainAmplitude(-20)).toBe(0);
    expect(grainAmplitude(200)).toBeCloseTo(0.12, 6);
  });
});

describe('grainFrequency', () => {
  it('is finer (higher frequency) for small size and coarser for large', () => {
    expect(grainFrequency(0)).toBeCloseTo(600, 6);
    expect(grainFrequency(100)).toBeCloseTo(90, 6);
    expect(grainFrequency(0)).toBeGreaterThan(grainFrequency(100));
  });
});

describe('isGrainNeutral', () => {
  it('is neutral only at or below zero', () => {
    expect(isGrainNeutral(0)).toBe(true);
    expect(isGrainNeutral(-5)).toBe(true);
    expect(isGrainNeutral(1)).toBe(false);
  });
});
