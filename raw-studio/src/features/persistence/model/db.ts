import Dexie, { type Table } from 'dexie';
import type { Preset } from '@/types';
import type { PersistedEdit } from './serialize';

interface SettingRow {
  key: string;
  value: unknown;
}

/** The single IndexedDB database for RAW Studio (via Dexie). */
export class RawStudioDb extends Dexie {
  edits!: Table<PersistedEdit, string>;
  presets!: Table<Preset, string>;
  settings!: Table<SettingRow, string>;

  constructor() {
    super('raw-studio');
    this.version(1).stores({
      edits: 'sourceKey, updatedAt',
      presets: 'id, category, updatedAt',
      settings: 'key',
    });
  }
}

let dbInstance: RawStudioDb | null = null;

export function getDb(): RawStudioDb {
  dbInstance ??= new RawStudioDb();
  return dbInstance;
}
