import { createClock } from '@/engines/kernel/clock';
import { createDefaultRegistry } from '@/engines/kernel/commands';
import type { ShellState } from '@/engines/kernel/registry';
import { createShellState } from '@/engines/kernel/session';
import { execute } from '@/engines/kernel/shell';
import { createProgress, evaluate } from '../runner';
import type { LessonDefinition, LessonProgressState } from '../types';

const registry = createDefaultRegistry();

export interface PlayResult {
  cleared: boolean;
  progress: LessonProgressState;
  timeline: ShellState[];
  /** 止まった手順の説明。落ちたときに何が足りないかを出すため */
  stuckAt: string | null;
  /** 各行の終了コード */
  exitCodes: number[];
}

/**
 * 模範解答を順に打って、その任務が本当に解けるかを確かめる。
 * 任務が増えても「解けること」を機械的に担保できるようにする。
 */
export function play(mission: LessonDefinition, lines: readonly string[]): PlayResult {
  const clock = createClock();
  const timeline: ShellState[] = [createShellState(mission.initial)];
  const exitCodes: number[] = [];
  let progress = createProgress(mission);

  for (const line of lines) {
    const last = timeline[timeline.length - 1];
    if (!last) break;
    const outcome = execute(last, line, registry, clock);
    timeline.push(outcome.state);
    exitCodes.push(outcome.exitCode);
    progress = evaluate(mission, progress, timeline);
    if (progress.cleared) break;
  }

  return {
    cleared: progress.cleared,
    progress,
    timeline,
    exitCodes,
    stuckAt: progress.cleared ? null : (mission.steps[progress.stepIndex]?.check ?? null),
  };
}

/** 落ちたときに読める形にする */
export function explainFailure(mission: LessonDefinition, result: PlayResult): string {
  return [
    `${mission.id} を模範解答で解けませんでした。`,
    `止まった手順 ${String(result.progress.stepIndex + 1)}/${String(mission.steps.length)}: ${result.stuckAt ?? ''}`,
    `終了コード: ${result.exitCodes.join(',')}`,
  ].join('\n');
}
