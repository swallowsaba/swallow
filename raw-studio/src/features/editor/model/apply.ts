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
    hsl: patch.hsl ? mergeHsl(base.hsl, patch.hsl) : base.hsl,
    colorGrading: patch.colorGrading
      ? mergeColorGrading(base.colorGrading, patch.colorGrading)
      : base.colorGrading,
  };
}

/**
 * `hsl` is keyed by band, and each band is itself an object of
 * {hue,saturation,luminance}. A naive `{...base.hsl, ...patch.hsl}` would
 * replace an entire band's object wholesale, silently dropping any field the
 * patch didn't mention (e.g. editing only saturation would erase hue and
 * luminance). Merge one level deeper, per band.
 */
function mergeHsl(
  base: Adjustments['hsl'],
  patch: NonNullable<PresetAdjustments['hsl']>,
): Adjustments['hsl'] {
  const next = { ...base };
  for (const band of Object.keys(patch) as (keyof Adjustments['hsl'])[]) {
    const bandPatch = patch[band];
    if (bandPatch) next[band] = { ...base[band], ...bandPatch };
  }
  return next;
}

/** Same reasoning as {@link mergeHsl}: each wheel needs a per-field merge. */
function mergeColorGrading(
  base: Adjustments['colorGrading'],
  patch: NonNullable<PresetAdjustments['colorGrading']>,
): Adjustments['colorGrading'] {
  return {
    shadows: patch.shadows ? { ...base.shadows, ...patch.shadows } : base.shadows,
    midtones: patch.midtones ? { ...base.midtones, ...patch.midtones } : base.midtones,
    highlights: patch.highlights ? { ...base.highlights, ...patch.highlights } : base.highlights,
    global: patch.global ? { ...base.global, ...patch.global } : base.global,
    blending: patch.blending ?? base.blending,
    balance: patch.balance ?? base.balance,
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
