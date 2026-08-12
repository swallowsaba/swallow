import { describe, expect, it } from 'vitest';
import {
  migrateEdit,
  migratePreset,
  serializeEdit,
  sourceKeyForFile,
} from './serialize';
import { createDefaultEditState } from '@/features/adjustments/model/defaults';

describe('persistence serialize', () => {
  it('builds a stable source key', () => {
    expect(sourceKeyForFile({ name: 'a.arw', size: 100, lastModified: 5 })).toBe('a.arw:100:5');
  });

  it('round-trips an edit record', () => {
    const edit = createDefaultEditState('img', 1);
    const rec = serializeEdit('key', edit, []);
    const back = migrateEdit(rec);
    expect(back).toBeTruthy();
    expect(back?.sourceKey).toBe('key');
    expect(back?.editState.imageId).toBe('img');
  });

  it('migrates v0 edit records (no snapshots) to empty snapshots', () => {
    const back = migrateEdit({ sourceKey: 'k', editState: { imageId: 'i' } });
    expect(back?.snapshots.length).toBe(0);
  });

  it('rejects invalid records', () => {
    expect(migrateEdit(null)).toBeNull();
    expect(migrateEdit({})).toBeNull();
    expect(migratePreset({ id: 'x' })).toBeNull();
  });

  it('forces imported presets to be non-built-in', () => {
    const p = migratePreset({ id: 'x', name: 'N', builtin: true, adjustments: { basic: {} } });
    expect(p?.builtin).toBe(false);
  });
});
