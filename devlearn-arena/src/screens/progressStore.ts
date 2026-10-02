import { create } from 'zustand';
import { answerQuiz, emptyProgress, enterLesson, reachStage, type Outcome } from '@/game/progress';
import { applyRecords, type LearningRecord } from '@/game/records';
import { LESSONS } from '@/game/lessons';
import type { LessonStage, Progress } from '@/game/types';

/**
 * 学習の記録の状態（docs/data-model.md 7 章の、成長に関わる所）。
 * 計算は src/game の純粋な関数。ここは結果を持ち、得た開発資金を都市へ渡すだけ。
 */
export interface ProgressState {
  progress: Progress;
  /** 学習の記録を与える。得た XP と同じ量の資金を onFunds に渡す */
  learn: (records: readonly LearningRecord[]) => Outcome;
  /** レッスンを始める（学習中にする。学習中なら続きから）。どのレッスンも、前提に関係なく始められる */
  start: (lessonId: string, at: string) => void;
  /** クイズの 1 問に答える。得た XP と同じ量の資金を onFunds に渡す */
  answer: (a: { lessonId: string; quizId: string; choiceIds: string[]; correct: boolean }, at: string) => Outcome;
  /** 段を進めた（途中保存） */
  reach: (lessonId: string, stage: LessonStage) => void;
}

export function createProgressStore(onFunds: (amount: number) => void, initial: Progress = emptyProgress()) {
  return create<ProgressState>((set, get) => ({
    progress: initial,
    learn: (records) => {
      const outcome = applyRecords(get().progress, records, LESSONS);
      set({ progress: outcome.progress });
      if (outcome.funds !== 0) onFunds(outcome.funds);
      return outcome;
    },
    start: (lessonId, at) => set({ progress: enterLesson(get().progress, lessonId, at) }),
    answer: (a, at) => {
      const outcome = answerQuiz(get().progress, a, at, LESSONS);
      set({ progress: outcome.progress });
      if (outcome.funds !== 0) onFunds(outcome.funds);
      return outcome;
    },
    reach: (lessonId, stage) => set({ progress: reachStage(get().progress, lessonId, stage) }),
  }));
}

export type ProgressStore = ReturnType<typeof createProgressStore>;
