import type { DomainId } from '@/city/types';
import { lessonMeta } from './lessons';
import { instantOf } from './time';
import type { Difficulty, LessonMeta, PracticeAttempt, Progress, SkillState } from './types';

/**
 * スキル（docs/game-design.md 4 章）。分野ごとの 0〜100。**XP の合計ではなく、学習履歴と理解度から計算する。**
 *
 *   スキル値 = 40 × 修了率（難易度で重み: 初級 1 / 中級 2 / 上級 3）
 *            + 25 × クイズの初回正答率（直近 20 問）
 *            + 25 × 実戦の成功率（ヒント無し 1・ヒントあり 0.5。直近 10 回）
 *            + 10 × 定着度（間隔反復の予定日を過ぎていない割合。復習カードが無ければ 0）
 *
 * 値は四捨五入した整数にしてから段階を決める（docs/decisions.md D-10・D-11）。
 */
export type SkillStage = 0 | 1 | 2 | 3 | 4 | 5;

export const SKILL_STAGE_NAMES: Record<SkillStage, string> = { 0: '未修得', 1: '見習い', 2: '初級', 3: '中級', 4: '上級', 5: '熟練' };

/** 段階の下限の値 */
const STAGE_FLOORS: [SkillStage, number][] = [[5, 90], [4, 70], [3, 50], [2, 30], [1, 10], [0, 0]];

export function skillStageOf(value: number): SkillStage {
  for (const [stage, floor] of STAGE_FLOORS) if (value >= floor) return stage;
  return 0;
}

export const SKILL_WEIGHTS = { completion: 40, quizFirstTry: 25, practiceSuccess: 25, retention: 10 } as const;
export const DIFFICULTY_WEIGHT: Record<Difficulty, number> = { b: 1, i: 2, a: 3 };
/** クイズの初回正答率を見る問題の数 */
export const RECENT_QUIZ = 20;
/** 実戦の成功率を見る回数 */
export const RECENT_PRACTICE = 10;

/** スキルの値と、その内訳の数（「何をしたからこの値か」を画面に出すため） */
export interface SkillDetail extends SkillState {
  counts: {
    completedLessons: number;
    totalLessons: number;
    /** 直近の初回の答え（最大 20）と、そのうちの正解 */
    quizFirstTries: number;
    quizFirstCorrect: number;
    /** 直近の実戦（最大 10）と、ヒント無しの成功・ヒントありの成功 */
    practices: number;
    practiceClean: number;
    practiceHinted: number;
    /** 復習カードと、予定日を過ぎていないカード */
    cards: number;
    cardsOnTime: number;
  };
}

/** 実戦 1 回の点（ヒント無しの成功 1・ヒントありの成功 0.5・失敗 0） */
export function practiceScore(a: PracticeAttempt): number {
  if (!a.success) return 0;
  return a.hintsUsed > 0 ? 0.5 : 1;
}

/** today は端末の日付（YYYY-MM-DD）。定着度は今日の時点で数える */
export function skillOf(domain: DomainId, progress: Progress, catalog: readonly LessonMeta[], today: string): SkillDetail {
  const inDomain = catalog.filter((l) => l.domain === domain);
  const totalWeight = inDomain.reduce((s, l) => s + DIFFICULTY_WEIGHT[l.difficulty], 0);
  let doneWeight = 0;
  let completedLessons = 0;
  for (const l of inDomain) {
    if ((progress.lessons[l.id]?.completions ?? 0) > 0) {
      doneWeight += DIFFICULTY_WEIGHT[l.difficulty];
      completedLessons += 1;
    }
  }
  const completion = totalWeight > 0 ? doneWeight / totalWeight : 0;

  const records = Object.values(progress.lessons).filter((p) => lessonMeta(p.lessonId, catalog)?.domain === domain);
  const firstTries = records.flatMap((p) => p.quiz.filter((q) => q.tryNo === 1)).sort(byTime).slice(-RECENT_QUIZ);
  const quizFirstCorrect = firstTries.filter((q) => q.correct).length;
  const quizFirstTry = firstTries.length > 0 ? quizFirstCorrect / firstTries.length : 0;

  const practices = records.flatMap((p) => p.practice).sort(byTime).slice(-RECENT_PRACTICE);
  const practiceSuccess = practices.length > 0 ? practices.reduce((s, a) => s + practiceScore(a), 0) / practices.length : 0;

  const cards = progress.reviews.filter((c) => lessonMeta(c.lessonId, catalog)?.domain === domain);
  const cardsOnTime = cards.filter((c) => c.due >= today).length;
  const retention = cards.length > 0 ? cardsOnTime / cards.length : 0;

  const raw = SKILL_WEIGHTS.completion * completion + SKILL_WEIGHTS.quizFirstTry * quizFirstTry
    + SKILL_WEIGHTS.practiceSuccess * practiceSuccess + SKILL_WEIGHTS.retention * retention;
  const value = Math.max(0, Math.min(100, Math.round(raw)));
  return {
    domain,
    value,
    stage: skillStageOf(value),
    breakdown: { completion, quizFirstTry, practiceSuccess, retention },
    counts: {
      completedLessons,
      totalLessons: inDomain.length,
      quizFirstTries: firstTries.length,
      quizFirstCorrect,
      practices: practices.length,
      practiceClean: practices.filter((a) => a.success && a.hintsUsed === 0).length,
      practiceHinted: practices.filter((a) => a.success && a.hintsUsed > 0).length,
      cards: cards.length,
      cardsOnTime,
    },
  };
}

export function skillsOf(domains: readonly DomainId[], progress: Progress, catalog: readonly LessonMeta[], today: string): Record<DomainId, SkillDetail> {
  return Object.fromEntries(domains.map((d) => [d, skillOf(d, progress, catalog, today)])) as Record<DomainId, SkillDetail>;
}

function byTime(a: { at: string }, b: { at: string }): number {
  return instantOf(a.at) - instantOf(b.at);
}
