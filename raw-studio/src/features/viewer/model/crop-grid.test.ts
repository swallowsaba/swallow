import { describe, expect, it } from 'vitest';
import { CROP_GRIDS, cropGridLines, type GridLine } from './crop-grid';

const inUnit = (l: GridLine): boolean =>
  [l.x1, l.y1, l.x2, l.y2].every((v) => v >= 0 && v <= 1);

describe('cropGridLines', () => {
  it('returns nothing for "none"', () => {
    expect(cropGridLines('none')).toEqual([]);
  });

  it('thirds has 4 lines at 1/3 and 2/3', () => {
    const lines = cropGridLines('thirds');
    expect(lines.length).toBe(4);
    const verticalXs = lines.filter((l) => l.x1 === l.x2).map((l) => l.x1).sort();
    expect(verticalXs[0]).toBeCloseTo(1 / 3, 6);
    expect(verticalXs[1]).toBeCloseTo(2 / 3, 6);
  });

  it('golden has 4 lines placed at the phi split', () => {
    const lines = cropGridLines('golden');
    expect(lines.length).toBe(4);
    const xs = lines.filter((l) => l.x1 === l.x2).map((l) => l.x1);
    expect(Math.min(...xs)).toBeCloseTo(0.382, 3);
    expect(Math.max(...xs)).toBeCloseTo(0.618, 3);
  });

  it('grid has 6 lines (3 v + 3 h)', () => {
    expect(cropGridLines('grid').length).toBe(6);
  });

  it('diagonal has the two corner-to-corner lines', () => {
    const lines = cropGridLines('diagonal');
    expect(lines.length).toBe(2);
    expect(lines).toContainEqual({ x1: 0, y1: 0, x2: 1, y2: 1 });
    expect(lines).toContainEqual({ x1: 1, y1: 0, x2: 0, y2: 1 });
  });

  it('every line stays within the unit square for every grid', () => {
    for (const kind of CROP_GRIDS) {
      expect(cropGridLines(kind).every(inUnit)).toBe(true);
    }
  });
});
