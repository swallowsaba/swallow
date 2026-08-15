import type { EditState, WarpOp, WarpTool } from '@/types';

/**
 * Pure liquify math and transitions. The displacement field is defined as an
 * INVERSE map: for an output pixel at (u,v) it returns (du,dv) such that the
 * shader samples the developed image at (u+du, v+dv). Summing per-op
 * displacements is a good approximation for moderate strengths and stays pure
 * and unit-testable — the GPU present pass just samples the baked field.
 *
 * Coordinates are normalized 0..1 in the cropped image's space.
 */

export const WARP_MAX_DISP = 0.35; // clamp per-axis displacement for 8-bit encoding

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

/** Smooth 1-at-center → 0-at-edge falloff for a point at `dist` within `radius`. */
export function falloff(dist: number, radius: number): number {
  if (radius <= 0) return 0;
  const t = clamp(1 - dist / radius, 0, 1);
  return t * t * (3 - 2 * t);
}

/** Inverse displacement contributed by a single op at (u,v). */
export function opDisplacementAt(op: WarpOp, u: number, v: number): { x: number; y: number } {
  const dirX = u - op.x;
  const dirY = v - op.y;
  const dist = Math.hypot(dirX, dirY);
  if (dist >= op.radius) return { x: 0, y: 0 };
  const f = falloff(dist, op.radius) * op.strength;
  switch (op.tool) {
    case 'push':
      // Sample from behind the drag so pixels appear to move by (dx,dy).
      return { x: -op.dx * f, y: -op.dy * f };
    case 'bloat':
      // Sample toward the center → magnify around it.
      return { x: -dirX * f, y: -dirY * f };
    case 'pinch':
      // Sample away from the center → shrink toward it.
      return { x: dirX * f, y: dirY * f };
    default: {
      const _never: never = op.tool;
      return _never;
    }
  }
}

/** Total inverse displacement at (u,v) from all ops. */
export function displacementAt(
  ops: readonly WarpOp[],
  u: number,
  v: number,
): { x: number; y: number } {
  let x = 0;
  let y = 0;
  for (const op of ops) {
    const d = opDisplacementAt(op, u, v);
    x += d.x;
    y += d.y;
  }
  return { x, y };
}

/**
 * Rasterize the warp field into an 8-bit RGBA displacement map. R,G encode
 * (du,dv) mapped from [-WARP_MAX_DISP, WARP_MAX_DISP] to 0..255; B,A are unused
 * (0,255). Row 0 = image top. The shader decodes rg*2-1 then scales.
 */
export function rasterizeWarpField(
  ops: readonly WarpOp[],
  width: number,
  height: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  const encode = (d: number): number =>
    Math.round((clamp(d, -WARP_MAX_DISP, WARP_MAX_DISP) / WARP_MAX_DISP) * 0.5 * 255 + 0.5 * 255);
  const neutral = Math.round(0.5 * 255);
  for (let y = 0; y < height; y++) {
    const v = (y + 0.5) / height;
    for (let x = 0; x < width; x++) {
      const u = (x + 0.5) / width;
      const i = (y * width + x) * 4;
      if (ops.length === 0) {
        out[i] = neutral;
        out[i + 1] = neutral;
      } else {
        const d = displacementAt(ops, u, v);
        out[i] = encode(d.x);
        out[i + 1] = encode(d.y);
      }
      out[i + 2] = 0;
      out[i + 3] = 255;
    }
  }
  return out;
}

/** Decode an encoded channel byte back to a displacement (for tests/tools). */
export function decodeWarpChannel(byte: number): number {
  return (byte / 255 - 0.5) * 2 * WARP_MAX_DISP;
}

/* ------------------------------ transitions ------------------------------ */

export function defaultPushOp(
  x: number,
  y: number,
  dx: number,
  dy: number,
  radius: number,
  strength: number,
): WarpOp {
  return { tool: 'push', x, y, dx, dy, radius, strength };
}

export function radialOp(
  tool: 'bloat' | 'pinch',
  x: number,
  y: number,
  radius: number,
  strength: number,
): WarpOp {
  return { tool, x, y, dx: 0, dy: 0, radius, strength };
}

function withWarp(state: EditState, warp: readonly WarpOp[]): EditState {
  return { ...state, warp, updatedAt: Date.now() };
}

/** Append one op (a tap/dab). */
export function addWarpOp(state: EditState, op: WarpOp): EditState {
  return withWarp(state, [...state.warp, op]);
}

/** Append a whole stroke of ops (one undo step per stroke). */
export function addWarpOps(state: EditState, ops: readonly WarpOp[]): EditState {
  if (ops.length === 0) return state;
  return withWarp(state, [...state.warp, ...ops]);
}

/** Remove the most recent op (fine-grained undo within a session). */
export function popWarpOp(state: EditState): EditState {
  if (state.warp.length === 0) return state;
  return withWarp(state, state.warp.slice(0, -1));
}

export function clearWarp(state: EditState): EditState {
  if (state.warp.length === 0) return state;
  return withWarp(state, []);
}

/** Whether any warp is present. */
export function hasWarp(state: EditState): boolean {
  return state.warp.length > 0;
}

/** Tool label helper. */
export function warpToolLabel(tool: WarpTool): string {
  return tool === 'push' ? 'Push' : tool === 'bloat' ? 'Bloat' : 'Pinch';
}
