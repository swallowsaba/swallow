import type { DomainId } from '@/city/types';
import { DOMAIN_IDS } from '@/content/schema';
import { LESSONS } from '@/game/lessons';
import { rankOf } from '@/game/rank';
import { skillsOf } from '@/game/skill';
import type { PracticeSession, Progress, SkillState } from '@/game/types';
import type { World } from '@/sim/types';
import { SAVE_VERSION, XP_LOG_LIMIT, type SaveData, type Settings } from './schema';

/**
 * 遊んでいる状態と、保存データ（docs/data-model.md 7 章）の行き来。
 * 時刻は呼ぶ側が渡す（同じ状態と時刻からは、同じ保存データになる）。
 */

/** 市長（プレイヤー）の、学習の記録から計算しない所 */
export interface PlayerMeta {
  id: string;
  name: string;
  createdAt: string;
  /** 初回の操作説明を見終えた・飛ばした */
  introSeen: boolean;
}

/** 保存する、遊んでいる状態 */
export interface SaveParts {
  player: PlayerMeta;
  settings: Settings;
  /** 都市と模擬と市政（版 4。docs/data-model.md 12 章） */
  world: World;
  progress: Progress;
  practiceSessions: Record<string, PracticeSession>;
}

/** 新しい市長（既定の名前は「市長」） */
export const newPlayer = (id: string, createdAt: string): PlayerMeta => ({ id, name: '市長', createdAt, introSeen: false });

/**
 * 保存データを作る。スキルとエンジニア段階は、学習の記録から計算した値を写しておく（読む時は記録から計算し直す）。
 * XP の記録は直近 1,000 件だけ残す
 */
export function toSaveData(parts: SaveParts, savedAt: string, today: string): SaveData {
  const { progress, world } = parts;
  const details = skillsOf(DOMAIN_IDS, progress, LESSONS, today);
  const skills = Object.fromEntries(DOMAIN_IDS.map((d) => {
    const { domain, value, stage, breakdown } = details[d];
    return [d, { domain, value, stage, breakdown } satisfies SkillState];
  })) as Record<DomainId, SkillState>;
  return {
    version: SAVE_VERSION,
    savedAt,
    player: { ...parts.player, xp: progress.xp, engineerRank: rankOf(progress.xp), skills, settings: parts.settings },
    city: world.city,
    lessons: progress.lessons,
    practiceSessions: parts.practiceSessions as SaveData['practiceSessions'],
    reviews: progress.reviews,
    missions: progress.missions,
    xpLog: progress.xpLog.slice(-XP_LOG_LIMIT),
    sim: world.sim,
    history: world.history,
    applications: world.applications,
    politics: world.politics,
    budget: world.budget,
    petitions: world.petitions,
    rewards: world.rewards,
  };
}

/** 保存データから、遊んでいる状態を戻す */
export function fromSaveData(data: SaveData): SaveParts {
  const { id, name, createdAt, introSeen, xp, settings } = data.player;
  return {
    player: { id, name, createdAt, introSeen },
    settings,
    world: {
      city: data.city, sim: data.sim, history: data.history, applications: data.applications, politics: data.politics,
      budget: data.budget, petitions: data.petitions, rewards: data.rewards,
    },
    progress: { xp, lessons: data.lessons, reviews: data.reviews, missions: data.missions, xpLog: data.xpLog },
    practiceSessions: data.practiceSessions,
  };
}

/** 書き出すファイルの名前（devlearn-save-<日付>.json） */
export const exportFileName = (today: string): string => `devlearn-save-${today}.json`;
