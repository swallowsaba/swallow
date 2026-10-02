import type { DomainId } from '@/city/types';

/**
 * プレイヤー側の記録の型（docs/data-model.md 1〜4.1・6 章）。
 * レッスンの中身は content/ の読み取り専用のデータで、ここは ID で参照して進み具合と結果だけを持つ。
 * 時刻（at）は端末の地方時の ISO 文字列（例: 2026-10-02T20:14:11+09:00）。先頭の 10 文字が端末の日付になる。
 */

/** 難易度（レッスン ID の 2 つ目: b 初級 / i 中級 / a 上級） */
export type Difficulty = 'b' | 'i' | 'a';

/** スキルの修了率の分母に使う、レッスンの最小の情報 */
export interface LessonMeta {
  id: string;
  domain: DomainId;
  difficulty: Difficulty;
  title: string;
}

export type EngineerRank = 'apprentice' | 'junior' | 'middle' | 'senior' | 'lead';

export type XpSource = 'lesson-complete' | 'quiz' | 'practice' | 'troubleshoot' | 'mission' | 'skill-up' | 'review';

export interface XpEvent {
  at: string;
  source: XpSource;
  /** レッスン ID・ミッション ID・分野 ID（スキルの段階） */
  ref: string;
  /** 稼ぎ防止を適用した後の値（docs/game-design.md 3 章） */
  amount: number;
}

export interface QuizAttempt {
  quizId: string;
  at: string;
  choiceIds: string[];
  correct: boolean;
  /** その回（レッスンを始めてから）の、この問題への何回目の答えか */
  tryNo: number;
}

export interface PracticeAttempt {
  at: string;
  stepsDone: string[];
  /** 0〜3（使った最大の段） */
  hintsUsed: number;
  errors: string[];
  /** エラーから自力で成功した */
  recoveredFromError: boolean;
  dangerousUsed: string[];
  success: boolean;
  commands: string[];
}

/** 実戦の途中再開のための状態（docs/data-model.md 4 章） */
export interface PracticeSession {
  lessonId: string;
  stepIndex: number;
  /** 模擬環境（src/engines）が出力する直列化済みの状態 */
  engineState: unknown;
  savedAt: string;
}

export type LessonStage = 'explain' | 'understand' | 'quiz' | 'practice' | 'result' | 'summary' | 'done';

export interface LessonProgress {
  lessonId: string;
  status: 'not-started' | 'in-progress' | 'completed';
  stage: LessonStage;
  /** 今の回を始めた時刻 */
  startedAt?: string;
  completedAt?: string;
  /** 何回まとめまで到達したか */
  completions: number;
  quiz: QuizAttempt[];
  practice: PracticeAttempt[];
  /** 稼ぎ防止（YYYY-MM-DD）。このレッスンから最後に XP を得た日 */
  lastXpDay?: string;
}

export interface ReviewCard {
  id: string;
  lessonId: string;
  /** 予定日（YYYY-MM-DD） */
  due: string;
  intervalDays: number;
  ease: number;
}

export interface MissionProgress {
  missionId: string;
  status: 'available' | 'in-progress' | 'completed';
  practice?: PracticeAttempt[];
  completedAt?: string;
}

/** 学習の記録（docs/data-model.md 7 章の SaveData のうち、成長に関わる所） */
export interface Progress {
  /** 累計 XP（消費しない） */
  xp: number;
  lessons: Record<string, LessonProgress>;
  reviews: ReviewCard[];
  missions: Record<string, MissionProgress>;
  /** 直近 1,000 件 */
  xpLog: XpEvent[];
}

export interface SkillState {
  domain: DomainId;
  /** 0〜100（docs/game-design.md 4 章の式。四捨五入した整数） */
  value: number;
  stage: 0 | 1 | 2 | 3 | 4 | 5;
  /** 「何をしたからこの値か」 */
  breakdown: {
    completion: number;
    quizFirstTry: number;
    practiceSuccess: number;
    retention: number;
  };
}
