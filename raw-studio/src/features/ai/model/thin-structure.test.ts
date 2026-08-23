import { describe, expect, it } from 'vitest';
import {
  detectThinStructures,
  erodeMask,
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
    const w = 40;
    const h = 40;
    // light background with a dark 1px horizontal wire at y=20
    const img = makeImage(w, h, (_x, y) => (y === 20 ? 20 : 220));
    const mask = detectThinStructures(img, w, h, { growRadius: 0, thinnessRadius: 1 });
    // some pixels near the wire row should be flagged
    let nearWire = 0;
    for (let x = 0; x < w; x++) {
      for (let dy = -2; dy <= 2; dy++) {
        if ((mask[(20 + dy) * w + x] ?? 0) > 0) nearWire++;
      }
    }
    expect(nearWire).toBeGreaterThan(0);
  });

  it('flags far less of a large solid subject than of a wire scene', () => {
    const w = 40;
    const h = 40;
    // a big solid dark block (a subject) on a light background — few thin edges
    const subject = makeImage(w, h, (x, y) => (x >= 8 && x <= 32 && y >= 8 && y <= 32 ? 20 : 220));
    const wire = makeImage(w, h, (_x, y) => (y % 6 === 0 ? 20 : 220)); // repeated thin lines

    const subjMask = detectThinStructures(subject, w, h);
    const wireMask = detectThinStructures(wire, w, h);
    expect(maskOn(wireMask)).toBeGreaterThan(maskOn(subjMask));
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
