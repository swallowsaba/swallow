import { useMemo } from 'react';
import { create } from 'zustand';
import type {
  Adjustments,
  EditHistory,
  EditState,
  Geometry,
  LocalAdjustments,
  Mask,
  MaskGeometry,
  Overlay,
  PresetAdjustments,
  Snapshot,
  SourceImageMeta,
  WarpOp,
} from '@/types';
import {
  addSnapshot as addSnapshotOp,
  canRedo as canRedoOp,
  canUndo as canUndoOp,
  createHistory,
  pushEdit,
  redo as redoOp,
  removeSnapshot as removeSnapshotOp,
  renameSnapshot as renameSnapshotOp,
  restoreSnapshot as restoreSnapshotOp,
  timeline as timelineOp,
  jumpTo as jumpToOp,
  undo as undoOp,
} from '@/features/history/model/history';
import { applyAdjustments, applyGeometry } from './apply';
import { ALL_GROUPS, pickAdjustments, type SettingsGroup } from './copy-settings';
import {
  createDefaultAdjustments,
  createDefaultGeometry,
} from '@/features/adjustments/model/defaults';
import {
  addMask as addMaskOp,
  invertMaskAdjustments as invertMaskAdjustmentsOp,
  removeMask as removeMaskOp,
  renameMask as renameMaskOp,
  reorderMask as reorderMaskOp,
  setMaskEnabled as setMaskEnabledOp,
  updateMaskAdjustments as updateMaskAdjustmentsOp,
  updateMaskGeometry as updateMaskGeometryOp,
} from '@/features/masks/model/mask-ops';
import type { OverlayPatch } from '@/features/overlays/model/overlay-ops';
import {
  addOverlay as addOverlayOp,
  moveOverlay as moveOverlayOp,
  removeOverlay as removeOverlayOp,
  reorderOverlay as reorderOverlayOp,
  updateOverlay as updateOverlayOp,
} from '@/features/overlays/model/overlay-ops';
import {
  addWarpOps as addWarpOpsOp,
  clearWarp as clearWarpOp,
  popWarpOp as popWarpOpOp,
} from '@/features/liquify/model/warp-field';

/** A live, uncommitted overlay for one mask while dragging/painting or moving a
 *  local-adjustment slider. Applied for rendering only; committed to history on
 *  release. */
export interface MaskPreview {
  readonly id: string;
  readonly geometry?: MaskGeometry;
  readonly adjustments?: LocalAdjustments;
}

