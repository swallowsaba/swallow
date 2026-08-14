import type { LinearMaskData, RadialMaskData } from '@/types';
import { clamp, computeFitScale, type Size } from '@/features/viewer/model/viewport';
import { clamp01 } from './mask-alpha';

/**
 * Pure geometry for the mask editing overlay: mapping between screen pixels and
 * the normalized (0..1) coordinates masks are stored in, plus handle positions
 * and drag resolution for radial and linear masks. Kept framework-free so the
 * fiddly coordinate math is unit-tested instead of eyeballed in the browser.
 *
 * Like the crop overlay, placement is rotation-agnostic: the cropped image is
 * laid out at its "fit" size, centered in the container.
 */

export interface Placement {
  readonly originX: number;
  readonly originY: number;
  readonly dispW: number;
  readonly dispH: number;
}

/** Fit the cropped image into the container, centered. */
export function fitPlacement(croppedSize: Size, container: Size): Placement {
  const scale = computeFitScale(croppedSize, container, 0);
  const dispW = croppedSize.width * scale;
  const dispH = croppedSize.height * scale;
  return {
    originX: (container.width - dispW) / 2,
    originY: (container.height - dispH) / 2,
    dispW,
    dispH,
  };
}

/** Screen position (relative to the container's top-left) → normalized coords. */
export function screenToNorm(
  localX: number,
  localY: number,
  p: Placement,
): { x: number; y: number } {
  const x = p.dispW === 0 ? 0 : (localX - p.originX) / p.dispW;
  const y = p.dispH === 0 ? 0 : (localY - p.originY) / p.dispH;
  return { x: clamp01(x), y: clamp01(y) };
}

/** Normalized coords → absolute pixel position within the container. */
export function normToScreen(nx: number, ny: number, p: Placement): { left: number; top: number } {
  return { left: p.originX + nx * p.dispW, top: p.originY + ny * p.dispH };
}

/* --------------------------------- radial -------------------------------- */

export type RadialHandle = 'center' | 'edgeX' | 'edgeY' | 'rotate';

/** Handle anchor points for a radial mask, in normalized coords. The rotation
 *  handle sits just beyond the +y edge. Accounts for the mask's rotation. */
export function radialHandlePoints(
  m: RadialMaskData,
): Record<RadialHandle, { x: number; y: number }> {
  const rad = (m.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const rot = (dx: number, dy: number) => ({
    x: m.centerX + dx * cos - dy * sin,
    y: m.centerY + dx * sin + dy * cos,
  });
  return {
    center: { x: m.centerX, y: m.centerY },
    edgeX: rot(m.radiusX, 0),
    edgeY: rot(0, m.radiusY),
    rotate: rot(0, m.radiusY + 0.06),
  };
}

/** Nearest radial handle within `tolerance` (normalized), or null. */
export function pickRadialHandle(
  m: RadialMaskData,
  x: number,
  y: number,
  tolerance: number,
): RadialHandle | null {
  const pts = radialHandlePoints(m);
  let best: RadialHandle | null = null;
  let bestDist = tolerance;
  for (const handle of ['edgeX', 'edgeY', 'rotate', 'center'] as RadialHandle[]) {
    const p = pts[handle];
    const d = Math.hypot(x - p.x, y - p.y);
    if (d <= bestDist) {
      bestDist = d;
      best = handle;
    }
  }
  return best;
}

/** Apply a drag on a radial handle, returning updated geometry. Coordinates
 *  are the current pointer position in normalized space. */
export function dragRadial(
  m: RadialMaskData,
  handle: RadialHandle,
  x: number,
  y: number,
): RadialMaskData {
  if (handle === 'center') {
    return { ...m, centerX: clamp01(x), centerY: clamp01(y) };
  }
  const dx = x - m.centerX;
  const dy = y - m.centerY;
  if (handle === 'rotate') {
    // Angle from center to pointer; the rotate handle is nominally "below".
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI - 90;
    return { ...m, rotation: ((angle % 360) + 360) % 360 };
  }
  // Resize: project the pointer offset onto the mask's local axis.
  const rad = (m.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const localX = dx * cos + dy * sin;
  const localY = -dx * sin + dy * cos;
  if (handle === 'edgeX') {
    return { ...m, radiusX: clamp(Math.abs(localX), 0.01, 1) };
  }
  return { ...m, radiusY: clamp(Math.abs(localY), 0.01, 1) };
}

/* --------------------------------- linear -------------------------------- */

export type LinearHandle = 'start' | 'end' | 'line';

export function pickLinearHandle(
  m: LinearMaskData,
  x: number,
  y: number,
  tolerance: number,
): LinearHandle | null {
  const dStart = Math.hypot(x - m.startX, y - m.startY);
  const dEnd = Math.hypot(x - m.endX, y - m.endY);
  if (dStart <= tolerance && dStart <= dEnd) return 'start';
  if (dEnd <= tolerance) return 'end';
  // Grab the whole gradient if the pointer is near the mid line.
  const midX = (m.startX + m.endX) / 2;
  const midY = (m.startY + m.endY) / 2;
  if (Math.hypot(x - midX, y - midY) <= tolerance) return 'line';
  return null;
}

export function dragLinear(
  m: LinearMaskData,
  handle: LinearHandle,
  x: number,
  y: number,
  dxNorm = 0,
  dyNorm = 0,
): LinearMaskData {
  if (handle === 'start') return { ...m, startX: clamp01(x), startY: clamp01(y) };
  if (handle === 'end') return { ...m, endX: clamp01(x), endY: clamp01(y) };
  // 'line': translate both endpoints by the pointer delta.
  return {
    ...m,
    startX: clamp01(m.startX + dxNorm),
    startY: clamp01(m.startY + dyNorm),
    endX: clamp01(m.endX + dxNorm),
    endY: clamp01(m.endY + dyNorm),
  };
}
