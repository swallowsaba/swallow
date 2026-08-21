import { describe, expect, it } from 'vitest';
import {
  clampBasicField,
  computeChannelHistogram,
  histogramPolyline,
  peakCount,
  TONE_ZONES,
  zoneAt,
  zoneDragDelta,
} from './histogram';

function rgba(pixels: readonly [number, number, number][]): Uint8ClampedArray {
  const out = new Uint8ClampedArray(pixels.length * 4);
  pixels.forEach(([r, g, b], i) => {
    out[i * 4] = r;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = b;
    out[i * 4 + 3] = 255;
  });
  return out;
}

describe('computeChannelHistogram', () => {
  it('counts per channel and luma', () => {
    const h = computeChannelHistogram(rgba([
      [0, 0, 0],
      [255, 255, 255],
      [255, 0, 0],
    ]));
    expect(h.total).toBe(3);
    expect(h.r[0]).toBe(1); // black + white -> one r=0 (black), white r=255
    expect(h.r[255]).toBe(2); // white + red both have r=255
    expect(h.b[0]).toBe(2); // black + red have b=0
    expect(h.luma[0]).toBe(1); // black
    expect(h.luma[255]).toBe(1); // white
  });

  it('reports clipping fractions', () => {
    const h = computeChannelHistogram(rgba([
      [0, 0, 0],
      [0, 0, 0],
      [255, 255, 255],
      [128, 128, 128],
    ]));
    expect(h.clipLow).toBeCloseTo(0.5, 6); // 2 of 4 are pure black
    expect(h.clipHigh).toBeCloseTo(0.25, 6); // 1 of 4 pure white
  });

  it('handles an empty buffer', () => {
    const h = computeChannelHistogram(new Uint8ClampedArray(0));
    expect(h.total).toBe(0);
    expect(h.clipLow).toBe(0);
  });
});

describe('peakCount', () => {
  it('ignores the extreme bins by default', () => {
    const bins = new Uint32Array(256);
    bins[0] = 1000; // clipped blacks, ignored
    bins[128] = 40;
    expect(peakCount(bins)).toBe(40);
    expect(peakCount(bins, false)).toBe(1000);
  });
});

describe('histogramPolyline', () => {
  it('spans the full width and stays within height', () => {
    const bins = new Uint32Array(256);
    bins[128] = 50;
    const pts = histogramPolyline(bins, 200, 60, 50).split(' ');
    expect(pts.length).toBe(256);
    const [x0] = pts[0]!.split(',').map(Number);
    const [xN] = pts[255]!.split(',').map(Number);
    expect(x0).toBeCloseTo(0, 3);
    expect(xN).toBeCloseTo(200, 1);
    // The peak bin should reach near the top (y≈0).
    const [, yPeak] = pts[128]!.split(',').map(Number);
    expect(yPeak).toBeLessThan(5);
  });

  it('degrades gracefully with a zero peak', () => {
    expect(histogramPolyline(new Uint32Array(256), 100, 40, 0)).toContain('100,40');
  });
});

describe('tone zones', () => {
  it('covers the whole 0..1 range in order', () => {
    expect(TONE_ZONES[0]?.from).toBe(0);
    expect(TONE_ZONES[TONE_ZONES.length - 1]?.to).toBe(1);
    expect(zoneAt(0.05)).toBe('blacks');
    expect(zoneAt(0.5)).toBe('exposure');
    expect(zoneAt(0.95)).toBe('whites');
    expect(zoneAt(1.5)).toBe('whites');
  });
});

describe('zoneDragDelta', () => {
  it('scales exposure in EV and others in slider units', () => {
    expect(zoneDragDelta('exposure', 100, 200)).toBeCloseTo(2, 6); // half track -> 2 EV
    expect(zoneDragDelta('shadows', 100, 200)).toBeCloseTo(100, 6); // half track -> 100
    expect(zoneDragDelta('whites', -50, 200)).toBeCloseTo(-50, 6);
  });
});

describe('clampBasicField', () => {
  it('clamps per field range', () => {
    expect(clampBasicField('exposure', 9)).toBe(5);
    expect(clampBasicField('exposure', -9)).toBe(-5);
    expect(clampBasicField('shadows', 150)).toBe(100);
    expect(clampBasicField('whites', -150)).toBe(-100);
    expect(clampBasicField('gamma', 10)).toBe(4);
  });
});
