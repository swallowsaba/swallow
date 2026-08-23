import { describe, expect, it } from 'vitest';
import {
  connectedComponents,
  detectThinStructures,
  erodeMask,
  isThinElongated,
  optionsForSensitivity,
  thresholdForCoverage,
} from './thin-structure';

/** Build an RGBA buffer from a grayscale fill function. */
function makeImage(w: number, h: number, val: (x: number, y: number) => number): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = val(x, y);
      const i = (y * w + x) * 4;
      rgba[i] = v;
      rgba[i + 1] = v;
      rgba[i + 2] = v;
      rgba[i + 3] = 255;
    }
  }
  return rgba;
}

const maskOn = (m: Uint8ClampedArray): number => m.reduce((n, v) => n + (v > 0 ? 1 : 0), 0);

describe('erodeMask', () => {
  it('erases a 1px line but keeps a thick block', () => {
    const w = 9;
    const h = 9;
    const mask = new Uint8ClampedArray(w * h);
    // vertical 1px line at x=2
    for (let y = 0; y < h; y++) mask[y * w + 2] = 255;
    // 5x5 block at (4..8, 2..6)
    for (let y = 2; y <= 6; y++) for (let x = 4; x <= 8; x++) mask[y * w + x] = 255;

    const eroded = erodeMask(mask, w, h, 1);
    // the line pixels should be gone
    for (let y = 0; y < h; y++) expect(eroded[y * w + 2]).toBe(0);
    // the block's interior should survive
    expect(eroded[4 * w + 6]).toBe(255);
  });

  it('is a no-op at radius 0', () => {
    const m = new Uint8ClampedArray([0, 255, 0, 255]);
    expect(Array.from(erodeMask(m, 2, 2, 0))).toEqual([0, 255, 0, 255]);
  });
});

describe('thresholdForCoverage', () => {
  it('finds a threshold giving roughly the target coverage', () => {
    // magnitudes 0..1 uniformly across 1000 samples
    const mag = new Float32Array(1000);
    for (let i = 0; i < 1000; i++) mag[i] = i / 1000;
    const thr = thresholdForCoverage(mag, 0.2);
    // coverage above thr should be near 0.2
    let on = 0;
    for (let i = 0; i < mag.length; i++) if ((mag[i] ?? 0) > thr) on++;
    expect(on / mag.length).toBeCloseTo(0.2, 1);
  });
});

describe('detectThinStructures', () => {
  it('detects a thin wire against a plain background', () => {
    const w = 120;
    const h = 120;
    // two short thin diagonal wires (elongated, small area each)
    const img = makeImage(w, h, (x, y) => {
      if (Math.abs(x - y) < 1 && x < 40) return 20;
      if (Math.abs(x - 60 - y) < 1 && x > 60 && x < 100) return 20;
      return 210;
    });
    const mask = detectThinStructures(img, w, h);
    expect(maskOn(mask)).toBeGreaterThan(0);
  });

  it('flags far less of a large solid subject than of a wire scene', () => {
    const w = 120;
    const h = 120;
    // short thin diagonal wires (each small area, elongated)
    const wire = makeImage(w, h, (x, y) => {
      if (Math.abs(x - y) < 1 && x < 40) return 20;
      if (Math.abs(x - 60 - y) < 1 && x > 60 && x < 100) return 20;
      return 210;
    });
    // a big solid dark block (a subject/wall) — should be rejected as too large
    const subject = makeImage(w, h, (x, y) => (x >= 20 && x <= 100 && y >= 20 && y <= 100 ? 30 : 210));

    const subjMask = detectThinStructures(subject, w, h);
    const wireMask = detectThinStructures(wire, w, h);
    expect(maskOn(wireMask)).toBeGreaterThan(maskOn(subjMask));
    // the large subject must be essentially untouched (not smeared away)
    expect(maskOn(subjMask)).toBeLessThan(w * h * 0.005);
  });

  it('returns an all-zero mask for a flat image', () => {
    const w = 20;
    const h = 20;
    const flat = makeImage(w, h, () => 128);
    const mask = detectThinStructures(flat, w, h);
    expect(maskOn(mask)).toBe(0);
  });

  it('produces a mask the same size as the image', () => {
    const w = 16;
    const h = 12;
    const img = makeImage(w, h, (x) => (x === 8 ? 0 : 255));
    expect(detectThinStructures(img, w, h).length).toBe(w * h);
  });
});

