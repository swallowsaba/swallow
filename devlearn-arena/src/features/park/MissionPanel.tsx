import { missions } from '@/engines/lesson/missions';
import type { LessonDefinition, LessonProgressState, LessonStep } from '@/engines/lesson/types';

interface Props {
  mission: LessonDefinition;
  /** クリア済みの任務 id。一覧に印を付けるのに使う */
  clearedIds: ReadonlySet<string>;
  progress: LessonProgressState;
  step: LessonStep | undefined;
  /** いま条件を満たしているか */
  passingNow: boolean;
  /** 通らなかったときの指摘。無ければ null */
  diagnosis: string | null;
  revealedHints: number;
  nextMission: LessonDefinition | null;
  onRevealHint: () => void;
  onSwitch: (id: string) => void;
}

/**
 * 学習画面の左上。いま何をすればよいかと、通過条件を出す。
 * 通過条件（check）は隠さない。何を満たせば通るのかが分かるほうが速く学べる。
 */
export function MissionPanel({
  mission,
  clearedIds,
  progress,
  step,
  passingNow,
  diagnosis,
  revealedHints,
  nextMission,
  onRevealHint,
  onSwitch,
}: Props) {
  return (
    <div className="scroll m-3 min-h-0 overflow-y-auto px-6 py-5">
      <p className="text-sm font-bold text-ink-soft">
        {progress.cleared ? '完了' : `やること ${String(progress.stepIndex + 1)}`}
      </p>
      <p className="mt-1 text-xl font-bold leading-snug">
        {progress.cleared ? 'この任務は完了しました。' : (step?.prompt ?? '')}
      </p>

      {progress.cleared ? (
        <div className="mt-4 flex flex-col gap-3">
          {nextMission ? (
            <button
              type="button"
              onClick={() => {
                onSwitch(nextMission.id);
              }}
              className="sign w-fit px-6 py-3 text-lg font-extrabold"
            >
              次の任務へ: {nextMission.title} →
            </button>
          ) : (
            <p className="text-base font-bold text-[var(--ok)]">
              今ある任務はすべてクリアしました。新しい任務は実装が進むたびに増えます。
            </p>
          )}

          <div>
            <p className="text-sm font-bold text-ink-soft">任務の一覧</p>
            <ul className="mt-2 flex flex-col gap-1">
              {missions.map((m) => {
                const done = clearedIds.has(m.id);
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onSwitch(m.id);
                      }}
                      className={`flex w-full items-center gap-3 border-2 px-3 py-2 text-left text-base ${
                        m.id === mission.id
                          ? 'border-wood-dark bg-gold'
                          : 'border-[var(--cream-dark)] bg-white/60 hover:border-wood-dark'
                      }`}
                    >
                      <span aria-hidden>{done ? '✓' : '・'}</span>
                      <span className="flex-1">{m.title}</span>
                      <span className="font-mono text-xs text-ink-soft">
                        {m.kind === 'boss' ? '障害対応' : '練習'} · {m.steps.length} 手順
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ) : null}

      {!progress.cleared && step ? (
        <p
          className={`mt-2 border-l-4 px-3 py-1.5 text-sm ${
            passingNow
              ? 'border-[var(--ok)] bg-[var(--ok)]/15'
              : 'border-[var(--cream-dark)] text-ink-soft'
          }`}
        >
          <span className="font-bold">{passingNow ? '達成 ' : '未達成 '}</span>
          {step.check}
        </p>
      ) : null}

      {/* 読み上げにも届くよう、指摘は live region に置く */}
      <div role="status" aria-live="polite" className="empty:hidden">
        {diagnosis !== null && !progress.cleared ? (
          <p className="mt-3 border-l-4 border-[var(--warn)] bg-[var(--gold)]/25 px-3 py-2 text-sm">
            <span className="font-bold">惜しい: </span>
            {diagnosis}
          </p>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            onRevealHint();
          }}
          disabled={step === undefined || revealedHints >= step.hints.length}
          className="knob px-4 py-1.5 text-sm disabled:opacity-50"
        >
          ヒント
        </button>
        {step?.hints.slice(0, revealedHints).map((hint) => (
          <span key={hint} className="font-mono text-sm text-ink">
            › {hint}
          </span>
        ))}
      </div>
    </div>
  );
}
