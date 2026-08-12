import type { EditState, Preset, Snapshot } from '@/types';
import { getDb } from './db';
import {
  type PersistedEdit,
  migrateEdit,
  migratePreset,
  serializeEdit,
} from './serialize';

/**
 * Thin async wrapper over the Dexie tables. All validation/migration happens in
 * `serialize.ts`; this file only does storage I/O and stays defensive so a
 * corrupt store never crashes the app.
 */

export async function loadUserPresets(): Promise<Preset[]> {
  try {
    const rows = await getDb().presets.toArray();
    return rows.map(migratePreset).filter((p): p is Preset => p !== null);
  } catch {
    return [];
  }
}

export async function saveUserPresets(presets: readonly Preset[]): Promise<void> {
  try {
    const db = getDb();
    await db.transaction('rw', db.presets, async () => {
      await db.presets.clear();
      await db.presets.bulkPut(presets.filter((p) => !p.builtin));
    });
  } catch {
    // storage unavailable; ignore
  }
}

export async function loadEdit(sourceKey: string): Promise<PersistedEdit | null> {
  try {
    const row = await getDb().edits.get(sourceKey);
    return row ? migrateEdit(row) : null;
  } catch {
    return null;
  }
}

export async function saveEdit(
  sourceKey: string,
  editState: EditState,
  snapshots: readonly Snapshot[],
): Promise<void> {
  try {
    await getDb().edits.put(serializeEdit(sourceKey, editState, snapshots));
  } catch {
    // ignore
  }
}

export async function loadSetting<T>(key: string, fallback: T): Promise<T> {
  try {
    const row = await getDb().settings.get(key);
    return row ? (row.value as T) : fallback;
  } catch {
    return fallback;
  }
}

export async function saveSetting(key: string, value: unknown): Promise<void> {
  try {
    await getDb().settings.put({ key, value });
  } catch {
    // ignore
  }
}
