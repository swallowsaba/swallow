import type { EditHistory, EditState, HistoryEntry, Snapshot } from '@/types';
import { createId } from '@/utils';

/**
 * Pure, immutable history operations. Every function returns a new
 * {@link EditHistory} and never mutates its input, which makes them safe to use
 * directly inside a Zustand store and trivial to unit test.
 */

/** Upper bound on undo depth. Entries are tiny, but memory is still bounded. */
export const MAX_HISTORY = 200;

function entry(label: string, state: EditState): HistoryEntry {
  return { id: createId('h'), label, at: Date.now(), state };
}

/** Start a history from the initial edit state. */
export function createHistory(initial: EditState): EditHistory {
  return {
    past: [],
    present: entry('Import', initial),
    future: [],
    snapshots: [],
  };
}

/**
 * Record a new edit. The current state moves into the past, the new state
 * becomes present, and any redo future is discarded (standard undo semantics).
 */
export function pushEdit(history: EditHistory, label: string, next: EditState): EditHistory {
  const past = [...history.past, history.present];
  const trimmed = past.length > MAX_HISTORY ? past.slice(past.length - MAX_HISTORY) : past;
  return {
    past: trimmed,
    present: entry(label, next),
    future: [],
    snapshots: history.snapshots,
  };
}

export function canUndo(history: EditHistory): boolean {
  return history.past.length > 0;
}

export function canRedo(history: EditHistory): boolean {
  return history.future.length > 0;
}

export function undo(history: EditHistory): EditHistory {
  if (!canUndo(history)) return history;
  const previous = history.past[history.past.length - 1];
  if (previous === undefined) return history;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
    snapshots: history.snapshots,
  };
}

export function redo(history: EditHistory): EditHistory {
  if (!canRedo(history)) return history;
  const [nextEntry, ...rest] = history.future;
  if (nextEntry === undefined) return history;
  return {
    past: [...history.past, history.present],
    present: nextEntry,
    future: rest,
    snapshots: history.snapshots,
  };
}

/** Jump the present to an arbitrary entry anywhere in the timeline. */
export function jumpTo(history: EditHistory, entryId: string): EditHistory {
  const all = [...history.past, history.present, ...history.future];
  const index = all.findIndex((entry) => entry.id === entryId);
  if (index < 0) return history;
  const present = all[index];
  if (present === undefined) return history;
  return {
    past: all.slice(0, index),
    present,
    future: all.slice(index + 1),
    snapshots: history.snapshots,
  };
}

/** All timeline entries in order (past → present → future). */
export function timeline(history: EditHistory): readonly HistoryEntry[] {
  return [...history.past, history.present, ...history.future];
}
export function addSnapshot(history: EditHistory, name: string): EditHistory {
  const snapshot: Snapshot = {
    id: createId('s'),
    name,
    at: Date.now(),
    state: history.present.state,
  };
  return { ...history, snapshots: [...history.snapshots, snapshot] };
}

export function removeSnapshot(history: EditHistory, snapshotId: string): EditHistory {
  return { ...history, snapshots: history.snapshots.filter((s) => s.id !== snapshotId) };
}

/** Jump the current edit to a saved snapshot, pushing the jump onto the stack. */
export function restoreSnapshot(history: EditHistory, snapshotId: string): EditHistory {
  const snapshot = history.snapshots.find((s) => s.id === snapshotId);
  if (snapshot === undefined) return history;
  return pushEdit(history, `Restore "${snapshot.name}"`, snapshot.state);
}
