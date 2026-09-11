import type { SessionOptions } from '@/engines/kernel/session';
import type { DocRef } from '@/content/types';
import type {
  LessonDefinition, LessonIntro, LessonKindMeta, LessonStep, MissionKind, MissionTrack, StepPart,
} from '../types';
import type { Check } from './assert';
import { requireAll, type Condition } from './conditions';
import { solutionText, splitSolution, withSolutionHint } from './solution';

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
  /** この手順の模範解答。省くと任務全体の solution を実際に打って切り分ける */
  solution?: readonly string[];
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
  /** 課題の前に読む説明 */
  intro: LessonIntro;
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
  intro: LessonIntro;
  kind: MissionKind;
  lessonKind: LessonKindMeta;
  minutes: number;
  docs: readonly DocRef[];
  stepCount: number;
  build: () => LessonDefinition;
  solution: readonly string[];
}

function toStep(spec: StepSpec): LessonStep {
  const built = spec.conditions === undefined ? null : requireAll(...spec.conditions);
  const parts = spec.parts ?? built?.parts;
  return {
    prompt: spec.prompt,
    check: spec.check ?? built?.summary ?? '',
    hints: spec.hints ?? [],
    solution: spec.solution ?? [],
    assert: spec.assert ?? built?.assert ?? (() => false),
    explain: spec.explain,
    ...(spec.diagnose ? { diagnose: spec.diagnose } : {}),
    ...(parts ? { parts } : {}),
    ...(spec.answer !== undefined ? { answer: spec.answer } : {}),
  };
}

/**
 * 手順ごとの模範解答を埋め、最後のヒントを「そのまま打てば通るコマンド」にそろえる。
 * 手順に解答が書かれていなければ、任務全体の解答を実際に打って切り分ける。
 */
function withSolutions(steps: readonly LessonStep[], split: () => string[][]): LessonStep[] {
  const needsSplit = steps.some((s) => s.solution.length === 0);
  const pieces = needsSplit ? split() : [];
  return steps.map((step, i) => {
    const solution = step.solution.length > 0 ? step.solution : (pieces[i] ?? []);
    // 前の手順と一緒に満たされる手順は解答が空になるので、そのときは最後のヒントを答えにする
    const answer =
      step.answer ?? (solution.length > 0 ? solutionText(solution) : step.hints[step.hints.length - 1]);
    return withSolutionHint({ ...step, solution, ...(answer !== undefined ? { answer } : {}) });
  });
}

export function defineMission(spec: MissionSpec): MissionSource {
  const kind = spec.kind ?? 'training';
  // 切り分けは1回打ってみる必要があるので、任務ごとに1度だけ行う
  let pieces: string[][] | null = null;
  const build = (): LessonDefinition => {
    const base: LessonDefinition = {
      id: spec.id,
      track: spec.track,
      kind,
      title: spec.title,
      intro: spec.intro,
      objectives: spec.objectives,
      initial: typeof spec.initial === 'function' ? spec.initial() : spec.initial,
      parCommands: spec.parCommands ?? Math.max(3, spec.solution.length),
      steps: spec.steps.map(toStep),
    };
    const steps = withSolutions(base.steps, () => {
      pieces ??= splitSolution(base, spec.solution);
      return pieces;
    });
    return { ...base, steps };
  };
  return {
    id: spec.id,
    track: spec.track,
    chapterId: spec.chapterId,
    title: spec.title,
    intro: spec.intro,
    kind,
    lessonKind: spec.lessonKind ?? (kind === 'boss' ? 'boss' : 'drill'),
    minutes: spec.minutes ?? Math.max(4, spec.steps.length * 3),
    docs: spec.docs ?? [],
    stepCount: spec.steps.length,
    solution: spec.solution,
    build,
  };
}

/** 章 id から番号だけ取り出す（'k8s/07' -> 7） */
export function chapterNo(chapterId: string): number {
  return Number(chapterId.split('/')[1] ?? '0');
}
