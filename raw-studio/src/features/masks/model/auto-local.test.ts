import { describe, expect, it } from 'vitest';
import {
  detectHighlightAlpha,
  detectShadowAlpha,
  detectSkyAlpha,
  meanCoverage,
  proposeAutoLocalMasks,
} from './auto-local';

/** Build a w×h RGBA buffer from a per-pixel color function. */
function makeRgba(
  w: number,
  h: number,
  fn: (x: number, y: number) => [number, number, number],
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = fn(x, y);
      const i = (y * w + x) * 4;
      out[i] = r;
      out[i + 1] = g;
      out[i + 2] = b;
      out[i + 3] = 255;
    }
  }
  return out;
}

describe('meanCoverage', () => {
  it('is 0 for empty, 1 for full', () => {
    expect(meanCoverage(new Uint8ClampedArray([0, 0, 0]))).toBe(0);
    expect(meanCoverage(new Uint8ClampedArray([255, 255]))).toBe(1);
    expect(meanCoverage(new Uint8ClampedArray([]))).toBe(0);
  });
});

describe('detectSkyAlpha', () => {
  it('selects a bright low-sat blue top band, not the dark bottom', () => {
    const w = 8;
    const h = 8;
    // Top half: bright blue-grey sky; bottom half: dark ground.
    const rgba = makeRgba(w, h, (_x, y) =>
      y < 4 ? [200, 210, 235] : [30, 25, 20],
    );
    const sky = detectSkyAlpha(rgba, w, h);
    const topAvg = meanCoverage(sky.slice(0, w * 4));
    const bottomAvg = meanCoverage(sky.slice(w * 4));
    expect(topAvg).toBeGreaterThan(0.4);
    expect(bottomAvg).toBeLessThan(0.05);
  });

  it('ignores a saturated red top (not sky)', () => {
    const rgba = makeRgba(8, 8, () => [230, 20, 20]);
    expect(meanCoverage(detectSkyAlpha(rgba, 8, 8))).toBeLessThan(0.05);
  });
});

describe('detectShadowAlpha / detectHighlightAlpha', () => {
  it('shadow selects dark pixels', () => {
    const dark = makeRgba(4, 4, () => [10, 10, 10]);
    const bright = makeRgba(4, 4, () => [240, 240, 240]);
    expect(meanCoverage(detectShadowAlpha(dark, 4, 4))).toBeGreaterThan(0.9);
    expect(meanCoverage(detectShadowAlpha(bright, 4, 4))).toBeLessThan(0.05);
  });

  it('highlight selects very bright pixels', () => {
    const bright = makeRgba(4, 4, () => [252, 252, 252]);
    const mid = makeRgba(4, 4, () => [128, 128, 128]);
    expect(meanCoverage(detectHighlightAlpha(bright, 4, 4))).toBeGreaterThan(0.9);
    expect(meanCoverage(detectHighlightAlpha(mid, 4, 4))).toBeLessThan(0.05);
  });
});

describe('proposeAutoLocalMasks', () => {
  it('proposes sky + shadows for a sky-over-ground image', () => {
    const w = 16;
    const h = 16;
    const rgba = makeRgba(w, h, (_x, y) => (y < 8 ? [200, 210, 235] : [20, 18, 15]));
    const proposals = proposeAutoLocalMasks(rgba, w, h);
    const kinds = proposals.map((p) => p.kind);
    expect(kinds).toContain('sky');
    expect(kinds).toContain('shadows');
    // Each proposal carries adjustments and a matching-size buffer.
    for (const p of proposals) {
      expect(p.alpha.length).toBe(w * h);
      expect(Object.keys(p.adjustments).length).toBeGreaterThan(0);
      expect(p.coverage).toBeGreaterThan(0.02);
      expect(p.coverage).toBeLessThan(0.75);
    }
  });

  it('skips regions that cover almost nothing', () => {
    // Uniform mid-grey: no sky, no deep shadow, no blown highlight.
    const rgba = makeRgba(16, 16, () => [128, 128, 128]);
    expect(proposeAutoLocalMasks(rgba, 16, 16)).toEqual([]);
  });

  it('skips a region that covers the whole frame (too global)', () => {
    // All near-black → shadow coverage ~1 > MAX_COVERAGE, so not proposed.
    const rgba = makeRgba(16, 16, () => [5, 5, 5]);
    const kinds = proposeAutoLocalMasks(rgba, 16, 16).map((p) => p.kind);
    expect(kinds).not.toContain('shadows');
  });
});
