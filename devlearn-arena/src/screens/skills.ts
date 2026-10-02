import { useMemo } from 'react';
import { useStore } from 'zustand';
import { DOMAINS } from '@/city/facilityInfo';
import type { DomainId } from '@/city/types';
import { LESSONS } from '@/game/lessons';
import { skillsOf, type SkillDetail, type SkillStage } from '@/game/skill';
import type { Progress } from '@/game/types';
import { today } from './clock';
import type { ProgressStore } from './progressStore';

/**
 * 画面が読む、分野ごとのスキル（docs/game-design.md 4 章）と、その説明の文。
 * 値の計算は src/game/skill.ts。ここは今日の日付で呼び、文に直すだけ。
 */

export const DOMAIN_IDS: readonly DomainId[] = DOMAINS.map((d) => d.id);

export type SkillMap = Record<DomainId, SkillDetail>;

export function useSkills(store: ProgressStore): SkillMap {
  const progress = useStore(store, (s) => s.progress);
  const day = today();
  return useMemo(() => skillsOf(DOMAIN_IDS, progress, LESSONS, day), [progress, day]);
}

/** 分野ごとのスキルの値（今日の日付で）。学習から戻った時の変化を比べるのに使う */
export function skillValues(progress: Progress): Partial<Record<DomainId, number>> {
  const all = skillsOf(DOMAIN_IDS, progress, LESSONS, today());
  return Object.fromEntries(DOMAIN_IDS.map((d) => [d, all[d].value]));
}

/** 「何をしたからこの値か」を 1 行で（docs/game-design.md 4 章） */
export function skillBecause(s: SkillDetail): string {
  const c = s.counts;
  if (c.completedLessons === 0 && c.quizFirstTries === 0 && c.practices === 0 && c.cards === 0) return 'まだ学習の記録が無い（修了したレッスン 0 本）';
  const parts = [`修了 ${String(c.completedLessons)} / ${String(c.totalLessons)} 本`];
  if (c.quizFirstTries > 0) parts.push(`クイズ初回正解 ${String(c.quizFirstCorrect)} / ${String(c.quizFirstTries)} 問`);
  if (c.practices > 0) parts.push(`実戦の成功 ${String(c.practiceClean + c.practiceHinted)} / ${String(c.practices)} 回`);
  if (c.cards > 0) parts.push(`復習 ${String(c.cardsOnTime)} / ${String(c.cards)} 枚が予定どおり`);
  return parts.join('・');
}

/** 称号（docs/game-design.md 4 章の表。例: Linux 初級エンジニア） */
export function skillTitle(domainName: string, stage: SkillStage): string {
  switch (stage) {
    case 0: return '';
    case 1: return `${domainName} 見習い`;
    case 2: return `${domainName} 初級エンジニア`;
    case 3: return `${domainName} 中級エンジニア`;
    case 4: return `${domainName} 上級エンジニア`;
    case 5: return `${domainName} のエキスパート`;
  }
}