/** A live, uncommitted overlay position while dragging a text overlay. */
export interface OverlayPreview {
  readonly id: string;
  readonly x: number;
  readonly y: number;
}

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
  /** Uncommitted live overlay for a single mask (geometry or local adjustments). */
  maskPreview: MaskPreview | null;
  /** Uncommitted live position for a text overlay being dragged. */
  overlayPreview: OverlayPreview | null;
  /** Uncommitted live liquify stroke ops applied for rendering only. */
  warpPreview: readonly WarpOp[] | null;
  /** Copied adjustments, held to paste onto another image ("copy settings"). */
  copiedAdjustments: Adjustments | null;

  loadImage: (image: SourceImageMeta, initial: EditState) => void;
  closeImage: () => void;

  setPreview: (patch: PresetAdjustments) => void;
  clearPreview: () => void;
  commitAdjustments: (patch: PresetAdjustments, label: string) => void;
  commitGeometry: (patch: Partial<Geometry>, label: string) => void;
  /** Copy the current image's adjustments to the clipboard. */
  copyAdjustments: () => void;
  /** Paste the copied adjustments (optionally only some groups) onto the image. */
  pasteAdjustments: (groups?: readonly SettingsGroup[]) => void;

  /* masks */
  setMaskPreview: (preview: MaskPreview) => void;
  clearMaskPreview: () => void;
  addMask: (mask: Mask, label: string) => void;
  commitMaskGeometry: (id: string, geometry: MaskGeometry, label: string) => void;
  commitMaskAdjustments: (id: string, patch: LocalAdjustments, label: string) => void;
  setMaskEnabled: (id: string, enabled: boolean, label: string) => void;
  renameMask: (id: string, name: string, label: string) => void;
  removeMask: (id: string, label: string) => void;
  reorderMask: (id: string, direction: 'up' | 'down', label: string) => void;
  invertMaskAdjustments: (id: string, label: string) => void;

  /* overlays */
  setOverlayPreview: (preview: OverlayPreview) => void;
  clearOverlayPreview: () => void;
  addOverlay: (overlay: Overlay, label: string) => void;
  updateOverlay: (
    id: string,
    patch: OverlayPatch,
    label: string,
  ) => void;
  commitOverlayMove: (id: string, x: number, y: number, label: string) => void;
  removeOverlay: (id: string, label: string) => void;
  reorderOverlay: (id: string, direction: 'up' | 'down', label: string) => void;

  /* liquify */
  setWarpPreview: (ops: readonly WarpOp[]) => void;
  clearWarpPreview: () => void;
  commitWarp: (ops: readonly WarpOp[], label: string) => void;
  popWarp: (label: string) => void;
  clearWarp: (label: string) => void;

  undo: () => void;
  redo: () => void;
  jumpToHistory: (entryId: string) => void;
  addSnapshot: (name: string) => void;
  removeSnapshot: (id: string) => void;
  renameSnapshot: (id: string, name: string) => void;
  restoreSnapshot: (id: string) => void;
  resetEdit: () => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  image: null,
  history: null,
  preview: null,
  maskPreview: null,
  overlayPreview: null,
  warpPreview: null,
  copiedAdjustments: null,

  loadImage: (image, initial) => {
    set({ image, history: createHistory(initial), preview: null, maskPreview: null, overlayPreview: null, warpPreview: null });
  },

  closeImage: () => {
    set({ image: null, history: null, preview: null, maskPreview: null, overlayPreview: null, warpPreview: null });
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

  copyAdjustments: () => {
    set((state) => {
      if (!state.history) return state;
      return { copiedAdjustments: state.history.present.state.adjustments };
    });
  },

  pasteAdjustments: (groups = ALL_GROUPS) => {
    set((state) => {
      if (!state.history || !state.copiedAdjustments) return state;
      const patch = pickAdjustments(state.copiedAdjustments, groups);
      const next = applyAdjustments(state.history.present.state, patch);
      return { history: pushEdit(state.history, 'Paste settings', next), preview: null };
    });
  },

  commitGeometry: (patch, label) => {
    set((state) => {
      if (!state.history) return state;
      const next = applyGeometry(state.history.present.state, patch);
      return { history: pushEdit(state.history, label, next) };
    });
  },

  /* ------------------------------- masks -------------------------------- */

  setMaskPreview: (maskPreview) => {
    set({ maskPreview });
  },
  clearMaskPreview: () => {
    set({ maskPreview: null });
  },
  addMask: (mask, label) => {
    set((state) => {
      if (!state.history) return state;
      const next = addMaskOp(state.history.present.state, mask);
      return { history: pushEdit(state.history, label, next), maskPreview: null };
    });
  },
  commitMaskGeometry: (id, geometry, label) => {
    set((state) => {
      if (!state.history) return state;
      const next = updateMaskGeometryOp(state.history.present.state, id, geometry);
      return { history: pushEdit(state.history, label, next), maskPreview: null };
    });
  },
  commitMaskAdjustments: (id, patch, label) => {
    set((state) => {
      if (!state.history) return state;
      const next = updateMaskAdjustmentsOp(state.history.present.state, id, patch);
      return { history: pushEdit(state.history, label, next), maskPreview: null };
    });
  },
  setMaskEnabled: (id, enabled, label) => {
    set((state) => {
      if (!state.history) return state;
      const next = setMaskEnabledOp(state.history.present.state, id, enabled);
      return { history: pushEdit(state.history, label, next) };
    });
  },
  renameMask: (id, name, label) => {
    set((state) => {
      if (!state.history) return state;
      const next = renameMaskOp(state.history.present.state, id, name);
      return { history: pushEdit(state.history, label, next) };
    });
  },
  removeMask: (id, label) => {
    set((state) => {
      if (!state.history) return state;
      const next = removeMaskOp(state.history.present.state, id);
      return { history: pushEdit(state.history, label, next), maskPreview: null };
    });
  },
  reorderMask: (id, direction, label) => {
    set((state) => {
      if (!state.history) return state;
      const next = reorderMaskOp(state.history.present.state, id, direction);
      return { history: pushEdit(state.history, label, next) };
    });
  },
  invertMaskAdjustments: (id, label) => {
    set((state) => {
      if (!state.history) return state;
      const next = invertMaskAdjustmentsOp(state.history.present.state, id);
      return { history: pushEdit(state.history, label, next), maskPreview: null };
    });
  },

  /* ------------------------------ overlays ------------------------------ */

  setOverlayPreview: (overlayPreview) => {
    set({ overlayPreview });
  },
  clearOverlayPreview: () => {
    set({ overlayPreview: null });
  },
  addOverlay: (overlay, label) => {
    set((state) => {
      if (!state.history) return state;
      const next = addOverlayOp(state.history.present.state, overlay);
      return { history: pushEdit(state.history, label, next), overlayPreview: null };
    });
  },
  updateOverlay: (id, patch, label) => {
    set((state) => {
      if (!state.history) return state;
      const next = updateOverlayOp(state.history.present.state, id, patch);
      return { history: pushEdit(state.history, label, next) };
    });
  },
  commitOverlayMove: (id, x, y, label) => {
    set((state) => {
      if (!state.history) return state;
      const next = moveOverlayOp(state.history.present.state, id, x, y);
      return { history: pushEdit(state.history, label, next), overlayPreview: null };
    });
  },
  removeOverlay: (id, label) => {
    set((state) => {
      if (!state.history) return state;
      const next = removeOverlayOp(state.history.present.state, id);
      return { history: pushEdit(state.history, label, next), overlayPreview: null };
    });
  },
  reorderOverlay: (id, direction, label) => {
    set((state) => {
      if (!state.history) return state;
      const next = reorderOverlayOp(state.history.present.state, id, direction);
      return { history: pushEdit(state.history, label, next) };
    });
  },

  /* ------------------------------ liquify ------------------------------ */

  setWarpPreview: (warpPreview) => {
    set({ warpPreview });
  },
  clearWarpPreview: () => {
    set({ warpPreview: null });
  },
  commitWarp: (ops, label) => {
    set((state) => {
      if (!state.history || ops.length === 0) return { warpPreview: null };
      const next = addWarpOpsOp(state.history.present.state, ops);
      return { history: pushEdit(state.history, label, next), warpPreview: null };
    });
  },
  popWarp: (label) => {
    set((state) => {
      if (!state.history) return state;
      const next = popWarpOpOp(state.history.present.state);
      return { history: pushEdit(state.history, label, next) };
    });
  },
  clearWarp: (label) => {
    set((state) => {
      if (!state.history) return state;
      const next = clearWarpOp(state.history.present.state);
      return { history: pushEdit(state.history, label, next), warpPreview: null };
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
  renameSnapshot: (id, name) => {
    set((state) => (state.history ? { history: renameSnapshotOp(state.history, id, name) } : state));
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
  const withPreview = state.preview ? applyAdjustments(present, state.preview) : present;
  const withMask = state.maskPreview ? applyMaskPreview(withPreview, state.maskPreview) : withPreview;
  const withOverlay = state.overlayPreview ? applyOverlayPreview(withMask, state.overlayPreview) : withMask;
  return state.warpPreview ? applyWarpPreview(withOverlay, state.warpPreview) : withOverlay;
}

/** Append live liquify stroke ops for rendering only (no history). */
export function applyWarpPreview(state: EditState, ops: readonly WarpOp[]): EditState {
  if (ops.length === 0) return state;
  return { ...state, warp: [...state.warp, ...ops] };
}

/** Overlay a live drag position onto the matching text overlay, no history. */
export function applyOverlayPreview(state: EditState, preview: OverlayPreview): EditState {
  let changed = false;
  const overlays = state.overlays.map((o) => {
    if (o.id !== preview.id) return o;
    changed = true;
    return { ...o, x: preview.x, y: preview.y };
  });
  return changed ? { ...state, overlays } : state;
}

/** Overlay a live mask preview (geometry and/or local adjustments) onto the
 *  matching mask, without touching history. */
export function applyMaskPreview(state: EditState, preview: MaskPreview): EditState {
  let changed = false;
  const masks = state.masks.map((m) => {
    if (m.id !== preview.id) return m;
    changed = true;
    return {
      ...m,
      ...(preview.geometry ? { geometry: preview.geometry } : {}),
      ...(preview.adjustments
        ? { adjustments: { ...m.adjustments, ...preview.adjustments } }
        : {}),
    };
  });
  return changed ? { ...state, masks } : state;
}

/** Memoized version of {@link selectRenderEdit} safe to use in components. */
export function useRenderEdit(): EditState | null {
  const present = useEditorStore((s) => s.history?.present.state ?? null);
  const preview = useEditorStore((s) => s.preview);
  const maskPreview = useEditorStore((s) => s.maskPreview);
  const overlayPreview = useEditorStore((s) => s.overlayPreview);
  const warpPreview = useEditorStore((s) => s.warpPreview);
  return useMemo(() => {
    if (!present) return null;
    const withPreview = preview ? applyAdjustments(present, preview) : present;
    const withMask = maskPreview ? applyMaskPreview(withPreview, maskPreview) : withPreview;
    const withOverlay = overlayPreview ? applyOverlayPreview(withMask, overlayPreview) : withMask;
    return warpPreview ? applyWarpPreview(withOverlay, warpPreview) : withOverlay;
  }, [present, preview, maskPreview, overlayPreview, warpPreview]);
}

/** The text overlay currently selected for editing, with any live drag applied. */
export function useActiveOverlay(activeOverlayId: string | null): Overlay | null {
  const present = useEditorStore((s) => s.history?.present.state ?? null);
  const overlayPreview = useEditorStore((s) => s.overlayPreview);
  return useMemo(() => {
    if (!present || !activeOverlayId) return null;
    const base = present.overlays.find((o) => o.id === activeOverlayId) ?? null;
    if (!base) return null;
    if (overlayPreview && overlayPreview.id === activeOverlayId) {
      return { ...base, x: overlayPreview.x, y: overlayPreview.y };
    }
    return base;
  }, [present, activeOverlayId, overlayPreview]);
}

/** The mask currently selected for editing, resolved against present state. */
export function useActiveMask(activeMaskId: string | null): Mask | null {
  const present = useEditorStore((s) => s.history?.present.state ?? null);
  const maskPreview = useEditorStore((s) => s.maskPreview);
  return useMemo(() => {
    if (!present || !activeMaskId) return null;
    const base = present.masks.find((m) => m.id === activeMaskId) ?? null;
    if (!base) return null;
    if (maskPreview && maskPreview.id === activeMaskId) {
      return {
        ...base,
        ...(maskPreview.geometry ? { geometry: maskPreview.geometry } : {}),
        ...(maskPreview.adjustments
          ? { adjustments: { ...base.adjustments, ...maskPreview.adjustments } }
          : {}),
      };
    }
    return base;
  }, [present, activeMaskId, maskPreview]);
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
