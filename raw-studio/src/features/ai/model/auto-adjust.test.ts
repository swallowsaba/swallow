import { describe, expect, it } from 'vitest';
import { analyzePixels } from './image-stats';
import { autoColor, autoContrast, autoExposure, autoWhiteBalance } from './auto-adjust';

function solid(r: number, g: number, b: number, n = 100): Uint8ClampedArray {
  const a = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    a[i * 4] = r;
    a[i * 4 + 1] = g;
    a[i * 4 + 2] = b;
    a[i * 4 + 3] = 255;
  }
  return a;
}

describe('auto adjustments', () => {
  it('brightens dark images and darkens bright ones', () => {
    expect(autoExposure(analyzePixels(solid(40, 40, 40))).exposure ?? 0).toBeGreaterThan(0);
    expect(autoExposure(analyzePixels(solid(220, 220, 220))).exposure ?? 0).toBeLessThan(0);
  });

  it('cools a warm cast and adds magenta to a green cast', () => {
    expect(autoWhiteBalance(analyzePixels(solid(200, 150, 90))).temperature ?? 0).toBeLessThan(0);
    expect(autoWhiteBalance(analyzePixels(solid(120, 200, 120))).tint ?? 0).toBeGreaterThan(0);
  });

  it('leaves neutral gray roughly untouched', () => {
    const wb = autoWhiteBalance(analyzePixels(solid(128, 128, 128)));
    expect(Math.abs(wb.temperature ?? 0)).toBeLessThanOrEqual(2);
    expect(Math.abs(wb.tint ?? 0)).toBeLessThanOrEqual(2);
  });

  it('adds vibrance to under-saturated images', () => {
    expect(autoColor(analyzePixels(solid(130, 128, 126))).vibrance ?? 0).toBeGreaterThan(0);
  });

  it('recovers a flat histogram', () => {
    const c = autoContrast(analyzePixels(solid(120, 120, 120)));
    expect(c.contrast ?? 0).toBeGreaterThan(0);
    expect(c.whites ?? 0).toBeGreaterThan(0);
  });
});
