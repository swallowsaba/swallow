import { create } from 'zustand';

/**
 * Transient UI state for the text/overlay editor — which overlay is selected
 * and whether the on-canvas editing layer is active. Not part of edit history
 * (the overlays themselves live in EditState).
 */

export interface OverlayUiState {
  overlayMode: boolean;
  activeOverlayId: string | null;

  setOverlayMode: (on: boolean) => void;
  setActiveOverlay: (id: string | null) => void;
  editOverlay: (id: string) => void;
  exit: () => void;
}

export const useOverlayUiStore = create<OverlayUiState>((set) => ({
  overlayMode: false,
  activeOverlayId: null,

  setOverlayMode: (overlayMode) => {
    set({ overlayMode });
  },
  setActiveOverlay: (activeOverlayId) => {
    set({ activeOverlayId });
  },
  editOverlay: (id) => {
    set({ overlayMode: true, activeOverlayId: id });
  },
  exit: () => {
    set({ overlayMode: false, activeOverlayId: null });
  },
}));
