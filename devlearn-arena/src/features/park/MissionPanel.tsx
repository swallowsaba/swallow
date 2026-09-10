import { useT } from '@/i18n/useT';
import type { LessonDefinition, LessonProgressState, LessonStep } from '@/engines/lesson/types';
import { Assist } from './Assist';
import { StepChecklist, type PartState } from './StepChecklist';

interface Props {
  mission: LessonDefinition;
  /** クリア済みの任務 id */
  clearedIds: ReadonlySet<string>;
  /** 用意されている任務の総数 */
  total: number;
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
  /** 次に開くとよい任務。一覧の情報だけで足りるので組み立てない */
  nextMission: { id: string; title: string } | null;
  onRevealHint: () => void;
  onSwitch: (id: string) => void;
  onInsert: (text: string) => void;
}

/**
 * 学習画面の左上。いま何をすればよいかと、通過条件を出す。
 * 通過条件（check）は隠さない。何を満たせば通るのかが分かるほうが速く学べる。
 */
export function MissionPanel({
  clearedIds,
  total,
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
            <p className="mt-1 text-sm text-ink-soft">{t('park.pickFromHeader')}</p>
            <p className="mt-1 font-mono text-xs text-ink-soft">
              {t('park.clearedCount', { a: clearedIds.size, b: total })}
            </p>
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
