import { describe, expect, it } from 'vitest';
import { expandFilename, sanitizeFilename } from './filename';
import { computeExportSize } from './resize';

describe('filename', () => {
  const ctx = {
    name: 'IMG_1234',
    seq: 5,
    width: 1920,
    height: 1080,
    date: new Date(2026, 2, 9, 8, 4, 5), // 2026-03-09 08:04:05
    ext: 'jpg',
  };

  it('expands name and padded sequence + appends extension', () => {
    expect(expandFilename('{name}_{seq:3}', ctx)).toBe('IMG_1234_005.jpg');
  });

  it('expands date, time and dimensions', () => {
    expect(expandFilename('{date}_{time}_{w}x{h}', ctx)).toBe('2026-03-09_080405_1920x1080.jpg');
  });

  it('drops unknown tokens and sanitizes', () => {
    expect(expandFilename('a/b:c{unknown}', ctx)).toBe('a_b_c.jpg');
  });

  it('falls back when the template is empty after sanitize', () => {
    expect(expandFilename('///', ctx)).toBe('export.jpg');
  });

  it('sanitizes illegal characters', () => {
    expect(sanitizeFilename('a:b*c?')).toBe('a_b_c_');
  });
});

describe('computeExportSize', () => {
  const src = { width: 4000, height: 3000 };

  it('none keeps the size', () => {
    expect(computeExportSize(src, { mode: 'none', value: 0 })).toEqual(src);
  });

  it('longEdge scales the long edge', () => {
    expect(computeExportSize(src, { mode: 'longEdge', value: 2000 })).toEqual({
      width: 2000,
      height: 1500,
    });
  });

  it('width sets width and preserves aspect', () => {
    expect(computeExportSize(src, { mode: 'width', value: 1000 })).toEqual({
      width: 1000,
      height: 750,
    });
  });

  it('height sets height and preserves aspect', () => {
    expect(computeExportSize(src, { mode: 'height', value: 1500 })).toEqual({
      width: 2000,
      height: 1500,
    });
  });

  it('percent scales both', () => {
    expect(computeExportSize(src, { mode: 'percent', value: 25 })).toEqual({
      width: 1000,
      height: 750,
    });
  });

  it('never returns below 1px', () => {
    const out = computeExportSize({ width: 10, height: 10 }, { mode: 'percent', value: 1 });
    expect(out.width).toBeGreaterThanOrEqual(1);
  });
});
