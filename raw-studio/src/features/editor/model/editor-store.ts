import { useMemo } from 'react';
import { create } from 'zustand';
import type {
  EditHistory,
  EditState,
  Geometry,
  PresetAdjustments,
  Snapshot,
  SourceImageMeta,
} from '@/types';
import {
  addSnapshot as addSnapshotOp,
  canRedo as canRedoOp,
  canUndo as canUndoOp,
  createHistory,
  pushEdit,
  redo as redoOp,
  removeSnapshot as removeSnapshotOp,
  restoreSnapshot as restoreSnapshotOp,
  timeline as timelineOp,
  jumpTo as jumpToOp,
  undo as undoOp,
} from '@/features/history/model/history';
import { applyAdjustments, applyGeometry } from './apply';
import {
  createDefaultAdjustments,
  createDefaultGeometry,
} from '@/features/adjustments/model/defaults';

/**
 * The single source of truth for the currently open image and its edit history.
 * All mutating actions run a pure transition and then a history operation, so
 * every change is automatically undoable.
 */
export interface EditorState {
  image: SourceImageMeta | null;
  history: EditHistory | null;
  /** Uncommitted live-drag overlay applied for rendering only (not in history). */
  preview: PresetAdjustments | null;

  loadImage: (image: SourceImageMeta, initial: EditState) => void;
  closeImage: () => void;

  setPreview: (patch: PresetAdjustments) => void;
  clearPreview: () => void;
  commitAdjustments: (patch: PresetAdjustments, label: string) => void;
  commitGeometry: (patch: Partial<Geometry>, label: string) => void;

  undo: () => void;
  redo: () => void;
  jumpToHistory: (entryId: string) => void;
  addSnapshot: (name: string) => void;
  removeSnapshot: (id: string) => void;
  restoreSnapshot: (id: string) => void;
  resetEdit: () => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  image: null,
  history: null,
  preview: null,

  loadImage: (image, initial) => {
    set({ image, history: createHistory(initial), preview: null });
  },

  closeImage: () => {
    set({ image: null, history: null, preview: null });
  },

  setPreview: (patch) => {
    set((state) => ({ preview: mergePreview(state.preview, patch) }));
  },
  clearPreview: () => {
    set({ preview: null });
  },

  commitAdjustments: (patch, label) => {
    set((state) => {
      if (!state.history) return state;
      const next = applyAdjustments(state.history.present.state, patch);
      return { history: pushEdit(state.history, label, next), preview: null };
    });
  },

  commitGeometry: (patch, label) => {
    set((state) => {
      if (!state.history) return state;
      const next = applyGeometry(state.history.present.state, patch);
      return { history: pushEdit(state.history, label, next) };
    });
  },

  undo: () => {
    set((state) => (state.history ? { history: undoOp(state.history) } : state));
  },
  redo: () => {
    set((state) => (state.history ? { history: redoOp(state.history) } : state));
  },
  jumpToHistory: (entryId) => {
    set((state) => (state.history ? { history: jumpToOp(state.history, entryId) } : state));
  },
  addSnapshot: (name) => {
    set((state) => (state.history ? { history: addSnapshotOp(state.history, name) } : state));
  },
  removeSnapshot: (id) => {
    set((state) => (state.history ? { history: removeSnapshotOp(state.history, id) } : state));
  },
  restoreSnapshot: (id) => {
    set((state) => (state.history ? { history: restoreSnapshotOp(state.history, id) } : state));
  },
  resetEdit: () => {
    set((state) => {
      if (!state.history) return state;
      const current = state.history.present.state;
      const reset = {
        ...current,
        adjustments: createDefaultAdjustments(),
        geometry: createDefaultGeometry(),
        updatedAt: Date.now(),
      };
      return { history: pushEdit(state.history, 'Reset', reset), preview: null };
    });
  },
}));

/** Shallow-merge preview overlays by adjustment group. */
function mergePreview(
  current: PresetAdjustments | null,
  patch: PresetAdjustments,
): PresetAdjustments {
  const base = current ?? {};
  return {
    ...base,
    ...patch,
    ...(patch.basic ? { basic: { ...base.basic, ...patch.basic } } : {}),
    ...(patch.toneCurves ? { toneCurves: { ...base.toneCurves, ...patch.toneCurves } } : {}),
    ...(patch.detail ? { detail: { ...base.detail, ...patch.detail } } : {}),
    ...(patch.lens ? { lens: { ...base.lens, ...patch.lens } } : {}),
    ...(patch.hsl ? { hsl: mergeHslPreview(base.hsl, patch.hsl) } : {}),
    ...(patch.colorGrading
      ? { colorGrading: mergeColorGradingPreview(base.colorGrading, patch.colorGrading) }
      : {}),
  };
}

/** Like {@link mergeHsl} in apply.ts, but both sides are partial here (this
 *  merges one preview patch onto the previous preview overlay, not onto a
 *  full committed Adjustments). Still needs a per-band merge so touching one
 *  field (e.g. saturation) doesn't erase a sibling field (hue/luminance)
 *  already present in the accumulated preview. */
