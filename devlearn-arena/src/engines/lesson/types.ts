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

/**
 * 通過条件のうちのひとつ。
 * 画面はこれを一覧にして、どこまで満たせているかを見せる。
 */
export interface StepPart {
  label: string;
  test: (ctx: AssertContext) => boolean;
  howTo?: string;
}

export interface LessonStep {
  prompt: string;
  /** 何を満たせば通るのかを人が読める形で示す。隠さない */
  check: string;
  /**
   * 助言。最後の1件は、そのまま打てば手順を通過する完全なコマンドにする。
   * 複数行のときは1行ずつ順に打つ。
   */
  hints: readonly string[];
  /**
   * 模範解答のコマンド列。直前の手順までを模範解答どおりに進めた状態から、
   * これを順に打てば必ずこの手順を通過する。
   * 前の手順で一緒に満たされる手順は空になる。
   */
  solution: readonly string[];
  /** 最終状態を検証する。別解を許容するため、コマンド文字列は見ない */
  assert: (ctx: AssertContext) => boolean;
  /**
   * 通らなかったときに、何が惜しいのかを返す。
   * 失敗を黙って捨てず、次の一手が分かるようにするため。
   */
  diagnose?: (ctx: AssertContext) => string | null;
  explain: string;
  /** 通過条件の内訳。空なら check の一文だけを見せる */
  parts?: readonly StepPart[];
  /** 詰まったときに最後に見せる答え */
  answer?: string;
}

export type MissionKind = 'training' | 'boss';

/** 目次での見え方。`src/content/types.ts` の LessonKind と同じ語彙 */
export type LessonKindMeta = 'concept' | 'drill' | 'challenge' | 'boss';

export type MissionTrack = 'kernel' | 'git' | 'k8s' | 'net' | 'github';

export interface LessonDefinition {
  /** training=練習, boss=障害対応 */
  kind: MissionKind;
  /** どの世界の任務か。地図の島に対応する */
  track: MissionTrack;
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
  /** 失敗した回数。罰ではなく、振り返りの材料として数える */
  mistakes: number;
}
