import type { City, DomainId } from '@/city/types';
import { LESSONS } from '@/game/lessons';
import { skillsOf } from '@/game/skill';
import type { World } from '@/sim/types';
import type { PracticeSession, Progress } from '@/game/types';
import { createCityStore, type CityStore } from './city/cityStore';
import { newPlayer, type PlayerMeta } from '@/save/saveData';
import type { Settings } from '@/save/schema';
import { create } from 'zustand';
import { createProgressStore, type ProgressStore } from './progressStore';
import { createSettingsStore, type SettingsStore } from './settingsStore';
import { today } from './clock';
import { DOMAIN_IDS } from './skills';

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
  /** 版 4 の保存データの、都市と模擬と市政の世界（あれば city より先に使う） */
  world?: World;
  progress?: Progress;
  practiceSessions?: Record<string, PracticeSession>;
  settings?: Settings;
  player?: PlayerMeta;
}

export function createSession(seed?: number, start?: SessionStart): Session {
  const city = createCityStore(seed, start?.city, start?.world ? { world: start.world } : {});
  const progress = createProgressStore((amount) => city.getState().dispatch({ kind: 'funds', amount }), start?.progress, start?.practiceSessions);
  tellPolitics(city, progress);
  return { city, progress, settings: createSettingsStore(start?.settings), player: createPlayerStore(start?.player ?? newPlayer('local', '')) };
}

/**
 * 学習の進みを市政へ知らせる（docs/game-design.md 21 章）。
 * 修了したレッスンの数と分野ごとのスキル段階は、任期の終わりの一覧に写すだけで、市政の条件には使わない（21.4）。
 * ミッションを達成すると政治資本 +3（同じミッションは 1 度だけ。21.5）
 */
function tellPolitics(city: CityStore, progress: ProgressStore): void {
  const learning = (p: Progress): void => {
    const lessonsDone = Object.values(p.lessons).filter((l) => l.completions > 0).length;
    const skills = skillsOf(DOMAIN_IDS, p, LESSONS, today());
    const stages: Partial<Record<DomainId, number>> = {};
    for (const d of DOMAIN_IDS) if (skills[d].stage > 0) stages[d] = skills[d].stage;
    const now = city.getState().world.politics.learning;
    if (now && now.lessonsDone === lessonsDone && JSON.stringify(now.stages) === JSON.stringify(stages)) return;
    city.getState().dispatch({ kind: 'learning', lessonsDone, stages });
  };
  learning(progress.getState().progress);
  progress.subscribe((s, prev) => {
    if (s.progress === prev.progress) return;
    for (const [id, m] of Object.entries(s.progress.missions)) {
      if (m.status === 'completed' && prev.progress.missions[id]?.status !== 'completed') city.getState().dispatch({ kind: 'mission', missionId: id });
    }
    learning(s.progress);
  });
}
