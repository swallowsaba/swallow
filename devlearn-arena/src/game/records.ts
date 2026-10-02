import { answerQuiz, answerReview, completeLesson, completeMission, finishPractice, startLesson, type Outcome } from './progress';
import { plusMinutes } from './time';
import type { LessonMeta, Progress } from './types';

/**
 * 学習の記録をまとめて与え、XP・スキル・資金を計算する（docs/development-plan.md Phase 4: レッスンの画面が無い間は、模擬の学習記録で動かす）。
 * レッスンの画面ができた後は、画面が progress.ts の行動を 1 つずつ呼ぶ。ここはその並びを 1 つの記録で書けるようにしたもの。
 */

export interface LessonRunRecord {
  kind: 'lesson';
  lessonId: string;
  /** 回を始めた時刻（端末の地方時の ISO）。中の行動は 1 分ずつ後に起きたとする */
  at: string;
  /** クイズの答え（答えた順） */
  quiz?: { quizId: string; correct: boolean }[];
  /** 実戦の回（行った順） */
  practice?: { success: boolean; hintsUsed?: number; recoveredFromError?: boolean }[];
  /** まとめまで到達した */
  complete?: boolean;
}

export type LearningRecord =
  | LessonRunRecord
  | { kind: 'review'; cardId: string; correct: boolean; at: string }
  | { kind: 'mission'; missionId: string; xp: number; funds?: number; at: string };

export function applyRecords(progress: Progress, records: readonly LearningRecord[], catalog: readonly LessonMeta[]): Outcome {
  let p = progress;
  const total: Outcome = { progress, events: [], funds: 0, skillUps: [] };
  const take = (o: Outcome): void => {
    p = o.progress;
    total.events.push(...o.events);
    total.funds += o.funds;
    total.skillUps.push(...o.skillUps);
  };
  for (const r of records) {
    if (r.kind === 'review') take(answerReview(p, { cardId: r.cardId, correct: r.correct }, r.at, catalog));
    else if (r.kind === 'mission') take(completeMission(p, { missionId: r.missionId, xp: r.xp, ...(r.funds !== undefined ? { funds: r.funds } : {}) }, r.at, catalog));
    else {
      let minute = 0;
      const next = (): string => plusMinutes(r.at, (minute += 1));
      p = startLesson(p, r.lessonId, r.at);
      for (const q of r.quiz ?? []) take(answerQuiz(p, { lessonId: r.lessonId, quizId: q.quizId, choiceIds: [], correct: q.correct }, next(), catalog));
      for (const a of r.practice ?? []) {
        take(finishPractice(p, {
          lessonId: r.lessonId,
          attempt: {
            at: '', stepsDone: [], hintsUsed: a.hintsUsed ?? 0, errors: a.recoveredFromError ? ['error'] : [],
            recoveredFromError: a.recoveredFromError ?? false, dangerousUsed: [], success: a.success, commands: [],
          },
        }, next(), catalog));
      }
      if (r.complete) take(completeLesson(p, r.lessonId, next(), catalog));
    }
  }
  total.progress = p;
  return total;
}
