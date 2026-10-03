import { create } from 'zustand';
import { missionOf } from '@/content/missions';
import { answerQuiz, completeLesson, emptyProgress, enterLesson, finishMission, finishPractice, reachStage, startMission, type Outcome } from '@/game/progress';
import { applyRecords, type LearningRecord } from '@/game/records';
import { LESSONS } from '@/game/lessons';
import type { LessonStage, PracticeAttempt, PracticeSession, Progress } from '@/game/types';

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
  /** 実戦の途中の状態（docs/data-model.md 7 章の practiceSessions。中断して開き直すと続きから） */
  practiceSessions: Record<string, PracticeSession>;
  savePractice: (session: PracticeSession) => void;
  /** 実戦を 1 回終える（成功でも未達でも）。途中の状態は消す。得た XP と同じ量の資金を onFunds に渡す */
  finishPractice: (lessonId: string, attempt: Omit<PracticeAttempt, 'at'>, at: string) => Outcome;
  /** まとめまで到達した（修了）。得た XP と同じ量の資金を onFunds に渡す */
  complete: (lessonId: string, at: string) => Outcome;
  /** ミッションを受ける（前提は要らない） */
  startMission: (missionId: string) => void;
  /**
   * ミッションの実戦を 1 回終える。初めて成功したら達成し、報酬（XP・開発資金）を得る。
   * 途中の状態（mission:<ID>）は消す。得た資金（XP と同じ量 + 報酬の資金）を onFunds に渡す
   */
  finishMission: (missionId: string, attempt: Omit<PracticeAttempt, 'at'>, at: string) => Outcome;
}

/** ミッションの実戦の途中の状態を保存する名前 */
export const missionSession = (missionId: string): string => `mission:${missionId}`;

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
    practiceSessions: {},
    savePractice: (session) => set({ practiceSessions: { ...get().practiceSessions, [session.lessonId]: session } }),
    finishPractice: (lessonId, attempt, at) => {
      const outcome = finishPractice(get().progress, { lessonId, attempt: { ...attempt, at } }, at, LESSONS);
      const rest = Object.fromEntries(Object.entries(get().practiceSessions).filter(([id]) => id !== lessonId));
      set({ progress: outcome.progress, practiceSessions: rest });
      if (outcome.funds !== 0) onFunds(outcome.funds);
      return outcome;
    },
    complete: (lessonId, at) => {
      const outcome = completeLesson(get().progress, lessonId, at, LESSONS);
      set({ progress: outcome.progress });
      if (outcome.funds !== 0) onFunds(outcome.funds);
      return outcome;
    },
    startMission: (missionId) => set({ progress: startMission(get().progress, missionId) }),
    finishMission: (missionId, attempt, at) => {
      const m = missionOf(missionId);
      const outcome = finishMission(get().progress, { missionId, attempt: { ...attempt, at }, xp: m?.rewards.xp ?? 0, funds: m?.rewards.funds ?? 0 }, at, LESSONS);
      const key = missionSession(missionId);
      const rest = Object.fromEntries(Object.entries(get().practiceSessions).filter(([id]) => id !== key));
      set({ progress: outcome.progress, practiceSessions: rest });
      if (outcome.funds !== 0) onFunds(outcome.funds);
      return outcome;
    },
  }));
}

export type ProgressStore = ReturnType<typeof createProgressStore>;
