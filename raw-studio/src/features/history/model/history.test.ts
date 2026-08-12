import { describe, expect, it } from 'vitest';
import { createDefaultEditState } from '@/features/adjustments/model/defaults';
import {
  addSnapshot,
  canRedo,
  canUndo,
  createHistory,
  MAX_HISTORY,
  pushEdit,
  redo,
  restoreSnapshot,
  undo,
} from './history';

function stateAt(exposure: number) {
  const base = createDefaultEditState('img-1', 0);
  return {
    ...base,
    adjustments: { ...base.adjustments, basic: { ...base.adjustments.basic, exposure } },
  };
}

describe('history', () => {
  it('starts with no undo/redo available', () => {
    const h = createHistory(stateAt(0));
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
    expect(h.present.label).toBe('Import');
  });

  it('pushes edits and undoes/redoes them', () => {
    let h = createHistory(stateAt(0));
    h = pushEdit(h, 'Exposure +1', stateAt(1));
    h = pushEdit(h, 'Exposure +2', stateAt(2));

    expect(h.present.state.adjustments.basic.exposure).toBe(2);
    expect(canUndo(h)).toBe(true);

    h = undo(h);
    expect(h.present.state.adjustments.basic.exposure).toBe(1);
    expect(canRedo(h)).toBe(true);

    h = redo(h);
    expect(h.present.state.adjustments.basic.exposure).toBe(2);
  });

  it('discards the redo future when a new edit is pushed after undo', () => {
    let h = createHistory(stateAt(0));
    h = pushEdit(h, 'a', stateAt(1));
    h = undo(h);
    h = pushEdit(h, 'b', stateAt(5));
    expect(canRedo(h)).toBe(false);
    expect(h.present.state.adjustments.basic.exposure).toBe(5);
  });

  it('does not mutate the input history (immutability)', () => {
    const h = createHistory(stateAt(0));
    const next = pushEdit(h, 'a', stateAt(1));
    expect(h.past.length).toBe(0);
    expect(next).not.toBe(h);
  });

  it('bounds the past to MAX_HISTORY entries', () => {
    let h = createHistory(stateAt(0));
    for (let i = 1; i <= MAX_HISTORY + 50; i++) {
      h = pushEdit(h, `edit ${String(i)}`, stateAt(i));
    }
    expect(h.past.length).toBe(MAX_HISTORY);
    expect(h.present.state.adjustments.basic.exposure).toBe(MAX_HISTORY + 50);
  });

  it('creates and restores snapshots', () => {
    let h = createHistory(stateAt(3));
    h = addSnapshot(h, 'My look');
    expect(h.snapshots.length).toBe(1);

    h = pushEdit(h, 'Exposure 9', stateAt(9));
    const snapId = h.snapshots[0]?.id ?? '';
    h = restoreSnapshot(h, snapId);
    expect(h.present.state.adjustments.basic.exposure).toBe(3);
  });
});
