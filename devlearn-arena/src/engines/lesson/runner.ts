import type { ShellState } from '@/engines/kernel/registry';
import type { AssertContext, LessonDefinition, LessonProgressState, LessonStep } from './types';

export function createProgress(lesson: LessonDefinition): LessonProgressState {
  void lesson;
  return { stepIndex: 0, cleared: false, hintsUsed: 0, commandsUsed: 0, mistakes: 0 };
}

export function buildContext(timeline: readonly ShellState[]): AssertContext {
  const shell = timeline[timeline.length - 1];
  if (!shell) throw new Error('timeline が空です');
  return { shell, history: shell.history, timeline };
}

/**
 * 1コマンド実行ごとに呼ぶ。
 * 失敗しても進行は止めない。失敗回数は振り返りのために数えるだけ。
 * 満たされた手順は連続して先に進める（1コマンドで2手順ぶん進む解答を許容する）。
 */
export function advance(
  lesson: LessonDefinition,
  progress: LessonProgressState,
  timeline: readonly ShellState[],
  exitCode = 0,
): LessonProgressState {
  const counted: LessonProgressState = {
    ...progress,
    mistakes: progress.mistakes + (exitCode === 0 ? 0 : 1),
    commandsUsed: progress.commandsUsed + 1,
  };
  return evaluate(lesson, counted, timeline);
}

/** 手順の合否だけを判定する。回数は数えない。状態が変わるたびに呼べる。 */
export function evaluate(
  lesson: LessonDefinition,
  progress: LessonProgressState,
  timeline: readonly ShellState[],
): LessonProgressState {
  if (progress.cleared) return progress;
  const ctx = buildContext(timeline);
  let index = progress.stepIndex;
  while (index < lesson.steps.length) {
    const step = lesson.steps[index];
    if (!step) break;
    if (!passes(step, ctx)) break;
    index += 1;
  }
  if (index === progress.stepIndex) return progress;
  return {
    ...progress,
    stepIndex: Math.min(index, lesson.steps.length - 1),
    cleared: index >= lesson.steps.length,
  };
}

/** assert が例外を投げても落とさない */
export function passes(step: LessonStep, ctx: AssertContext): boolean {
  try {
    return step.assert(ctx);
  } catch {
    return false;
  }
}

export function useHint(progress: LessonProgressState): LessonProgressState {
  return { ...progress, hintsUsed: progress.hintsUsed + 1 };
}

export function currentStep(lesson: LessonDefinition, progress: LessonProgressState) {
  return lesson.steps[Math.min(progress.stepIndex, lesson.steps.length - 1)];
}
