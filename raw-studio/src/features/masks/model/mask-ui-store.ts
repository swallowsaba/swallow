import { create } from 'zustand';

/**
 * Transient UI state for mask editing — deliberately NOT part of the undoable
 * edit history (which mask is selected or whether the eraser is active are not
 * things you "undo"). The masks themselves live in EditState/history; this only
 * tracks what the overlay is doing right now.
 */

export type BrushTool = 'paint' | 'erase';

export interface MaskUiState {
  /** Whether the on-canvas mask overlay is active. */
  maskMode: boolean;
  /** The mask currently being edited, or null. */
  activeMaskId: string | null;
  /** Brush vs eraser, for brush masks. */
  brushTool: BrushTool;

  setMaskMode: (on: boolean) => void;
  setActiveMask: (id: string | null) => void;
  setBrushTool: (tool: BrushTool) => void;
  /** Enter mask mode focused on a specific mask (used when adding/selecting). */
  editMask: (id: string) => void;
  /** Leave mask mode and clear selection. */
  exit: () => void;
}

export const useMaskUiStore = create<MaskUiState>((set) => ({
  maskMode: false,
  activeMaskId: null,
  brushTool: 'paint',

  setMaskMode: (maskMode) => {
    set({ maskMode });
  },
  setActiveMask: (activeMaskId) => {
    set({ activeMaskId });
  },
  setBrushTool: (brushTool) => {
    set({ brushTool });
  },
  editMask: (id) => {
    set({ maskMode: true, activeMaskId: id });
  },
  exit: () => {
    set({ maskMode: false, activeMaskId: null });
  },
}));
