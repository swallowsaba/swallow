import type {
  BrushMaskData,
  LinearMaskData,
  Mask,
  MaskGeometry,
  RadialMaskData,
  RasterMaskData,
} from '@/types';
import { decodeRaster, rasterizeRaster, sampleRasterAt } from './raster-mask';

/**
 * Pure mask rasterization: turn a {@link Mask}'s normalized geometry into a
 * per-pixel coverage value in 0..1. Everything here is deterministic and
 * framework-free so it can be unit-tested against synthetic pixel grids
 * without a canvas or GPU — the same math the shader compositing pass relies
 * on to decide how strongly each mask's local adjustments apply.
 *
 * Coordinate convention: `u`,`v` are normalized 0..1 across the CROPPED image
 * (u = left→right, v = top→bottom), matching the UV space the renderer samples
 * and the normalized coordinates masks are stored in. Feather values are
 * fractions (0..1); the UI keeps them in that range.
 */

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** Hermite smoothstep. Returns 0 for x<=edge0, 1 for x>=edge1, smooth between.
 *  When edge0 >= edge1 it degrades to a hard step at edge1 (no divide-by-zero). */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 >= edge1) return x < edge1 ? 0 : 1;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** Shortest distance from point (px,py) to the segment (ax,ay)-(bx,by). */
export function distanceToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = clamp01(t);
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/**
 * Radial (elliptical) mask coverage at (u,v). The ellipse is centered at
 * (centerX,centerY) with half-extents (radiusX,radiusY), rotated by `rotation`
 * degrees. Coverage is 1 in the core, feathered to 0 at the edge. `inverted`
 * swaps inside/outside so the effect applies around the subject instead.
 */
export function radialAlphaAt(m: RadialMaskData, u: number, v: number): number {
  const rad = (-m.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = u - m.centerX;
  const dy = v - m.centerY;
  // Rotate the sample point into the ellipse's local axes.
  const lx = dx * cos - dy * sin;
  const ly = dx * sin + dy * cos;
  const rx = Math.max(m.radiusX, 1e-6);
  const ry = Math.max(m.radiusY, 1e-6);
  const d = Math.hypot(lx / rx, ly / ry); // 1.0 exactly on the ellipse edge.
  const feather = clamp01(m.feather);
  const inner = 1 - feather; // start of the falloff band
  const inside = 1 - smoothstep(inner, 1, d);
  return m.inverted ? 1 - inside : inside;
}

/**
 * Linear (graduated) mask coverage at (u,v). 0 on the start line, ramping to 1
 * on the end line, clamped beyond each. The ramp direction is start→end, so a
 * top-to-bottom drag darkens the sky, etc.
 */
export function linearAlphaAt(m: LinearMaskData, u: number, v: number): number {
  const dx = m.endX - m.startX;
  const dy = m.endY - m.startY;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return 0;
  const t = ((u - m.startX) * dx + (v - m.startY) * dy) / lenSq;
  return smoothstep(0, 1, t);
}

/**
 * Brush mask coverage at (u,v). Additive strokes paint coverage in; erase
 * strokes take it back out. Each stroke is a polyline; a point contributes
 * where it is within `size/2` of any segment, feathered over the outer band,
 * scaled by flow and pen pressure. Result is clamped to 0..1.
 */
export function brushAlphaAt(m: BrushMaskData, u: number, v: number): number {
  const radius = Math.max(m.size / 2, 1e-6);
  const feather = clamp01(m.feather);
  const inner = radius * (1 - feather);
  const flow = clamp01(m.flow);

  const coverageFrom = (
    strokes: readonly (readonly { x: number; y: number; pressure: number }[])[],
  ): number => {
    let cov = 0;
    for (const stroke of strokes) {
      if (stroke.length === 0) continue;
      if (stroke.length === 1) {
        const p = stroke[0];
        if (!p) continue;
        const dist = Math.hypot(u - p.x, v - p.y);
        const c = (1 - smoothstep(inner, radius, dist)) * flow * clamp01(p.pressure);
        cov = Math.max(cov, c);
        continue;
      }
      for (let i = 0; i + 1 < stroke.length; i++) {
        const a = stroke[i];
        const b = stroke[i + 1];
        if (!a || !b) continue;
        const dist = distanceToSegment(u, v, a.x, a.y, b.x, b.y);
        const pressure = clamp01((a.pressure + b.pressure) / 2);
        const c = (1 - smoothstep(inner, radius, dist)) * flow * pressure;
        cov = Math.max(cov, c);
      }
    }
    return cov;
  };

  const add = coverageFrom(m.strokes);
  const erase = coverageFrom(m.erase);
  return clamp01(add - erase);
}

/** Dispatch coverage evaluation by mask kind. */
export function maskAlphaAt(geometry: MaskGeometry, u: number, v: number): number {
  switch (geometry.kind) {
    case 'radial':
      return radialAlphaAt(geometry, u, v);
    case 'linear':
      return linearAlphaAt(geometry, u, v);
    case 'brush':
      return brushAlphaAt(geometry, u, v);
    case 'raster':
      return rasterAlphaAt(geometry, u, v);
    default: {
      // Exhaustiveness guard: a new kind must be handled above.
      const _never: never = geometry;
      return _never;
    }
  }
}

/** Point sample of a raster mask (decodes via cache). For per-pixel work prefer
 *  {@link rasterizeMaskAlpha}, which decodes once. */
export function rasterAlphaAt(m: RasterMaskData, u: number, v: number): number {
  const decoded = decodeRaster(m.data);
  let a = sampleRasterAt(decoded, m.width, m.height, u, v);
  if (m.invert) a = 1 - a;
  return a;
}

/**
 * Rasterize a mask to an 8-bit single-channel coverage buffer of width×height,
 * sampling at pixel centers. Disabled masks return an all-zero buffer so the
 * caller can treat "enabled" uniformly. This is the CPU source for the alpha
 * texture the GPU compositing pass samples; it is regenerated only when the
 * mask geometry changes (see the canvas layer memoization).
 */
export function rasterizeMaskAlpha(
  mask: Mask,
  width: number,
  height: number,
): Uint8ClampedArray {
  if (!mask.enabled || width <= 0 || height <= 0) {
    return new Uint8ClampedArray(width > 0 && height > 0 ? width * height : 0);
  }
  // Raster masks decode their stored bitmap once and resample — never per pixel.
  if (mask.geometry.kind === 'raster') {
    return rasterizeRaster(mask.geometry, width, height);
  }
  const out = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y++) {
    const v = (y + 0.5) / height;
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const u = (x + 0.5) / width;
      out[row + x] = Math.round(maskAlphaAt(mask.geometry, u, v) * 255);
    }
  }
  return out;
}

/** Fraction of the buffer with non-zero coverage — handy for tests and for the
 *  panel to show "empty mask" hints. */
export function coverageFraction(alpha: Uint8ClampedArray): number {
  if (alpha.length === 0) return 0;
  let n = 0;
  for (let i = 0; i < alpha.length; i++) if ((alpha[i] ?? 0) > 0) n++;
  return n / alpha.length;
}
