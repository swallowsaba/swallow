import { useMemo, useState } from 'react';
import { missionTerms } from '@/content/glossary';
import type { LessonDefinition, LessonProgressState } from '@/engines/lesson/types';
import { useT } from '@/i18n/useT';
import { Icon } from '@/ui/Icon';
import { commandLabel } from './stepLabel';
import { TermText } from './TermText';
import { HUD, SIZE, besideDock } from './theme';
import { FlowSteps } from '@/lesson/flow/FlowStage';

/** 札の中に一度に並べる語の数。これを超えたぶんは折り畳む */
const SHOWN_TERMS = 3;

interface Props {
  mission: LessonDefinition;
  progress: LessonProgressState;
  /** いま条件を満たしているか。満たした瞬間に印が変わる */
  passingNow: boolean;
  /** 通らなかったときの助言。1 行だけ出す */
  diagnosis: string | null;
  /** 端末で hint と打つか、この札のヒントを押して開いた数 */
  revealedHints: number;
  reward: { xp: number; rights: number };
  onHint: () => void;
  onWhy: () => void;
  /** 体験の段からやり直す */
  onReplay?: () => void;
}

/**
 * 課題の札。端末の右、上の帯の下に重なる。
 *
 * 見出し・2 行以内の説明・チェック項目・報酬・ヒント、それだけ。
 * 長い解説はここに書かず、「なぜ」から開く引き出しへ回す。
 */
