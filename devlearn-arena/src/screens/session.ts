import type { City } from '@/city/types';
import type { PracticeSession, Progress } from '@/game/types';
import { createCityStore, type CityStore } from './city/cityStore';
import { newPlayer, type PlayerMeta } from '@/save/saveData';
import type { Settings } from '@/save/schema';
import { create } from 'zustand';
import { createProgressStore, type ProgressStore } from './progressStore';
import { createSettingsStore, type SettingsStore } from './settingsStore';

/**
 * 遊んでいる間の状態（都市と学習の記録）。全ての画面が同じものを読む。
 * 学習で得た開発資金は都市の資金に入る（docs/game-design.md 2 章）。
 */
export interface Session {
  city: CityStore;
  progress: ProgressStore;
  settings: SettingsStore;
  /** 市長（名前・初回の操作説明を見終えたか） */
  player: PlayerStore;
}

export interface PlayerState {
  player: PlayerMeta;
  set: (patch: Partial<Omit<PlayerMeta, 'id' | 'createdAt'>>) => void;
}
export type PlayerStore = ReturnType<typeof createPlayerStore>;

const createPlayerStore = (initial: PlayerMeta) =>
  create<PlayerState>((set, get) => ({ player: initial, set: (patch) => set({ player: { ...get().player, ...patch } }) }));

/** 保存から戻す時の、遊んでいる状態（src/save/autosave.ts）。無い物は新しく始める */
export interface SessionStart {
  city?: City;
  progress?: Progress;
  practiceSessions?: Record<string, PracticeSession>;
  settings?: Settings;
  player?: PlayerMeta;
}

export function createSession(seed?: number, start?: SessionStart): Session {
  const city = createCityStore(seed, start?.city);
  const progress = createProgressStore((amount) => {
    const c = city.getState().city;
    city.getState().setCity({ ...c, funds: c.funds + amount });
  }, start?.progress, start?.practiceSessions);
  return { city, progress, settings: createSettingsStore(start?.settings), player: createPlayerStore(start?.player ?? newPlayer('local', '')) };
}
