import { describe, expect, it } from 'vitest';
import type { LinearMaskData, RadialMaskData } from '@/types';
import {
  dragLinear,
  dragRadial,
  fitPlacement,
  normToScreen,
  pickLinearHandle,
  pickRadialHandle,
  radialHandlePoints,
  screenToNorm,
} from './mask-overlay-math';

const container = { width: 400, height: 300 };

describe('placement + coordinate mapping', () => {
  it('centers a square image and round-trips coordinates', () => {
    const p = fitPlacement({ width: 300, height: 300 }, container);
    // 300x300 fit into 400x300 → scale 1, disp 300x300, centered horizontally.
    expect(p.dispW).toBeCloseTo(300, 5);
    expect(p.originX).toBeCloseTo(50, 5);
    expect(p.originY).toBeCloseTo(0, 5);

    const screen = normToScreen(0.5, 0.5, p);
    expect(screen.left).toBeCloseTo(200, 5);
    expect(screen.top).toBeCloseTo(150, 5);

    const norm = screenToNorm(screen.left, screen.top, p);
    expect(norm.x).toBeCloseTo(0.5, 5);
    expect(norm.y).toBeCloseTo(0.5, 5);
  });

  it('clamps out-of-bounds screen coords into 0..1', () => {
    const p = fitPlacement({ width: 300, height: 300 }, container);
    const norm = screenToNorm(-100, 999, p);
    expect(norm.x).toBe(0);
    expect(norm.y).toBe(1);
  });
});

describe('radial handles', () => {
  const m: RadialMaskData = {
    kind: 'radial',
    centerX: 0.5,
    centerY: 0.5,
    radiusX: 0.2,
    radiusY: 0.3,
    rotation: 0,
    feather: 0.5,
    inverted: false,
  };

  it('places edge handles at the ellipse extents', () => {
    const pts = radialHandlePoints(m);
    expect(pts.edgeX.x).toBeCloseTo(0.7, 5);
    expect(pts.edgeX.y).toBeCloseTo(0.5, 5);
    expect(pts.edgeY.x).toBeCloseTo(0.5, 5);
    expect(pts.edgeY.y).toBeCloseTo(0.8, 5);
  });

  it('picks the closest handle within tolerance', () => {
    expect(pickRadialHandle(m, 0.7, 0.5, 0.03)).toBe('edgeX');
    expect(pickRadialHandle(m, 0.5, 0.5, 0.03)).toBe('center');
    expect(pickRadialHandle(m, 0.1, 0.1, 0.03)).toBeNull();
  });

  it('dragging center moves the mask', () => {
    const moved = dragRadial(m, 'center', 0.3, 0.4);
    expect(moved.centerX).toBeCloseTo(0.3, 5);
    expect(moved.centerY).toBeCloseTo(0.4, 5);
  });

  it('dragging edgeX resizes radiusX', () => {
    const resized = dragRadial(m, 'edgeX', 0.9, 0.5);
    expect(resized.radiusX).toBeCloseTo(0.4, 5);
    expect(resized.radiusY).toBeCloseTo(0.3, 5);
  });

  it('dragging rotate updates rotation', () => {
    // Pointer directly below center → 0° (handle's nominal position).
    const rotated = dragRadial(m, 'rotate', 0.5, 0.9);
    expect(rotated.rotation).toBeCloseTo(0, 1);
  });
});

describe('linear handles', () => {
  const m: LinearMaskData = {
    kind: 'linear',
    startX: 0.5,
    startY: 0.2,
    endX: 0.5,
    endY: 0.8,
    feather: 0,
  };

  it('picks start, end, or line', () => {
    expect(pickLinearHandle(m, 0.5, 0.2, 0.05)).toBe('start');
    expect(pickLinearHandle(m, 0.5, 0.8, 0.05)).toBe('end');
    expect(pickLinearHandle(m, 0.5, 0.5, 0.05)).toBe('line');
    expect(pickLinearHandle(m, 0.1, 0.1, 0.05)).toBeNull();
  });

  it('drags endpoints and translates the line', () => {
    expect(dragLinear(m, 'start', 0.4, 0.1).startX).toBeCloseTo(0.4, 5);
    expect(dragLinear(m, 'end', 0.6, 0.9).endY).toBeCloseTo(0.9, 5);
    const moved = dragLinear(m, 'line', 0, 0, 0.1, -0.1);
    expect(moved.startX).toBeCloseTo(0.6, 5);
    expect(moved.startY).toBeCloseTo(0.1, 5);
    expect(moved.endY).toBeCloseTo(0.7, 5);
  });
});
