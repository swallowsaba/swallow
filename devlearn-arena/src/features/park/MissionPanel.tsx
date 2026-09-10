import { missions } from '@/engines/lesson/missions';
import { useT } from '@/i18n/useT';
import type { LessonDefinition, LessonProgressState, LessonStep } from '@/engines/lesson/types';
import { Assist } from './Assist';
import { StepChecklist, type PartState } from './StepChecklist';

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
  /** 通過条件の内訳。いまどこまで満たせているか */
  parts: readonly PartState[];
  /** 直前のコマンドが失敗していれば、その出力 */
  lastError: string | null;
  /** いまの手順で通らなかった回数 */
  attempts: number;
  untilNextHint: number;
  /** 詰まりきったときに見せる答え */
  answer: string | null;
  /** ヒントが自動で開いたか */
  autoOpened: boolean;
  nextMission: LessonDefinition | null;
  onRevealHint: () => void;
  onSwitch: (id: string) => void;
  onInsert: (text: string) => void;
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
  parts,
  lastError,
  attempts,
  untilNextHint,
  answer,
  autoOpened,
  nextMission,
  onRevealHint,
  onSwitch,
  onInsert,
}: Props) {
  const t = useT();
  return (
    <div className="scroll m-3 min-h-0 overflow-y-auto px-6 py-5">
      <p className="text-sm font-bold text-ink-soft">
        {progress.cleared ? t('park.done') : t('park.todo', { n: progress.stepIndex + 1 })}
      </p>
      <p className="mt-1 text-xl font-bold leading-snug">
        {progress.cleared ? t('park.missionDone') : (step?.prompt ?? '')}
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
              {t('park.nextMission', { title: nextMission.title })}
            </button>
          ) : (
            <p className="text-base font-bold text-[var(--ok)]">
              {t('park.allDone')}
            </p>
          )}

          <div>
            <p className="text-sm font-bold text-ink-soft">{t('park.missionList')}</p>
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
                        {m.kind === 'boss' ? t('park.kind.boss') : t('park.kind.training')} ·{' '}
                      {t('park.steps', { n: m.steps.length })}
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
        <StepChecklist parts={parts} fallback={step.check} passingNow={passingNow} />
      ) : null}

      {/* 読み上げにも届くよう、指摘は live region に置く */}
      <div role="status" aria-live="polite" className="empty:hidden">
        {diagnosis !== null && !progress.cleared ? (
          <p className="mt-3 border-l-4 border-[var(--warn)] bg-[var(--gold)]/25 px-3 py-2 text-sm">
            <span className="font-bold">{t('park.close')}: </span>
            {diagnosis}
          </p>
        ) : null}
      </div>

      {!progress.cleared ? (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                onRevealHint();
              }}
              disabled={step === undefined || revealedHints >= step.hints.length}
              className="knob px-4 py-1.5 text-sm disabled:opacity-50"
            >
              {t('park.hint')}
            </button>
            {autoOpened ? (
              <span className="text-xs text-ink-soft">{t('park.autoHint')}</span>
            ) : null}
          </div>
          <ul className="mt-2 flex flex-col gap-1">
            {step?.hints.slice(0, revealedHints).map((hint) => (
              <li key={hint} className="flex items-start gap-2">
                <span aria-hidden className="text-ink-soft">›</span>
                <span className="font-mono text-sm text-ink">{hint}</span>
              </li>
            ))}
          </ul>
          <Assist
            lastError={lastError}
            attempts={attempts}
            untilNextHint={untilNextHint}
            answer={answer}
            onInsert={onInsert}
          />
        </>
      ) : null}
    </div>
  );
}
