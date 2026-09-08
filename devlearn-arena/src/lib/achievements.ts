import { TRACKS } from '@/content/catalog';
import type { TrackId } from '@/content/types';
import type { LessonProgress, MissionProgress, Profile } from './storage/schema';

/**
 * 実績。
 *
 * 付与した記録を別に持たず、いまの進捗から毎回導く。
 * 保存データを書き換えても、実績だけが取り残されることが起きない。
 */
export type BadgeTier = 'bronze' | 'silver' | 'gold';

export interface Badge {
  id: string;
  /** 何をすると取れるか。隠さない */
  requirement: string;
  tier: BadgeTier;
  earned: boolean;
  /** 進み具合。取得済みなら done === total */
  done: number;
  total: number;
}

export interface AchievementInput {
  profile: Profile;
  lessons: Readonly<Record<string, LessonProgress>>;
  missionProgress: Readonly<Record<string, MissionProgress>>;
}

function clearedIds(lessons: AchievementInput['lessons']): Set<string> {
  return new Set(Object.entries(lessons).filter(([, l]) => l.cleared).map(([id]) => id));
}

function trackTotals(): Map<TrackId, string[]> {
  const out = new Map<TrackId, string[]>();
  for (const track of TRACKS) {
    out.set(
      track.id,
      track.chapters.flatMap((c) => c.lessons.filter((l) => l.status === 'ready').map((l) => l.id)),
    );
  }
  return out;
}

function badge(
  id: string,
  requirement: string,
  tier: BadgeTier,
  done: number,
  total: number,
): Badge {
  return { id, requirement, tier, done: Math.min(done, total), total, earned: done >= total };
}

/** いまの進捗から取得済みの実績を数える */
export function achievements(input: AchievementInput): Badge[] {
  const cleared = clearedIds(input.lessons);
  const totals = trackTotals();
  const bosses = [...cleared].filter((id) => id.includes('boss')).length;
  const noHint = Object.values(input.lessons).filter((l) => l.cleared && l.hintsUsed === 0).length;
  const perfect = Object.values(input.lessons).filter((l) => (l.bestScore ?? 0) >= 100).length;

  const out: Badge[] = [
    badge('first-clear', '任務を1つクリアする', 'bronze', cleared.size, 1),
    badge('ten-clears', '任務を10クリアする', 'silver', cleared.size, 10),
    badge('thirty-clears', '任務を30クリアする', 'gold', cleared.size, 30),
    badge('first-boss', 'インシデント対応を1つ解決する', 'silver', bosses, 1),
    badge('five-bosses', 'インシデント対応を5つ解決する', 'gold', bosses, 5),
    badge('no-hint', 'ヒントを1度も見ずにクリアする', 'silver', noHint, 1),
    badge('perfect', '満点でクリアする', 'gold', perfect, 1),
    badge('streak-3', '3日続けて取り組む', 'bronze', input.profile.streakDays, 3),
    badge('streak-7', '7日続けて取り組む', 'silver', input.profile.streakDays, 7),
    badge('streak-30', '30日続けて取り組む', 'gold', input.profile.streakDays, 30),
  ];

  for (const [trackId, ids] of totals) {
    if (ids.length === 0) continue;
    const done = ids.filter((id) => cleared.has(id)).length;
    out.push(badge(`track-${trackId}`, `${trackId} の任務を全てクリアする`, 'gold', done, ids.length));
  }

  return out;
}

/** 直近 n 日ぶんの、取り組んだ日の並び（新しい方が末尾） */
export function streakStrip(
  activeDays: readonly string[],
  today: string,
  days = 14,
): { day: string; active: boolean }[] {
  const active = new Set(activeDays);
  const [y, m, d] = today.split('-').map((v) => Number(v));
  const base = Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  const out: { day: string; active: boolean }[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const at = new Date(base - i * 24 * 60 * 60 * 1000);
    const key = `${String(at.getUTCFullYear())}-${String(at.getUTCMonth() + 1).padStart(2, '0')}-${String(at.getUTCDate()).padStart(2, '0')}`;
    out.push({ day: key, active: active.has(key) });
  }
  return out;
}
