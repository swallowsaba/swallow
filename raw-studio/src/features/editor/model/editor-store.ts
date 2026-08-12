import { create } from 'zustand';
import type {
  EditHistory,
  EditState,
  Geometry,
  PresetAdjustments,
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
    ...(patch.detail ? { detail: { ...base.detail, ...patch.detail } } : {}),
    ...(patch.lens ? { lens: { ...base.lens, ...patch.lens } } : {}),
    ...(patch.hsl ? { hsl: { ...base.hsl, ...patch.hsl } } : {}),
    ...(patch.colorGrading
      ? { colorGrading: { ...base.colorGrading, ...patch.colorGrading } }
      : {}),
  };
}

/* ----------------------------- selectors ------------------------------ */

/** The edit state to render: present state with the live preview overlaid. */
export function selectRenderEdit(state: EditorState): EditState | null {
  const present = state.history?.present.state ?? null;
  if (!present) return null;
  return state.preview ? applyAdjustments(present, state.preview) : present;
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

export function selectHistoryLabels(state: EditorState): readonly string[] {
  if (!state.history) return [];
  return [...state.history.past, state.history.present].map((entry) => entry.label);
}

export interface HistoryRow {
  id: string;
  label: string;
  active: boolean;
}

export function selectHistoryRows(state: EditorState): readonly HistoryRow[] {
  if (!state.history) return [];
  const presentId = state.history.present.id;
  return timelineOp(state.history).map((entry) => ({
    id: entry.id,
    label: entry.label,
    active: entry.id === presentId,
  }));
}

export function selectSnapshots(state: EditorState) {
  return state.history?.snapshots ?? [];
}
