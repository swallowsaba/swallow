import type { EditState } from './edit-state';

/**
 * Undo/redo and snapshots.
 *
 * Because an {@link EditState} is just parameters (a few kilobytes at most),
 * we store a full snapshot per history entry rather than computing diffs. This
 * keeps undo/redo trivially correct and memory cost negligible.
 */

export interface HistoryEntry {
  readonly id: string;
  /** Human-readable label, e.g. "Exposure +0.5". */
  readonly label: string;
  readonly at: number;
  readonly state: EditState;
}

/** A named, user-created checkpoint that is independent of the undo stack. */
export interface Snapshot {
  readonly id: string;
  readonly name: string;
  readonly at: number;
  readonly state: EditState;
}

/**
 * Zipper-style history: everything before the current edit, the current edit,
 * and everything that was undone (available to redo), plus saved snapshots.
 */
export interface EditHistory {
  readonly past: readonly HistoryEntry[];
  readonly present: HistoryEntry;
  readonly future: readonly HistoryEntry[];
  readonly snapshots: readonly Snapshot[];
}
