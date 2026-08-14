import { describe, expect, it } from 'vitest';
import { computeCoverRect, computeGridLayout } from './collage-layout';

describe('computeGridLayout', () => {
  it('arranges 2 images side by side (1 row x 2 cols)', () => {
    const rects = computeGridLayout(2, { width: 200, height: 100 }, 0);
    expect(rects.length).toBe(2);
    expect(rects[0]).toEqual({ x: 0, y: 0, width: 100, height: 100 });
    expect(rects[1]).toEqual({ x: 100, y: 0, width: 100, height: 100 });
  });

  it('arranges 4 images into a 2x2 grid', () => {
    const rects = computeGridLayout(4, { width: 200, height: 200 }, 0);
    expect(rects.length).toBe(4);
    expect(rects[0]).toEqual({ x: 0, y: 0, width: 100, height: 100 });
    expect(rects[1]).toEqual({ x: 100, y: 0, width: 100, height: 100 });
    expect(rects[2]).toEqual({ x: 0, y: 100, width: 100, height: 100 });
    expect(rects[3]).toEqual({ x: 100, y: 100, width: 100, height: 100 });
  });

  it('accounts for the gap between cells', () => {
    const rects = computeGridLayout(2, { width: 210, height: 100 }, 10);
    expect(rects[0]?.width).toBe(100);
    expect(rects[1]?.x).toBe(110);
  });

  it('handles a count that does not evenly divide the grid (3 in a 2x2)', () => {
    const rects = computeGridLayout(3, { width: 200, height: 200 }, 0);
    expect(rects.length).toBe(3);
    // 2 columns, 2 rows; only 3 of the 4 cells are used.
    expect(rects[2]).toEqual({ x: 0, y: 100, width: 100, height: 100 });
  });

  it('returns an empty array for zero or invalid input', () => {
    expect(computeGridLayout(0, { width: 200, height: 200 }, 0)).toEqual([]);
    expect(computeGridLayout(2, { width: 0, height: 200 }, 0)).toEqual([]);
  });

  it('every cell stays within the canvas bounds', () => {
    for (const count of [2, 3, 4, 5, 6, 9]) {
      const canvas = { width: 400, height: 300 };
      const rects = computeGridLayout(count, canvas, 4);
      for (const r of rects) {
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.y).toBeGreaterThanOrEqual(0);
        expect(r.x + r.width).toBeLessThanOrEqual(canvas.width + 0.001);
        expect(r.y + r.height).toBeLessThanOrEqual(canvas.height + 0.001);
      }
    }
  });
});

describe('collage computeCoverRect', () => {
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
