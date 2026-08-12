import { create } from 'zustand';
import type { Adjustments, Preset, PresetCategory } from '@/types';
import { BUILTIN_PRESETS } from './builtin-presets';
import { captureUserPreset } from './preset-apply';
import { parsePresets, serializePresets } from './preset-io';

export interface PresetState {
  presets: readonly Preset[];
  query: string;

  setQuery: (query: string) => void;
  createFromAdjustments: (name: string, category: PresetCategory, adjustments: Adjustments) => void;
  rename: (id: string, name: string) => void;
  duplicate: (id: string) => void;
  remove: (id: string) => void;
  toggleFavorite: (id: string) => void;
  importJson: (json: string) => { added: number; error: string | null };
  exportJson: (ids?: readonly string[]) => string;
}

export const usePresetStore = create<PresetState>((set, get) => ({
  presets: BUILTIN_PRESETS,
  query: '',

  setQuery: (query) => {
    set({ query });
  },

  createFromAdjustments: (name, category, adjustments) => {
    const created = captureUserPreset(name, category, adjustments);
    set((s) => ({ presets: [...s.presets, created] }));
  },

  rename: (id, name) => {
    set((s) => ({
      presets: s.presets.map((p) =>
        p.id === id && !p.builtin ? { ...p, name: name.trim() || p.name, updatedAt: Date.now() } : p,
      ),
    }));
  },

  duplicate: (id) => {
    const original = get().presets.find((p) => p.id === id);
    if (!original) return;
    const copy = captureUserPresetFromPreset(original);
    set((s) => ({ presets: [...s.presets, copy] }));
  },

  remove: (id) => {
    set((s) => ({ presets: s.presets.filter((p) => p.id !== id || p.builtin) }));
  },

  toggleFavorite: (id) => {
    set((s) => ({
      presets: s.presets.map((p) => (p.id === id ? { ...p, favorite: !p.favorite } : p)),
    }));
  },

  importJson: (json) => {
    const result = parsePresets(json);
    if (!result.ok) return { added: 0, error: result.error };
    set((s) => ({ presets: [...s.presets, ...result.presets] }));
    return { added: result.presets.length, error: null };
  },

  exportJson: (ids) => {
    const all = get().presets;
    const chosen = ids ? all.filter((p) => ids.includes(p.id)) : all.filter((p) => !p.builtin);
    return serializePresets(chosen.length > 0 ? chosen : all);
  },
}));

/** Build a user-owned copy of an existing preset (keeps its adjustments). */
function captureUserPresetFromPreset(original: Preset): Preset {
  const now = Date.now();
  return {
    ...original,
    id: `pre_${now.toString(16)}_${Math.random().toString(16).slice(2, 8)}`,
    name: `${original.name} copy`,
    builtin: false,
    favorite: false,
    createdAt: now,
    updatedAt: now,
  };
}

/* selectors */

export function selectFilteredPresets(state: PresetState): readonly Preset[] {
  const q = state.query.trim().toLowerCase();
  if (!q) return state.presets;
  return state.presets.filter(
    (p) => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q),
  );
}
