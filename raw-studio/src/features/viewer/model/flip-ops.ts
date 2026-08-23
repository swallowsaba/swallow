import type { FlipMode } from '@/types';

/**
 * Pure toggling of the flip state. FlipMode combines horizontal and vertical
 * into one enum ('none' | 'horizontal' | 'vertical' | 'both'); toggling one axis
 * moves between the combined states. Kept pure so the crop UI stays trivial and
 * this is unit-tested.
 */

export function isFlippedH(mode: FlipMode): boolean {
  return mode === 'horizontal' || mode === 'both';
}

export function isFlippedV(mode: FlipMode): boolean {
  return mode === 'vertical' || mode === 'both';
}

function fromAxes(h: boolean, v: boolean): FlipMode {
  if (h && v) return 'both';
  if (h) return 'horizontal';
  if (v) return 'vertical';
  return 'none';
}

/** Toggle one axis of the flip, preserving the other. */
export function toggleFlip(mode: FlipMode, axis: 'horizontal' | 'vertical'): FlipMode {
  const h = isFlippedH(mode);
  const v = isFlippedV(mode);
  return axis === 'horizontal' ? fromAxes(!h, v) : fromAxes(h, !v);
}
