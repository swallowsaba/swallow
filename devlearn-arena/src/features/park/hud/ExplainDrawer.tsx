import { useMemo, useState } from 'react';
import { briefingQuiz, quizPool } from '@/engines/lesson/briefing';
import type { LessonDefinition } from '@/engines/lesson/types';
import { useT } from '@/i18n/useT';
import { Icon } from '@/ui/Icon';
import { HUD, SIZE } from './theme';

interface Props {
  mission: LessonDefinition;
  onClose: () => void;
  /** 理解度の問題に正解したとき。街に家が増える */
  onAnswer: () => void;
}

/**
 * 解説の引き出し。課題の札の「なぜ」から開く。
 *
 * 開くかどうかは学習者が決める。読まないと進めない作りにはしない。
 * 端末も街も生きたままなので、読みながら打てる。
 */
export function ExplainDrawer({ mission, onClose, onAnswer }: Props) {
  const t = useT();
  const questions = useMemo(
    () => briefingQuiz(mission.id, mission.intro, quizPool(mission.track)),
    [mission],
  );
  const [index, setIndex] = useState(0);
  const [wrong, setWrong] = useState<ReadonlySet<number>>(new Set());
  const [solved, setSolved] = useState(false);
  const question = questions[index];

  const choose = (i: number): void => {
    if (!question || solved || wrong.has(i)) return;
    if (i === question.answer) {
      setSolved(true);
      onAnswer();
      return;
    }
    setWrong((set) => new Set([...set, i]));
  };

  const advance = (): void => {
    setIndex((n) => Math.min(questions.length - 1, n + 1));
    setWrong(new Set());
    setSolved(false);
  };

  return (
    <section
      data-testid="explain-drawer"
      aria-label={t('hud.explain')}
      className="absolute z-30 flex flex-col overflow-hidden rounded-lg"
      style={{
        left: SIZE.dock + 16,
        top: SIZE.panelTop,
        bottom: 96,
        width: 520,
        background: HUD.panel,
        border: `1px solid ${HUD.lineStrong}`,
        boxShadow: HUD.shadow,
        backdropFilter: 'blur(8px)',
      }}
    >
      <div className="flex shrink-0 items-center gap-2 px-3 py-2.5" style={{ borderBottom: `1px solid ${HUD.line}` }}>
        <Icon name="book" size={16} />
        <span className="text-[13px] font-bold">{t('hud.explain')}</span>
        <span className="min-w-0 flex-1 truncate text-[12px]" style={{ color: HUD.muted }}>
          {mission.title}
        </span>
        <button
          type="button"
          data-testid="explain-close"
          aria-label={t('hud.close')}
          onClick={onClose}
          className="grid h-7 w-7 shrink-0 place-items-center rounded"
          style={{ background: HUD.fill, color: HUD.soft }}
        >
          <Icon name="close" size={12} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3.5 py-3 text-[13px] leading-relaxed">
        <p className="text-[12px]" style={{ color: HUD.muted }}>{t('intro.why')}</p>
        <p className="mt-1" style={{ color: HUD.soft }}>{mission.intro.why}</p>

        {mission.intro.concepts.length === 0 ? null : (
          <>
            <p className="mt-4 text-[12px]" style={{ color: HUD.muted }}>{t('intro.concepts')}</p>
            <dl className="mt-1 flex flex-col gap-1.5">
              {mission.intro.concepts.map((c) => (
                <div key={c.term}>
                  <dt className="font-bold">{c.term}</dt>
                  <dd style={{ color: HUD.soft }}>{c.plain}</dd>
                </div>
              ))}
            </dl>
          </>
        )}

        {mission.intro.commands.length === 0 ? null : (
          <>
            <p className="mt-4 text-[12px]" style={{ color: HUD.muted }}>{t('intro.commands')}</p>
            <dl className="mt-1 flex flex-col gap-1.5">
              {mission.intro.commands.map((c) => (
                <div key={c.command}>
                  <dt className="font-mono text-[12px]" style={{ color: HUD.accentText }}>{c.command}</dt>
                  <dd style={{ color: HUD.soft }}>{c.means}</dd>
                </div>
              ))}
            </dl>
          </>
        )}

        {question === undefined ? null : (
          <div data-testid="explain-quiz" className="mt-4 rounded-md p-3" style={{ background: HUD.fillSoft, border: `1px solid ${HUD.line}` }}>
            <p className="text-[12px]" style={{ color: HUD.muted }}>
              {t('brief.quizTitle', { a: index + 1, b: questions.length })}
            </p>
            <p className="mt-1 font-bold">
              {question.kind === 'concept'
                ? t('brief.quizConcept', { term: question.subject })
                : t('brief.quizCommand', { command: question.subject })}
            </p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {question.choices.map((choice, i) => (
                <li key={choice}>
                  <button
                    type="button"
                    data-choice={i}
                    data-correct={i === question.answer ? 'true' : undefined}
                    onClick={() => { choose(i); }}
                    className="w-full rounded px-2.5 py-1.5 text-left text-[13px]"
                    style={{
                      border: `1px solid ${solved && i === question.answer ? HUD.ok : wrong.has(i) ? HUD.bad : HUD.line}`,
                      background: solved && i === question.answer ? 'rgba(55,179,122,.14)' : HUD.fillSoft,
                      color: wrong.has(i) ? HUD.muted : HUD.text,
                    }}
                  >
                    {choice}
                  </button>
                </li>
              ))}
            </ul>
            {solved ? (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-[12px]" style={{ color: HUD.okText }}>{t('brief.correct')}</span>
                {index + 1 < questions.length ? (
                  <button
                    type="button"
                    data-testid="explain-quiz-advance"
                    onClick={advance}
                    className="ml-auto h-7 rounded px-2.5 text-[12px]"
                    style={{ border: `1px solid ${HUD.lineStrong}`, color: HUD.text }}
                  >
                    {t('brief.nextQuestion')}
                  </button>
                ) : null}
              </div>
            ) : wrong.size > 0 ? (
              <p className="mt-2 text-[12px]" style={{ color: HUD.warn }}>{t('brief.wrong')}</p>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
