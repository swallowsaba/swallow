import type { ShellState } from '@/engines/kernel/registry';
import type { AssertContext, LessonDefinition, LessonProgressState } from './types';

export function createProgress(): LessonProgressState {
  return { stepIndex: 0, cleared: false, hintsUsed: 0, commandsUsed: 0 };
}

export function buildContext(timeline: readonly ShellState[]): AssertContext {
  const shell = timeline[timeline.length - 1];
  if (!shell) throw new Error('timeline が空です');
  return { shell, history: shell.history, timeline };
}

/**
 * 1コマンド実行ごとに呼ぶ。
 * 満たされた手順は連続して先に進める（1コマンドで2手順ぶん進む解答を許容する）。
 */
export function advance(
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
    let passed = false;
    try {
      passed = step.assert(ctx);
    } catch {
      passed = false;
    }
    if (!passed) break;
    index += 1;
  }
  return {
    ...progress,
    stepIndex: Math.min(index, lesson.steps.length - 1),
    cleared: index >= lesson.steps.length,
    commandsUsed: progress.commandsUsed + 1,
  };
}

export function useHint(progress: LessonProgressState): LessonProgressState {
  return { ...progress, hintsUsed: progress.hintsUsed + 1 };
}

export function currentStep(lesson: LessonDefinition, progress: LessonProgressState) {
  return lesson.steps[Math.min(progress.stepIndex, lesson.steps.length - 1)];
}