function mergeHslPreview(
  base: PresetAdjustments['hsl'],
  patch: NonNullable<PresetAdjustments['hsl']>,
): NonNullable<PresetAdjustments['hsl']> {
  const next = { ...base };
  for (const band of Object.keys(patch) as (keyof NonNullable<PresetAdjustments['hsl']>)[]) {
    const bandPatch = patch[band];
    if (bandPatch) next[band] = { ...base?.[band], ...bandPatch };
  }
  return next;
}

function mergeColorGradingPreview(
  base: PresetAdjustments['colorGrading'],
  patch: NonNullable<PresetAdjustments['colorGrading']>,
): NonNullable<PresetAdjustments['colorGrading']> {
  return {
    ...base,
    ...patch,
    ...(patch.shadows ? { shadows: { ...base?.shadows, ...patch.shadows } } : {}),
    ...(patch.midtones ? { midtones: { ...base?.midtones, ...patch.midtones } } : {}),
    ...(patch.highlights ? { highlights: { ...base?.highlights, ...patch.highlights } } : {}),
    ...(patch.global ? { global: { ...base?.global, ...patch.global } } : {}),
  };
}

/* ----------------------------- selectors ------------------------------ */

/**
 * Pitfall: a selector passed straight to `useStore(selector)` must return a
 * value that's referentially stable when the underlying state hasn't
 * actually changed. Selectors below that build a new array/object every call
 * (marked accordingly) will make React's `useSyncExternalStore` see a
 * "different" snapshot on every check and can trigger an infinite update
 * loop (React error #185). Use the paired `use...()` hook instead — it reads
 * only the raw, referentially-stable store fields and memoizes the derived
 * value with `useMemo`, recomputing only when those fields actually change.
 */

/** The edit state to render: present state with the live preview overlaid.
 *  NEW OBJECT EVERY CALL while a preview is active — do not pass directly to
 *  `useStore(selectRenderEdit)`. Use `useRenderEdit()` in components. */
export function selectRenderEdit(state: EditorState): EditState | null {
  const present = state.history?.present.state ?? null;
  if (!present) return null;
  return state.preview ? applyAdjustments(present, state.preview) : present;
}

/** Memoized version of {@link selectRenderEdit} safe to use in components. */
export function useRenderEdit(): EditState | null {
  const present = useEditorStore((s) => s.history?.present.state ?? null);
  const preview = useEditorStore((s) => s.preview);
  return useMemo(
    () => (present && preview ? applyAdjustments(present, preview) : present),
    [present, preview],
  );
}


/** The current (present) edit state, or null when no image is open. */
export function selectCurrentEdit(state: EditorState): EditState | null {
  return state.history?.present.state ?? null;
}

export function selectCanUndo(state: EditorState): boolean {
  return state.history ? canUndoOp(state.history) : false;
}

export function selectCanRedo(state: EditorState): boolean {
  return state.history ? canRedoOp(state.history) : false;
}

const EMPTY_LABELS: readonly string[] = [];

/** NEW ARRAY EVERY CALL while history exists — fine for one-off reads (e.g.
 *  tests), but avoid passing directly to `useStore` in a component. */
export function selectHistoryLabels(state: EditorState): readonly string[] {
  if (!state.history) return EMPTY_LABELS;
  return [...state.history.past, state.history.present].map((entry) => entry.label);
}

export interface HistoryRow {
  id: string;
  label: string;
  active: boolean;
}

/** NEW ARRAY EVERY CALL — do not pass directly to `useStore`. Use
 *  `useHistoryRows()` in components. */
export function selectHistoryRows(state: EditorState): readonly HistoryRow[] {
  if (!state.history) return EMPTY_HISTORY_ROWS;
  const presentId = state.history.present.id;
  return timelineOp(state.history).map((entry) => ({
    id: entry.id,
    label: entry.label,
    active: entry.id === presentId,
  }));
}

const EMPTY_HISTORY_ROWS: readonly HistoryRow[] = [];

/** Memoized version of {@link selectHistoryRows} safe to use in components. */
export function useHistoryRows(): readonly HistoryRow[] {
  const history = useEditorStore((s) => s.history);
  return useMemo(() => {
    if (!history) return EMPTY_HISTORY_ROWS;
    const presentId = history.present.id;
    return timelineOp(history).map((entry) => ({
      id: entry.id,
      label: entry.label,
      active: entry.id === presentId,
    }));
  }, [history]);
}

/** Stable empty array so callers with no open image get the same reference
 *  every time, instead of a fresh `[]` (which would look "changed" to
 *  `useSyncExternalStore` on every render and can trigger an infinite loop). */
const EMPTY_SNAPSHOTS: readonly Snapshot[] = [];

export function selectSnapshots(state: EditorState): readonly Snapshot[] {
  return state.history?.snapshots ?? EMPTY_SNAPSHOTS;
}
