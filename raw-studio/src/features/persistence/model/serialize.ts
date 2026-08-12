import type { EditState, Preset, Snapshot } from '@/types';

/**
 * Pure (de)serialization and migration for persisted records. IndexedDB itself
 * can't run in the build sandbox, so all the fallible logic — validating
 * untrusted stored data and migrating old schema versions — lives here where it
 * is unit-tested. The repository layer only does I/O.
 */

export const SCHEMA_VERSION = 1;

export interface PersistedEdit {
  /** Stable key derived from file identity (name:size:lastModified). */
  sourceKey: string;
  version: number;
  editState: EditState;
  snapshots: readonly Snapshot[];
  updatedAt: number;
}

export interface PersistedSettings {
  version: number;
  values: Record<string, unknown>;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** Build a stable persistence key from a file's identity. */
export function sourceKeyForFile(file: {
  name: string;
  size: number;
  lastModified: number;
}): string {
  return `${file.name}:${String(file.size)}:${String(file.lastModified)}`;
}

export function serializeEdit(
  sourceKey: string,
  editState: EditState,
  snapshots: readonly Snapshot[],
): PersistedEdit {
  return {
    sourceKey,
    version: SCHEMA_VERSION,
    editState,
    snapshots,
    updatedAt: Date.now(),
  };
}

/**
 * Validate + migrate a stored edit record into the current shape, or null if it
 * is unusable. Future schema bumps add cases here.
 */
export function migrateEdit(raw: unknown): PersistedEdit | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.sourceKey !== 'string') return null;
  if (!isRecord(raw.editState)) return null;

  // v0 -> v1: records without a snapshots array get an empty one.
  const snapshots = Array.isArray(raw.snapshots) ? (raw.snapshots as Snapshot[]) : [];

  return {
    sourceKey: raw.sourceKey,
    version: SCHEMA_VERSION,
    editState: raw.editState as unknown as EditState,
    snapshots,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now(),
  };
}

/** Validate a stored preset record; returns a user-owned preset or null. */
export function migratePreset(raw: unknown): Preset | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.id !== 'string' || typeof raw.name !== 'string') return null;
  if (!isRecord(raw.adjustments)) return null;
  return {
    id: raw.id,
    name: raw.name,
    category: (typeof raw.category === 'string' ? raw.category : 'user') as Preset['category'],
    favorite: raw.favorite === true,
    builtin: false,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now(),
    adjustments: raw.adjustments as Preset['adjustments'],
  };
}
