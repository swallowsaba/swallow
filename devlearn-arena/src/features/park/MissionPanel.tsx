import { useT } from '@/i18n/useT';
import type { LessonDefinition, LessonProgressState, LessonStep } from '@/engines/lesson/types';
import { FitBox } from '@/ui/FitBox';
import { Glossed } from '@/ui/Term';
import { Icon } from '@/ui/Icon';
import { takeawaysOf } from '@/engines/lesson/takeaways';
import { Assist } from './Assist';
import { PrerequisiteNote } from './PrerequisiteNote';
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
  /** 次に開くとよい任務。一覧の情報だけで足りるので組み立てない */
  nextMission: { id: string; title: string } | null;
  /** まだ終えていない前提の任務。止めずに知らせるだけ */
  prerequisites: readonly { id: string; title: string }[];
  /** いまの手順を、解答を実行して飛ばす */
  onSkip: () => void;
  onSwitch: (id: string) => void;
}

/**
 * 学習画面の左上。いま何をすればよいかと、通過条件を出す。
 * 通過条件（check）は隠さない。何を満たせば通るのかが分かるほうが速く学べる。
 */
export function MissionPanel({
  mission,
  clearedIds,
  total,
  progress,
  step,
  passingNow,
  diagnosis,
  revealedHints,
  parts,
  lastError,
  nextMission,
  prerequisites,
  onSkip,
  onSwitch,
}: Props) {
  const t = useT();
  return (
    // 行の高さは仕切りで決まる。ヒントや解答で中身が増えたら、送らずに字ごと縮めて収める
    <FitBox className="ui min-h-0 flex-1" testId="mission-fit">
      <div className="px-5 py-4">
      {progress.cleared ? null : (
        <div className="mb-3">
          <PrerequisiteNote prerequisites={prerequisites} onSwitch={onSwitch} />
        </div>
      )}
      <SkippedNotes mission={mission} skipped={progress.skipped} />
      <p className="ui-eyebrow flex items-center gap-1.5">
        <Icon name={progress.cleared ? 'check' : 'target'} size={13} />
        {progress.cleared ? t('park.done') : t('park.todo', { n: progress.stepIndex + 1 })}
      </p>
      <p className="mt-1 text-[20px] font-bold leading-snug tracking-tight">
        {progress.cleared ? t('park.missionDone') : <Glossed text={step?.prompt ?? ''} />}
      </p>

      <LastExplain mission={mission} progress={progress} />

      {progress.cleared ? (
        <div className="mt-4 flex flex-col gap-3">
          <section aria-label={t('takeaways.title')} className="ui-note ui-note-ok">
            <p className="ui-eyebrow flex items-center gap-1.5">
              <Icon name="book" size={13} />
              {t('takeaways.title')}
            </p>
            <ol className="mt-1 flex list-decimal flex-col gap-1 pl-5 leading-snug">
              {takeawaysOf(mission).map((line) => (
                <li key={line}>
                  <Glossed text={line} />
                </li>
              ))}
            </ol>
          </section>
          {nextMission ? (
            <button
              type="button"
              onClick={() => {
                onSwitch(nextMission.id);
              }}
              className="ui-btn ui-btn-primary h-11 w-fit px-5 text-[15px]"
            >
              {t('park.nextMission', { title: nextMission.title })}
              <Icon name="next" size={17} />
            </button>
          ) : (
            <p className="text-[14px] font-semibold text-[var(--u-ok)]">{t('park.allDone')}</p>
          )}

          <div className="ui-flat px-3 py-2">
            <p className="ui-eyebrow">{t('park.missionList')}</p>
            <p className="mt-1 text-[13px] text-[var(--u-text-2)]">{t('park.pickFromHeader')}</p>
            <p className="mt-1 font-mono text-[11px] text-[var(--u-text-3)]">{t('park.clearedCount', { a: clearedIds.size, b: total })}</p>
          </div>
        </div>
      ) : null}

      {!progress.cleared && step ? (
        <StepChecklist parts={parts} fallback={step.check} passingNow={passingNow} />
      ) : null}

      {/* 読み上げにも届くよう、指摘は live region に置く */}
      <div role="status" aria-live="polite" className="empty:hidden">
        {diagnosis !== null && !progress.cleared ? (
          <p className="ui-note ui-note-warn mt-3">
            <span className="font-bold">{t('park.close')}: </span>
            <Glossed text={diagnosis} />
          </p>
        ) : null}
      </div>

      {!progress.cleared ? (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onSkip}
              disabled={step === undefined}
              title={t('park.skipLead')}
              className="ui-btn ui-btn-plain h-8 px-3 text-[13px]"
            >
              <Icon name="skip" size={15} />
              {t('park.skip')}
            </button>
          </div>
          {/* ヒントは端末で hint と打ったときだけ出す。画面のボタンでは出さない */}
          {revealedHints === 0 ? (
            <p data-testid="hint-lead" className="mt-1.5 text-[11px] leading-relaxed text-[var(--u-text-3)]">
              {t('park.hintLead')} {t('park.skipLead')}
            </p>
          ) : null}
          <ul className="mt-2 flex flex-col gap-1">
            {step?.hints.slice(0, revealedHints).map((hint) => (
              <li key={hint} className="ui-note ui-note-info flex items-start gap-2 py-1.5">
                <Icon name="idea" size={14} className="mt-0.5" />
                <span className="font-mono text-[12px]">{hint}</span>
              </li>
            ))}
          </ul>
          <Assist lastError={lastError} />
        </>
      ) : null}
      </div>
    </FitBox>
  );
}

/**
 * 解答を見て飛ばした手順を残しておく。
 * 飛ばしたことを隠さず、あとで自分の手でやり直すきっかけにするため。
 */
function SkippedNotes({ mission, skipped }: { mission: LessonDefinition; skipped: readonly number[] }) {
  const t = useT();
  if (skipped.length === 0) return null;
  return (
    <div className="ui-note ui-note-warn mb-3">
      <ul className="flex flex-col gap-0.5">
        {skipped.map((index) => (
          <li key={index}>
            <span className="font-bold">{t('park.skipped', { n: index + 1 })}</span>
            <span className="opacity-80">
              {' — '}
              <Glossed text={mission.steps[index]?.prompt ?? ''} />
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-[11px] opacity-75">{t('park.skippedLead')}</p>
    </div>
  );
}

/**
 * 直前に通った手順で「何が起きたのか」を出す。
 * 通った瞬間に理由を読めば、打ったコマンドと起きたことが結び付く。
 */
function LastExplain({ mission, progress }: { mission: LessonDefinition; progress: LessonProgressState }) {
  const t = useT();
  const index = progress.cleared ? mission.steps.length - 1 : progress.stepIndex - 1;
  const step = index >= 0 ? mission.steps[index] : undefined;
  if (step === undefined) return null;
  return (
    <div className="ui-note ui-note-ok mt-3">
      <p className="ui-eyebrow flex items-center gap-1.5">
        <Icon name="check" size={13} strokeWidth={2.4} />
        {t('park.explainTitle', { n: index + 1 })}
      </p>
      <p className="mt-0.5 leading-relaxed">
        <Glossed text={step.explain} />
      </p>
    </div>
  );
}
