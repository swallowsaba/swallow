import { describe, expect, it } from 'vitest';
import { applyPresetToEdit } from './preset-apply';
import { parsePresets, serializePresets } from './preset-io';
import { BUILTIN_PRESETS } from './builtin-presets';
import { createDefaultEditState } from '@/features/adjustments/model/defaults';
import type { Preset } from '@/types';

describe('presets', () => {
  it('ships thirteen built-in presets', () => {
    expect(BUILTIN_PRESETS.length).toBe(13);
    expect(BUILTIN_PRESETS.every((p) => p.builtin)).toBe(true);
  });

  it('applies a preset without mutating the source', () => {
    const edit = createDefaultEditState('img', 0);
    const bw = BUILTIN_PRESETS.find((p) => p.category === 'bw');
    expect(bw).toBeTruthy();
    const next = applyPresetToEdit(edit, bw as Preset, 5);
    expect(next.adjustments.basic.saturation).toBe(-100);
    expect(edit.adjustments.basic.saturation).toBe(0);
    expect(next.updatedAt).toBe(5);
  });

  it('round-trips through serialize/parse', () => {
    const user: Preset = {
      id: 'u1',
      name: 'My Look',
      category: 'user',
      favorite: false,
      builtin: false,
      createdAt: 0,
      updatedAt: 0,
      adjustments: { basic: { contrast: 20 } },
    };
    const json = serializePresets([user]);
    const result = parsePresets(json);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.presets.length).toBe(1);
      expect(result.presets[0]?.name).toBe('My Look');
    }
  });

  it('rejects malformed files', () => {
    expect(parsePresets('{ not json').ok).toBe(false);
    expect(parsePresets('{"schema":"other"}').ok).toBe(false);
  });
});
