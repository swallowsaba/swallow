import type { SessionOptions } from '@/engines/kernel/session';
import type { DocRef } from '@/content/types';
import type {
  LessonDefinition, LessonKindMeta, LessonStep, MissionKind, MissionTrack, StepPart,
} from '../types';
import type { Check } from './assert';
import { requireAll, type Condition } from './conditions';

interface StepBase {
  /** 何をするか */
  prompt: string;
  /** 何を満たせば通るか。隠さない */
  check?: string;
  hints?: readonly string[];
  /** なぜそうなるか */
  explain: string;
  /** 惜しいときの指摘 */
  diagnose?: (ctx: Parameters<Check>[0]) => string | null;
  /** 通過条件の内訳。どこまで満たせているかを画面に出すために使う */
  parts?: readonly StepPart[];
  /** 詰まったときに最後に見せる答え */
  answer?: string;
}

/**
 * 手順の合否は、ひとつの関数で書いても、
 * 名前の付いた条件の集まりで書いてもよい。
 * 集まりで書くと、画面に「どこまで満たせているか」を出せる。
 */
export type StepSpec =
  | (StepBase & { assert: Check; conditions?: undefined; check: string })
  | (StepBase & { conditions: readonly Condition[]; assert?: undefined });

export interface MissionSpec {
  id: string;
  track: MissionTrack;
  /** 目次の章 id（例 'k8s/01'）。目次に載せる位置になる */
  chapterId: string;
  title: string;
  kind?: MissionKind;
  /** 目次での見え方 */
  lessonKind?: LessonKindMeta;
  minutes?: number;
  docs?: readonly DocRef[];
  objectives: readonly string[];
  initial: SessionOptions | (() => SessionOptions);
  parCommands?: number;
  steps: readonly StepSpec[];
  /** これを順に打てば必ずクリアできる、という模範解答 */
  solution: readonly string[];
}

/**
 * 任務の定義。
 * 目次を組み立てるだけなら `build()` は呼ばない。
 * 数が増えても、開いた任務ぶんしか状態を作らないようにするため。
 */
export interface MissionSource {
  id: string;
  track: MissionTrack;
  chapterId: string;
  title: string;
  kind: MissionKind;
  lessonKind: LessonKindMeta;
  minutes: number;
  docs: readonly DocRef[];
  stepCount: number;
  build: () => LessonDefinition;
  solution: readonly string[];
}

function toStep(spec: StepSpec, fallbackAnswer: string | undefined): LessonStep {
  // 最後のヒントは、どの演習でも「そのまま打てば通る一行」にしてある
  const lastHint = spec.hints?.[spec.hints.length - 1];
  const answer = spec.answer ?? fallbackAnswer ?? lastHint;
  const built = spec.conditions === undefined ? null : requireAll(...spec.conditions);
  const parts = spec.parts ?? built?.parts;
  return {
    prompt: spec.prompt,
    check: spec.check ?? built?.summary ?? '',
    hints: spec.hints ?? [],
    assert: spec.assert ?? built?.assert ?? (() => false),
    explain: spec.explain,
    ...(spec.diagnose ? { diagnose: spec.diagnose } : {}),
    ...(parts ? { parts } : {}),
    ...(answer !== undefined ? { answer } : {}),
  };
}

export function defineMission(spec: MissionSpec): MissionSource {
  const kind = spec.kind ?? 'training';
  return {
    id: spec.id,
    track: spec.track,
    chapterId: spec.chapterId,
    title: spec.title,
    kind,
    lessonKind: spec.lessonKind ?? (kind === 'boss' ? 'boss' : 'drill'),
    minutes: spec.minutes ?? Math.max(4, spec.steps.length * 3),
    docs: spec.docs ?? [],
    stepCount: spec.steps.length,
    solution: spec.solution,
    build: () => ({
      id: spec.id,
      track: spec.track,
      kind,
      title: spec.title,
      objectives: spec.objectives,
      initial: typeof spec.initial === 'function' ? spec.initial() : spec.initial,
      parCommands: spec.parCommands ?? Math.max(3, spec.solution.length),
      // 手順と模範解答が1対1なら、その行を「答え」として使える
      steps: spec.steps.map((step, i) =>
        toStep(step, spec.steps.length === spec.solution.length ? spec.solution[i] : undefined),
      ),
    }),
  };
}

/** 章 id から番号だけ取り出す（'k8s/07' -> 7） */
export function chapterNo(chapterId: string): number {
  return Number(chapterId.split('/')[1] ?? '0');
}
