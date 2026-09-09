import type { SessionOptions } from '@/engines/kernel/session';
import type { DocRef } from '@/content/types';
import type { LessonDefinition, LessonKindMeta, LessonStep, MissionKind, MissionTrack } from '../types';
import type { Check } from './assert';

export interface StepSpec {
  /** 何をするか */
  prompt: string;
  /** 何を満たせば通るか。隠さない */
  check: string;
  assert: Check;
  hints?: readonly string[];
  /** なぜそうなるか */
  explain: string;
  /** 惜しいときの指摘 */
  diagnose?: (ctx: Parameters<Check>[0]) => string | null;
}

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

function toStep(spec: StepSpec): LessonStep {
  return {
    prompt: spec.prompt,
    check: spec.check,
    hints: spec.hints ?? [],
    assert: spec.assert,
    explain: spec.explain,
    ...(spec.diagnose ? { diagnose: spec.diagnose } : {}),
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
      steps: spec.steps.map(toStep),
    }),
  };
}

/** 章 id から番号だけ取り出す（'k8s/07' -> 7） */
export function chapterNo(chapterId: string): number {
  return Number(chapterId.split('/')[1] ?? '0');
}
