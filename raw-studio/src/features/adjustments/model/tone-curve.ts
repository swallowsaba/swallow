import type { CurvePoint } from '@/types';

/**
 * Pure free-form tone-curve model for the point editor: sanitizing/sorting
 * points, monotone-x evaluation, adding/moving/removing points, and building a
 * 256-entry lookup table for the GPU. All deterministic and unit-tested; the
 * texture upload and shader sampling live in the renderer.
 */

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

export const IDENTITY_CURVE: readonly CurvePoint[] = [
  { x: 0, y: 0 },
  { x: 1, y: 1 },
];

/** True when the curve is the identity (endpoints only, straight). */
export function isIdentityCurve(points: readonly CurvePoint[]): boolean {
  if (points.length !== 2) return false;
  const a = points[0];
  const b = points[1];
  return !!a && !!b && a.x === 0 && a.y === 0 && b.x === 1 && b.y === 1;
}

/** Sort by x and clamp to the unit square; guarantees at least two endpoints. */
export function normalizeCurve(points: readonly CurvePoint[]): CurvePoint[] {
  const pts = points
    .map((p) => ({ x: clamp01(p.x), y: clamp01(p.y) }))
    .sort((a, b) => a.x - b.x);
  if (pts.length === 0) return [{ x: 0, y: 0 }, { x: 1, y: 1 }];
  if (pts.length === 1) {
    const only = pts[0]!;
    return [{ x: 0, y: only.y }, { x: 1, y: only.y }];
  }
  return pts;
}

/** Evaluate the curve at x (0..1) with linear interpolation between points. */
export function evalCurve(points: readonly CurvePoint[], x: number): number {
  const pts = normalizeCurve(points);
  const xc = clamp01(x);
  if (xc <= pts[0]!.x) return clamp01(pts[0]!.y);
  const last = pts[pts.length - 1]!;
  if (xc >= last.x) return clamp01(last.y);
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    if (xc >= a.x && xc <= b.x) {
      const t = b.x === a.x ? 0 : (xc - a.x) / (b.x - a.x);
      return clamp01(a.y + (b.y - a.y) * t);
    }
  }
  return clamp01(last.y);
}

/** Build a `size`-entry LUT (0..255) sampling the curve across 0..1. */
export function buildCurveLut(points: readonly CurvePoint[], size = 256): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(size);
  for (let i = 0; i < size; i++) {
    const x = i / (size - 1);
    lut[i] = Math.round(evalCurve(points, x) * 255);
  }
  return lut;
}

/**
 * Pack the four channel curves into a 256×1 RGBA buffer for a GPU texture:
 * .r = red curve, .g = green curve, .b = blue curve, .a = master (rgb) curve.
 */
export function packCurveLutRgba(
  rgb: readonly CurvePoint[],
  red: readonly CurvePoint[],
  green: readonly CurvePoint[],
  blue: readonly CurvePoint[],
  size = 256,
): Uint8ClampedArray {
  const lr = buildCurveLut(red, size);
  const lg = buildCurveLut(green, size);
  const lb = buildCurveLut(blue, size);
  const lrgb = buildCurveLut(rgb, size);
  const out = new Uint8ClampedArray(size * 4);
  for (let i = 0; i < size; i++) {
    out[i * 4] = lr[i] ?? i;
    out[i * 4 + 1] = lg[i] ?? i;
    out[i * 4 + 2] = lb[i] ?? i;
    out[i * 4 + 3] = lrgb[i] ?? i;
  }
  return out;
}

/* ----------------------------- point editing ----------------------------- */

const MIN_GAP = 0.02;

/** Add a point at (x,y); endpoints keep their x but can move in y. */
export function addPoint(points: readonly CurvePoint[], x: number, y: number): CurvePoint[] {
  return normalizeCurve([...points, { x: clamp01(x), y: clamp01(y) }]);
}

/**
 * Move point `index` to (x,y). Interior points are kept strictly between their
 * neighbors; the two endpoints stay pinned at x=0 and x=1 (y free).
 */
export function movePoint(
  points: readonly CurvePoint[],
  index: number,
  x: number,
  y: number,
): CurvePoint[] {
  const pts = normalizeCurve(points).map((p) => ({ ...p }));
  if (index < 0 || index >= pts.length) return pts;
  const yc = clamp01(y);
  if (index === 0) {
    pts[0] = { x: 0, y: yc };
  } else if (index === pts.length - 1) {
    pts[index] = { x: 1, y: yc };
  } else {
    const lo = (pts[index - 1]!.x ?? 0) + MIN_GAP;
    const hi = (pts[index + 1]!.x ?? 1) - MIN_GAP;
    const xc = Math.max(lo, Math.min(hi, clamp01(x)));
    pts[index] = { x: xc, y: yc };
  }
  return pts;
}

/** Remove an interior point (endpoints can't be removed). */
export function removePoint(points: readonly CurvePoint[], index: number): CurvePoint[] {
  const pts = normalizeCurve(points);
  if (index <= 0 || index >= pts.length - 1) return pts;
  return pts.filter((_, i) => i !== index);
}

/** Index of the point within `tol` of (x,y), or -1. */
export function findPoint(
  points: readonly CurvePoint[],
  x: number,
  y: number,
  tol: number,
): number {
  const pts = normalizeCurve(points);
  let best = -1;
  let bestD = tol;
  for (let i = 0; i < pts.length; i++) {
    const d = Math.hypot(pts[i]!.x - x, pts[i]!.y - y);
    if (d <= bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}
