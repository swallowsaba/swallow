import type { LessonDefinition, LessonProgressState } from '@/engines/lesson/types';
import { currentStep } from '@/engines/lesson/runner';
import { scoreAttempt } from '@/lib/xp';

interface Props {
  lesson: LessonDefinition;
  progress: LessonProgressState;
  onHint: () => void;
  revealedHints: number;
}

export function MissionPanel({ lesson, progress, onHint, revealedHints }: Props) {
  const step = currentStep(lesson, progress);
  const score = scoreAttempt({
    hintsUsed: progress.hintsUsed,
    commandsUsed: progress.commandsUsed,
    parCommands: lesson.parCommands,
  });

  return (
    <section className="border border-line bg-panel/70 p-4" aria-live="polite">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">{lesson.title}</h2>
        <span className="font-mono text-[11px] text-muted">
          {progress.cleared ? 'クリア' : `${String(progress.stepIndex + 1)} / ${String(lesson.steps.length)}`}
          {' · '}
          {String(progress.commandsUsed)} コマンド · スコア {String(score)}
        </span>
      </div>

      {progress.cleared ? (
        <p className="mt-3 text-sm text-[var(--c-ok)]">
          全ての手順を満たしました。判定は最終的な状態を見ているので、別の解き方でも通ります。
        </p>
      ) : (
        <>
          <p className="mt-3 text-sm">{step?.prompt}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onHint}
              disabled={step === undefined || revealedHints >= step.hints.length}
              className="border border-line px-2 py-1 font-mono text-[11px] text-muted hover:border-accent disabled:opacity-40"
            >
              ヒントを見る（スコア −12）
            </button>
            {step?.hints.slice(0, revealedHints).map((hint) => (
              <span key={hint} className="font-mono text-[11px] text-[var(--c-warn)]">
                {hint}
              </span>
            ))}
          </div>
        </>
      )}

      {progress.cleared && step ? <p className="mt-2 text-xs text-muted">{step.explain}</p> : null}
    </section>
  );
}
