import type {
  EditState,
  LinearMaskData,
  LocalAdjustments,
  Mask,
  MaskGeometry,
  MaskKind,
  RadialMaskData,
} from '@/types';
import { createId } from '@/utils/id';

/**
 * Pure transitions over {@link EditState.masks}. The editor store wraps each of
 * these with a history push so every mask change is undoable and persisted,
 * exactly like the global adjustment transitions in `apply.ts`. Keeping the
 * logic here (not in the store) means it can be unit-tested without React.
 */

/** A neutral brush mask centered on the frame — the starting point for painting. */
export function defaultBrushGeometry(): MaskGeometry {
  return {
    kind: 'brush',
    size: 0.12,
    feather: 0.5,
    flow: 1,
    strokes: [],
    erase: [],
  };
}

/** A centered radial covering the middle of the frame. */
export function defaultRadialGeometry(): RadialMaskData {
  return {
    kind: 'radial',
    centerX: 0.5,
    centerY: 0.5,
    radiusX: 0.3,
    radiusY: 0.3,
    rotation: 0,
    feather: 0.5,
    inverted: false,
  };
}

/** A top-to-bottom linear gradient across the upper half (a "sky" default). */
export function defaultLinearGeometry(): LinearMaskData {
  return {
    kind: 'linear',
    startX: 0.5,
    startY: 0.1,
    endX: 0.5,
    endY: 0.5,
    feather: 0,
  };
}

export function defaultGeometryFor(kind: MaskKind): MaskGeometry {
  if (kind === 'radial') return defaultRadialGeometry();
  if (kind === 'linear') return defaultLinearGeometry();
  return defaultBrushGeometry();
}

const KIND_LABEL: Record<MaskKind, string> = {
  brush: 'Brush',
  radial: 'Radial',
  linear: 'Linear',
};

/** Build a fresh, empty mask of the given kind with a sensible unique name. */
export function createMask(kind: MaskKind, existing: readonly Mask[]): Mask {
  const sameKind = existing.filter((m) => m.geometry.kind === kind).length;
  return {
    id: createId('mask'),
    name: `${KIND_LABEL[kind]} ${sameKind + 1}`,
    enabled: true,
    geometry: defaultGeometryFor(kind),
    adjustments: {},
  };
}

function withMasks(state: EditState, masks: readonly Mask[]): EditState {
  return { ...state, masks, updatedAt: Date.now() };
}

/** Append a mask to the end of the stack (drawn last = on top). */
export function addMask(state: EditState, mask: Mask): EditState {
  return withMasks(state, [...state.masks, mask]);
}

/** Replace one mask's geometry (drag/resize/paint), leaving adjustments intact. */
export function updateMaskGeometry(
  state: EditState,
  id: string,
  geometry: MaskGeometry,
): EditState {
  return withMasks(
    state,
    state.masks.map((m) => (m.id === id ? { ...m, geometry } : m)),
  );
}

/** Merge a partial local-adjustment patch onto one mask. */
export function updateMaskAdjustments(
  state: EditState,
  id: string,
  patch: LocalAdjustments,
): EditState {
  return withMasks(
    state,
    state.masks.map((m) =>
      m.id === id ? { ...m, adjustments: { ...m.adjustments, ...patch } } : m,
    ),
  );
}

export function setMaskEnabled(state: EditState, id: string, enabled: boolean): EditState {
  return withMasks(
    state,
    state.masks.map((m) => (m.id === id ? { ...m, enabled } : m)),
  );
}

export function renameMask(state: EditState, id: string, name: string): EditState {
  const trimmed = name.trim();
  if (trimmed.length === 0) return state;
  return withMasks(
    state,
    state.masks.map((m) => (m.id === id ? { ...m, name: trimmed } : m)),
  );
}

export function removeMask(state: EditState, id: string): EditState {
  return withMasks(
    state,
    state.masks.filter((m) => m.id !== id),
  );
}

/** Invert a mask's local adjustments (negate every numeric field). Handy for
 *  flipping "brighten the subject" into "darken the surroundings". */
export function invertMaskAdjustments(state: EditState, id: string): EditState {
  return withMasks(
    state,
    state.masks.map((m) => {
      if (m.id !== id) return m;
      const negated: LocalAdjustments = {};
      for (const [key, value] of Object.entries(m.adjustments)) {
        if (typeof value === 'number') {
          (negated as Record<string, number>)[key] = -value;
        }
      }
      return { ...m, adjustments: negated };
    }),
  );
}

/** Move a mask up (toward the end / top of the stack) or down by one slot. */
export function reorderMask(state: EditState, id: string, direction: 'up' | 'down'): EditState {
  const idx = state.masks.findIndex((m) => m.id === id);
  if (idx === -1) return state;
  const target = direction === 'up' ? idx + 1 : idx - 1;
  if (target < 0 || target >= state.masks.length) return state;
  const next = [...state.masks];
  const a = next[idx];
  const b = next[target];
  if (!a || !b) return state;
  next[idx] = b;
  next[target] = a;
  return withMasks(state, next);
}

/** True when a mask carries at least one non-zero local adjustment. */
export function maskHasEffect(mask: Mask): boolean {
  return Object.values(mask.adjustments).some(
    (v) => typeof v === 'number' && v !== 0,
  );
}

/** The masks that actually contribute to the render: enabled and non-empty. */
export function activeMasks(masks: readonly Mask[]): readonly Mask[] {
  return masks.filter((m) => m.enabled && maskHasEffect(m));
}
