import { describe, expect, it } from 'vitest';
import type { BrushMaskData, LinearMaskData, Mask, RadialMaskData } from '@/types';
import {
  brushAlphaAt,
  clamp01,
  coverageFraction,
  distanceToSegment,
  linearAlphaAt,
  maskAlphaAt,
  radialAlphaAt,
  rasterizeMaskAlpha,
  smoothstep,
} from './mask-alpha';

describe('helpers', () => {
  it('clamp01 clamps to the unit range', () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(0.5)).toBe(0.5);
    expect(clamp01(2)).toBe(1);
  });

  it('smoothstep is 0 below, 1 above, 0.5 at the midpoint', () => {
    expect(smoothstep(0, 1, -0.5)).toBe(0);
    expect(smoothstep(0, 1, 1.5)).toBe(1);
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5, 5);
  });

  it('smoothstep degrades to a hard step when edges cross', () => {
    expect(smoothstep(1, 1, 0.9)).toBe(0);
    expect(smoothstep(1, 1, 1)).toBe(1);
  });

  it('distanceToSegment handles the degenerate (point) segment', () => {
    expect(distanceToSegment(3, 4, 0, 0, 0, 0)).toBeCloseTo(5, 5);
  });

  it('distanceToSegment clamps to the endpoints', () => {
    // Perpendicular foot lands past the end; nearest point is the endpoint.
    expect(distanceToSegment(2, 1, 0, 0, 1, 0)).toBeCloseTo(Math.hypot(1, 1), 5);
    // Perpendicular within the segment.
    expect(distanceToSegment(0.5, 1, 0, 0, 1, 0)).toBeCloseTo(1, 5);
  });
});

describe('radial mask', () => {
  const base: RadialMaskData = {
    kind: 'radial',
    centerX: 0.5,
    centerY: 0.5,
    radiusX: 0.25,
    radiusY: 0.25,
    rotation: 0,
    feather: 0.5,
    inverted: false,
  };

  it('is full at the center and zero far outside', () => {
    expect(radialAlphaAt(base, 0.5, 0.5)).toBeCloseTo(1, 5);
    expect(radialAlphaAt(base, 0.99, 0.99)).toBeCloseTo(0, 5);
  });

  it('is ~0.5 on the ellipse edge with 50% feather', () => {
    // Edge along +x is at u = center + radiusX.
    const edge = radialAlphaAt(base, 0.5 + 0.25, 0.5);
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(1);
  });

  it('inverted swaps inside and outside', () => {
    const inv: RadialMaskData = { ...base, inverted: true };
    expect(inv.centerX).toBe(0.5);
    expect(radialAlphaAt(inv, 0.5, 0.5)).toBeCloseTo(0, 5);
    expect(radialAlphaAt(inv, 0.99, 0.99)).toBeCloseTo(1, 5);
  });

  it('respects rotation for a non-symmetric ellipse', () => {
    const ellipse: RadialMaskData = { ...base, radiusX: 0.4, radiusY: 0.1, feather: 0 };
    // Point along the long (x) axis is inside; same distance along y is outside.
    expect(radialAlphaAt(ellipse, 0.5 + 0.3, 0.5)).toBeCloseTo(1, 5);
    expect(radialAlphaAt(ellipse, 0.5, 0.5 + 0.3)).toBeCloseTo(0, 5);
    // Rotating 90° swaps which axis is long.
    const rotated: RadialMaskData = { ...ellipse, rotation: 90 };
    expect(radialAlphaAt(rotated, 0.5, 0.5 + 0.3)).toBeCloseTo(1, 5);
    expect(radialAlphaAt(rotated, 0.5 + 0.3, 0.5)).toBeCloseTo(0, 5);
  });
});

