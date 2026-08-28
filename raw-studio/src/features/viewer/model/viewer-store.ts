import { create } from 'zustand';
import type { FitMode, Point, Size } from './viewport';
import { clampScale } from './viewport';

/**
 * View state for the center stage: which image bitmap is shown and how it is
 * framed (fit/fill/custom scale, pan offset, rotation). Actual fit/fill scale is
 * computed in the canvas component from the measured container; this store holds
 * the user's *intent*.
 */
/** Commands the right-panel remove controls fire for the overlay to execute. */
export type RemoveCommand = 'remove' | 'redo' | 'autoDetect' | 'clear';

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
  /** Remove-mode: brush size as % of the image's long edge. */
  removeBrushPct: number;
  /** Remove-mode: 'manual' (paint) or 'auto' (detect thin lines, then editable). */
  removeSubMode: 'manual' | 'auto';
  /** Remove-mode: whether the mask has any paint (drives Remove button enabled). */
  removeHasPaint: boolean;
  /** Remove-mode: busy running inpaint/detection. */
  removeBusy: boolean;
  /** Remove-mode: status line shown in the right panel. */
  removeStatus: string | null;
  /** Remove-mode: whether a preview result is showing. */
  removeHasPreview: boolean;
  /** Remove-mode: monotonically-increasing command trigger. The overlay watches
   *  this and runs the named command once. Lets the right-panel buttons drive
   *  the canvas that lives in the overlay. */
  removeCommand: { readonly id: number; readonly name: RemoveCommand } | null;
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
  setRemoveBrushPct: (value: number) => void;
  setRemoveSubMode: (value: 'manual' | 'auto') => void;
  setRemoveHasPaint: (value: boolean) => void;
  setRemoveBusy: (value: boolean) => void;
  setRemoveStatus: (value: string | null) => void;
  setRemoveHasPreview: (value: boolean) => void;
  /** Fire a command for the overlay to execute (remove/redo/auto-detect/clear). */
  dispatchRemoveCommand: (name: RemoveCommand) => void;
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
  removeBrushPct: 4,
  removeSubMode: 'manual' as 'manual' | 'auto',
  removeHasPaint: false,
  removeBusy: false,
  removeStatus: null as string | null,
  removeHasPreview: false,
  removeCommand: null as { readonly id: number; readonly name: RemoveCommand } | null,
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
    // Reset transient remove state whenever we enter/leave the mode.
    set({
      removeMode,
      removeHasPaint: false,
      removeBusy: false,
      removeStatus: null,
      removeHasPreview: false,
      removeCommand: null,
      removeSubMode: 'manual',
    });
  },
  setRemoveBrushPct: (removeBrushPct) => {
    set({ removeBrushPct });
  },
  setRemoveSubMode: (removeSubMode) => {
    set({ removeSubMode });
  },
  setRemoveHasPaint: (removeHasPaint) => {
    set({ removeHasPaint });
  },
  setRemoveBusy: (removeBusy) => {
    set({ removeBusy });
  },
  setRemoveStatus: (removeStatus) => {
    set({ removeStatus });
  },
  setRemoveHasPreview: (removeHasPreview) => {
    set({ removeHasPreview });
  },
  dispatchRemoveCommand: (name) => {
    set((s) => ({
      removeCommand: { id: (s.removeCommand?.id ?? 0) + 1, name },
    }));
  },
  setWbPickMode: (wbPickMode) => {
    set({ wbPickMode });
  },
}));
