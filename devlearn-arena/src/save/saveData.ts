import type { City, DomainId } from '@/city/types';
import { DOMAIN_IDS } from '@/content/schema';
import { LESSONS } from '@/game/lessons';
import { rankOf } from '@/game/rank';
import { skillsOf } from '@/game/skill';
import type { PracticeSession, Progress, SkillState } from '@/game/types';
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
}

/** 保存する、遊んでいる状態 */
export interface SaveParts {
  player: PlayerMeta;
  settings: Settings;
  city: City;
  progress: Progress;
  practiceSessions: Record<string, PracticeSession>;
}

/** 新しい市長（既定の名前は「市長」） */
export const newPlayer = (id: string, createdAt: string): PlayerMeta => ({ id, name: '市長', createdAt });

/**
 * 保存データを作る。スキルとエンジニア段階は、学習の記録から計算した値を写しておく（読む時は記録から計算し直す）。
 * XP の記録は直近 1,000 件だけ残す
 */
export function toSaveData(parts: SaveParts, savedAt: string, today: string): SaveData {
  const { progress } = parts;
  const details = skillsOf(DOMAIN_IDS, progress, LESSONS, today);
  const skills = Object.fromEntries(DOMAIN_IDS.map((d) => {
    const { domain, value, stage, breakdown } = details[d];
    return [d, { domain, value, stage, breakdown } satisfies SkillState];
  })) as Record<DomainId, SkillState>;
  return {
    version: SAVE_VERSION,
    savedAt,
    player: { ...parts.player, xp: progress.xp, engineerRank: rankOf(progress.xp), skills, settings: parts.settings },
    city: parts.city,
    lessons: progress.lessons,
    practiceSessions: parts.practiceSessions as SaveData['practiceSessions'],
    reviews: progress.reviews,
    missions: progress.missions,
    xpLog: progress.xpLog.slice(-XP_LOG_LIMIT),
  };
}

/** 保存データから、遊んでいる状態を戻す */
export function fromSaveData(data: SaveData): SaveParts {
  const { id, name, createdAt, xp, settings } = data.player;
  return {
    player: { id, name, createdAt },
    settings,
    city: data.city,
    progress: { xp, lessons: data.lessons, reviews: data.reviews, missions: data.missions, xpLog: data.xpLog },
    practiceSessions: data.practiceSessions,
  };
}

/** 書き出すファイルの名前（devlearn-save-<日付>.json） */
export const exportFileName = (today: string): string => `devlearn-save-${today}.json`;
