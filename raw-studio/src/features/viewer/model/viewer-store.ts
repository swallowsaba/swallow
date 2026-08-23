import { create } from 'zustand';
import type { FitMode, Point, Size } from './viewport';
import { clampScale } from './viewport';

/**
 * View state for the center stage: which image bitmap is shown and how it is
 * framed (fit/fill/custom scale, pan offset, rotation). Actual fit/fill scale is
 * computed in the canvas component from the measured container; this store holds
 * the user's *intent*.
 */
export interface ViewerState {
  bitmap: ImageBitmap | null;
  imageSize: Size | null;

  mode: FitMode;
  /** Scale used when mode === 'custom'. */
  scale: number;
  offset: Point;
  rotationDeg: number;
  showBefore: boolean;
  showClipping: boolean;
  /** Before/after split compare: null = off, else divider position 0..1. */
  compareSplit: number | null;
  /** Whether the crop overlay is active (shows the full uncropped image). */
  cropMode: boolean;
  /** Whether the Remove Object brush overlay is active. */
  removeMode: boolean;
  /** Whether the white-balance eyedropper (click-to-neutralize) is active. */
  wbPickMode: boolean;

  loadBitmap: (bitmap: ImageBitmap, size: Size) => void;
  clearBitmap: () => void;

  setMode: (mode: FitMode) => void;
  setCustomScale: (scale: number) => void;
  setOffset: (offset: Point) => void;
  rotateCw: () => void;
  resetView: () => void;
  setShowBefore: (value: boolean) => void;
  setShowClipping: (value: boolean) => void;
  setCompareSplit: (value: number | null) => void;
  setCropMode: (value: boolean) => void;
  setRemoveMode: (value: boolean) => void;
  setWbPickMode: (value: boolean) => void;
}

const INITIAL = {
  mode: 'fit' as FitMode,
  scale: 1,
  offset: { x: 0, y: 0 } as Point,
  rotationDeg: 0,
  showBefore: false,
  showClipping: false,
  compareSplit: null,
  cropMode: false,
  removeMode: false,
  wbPickMode: false,
};

export const useViewerStore = create<ViewerState>((set) => ({
  bitmap: null,
  imageSize: null,
  ...INITIAL,

  loadBitmap: (bitmap, size) => {
    set({ bitmap, imageSize: size, ...INITIAL });
  },
  clearBitmap: () => {
    set({ bitmap: null, imageSize: null, ...INITIAL });
  },
  setMode: (mode) => {
    set({ mode });
  },
  setCustomScale: (scale) => {
    set({ mode: 'custom', scale: clampScale(scale) });
  },
  setOffset: (offset) => {
    set({ offset });
  },
  rotateCw: () => {
    set((s) => ({ rotationDeg: (s.rotationDeg + 90) % 360, offset: { x: 0, y: 0 } }));
  },
  resetView: () => {
    set({ ...INITIAL });
  },
  setShowBefore: (showBefore) => {
    set({ showBefore });
  },
  setShowClipping: (showClipping) => {
    set({ showClipping });
  },
  setCompareSplit: (compareSplit) => {
    set({ compareSplit });
  },
  setCropMode: (cropMode) => {
    set({ cropMode });
  },
  setRemoveMode: (removeMode) => {
    set({ removeMode });
  },
  setWbPickMode: (wbPickMode) => {
    set({ wbPickMode });
  },
}));
