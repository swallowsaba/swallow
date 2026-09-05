import { currentStep } from '@/engines/lesson/runner';
import type { LessonDefinition, LessonProgressState } from '@/engines/lesson/types';
import { scoreAttempt } from '@/lib/xp';
import { Badge } from '@/ui/components/Badge';

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
    <section
      aria-live="polite"
      className={`cut border-2 bg-panel p-7 ${progress.cleared ? 'border-[var(--c-ok)]' : 'border-accent'}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="font-mono text-sm uppercase tracking-[0.2em] text-accent">MISSION</span>
          <h2 className="display text-2xl">{lesson.title}</h2>
        </div>
        <div className="flex items-center gap-3">
          {lesson.steps.map((_, i) => (
            <span
              key={i}
              aria-hidden
              className={`h-3 w-10 ${
                progress.cleared || i < progress.stepIndex
                  ? 'bg-[var(--c-ok)]'
                  : i === progress.stepIndex
                    ? 'bg-accent'
                    : 'bg-line'
              }`}
            />
          ))}
          <Badge tone={progress.cleared ? 'ok' : 'muted'} size="sm">
            {progress.cleared
              ? 'CLEAR'
              : `${String(progress.stepIndex + 1)} / ${String(lesson.steps.length)}`}
          </Badge>
        </div>
      </div>

      {progress.cleared ? (
        <>
          <p className="mt-5 text-2xl font-bold text-[var(--c-ok)]">全ての手順を達成しました</p>
          <p className="mt-2 text-base text-muted">
            判定は最終的な状態を見ています。別の解き方でも同じように通ります。
          </p>
          {step ? <p className="mt-3 text-base text-muted">{step.explain}</p> : null}
        </>
      ) : (
        <>
          <p className="mt-5 text-2xl leading-relaxed">{step?.prompt}</p>

          <div className="mt-6 flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={onHint}
              disabled={step === undefined || revealedHints >= step.hints.length}
              className="border-2 border-line px-5 py-2.5 font-mono text-sm text-muted transition-colors hover:border-[var(--c-warn)] hover:text-[var(--c-warn)] disabled:opacity-40"
            >
              ヒント（スコア −12）
            </button>
            <span className="font-mono text-sm text-muted">
              {String(progress.commandsUsed)} コマンド · スコア {String(score)}
            </span>
          </div>

          {revealedHints > 0 && step ? (
            <ul className="mt-4 flex flex-col gap-1">
              {step.hints.slice(0, revealedHints).map((hint) => (
                <li key={hint} className="font-mono text-base text-[var(--c-warn)]">
                  › {hint}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </section>
  );
}
