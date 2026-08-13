import type { Adjustments, EditState, Geometry, PresetAdjustments } from '@/types';

/**
 * Pure state transitions for the editor. The Zustand store is a thin wrapper
 * around these functions, which keeps all real logic testable in isolation and
 * free of React/store concerns.
 */

/** Deep-merge a partial adjustment overlay (e.g. a preset) onto a full stack. */
export function mergeAdjustments(base: Adjustments, patch: PresetAdjustments): Adjustments {
  return {
    basic: patch.basic ? { ...base.basic, ...patch.basic } : base.basic,
    toneCurves: patch.toneCurves ? { ...base.toneCurves, ...patch.toneCurves } : base.toneCurves,
    detail: patch.detail ? { ...base.detail, ...patch.detail } : base.detail,
    lens: patch.lens ? { ...base.lens, ...patch.lens } : base.lens,
    hsl: patch.hsl ? { ...base.hsl, ...patch.hsl } : base.hsl,
    colorGrading: patch.colorGrading
      ? { ...base.colorGrading, ...patch.colorGrading }
      : base.colorGrading,
  };
}

/** Return a new EditState with the adjustment patch applied. */
export function applyAdjustments(
  state: EditState,
  patch: PresetAdjustments,
  at: number = Date.now(),
): EditState {
  return {
    ...state,
    adjustments: mergeAdjustments(state.adjustments, patch),
    updatedAt: at,
  };
}

/** Return a new EditState with a geometry patch applied. */
export function applyGeometry(
  state: EditState,
  patch: Partial<Geometry>,
  at: number = Date.now(),
): EditState {
  return {
    ...state,
    geometry: { ...state.geometry, ...patch },
    updatedAt: at,
  };
}