export function TaskCard({ mission, progress, passingNow, diagnosis, revealedHints, reward, onHint, onWhy, onReplay }: Props) {
  const t = useT();
  const total = mission.steps.length;
  const at = Math.min(progress.stepIndex + (progress.cleared ? 1 : 0), total);
  const step = progress.cleared ? undefined : mission.steps[progress.stepIndex];
  const hints = (step?.hints ?? []).slice(0, revealedHints);
  // この任務で出てくる言葉。題・説明と、いまの手順までに出てきた語だけを拾う。
  // 先の手順の語を先回りして並べると、まだ触っていない物の名前を覚えさせることになる
  const reached = progress.cleared ? total - 1 : progress.stepIndex;
  const words = useMemo(() => missionTerms(mission, reached), [mission, reached]);
  const [allWords, setAllWords] = useState(false);
  const shown = allWords ? words : words.slice(0, SHOWN_TERMS);

  return (
    <section
      data-testid="task-card"
      className="absolute z-20 rounded-lg"
      style={{
        left: besideDock(16),
        top: SIZE.panelTop,
        width: SIZE.task,
        background: HUD.panel,
        border: `1px solid ${HUD.lineStrong}`,
        boxShadow: HUD.shadow,
        backdropFilter: 'blur(8px)',
      }}
    >
      <div
        className="flex items-center gap-2 overflow-hidden rounded-t-lg px-3 py-2.5"
        style={{
          background: 'linear-gradient(90deg, rgba(47,143,216,.25), rgba(47,143,216,0))',
          borderBottom: `1px solid ${HUD.line}`,
        }}
      >
        <Icon name="flag" size={16} />
        <span className="text-[12px]" style={{ color: HUD.accentText }}>
          {t('hud.task')}
        </span>
        <span className="min-w-0 flex-1 truncate text-[14px] font-bold">{mission.title}</span>
        <span className="shrink-0 text-[12px]" style={{ color: HUD.muted }} data-testid="task-progress">
          {t('hud.stepCount', { a: at, b: total })}
        </span>
      </div>

      <div className="flex flex-col gap-2 px-3 py-2.5">
        {/*
          操作の段（学びの流れ 4）。説明の文章は置かない。体験と登場で見たことを、コマンドで確かめる段。
          いまの手順には「この操作で何を確かめるのか」を先に 1 行で出す
        */}
        <div className="flex items-center gap-2">
          <FlowSteps at={progress.cleared ? 'recap' : 'operate'} compact />
          {onReplay === undefined ? null : (
            <button
              type="button"
              data-testid="task-replay"
              onClick={onReplay}
              className="ml-auto text-[11px]"
              style={{ color: HUD.accentText }}
            >
              体験からやり直す
            </button>
          )}
        </div>
        {step === undefined ? null : (
          <p data-testid="task-purpose" className="rounded px-2 py-1.5 text-[13px] leading-snug" style={{ background: HUD.accentFill, color: HUD.text }}>
            <span className="mr-1 text-[11.5px]" style={{ color: HUD.accentText }}>
              確かめること
            </span>
            {step.purpose}
          </p>
        )}

        <ul className="flex flex-col gap-1.5">
          {mission.steps.map((s, i) => {
            const done = progress.cleared || i < progress.stepIndex;
            const here = !progress.cleared && i === progress.stepIndex;
            const command = commandLabel(s.solution);
            return (
              <li key={`${String(i)}-${s.prompt}`} data-step={i} data-done={done ? 'true' : undefined} className={`flex gap-2 text-[13px] ${here ? 'items-start' : 'items-center'}`}>
                <span
                  aria-hidden
                  className="grid h-4 w-4 shrink-0 place-items-center rounded"
                  style={
                    done
                      ? { background: HUD.ok }
                      : { border: `1.5px solid ${here ? (passingNow ? HUD.ok : HUD.accent) : HUD.locked}` }
                  }
                >
                  {done ? <Icon name="check" size={11} strokeWidth={3} /> : null}
                </span>
                {/*
                  先の手順は中身を伏せる。まだ出てきていない言葉を先に見せないため。
                  いまの手順は折り返して全部見せ、用語にはその場で説明が浮かぶ
                */}
                <span
                  className={here || done ? 'min-w-0 flex-1' : 'min-w-0 flex-1 truncate'}
                  style={done ? { color: HUD.okDone } : here ? undefined : { color: HUD.muted }}
                >
                  {done ? (
                    <span style={{ textDecoration: 'line-through' }}>
                      <TermText text={s.prompt} />
                    </span>
                  ) : here ? (
                    <TermText text={s.prompt} tip />
                  ) : (
                    t('task.later')
                  )}
                  {done ? (
                    <span data-testid="task-afterward" className="block text-[11.5px] leading-snug" style={{ color: HUD.muted }}>
                      {`街で: ${s.afterward}`}
                    </span>
                  ) : null}
                </span>
                {command === '' ? null : (
                  <span className="shrink-0 font-mono text-[12px]" style={{ color: HUD.dim }}>
                    {command}
                  </span>
                )}
              </li>
            );
          })}
        </ul>

        {shown.length === 0 ? null : (
          <div data-testid="task-terms" className="rounded-md p-2" style={{ background: HUD.fillSoft, border: `1px solid ${HUD.line}` }}>
            <p className="text-[11px]" style={{ color: HUD.muted }}>
              {t('task.terms')}
            </p>
            <dl className="mt-1 flex flex-col gap-1">
              {shown.map((word) => (
                <div key={word.term} data-word={word.term} className="text-[12px] leading-snug">
                  <dt className="inline font-bold" style={{ color: HUD.text }}>
                    <TermText text={word.term} />
                  </dt>
                  <dd className="inline" style={{ color: HUD.soft }}>
                    {` … ${word.plain}`}
                  </dd>
                </div>
              ))}
            </dl>
            {words.length <= SHOWN_TERMS ? null : (
              <button
                type="button"
                data-testid="task-terms-more"
                onClick={() => {
                  setAllWords((was) => !was);
                }}
                className="mt-1 text-[11px]"
                style={{ color: HUD.accentText }}
              >
                {allWords ? t('task.termsLess') : t('task.termsMore', { n: words.length - SHOWN_TERMS })}
              </button>
            )}
          </div>
        )}

        {diagnosis === null ? null : (
          <p data-testid="task-diagnosis" className="text-[12px] leading-relaxed" style={{ color: HUD.warn }}>
            {diagnosis}
          </p>
        )}

        {hints.length === 0 ? null : (
          <ul data-testid="task-hints" className="flex flex-col gap-1">
            {hints.map((hint, i) => (
              <li key={`${String(i)}-${hint}`} className="font-mono text-[12px] leading-relaxed" style={{ color: HUD.accentText }}>
                {hint}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div
        className="flex items-center gap-2 rounded-b-lg px-3 py-2"
        style={{ borderTop: `1px solid ${HUD.line}`, background: HUD.fillSoft }}
      >
        <span className="text-[12px]" style={{ color: HUD.muted }}>
          {t('hud.reward')}
        </span>
        <span className="text-[12px]" style={{ color: HUD.warn }}>
          {t('hud.rewardXp', { n: reward.xp })}
        </span>
        <span className="text-[12px]" style={{ color: HUD.accent }}>
          {t('hud.rewardRights', { n: reward.rights })}
        </span>
        <button
          type="button"
          data-testid="task-why"
          onClick={onWhy}
          className="ml-auto h-7 rounded px-2 text-[12px]"
          style={{ border: `1px solid ${HUD.lineStrong}`, color: HUD.soft }}
        >
          {t('hud.why')}
        </button>
        <button
          type="button"
          data-testid="task-hint"
          onClick={onHint}
          className="h-7 rounded px-2.5 text-[12px]"
          style={{ border: `1px solid ${HUD.lineStrong}`, color: HUD.text }}
        >
          {t('hud.hint')}
        </button>
      </div>
    </section>
  );
}
