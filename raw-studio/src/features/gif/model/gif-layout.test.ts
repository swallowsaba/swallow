import { describe, expect, it } from 'vitest';
import { computeCoverRect, computeGifCanvasSize } from './gif-layout';

describe('computeGifCanvasSize', () => {
  it('keeps the first image aspect ratio, capped to maxEdge', () => {
    const size = computeGifCanvasSize({ width: 4000, height: 2000 }, 480);
    expect(size.width).toBe(480);
    expect(size.height).toBe(240);
  });

  it('does not upscale images already under maxEdge', () => {
    const size = computeGifCanvasSize({ width: 200, height: 100 }, 480);
    expect(size).toEqual({ width: 200, height: 100 });
  });

  it('handles a portrait image', () => {
    const size = computeGifCanvasSize({ width: 1000, height: 2000 }, 480);
    expect(size.height).toBe(480);
    expect(size.width).toBe(240);
  });
});

describe('computeCoverRect', () => {
  it('centers and crops a wider source to fill a narrower destination', () => {
    const rect = computeCoverRect({ width: 400, height: 200 }, { width: 200, height: 200 });
    expect(rect.height).toBe(200);
    expect(rect.width).toBe(400);
    expect(rect.x).toBeLessThan(0); // cropped off both sides, centered
    expect(rect.y).toBe(0);
  });

  it('fully covers the destination with no gaps', () => {
    const rect = computeCoverRect({ width: 300, height: 600 }, { width: 200, height: 200 });
    expect(rect.width).toBeGreaterThanOrEqual(200);
    expect(rect.height).toBeGreaterThanOrEqual(200);
  });

  it('is a no-op scale for a same-aspect same-size image', () => {
    const rect = computeCoverRect({ width: 200, height: 200 }, { width: 200, height: 200 });
    expect(rect).toEqual({ x: 0, y: 0, width: 200, height: 200 });
  });
});
