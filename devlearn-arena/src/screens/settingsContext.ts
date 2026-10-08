import { createContext, useContext } from 'react';
import { useStore } from 'zustand';
import { FONT_SIZES } from '@/ui/tokens';
import type { Settings } from '@/save/schema';
import { createSettingsStore, type SettingsStore } from './settingsStore';

/**
 * 設定を、どの画面の部品からも読めるようにする（ふりがな・コマンドの候補・音など、部品ごとに効く物）。
 * 渡されていなければ既定の設定。
 */
export const SettingsContext = createContext<SettingsStore | null>(null);

/** 渡されていない時に読む、既定の設定 */
const DEFAULTS = createSettingsStore();

export function useSettings(): Settings {
  return useStore(useContext(SettingsContext) ?? DEFAULTS, (s) => s.settings);
}

/**
 * 画面全体に効く設定を、ページの根に写す（docs/product-spec.md 4 章の設定）。
 * 文字の大きさは、使ってよい大きさ（--fs-*）を倍にする。動きを減らすと、画面の動き（切り替え・光の輪など）を止める。
 */
export function applySettings(settings: Settings, root: HTMLElement): void {
  for (const size of FONT_SIZES) root.style.setProperty(`--fs-${String(size)}`, `${String(Math.round(size * settings.fontScale))}px`);
  // 文字に合わせて広げる枠（おすすめの欄の高さの上限など）が読む倍率
  root.style.setProperty('--font-scale', String(settings.fontScale));
  root.dataset.motion = settings.reduceMotion ? 'reduced' : 'full';
  root.dataset.quality = settings.quality;
}
