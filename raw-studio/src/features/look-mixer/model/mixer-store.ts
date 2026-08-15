import { create } from 'zustand';
import type { LookRef } from './look-source';

/**
 * Transient UI state for the Look Mixer — which looks sit at the endpoints and
 * where the blend puck is. Not part of edit history; only the final "Apply"
 * writes to history (as a normal adjustment commit).
 */

export type MixMode = '1d' | '2d';

/** Corner slots for 2D mode: [topLeft, topRight, bottomLeft, bottomRight]. */
export type CornerSlot = 0 | 1 | 2 | 3;

export interface MixerState {
  mode: MixMode;
  /** 1D endpoints. */
  a: LookRef;
  b: LookRef;
  /** 1D blend position, 0 = a, 1 = b. */
  t: number;
  /** 2D corners; null = empty slot (contributes nothing). */
  corners: readonly [LookRef | null, LookRef | null, LookRef | null, LookRef | null];
  /** 2D puck position in the unit square. */
  padX: number;
  padY: number;

  setMode: (mode: MixMode) => void;
  setA: (ref: LookRef) => void;
  setB: (ref: LookRef) => void;
  setT: (t: number) => void;
  setCorner: (slot: CornerSlot, ref: LookRef | null) => void;
  setPad: (x: number, y: number) => void;
  /** Collapse controls to a no-op blend that equals the current edit — used
   *  after Apply so committing doesn't make the live preview jump. */
  settleToCurrent: () => void;
  reset: () => void;
}

const INITIAL = {
  mode: '1d' as MixMode,
  a: { kind: 'current' } as LookRef,
  b: { kind: 'neutral' } as LookRef,
  t: 0.5,
  corners: [{ kind: 'current' }, null, null, null] as MixerState['corners'],
  padX: 0,
  padY: 0,
};

export const useMixerStore = create<MixerState>((set) => ({
  ...INITIAL,

  setMode: (mode) => {
    set({ mode });
  },
  setA: (a) => {
    set({ a });
  },
  setB: (b) => {
    set({ b });
  },
  setT: (t) => {
    set({ t: t < 0 ? 0 : t > 1 ? 1 : t });
  },
  setCorner: (slot, ref) => {
    set((s) => {
      const next = [...s.corners] as [
        LookRef | null,
        LookRef | null,
        LookRef | null,
        LookRef | null,
      ];
      next[slot] = ref;
      return { corners: next };
    });
  },
  setPad: (padX, padY) => {
    set({
      padX: padX < 0 ? 0 : padX > 1 ? 1 : padX,
      padY: padY < 0 ? 0 : padY > 1 ? 1 : padY,
    });
  },
  settleToCurrent: () => {
    // In 1D this makes blend = a = current (t=0); in 2D the puck at the top-left
    // corner (weights [1,0,0,0]) with corner 0 = current does the same. Either
    // way the resulting blend equals the current edit, so applying is seamless.
    set({
      a: { kind: 'current' },
      t: 0,
      corners: [{ kind: 'current' }, null, null, null],
      padX: 0,
      padY: 0,
    });
  },
  reset: () => {
    set({ ...INITIAL });
  },
}));
