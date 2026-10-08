import { create } from 'zustand';
import { DEFAULT_SETTINGS, type Settings } from '@/save/schema';

/**
 * 設定（docs/data-model.md 7 章の Settings: 音・動きを減らす・文字の大きさ・表示品質・ふりがな・コマンドの候補）。
 * 設定画面で変え、保存データと一緒に自動で保存する。
 */
export interface SettingsState {
  settings: Settings;
  set: (patch: Partial<Settings>) => void;
}

export function createSettingsStore(initial: Settings = DEFAULT_SETTINGS) {
  return create<SettingsState>((set, get) => ({
    settings: initial,
    set: (patch) => set({ settings: { ...get().settings, ...patch } }),
  }));
}

export type SettingsStore = ReturnType<typeof createSettingsStore>;
