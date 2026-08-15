import { describe, expect, it } from 'vitest';
import type { EditState, WarpOp } from '@/types';
import { createDefaultEditState } from '@/features/adjustments/model/defaults';
import {
  addWarpOp,
  addWarpOps,
  clearWarp,
  decodeWarpChannel,
  defaultPushOp,
  displacementAt,
  falloff,
  hasWarp,
  opDisplacementAt,
  popWarpOp,
  radialOp,
  rasterizeWarpField,
  WARP_MAX_DISP,
} from './warp-field';

function state(): EditState {
  return createDefaultEditState('img1', 0);
}

describe('falloff', () => {
  it('is 1 at the center, 0 at/after the edge', () => {
    expect(falloff(0, 0.2)).toBeCloseTo(1, 5);
    expect(falloff(0.2, 0.2)).toBeCloseTo(0, 5);
    expect(falloff(0.3, 0.2)).toBe(0);
  });
  it('is between 0 and 1 partway', () => {
    const f = falloff(0.1, 0.2);
    expect(f).toBeGreaterThan(0);
    expect(f).toBeLessThan(1);
  });
});

describe('opDisplacementAt', () => {
  const at = { x: 0.5, y: 0.5, radius: 0.3, strength: 1 };

  it('push samples from behind the drag vector', () => {
    const op: WarpOp = { tool: 'push', ...at, dx: 0.1, dy: 0 };
    const d = opDisplacementAt(op, 0.5, 0.5); // center, full falloff
    expect(d.x).toBeCloseTo(-0.1, 5);
    expect(d.y).toBeCloseTo(0, 5);
  });

  it('bloat pulls the sample toward the center', () => {
    const op: WarpOp = { tool: 'bloat', ...at, dx: 0, dy: 0 };
    // A point to the right of center → displacement points left (toward center).
    const d = opDisplacementAt(op, 0.6, 0.5);
    expect(d.x).toBeLessThan(0);
  });

  it('pinch pushes the sample away from the center', () => {
    const op: WarpOp = { tool: 'pinch', ...at, dx: 0, dy: 0 };
    const d = opDisplacementAt(op, 0.6, 0.5);
    expect(d.x).toBeGreaterThan(0);
  });

  it('is zero outside the radius', () => {
    const op: WarpOp = { tool: 'bloat', ...at, dx: 0, dy: 0 };
    expect(opDisplacementAt(op, 0.95, 0.95)).toEqual({ x: 0, y: 0 });
  });
});

describe('displacementAt', () => {
  it('sums contributions from multiple ops', () => {
    const a: WarpOp = { tool: 'push', x: 0.5, y: 0.5, radius: 0.5, strength: 1, dx: 0.1, dy: 0 };
    const b: WarpOp = { tool: 'push', x: 0.5, y: 0.5, radius: 0.5, strength: 1, dx: 0.1, dy: 0 };
    const one = displacementAt([a], 0.5, 0.5);
    const two = displacementAt([a, b], 0.5, 0.5);
    expect(two.x).toBeCloseTo(one.x * 2, 5);
  });

  it('empty ops give zero displacement', () => {
    expect(displacementAt([], 0.3, 0.7)).toEqual({ x: 0, y: 0 });
  });
});

describe('rasterizeWarpField', () => {
  it('encodes neutral (0.5) where there is no displacement', () => {
    const field = rasterizeWarpField([], 4, 4);
    expect(field.length).toBe(4 * 4 * 4);
    // R,G ~127/128 (neutral), B=0, A=255.
    expect(Math.abs((field[0] ?? 0) - 127.5)).toBeLessThanOrEqual(1);
    expect(field[2]).toBe(0);
    expect(field[3]).toBe(255);
  });

  it('encodes a decodable displacement at the center of a push', () => {
    const op: WarpOp = { tool: 'push', x: 0.5, y: 0.5, radius: 0.6, strength: 1, dx: 0.1, dy: 0 };
    const w = 8;
    const h = 8;
    const field = rasterizeWarpField([op], w, h);
    // Center pixel (4,4).
    const i = (4 * w + 4) * 4;
    const du = decodeWarpChannel(field[i] ?? 0);
    // Displacement is -dx at center; within one 8-bit quantization step.
    expect(du).toBeLessThan(0);
    expect(Math.abs(du - -0.1)).toBeLessThan(WARP_MAX_DISP / 64);
  });

  it('clamps large displacements to the encodable range', () => {
    const op: WarpOp = { tool: 'push', x: 0.5, y: 0.5, radius: 1, strength: 1, dx: 5, dy: 0 };
    const field = rasterizeWarpField([op], 2, 2);
    // Extreme negative → encoded ~0.
    expect(field[0]).toBeLessThanOrEqual(1);
  });
});

describe('transitions', () => {
  it('adds ops and strokes without mutating input', () => {
    const s0 = state();
    const s1 = addWarpOp(s0, defaultPushOp(0.5, 0.5, 0.1, 0, 0.2, 0.5));
    expect(s0.warp.length).toBe(0);
    expect(s1.warp.length).toBe(1);
    const s2 = addWarpOps(s1, [radialOp('bloat', 0.5, 0.5, 0.2, 0.5), radialOp('pinch', 0.3, 0.3, 0.1, 0.5)]);
    expect(s2.warp.length).toBe(3);
    expect(addWarpOps(s2, []).warp.length).toBe(3);
  });

  it('pops and clears', () => {
    let s = addWarpOps(state(), [
      radialOp('bloat', 0.5, 0.5, 0.2, 0.5),
      radialOp('pinch', 0.3, 0.3, 0.1, 0.5),
    ]);
    s = popWarpOp(s);
    expect(s.warp.length).toBe(1);
    expect(hasWarp(s)).toBe(true);
    s = clearWarp(s);
    expect(s.warp.length).toBe(0);
    expect(hasWarp(s)).toBe(false);
    expect(popWarpOp(s)).toBe(s); // no-op on empty
  });
});
