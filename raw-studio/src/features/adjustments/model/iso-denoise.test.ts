import { describe, expect, it } from 'vitest';
import { suggestDenoiseFromIso } from './iso-denoise';

describe('suggestDenoiseFromIso', () => {
  it('suggests nothing for low or missing ISO', () => {
    expect(suggestDenoiseFromIso(100)).toEqual({ noiseReduction: 0, colorNoiseReduction: 0 });
    expect(suggestDenoiseFromIso(200)).toEqual({ noiseReduction: 0, colorNoiseReduction: 0 });
    expect(suggestDenoiseFromIso(undefined)).toEqual({ noiseReduction: 0, colorNoiseReduction: 0 });
    expect(suggestDenoiseFromIso(0)).toEqual({ noiseReduction: 0, colorNoiseReduction: 0 });
  });

  it('increases monotonically with ISO', () => {
    const a = suggestDenoiseFromIso(800);
    const b = suggestDenoiseFromIso(3200);
    const c = suggestDenoiseFromIso(12800);
    expect(a.noiseReduction).toBeLessThan(b.noiseReduction);
    expect(b.noiseReduction).toBeLessThan(c.noiseReduction);
    expect(a.colorNoiseReduction).toBeLessThan(b.colorNoiseReduction);
  });

  it('applies stronger chroma than luminance NR', () => {
    const v = suggestDenoiseFromIso(6400);
    expect(v.colorNoiseReduction).toBeGreaterThan(v.noiseReduction);
  });

  it('caps at very high ISO and stays in range', () => {
    for (const iso of [25600, 51200, 400000]) {
      const v = suggestDenoiseFromIso(iso);
      expect(v.noiseReduction).toBeGreaterThanOrEqual(0);
      expect(v.noiseReduction).toBeLessThanOrEqual(80);
      expect(v.colorNoiseReduction).toBeLessThanOrEqual(90);
    }
  });

  it('gives sensible mid values at ISO 1600', () => {
    const v = suggestDenoiseFromIso(1600);
    expect(v.noiseReduction).toBeGreaterThan(20);
    expect(v.noiseReduction).toBeLessThan(50);
  });
});