describe('connectedComponents', () => {
  it('separates disjoint regions', () => {
    const w = 6;
    const h = 3;
    const m = new Uint8ClampedArray(w * h);
    m[0] = 255; m[1] = 255; // component A (row 0, x0-1)
    m[w * 2 + 4] = 255; m[w * 2 + 5] = 255; // component B (row 2, x4-5)
    const comps = connectedComponents(m, w, h);
    expect(comps.length).toBe(2);
    expect(comps.every((c) => c.area === 2)).toBe(true);
  });

  it('computes bounding boxes', () => {
    const w = 5;
    const h = 5;
    const m = new Uint8ClampedArray(w * h);
    for (let x = 0; x < 5; x++) m[2 * w + x] = 255; // horizontal line row 2
    const comps = connectedComponents(m, w, h);
    expect(comps.length).toBe(1);
    expect(comps[0]!.minY).toBe(2);
    expect(comps[0]!.maxY).toBe(2);
    expect(comps[0]!.minX).toBe(0);
    expect(comps[0]!.maxX).toBe(4);
  });
});

describe('isThinElongated', () => {
  const opts = {
    maxFillFraction: 0.35,
    minElongation: 3,
    maxComponentFraction: 0.02,
    minComponentPixels: 12,
  };
  const img = 10000;

  it('accepts a long thin line', () => {
    // a 1px-tall, 60px-wide line: area 60, bbox 60x1, fill=1 -> but fill of a
    // 1px line in a 60x1 box is 1.0, so use a 2px gap representation instead.
    const line = { pixels: [], area: 60, minX: 0, minY: 0, maxX: 59, maxY: 2 };
    // bbox 60x3=180, fill=60/180=0.33 (<=0.35), diag=~60, elong=60/sqrt(60)=7.7
    expect(isThinElongated(line, img, opts)).toBe(true);
  });

  it('rejects a big solid blob', () => {
    const blob = { pixels: [], area: 2500, minX: 0, minY: 0, maxX: 49, maxY: 49 };
    // area 2500 > img*0.02=200 -> rejected as too big
    expect(isThinElongated(blob, img, opts)).toBe(false);
  });

  it('rejects a compact square (fills its box, not elongated)', () => {
    const sq = { pixels: [], area: 100, minX: 0, minY: 0, maxX: 9, maxY: 9 };
    // fill=100/100=1 > 0.35 -> rejected
    expect(isThinElongated(sq, img, opts)).toBe(false);
  });

  it('rejects tiny specks', () => {
    const speck = { pixels: [], area: 5, minX: 0, minY: 0, maxX: 4, maxY: 0 };
    expect(isThinElongated(speck, img, opts)).toBe(false);
  });
});

describe('optionsForSensitivity', () => {
  it('widens the net as sensitivity increases', () => {
    const lo = optionsForSensitivity(0);
    const hi = optionsForSensitivity(100);
    expect(hi.targetCoverage!).toBeGreaterThan(lo.targetCoverage!);
    expect(hi.maxFillFraction!).toBeGreaterThan(lo.maxFillFraction!);
    expect(hi.minElongation!).toBeLessThan(lo.minElongation!); // looser
    expect(hi.maxComponentFraction!).toBeGreaterThan(lo.maxComponentFraction!);
  });

  it('clamps out-of-range input', () => {
    expect(optionsForSensitivity(-50)).toEqual(optionsForSensitivity(0));
    expect(optionsForSensitivity(500)).toEqual(optionsForSensitivity(100));
  });

  it('never allows a huge component fraction', () => {
    for (const s of [0, 50, 100]) {
      expect(optionsForSensitivity(s).maxComponentFraction!).toBeLessThanOrEqual(0.03);
    }
  });
});
