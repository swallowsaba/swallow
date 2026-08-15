import { create } from 'zustand';
import type { WarpTool } from '@/types';
import {
  moveLandmark,
  type FaceLandmarks,
  type LandmarkPoint,
} from './face-reshape';

/**
 * Transient UI state for the liquify tool. The warp ops themselves live in
 * EditState (undoable/persisted); this only tracks the active brush.
 */
export interface LiquifyUiState {
  liquifyMode: boolean;
  /** Face-reshape view: fit-locks and enables warp preview, but no brush. */
  faceMode: boolean;
  /** Editable face landmarks shared between the panel and the handle layer. */
  faceLandmarks: FaceLandmarks | null;
  tool: WarpTool;
  /** Brush radius as a fraction of the shorter edge (0..1). */
  size: number;
  /** Brush strength 0..1. */
  strength: number;

  setLiquifyMode: (on: boolean) => void;
  setFaceMode: (on: boolean) => void;
  setFaceLandmarks: (lm: FaceLandmarks | null) => void;
  moveFaceLandmark: (id: LandmarkPoint, x: number, y: number) => void;
  setTool: (tool: WarpTool) => void;
  setSize: (size: number) => void;
  setStrength: (strength: number) => void;
}

export const useLiquifyUiStore = create<LiquifyUiState>((set) => ({
  liquifyMode: false,
  faceMode: false,
  faceLandmarks: null,
  tool: 'push',
  size: 0.18,
  strength: 0.5,

  setLiquifyMode: (liquifyMode) => {
    set({ liquifyMode });
  },
  setFaceMode: (faceMode) => {
    set({ faceMode });
  },
  setFaceLandmarks: (faceLandmarks) => {
    set({ faceLandmarks });
  },
  moveFaceLandmark: (id, x, y) => {
    set((s) => (s.faceLandmarks ? { faceLandmarks: moveLandmark(s.faceLandmarks, id, x, y) } : s));
  },
  setTool: (tool) => {
    set({ tool });
  },
  setSize: (size) => {
    set({ size: size < 0.02 ? 0.02 : size > 0.6 ? 0.6 : size });
  },
  setStrength: (strength) => {
    set({ strength: strength < 0 ? 0 : strength > 1 ? 1 : strength });
  },
}));
