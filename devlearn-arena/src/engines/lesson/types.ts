import type { ShellState } from '@/engines/kernel/registry';
import type { SessionOptions } from '@/engines/kernel/session';

/** 判定に使える文脈。文字列一致ではなく「状態」を見る。 */
export interface AssertContext {
  shell: ShellState;
  /** 実行された行（末尾が直近） */
  history: readonly string[];
  /** 各コマンド実行直後の状態列。可用性など「全時点で成立」の検証に使う */
  timeline: readonly ShellState[];
}

export interface LessonStep {
  prompt: string;
  hints: readonly string[];
  /** 最終状態を検証する。別解を許容するため、コマンド文字列は見ない */
  assert: (ctx: AssertContext) => boolean;
  explain: string;
}

export interface LessonDefinition {
  /** カタログの LessonMeta.id と一致させる */
  id: string;
  title: string;
  objectives: readonly string[];
  initial: SessionOptions;
  steps: readonly LessonStep[];
  /** 想定手数。スコア計算に使う */
  parCommands: number;
}

export interface LessonProgressState {
  /** 今取り組んでいる手順（0 始まり） */
  stepIndex: number;
  cleared: boolean;
  hintsUsed: number;
  commandsUsed: number;
}