describe('linear mask', () => {
  const grad: LinearMaskData = {
    kind: 'linear',
    startX: 0.5,
    startY: 0,
    endX: 0.5,
    endY: 1,
    feather: 0,
  };

  it('ramps 0 at the start line to 1 at the end line', () => {
    expect(linearAlphaAt(grad, 0.5, 0)).toBeCloseTo(0, 5);
    expect(linearAlphaAt(grad, 0.5, 1)).toBeCloseTo(1, 5);
    expect(linearAlphaAt(grad, 0.5, 0.5)).toBeCloseTo(0.5, 5);
  });

  it('clamps beyond the start and end lines', () => {
    expect(linearAlphaAt(grad, 0.5, -0.5)).toBe(0);
    expect(linearAlphaAt(grad, 0.5, 1.5)).toBe(1);
  });

  it('is invariant along lines perpendicular to the axis', () => {
    expect(linearAlphaAt(grad, 0.1, 0.3)).toBeCloseTo(linearAlphaAt(grad, 0.9, 0.3), 5);
  });

  it('degenerate zero-length gradient yields no coverage', () => {
    const zero: LinearMaskData = { ...grad, endY: 0 };
    expect(linearAlphaAt(zero, 0.5, 0.5)).toBe(0);
  });
});

describe('brush mask', () => {
  const stroke: BrushMaskData = {
    kind: 'brush',
    size: 0.2,
    feather: 0.5,
    flow: 1,
    strokes: [
      [
        { x: 0.2, y: 0.5, pressure: 1 },
        { x: 0.8, y: 0.5, pressure: 1 },
      ],
    ],
    erase: [],
  };

  it('paints coverage along the stroke line', () => {
    expect(brushAlphaAt(stroke, 0.5, 0.5)).toBeCloseTo(1, 2);
    expect(brushAlphaAt(stroke, 0.5, 0.9)).toBeCloseTo(0, 5);
  });

  it('erase strokes subtract coverage', () => {
    const erased: BrushMaskData = {
      ...stroke,
      erase: [
        [
          { x: 0.5, y: 0.5, pressure: 1 },
        ],
      ],
    };
    expect(brushAlphaAt(erased, 0.5, 0.5)).toBeLessThan(brushAlphaAt(stroke, 0.5, 0.5));
  });

  it('flow scales the painted coverage', () => {
    const light: BrushMaskData = { ...stroke, flow: 0.3, feather: 0 };
    expect(brushAlphaAt(light, 0.5, 0.5)).toBeCloseTo(0.3, 5);
  });

  it('empty stroke set yields zero', () => {
    const empty: BrushMaskData = { ...stroke, strokes: [] };
    expect(brushAlphaAt(empty, 0.5, 0.5)).toBe(0);
  });
});

describe('rasterize + dispatch', () => {
  const radial: Mask = {
    id: 'm1',
    name: 'Radial',
    enabled: true,
    geometry: {
      kind: 'radial',
      centerX: 0.5,
      centerY: 0.5,
      radiusX: 0.4,
      radiusY: 0.4,
      rotation: 0,
      feather: 0.3,
      inverted: false,
    },
    adjustments: {},
  };

  it('maskAlphaAt dispatches by kind', () => {
    expect(maskAlphaAt(radial.geometry, 0.5, 0.5)).toBeCloseTo(1, 5);
  });

  it('rasterizes to an 8-bit buffer with a bright center', () => {
    const buf = rasterizeMaskAlpha(radial, 16, 16);
    expect(buf.length).toBe(16 * 16);
    const center = buf[8 * 16 + 8] ?? 0;
    const corner = buf[0] ?? 0;
    expect(center).toBeGreaterThan(200);
    expect(corner).toBe(0);
  });

  it('disabled masks rasterize to all zero', () => {
    const off: Mask = { ...radial, enabled: false };
    const buf = rasterizeMaskAlpha(off, 8, 8);
    expect(coverageFraction(buf)).toBe(0);
  });

  it('coverageFraction reports partial coverage for a small radial', () => {
    const small: Mask = {
      ...radial,
      geometry: {
        kind: 'radial',
        centerX: 0.5,
        centerY: 0.5,
        radiusX: 0.1,
        radiusY: 0.1,
        rotation: 0,
        feather: 0,
        inverted: false,
      },
    };
    const frac = coverageFraction(rasterizeMaskAlpha(small, 64, 64));
    expect(frac).toBeGreaterThan(0);
    expect(frac).toBeLessThan(0.2);
  });
});
