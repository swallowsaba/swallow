import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  briefingQuiz, briefingScript, QUEST_GIVER, quizPool, tryouts, type BriefingLine, type QuizQuestion, type Tryout,
} from '@/engines/lesson/briefing';
import type { LessonDefinition } from '@/engines/lesson/types';
import { useT } from '@/i18n/useT';
import { useMotionEnabled } from '@/ui/motion';
import { Glossed } from '@/ui/Term';
import { CityPortrait } from '@/visual/game/cityArt';
import { PrerequisiteNote } from './PrerequisiteNote';

interface Props {
  mission: LessonDefinition;
  prerequisites?: readonly { id: string; title: string }[];
  onStart: () => void;
  onSwitch?: (id: string) => void;
  /** 一度聞いた依頼なら、話を飛ばして作業に戻れる */
  canSkip?: boolean;
  /** 理解度チェックに正解した（firstTry = 一度も間違えずに）。街の予算になる */
  onAnswer?: (question: number, firstTry: boolean) => void;
}

type Phase = 'talk' | 'quiz' | 'try' | 'plan';
const PHASES: readonly Phase[] = ['talk', 'quiz', 'try', 'plan'];

/**
 * 任務を始める前の「依頼」。
 *
 * 説明を文章の一覧で読ませる代わりに、街の依頼主が 1 つずつ話す（なぜ要るか・言葉・道具・工程）。
 * 次に理解度チェックで言葉とコマンドの意味を確かめ、正解したコマンドは道具として手に入る。
 * 穴埋めの無い道具は練習用の街で実際に打って結果を見てから、建設計画を確かめて建設（端末での作業）に入る。
 * どの段階も飛ばせる（Esc か「説明をとばす」）。間違えても罰は無い。
 */
export function Briefing({ mission, prerequisites = [], onStart, onSwitch, canSkip = false, onAnswer }: Props) {
  const t = useT();
  const animate = useMotionEnabled();
  const giver = QUEST_GIVER[mission.track];
  const script = useMemo(() => briefingScript(mission.title, mission.intro, mission.steps), [mission]);
  const quiz = useMemo(() => briefingQuiz(mission.id, mission.intro, quizPool(mission.track)), [mission]);
  const tries = useMemo(() => tryouts(mission.intro, mission.initial), [mission]);

  const [phase, setPhase] = useState<Phase>('talk');
  const [line, setLine] = useState(0);
  const [bag, setBag] = useState<string[]>([]);

  const reviewLine = useCallback(
    (subject: string) => {
      const index = script.findIndex((l) => (l.kind === 'concept' && l.term === subject) || (l.kind === 'tool' && l.command === subject));
      setLine(Math.max(0, index));
      setPhase('talk');
    },
    [script],
  );

  return (
    <section aria-labelledby="briefing-title" data-testid="briefing" className="flex flex-col">
      <div className="flex flex-col">
        <header className="flex flex-wrap items-center gap-3 border-b-4 border-wood-dark bg-[var(--wood)] px-4 py-2">
          <span className="sign px-3 py-1 text-sm font-extrabold">📜 {t('brief.label')}</span>
          <h2 id="briefing-title" className="min-w-0 flex-1 truncate text-lg font-extrabold text-cream">
            {mission.title}
          </h2>
          {canSkip ? (
            <button type="button" onClick={onStart} className="knob px-3 py-1.5 text-xs">
              {t('brief.skip')}
            </button>
          ) : null}
        </header>

        <nav aria-label={t('brief.phases')} className="flex flex-wrap gap-1 border-b-2 border-[var(--cream-dark)] bg-[var(--cream-dark)] px-3 py-2">
          {PHASES.map((p, i) => (
            <button
              key={p}
              type="button"
              aria-current={phase === p ? 'step' : undefined}
              data-phase={p}
              onClick={() => {
                setPhase(p);
              }}
              className={`px-3 py-1 text-sm font-extrabold ${phase === p ? 'bg-gold text-ink' : 'text-ink-soft hover:text-ink'}`}
            >
              {i + 1}. {t(`brief.phase.${p}`)}
            </button>
          ))}
        </nav>

        {onSwitch && prerequisites.length > 0 ? (
          <div className="px-4 pt-3">
            <PrerequisiteNote prerequisites={prerequisites} onSwitch={onSwitch} />
          </div>
        ) : null}

        <div className="grid gap-3 p-3 sm:grid-cols-[auto_1fr]">
          <div className="flex flex-row items-end gap-3 sm:flex-col sm:items-center">
            <CityPortrait track={mission.track} talking={phase === 'talk'} animate={animate} size={4} />
            <span className="plate px-3 py-1 text-sm font-extrabold">{t('brief.giver', giver)}</span>
          </div>

          <div className="min-w-0">
            {phase === 'talk' ? (
              <Talk
                script={script}
                line={line}
                onLine={setLine}
                animate={animate}
                onDone={() => {
                  setPhase(quiz.length > 0 ? 'quiz' : 'try');
                }}
              />
            ) : phase === 'quiz' ? (
              <Quiz
                questions={quiz}
                bag={bag}
                animate={animate}
                onAnswer={onAnswer}
                onReward={(tool) => {
                  setBag((list) => (list.includes(tool) ? list : [...list, tool]));
                }}
                onReview={reviewLine}
                onDone={() => {
                  setPhase('try');
                }}
              />
            ) : phase === 'try' ? (
              <TryTools
                tries={tries}
                fieldTools={mission.intro.commands.filter((c) => !tries.some((tr) => tr.command === c.command))}
                onDone={() => {
                  setPhase('plan');
                }}
              />
            ) : (
              <Plan mission={mission} onStart={onStart} />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------- 1. 話を聞く ---------------- */

const LINE_LABEL: Record<BriefingLine['kind'], 'brief.request' | 'brief.why' | 'brief.concept' | 'brief.tool' | 'brief.plan'> = {
  request: 'brief.request',
  why: 'brief.why',
  concept: 'brief.concept',
  tool: 'brief.tool',
  plan: 'brief.plan',
};

function Talk({ script, line, onLine, onDone, animate }: {
  script: readonly BriefingLine[];
  line: number;
  onLine: (n: number) => void;
  onDone: () => void;
  animate: boolean;
}) {
  const t = useT();
  const nextRef = useRef<HTMLButtonElement>(null);
  const current = script[line];
  const last = line >= script.length - 1;

  useEffect(() => {
    nextRef.current?.focus();
  }, [line]);

  if (current === undefined) return null;
  return (
    <div className="flex flex-col gap-3">
      <div className="relative border-4 border-wood-dark bg-white px-5 py-4 shadow-[4px_4px_0_rgba(0,0,0,0.2)]" data-testid="speech">
        {/* 吹き出しの尻尾 */}
        <span aria-hidden className="absolute -left-3 top-8 hidden h-5 w-5 rotate-45 border-b-4 border-l-4 border-wood-dark bg-white sm:block" />
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-extrabold text-ink-soft">{t(LINE_LABEL[current.kind])}</p>
          <p className="font-mono text-xs text-ink-soft">{t('brief.lineCount', { a: line + 1, b: script.length })}</p>
        </div>
        <AnimatePresence mode="wait">
          <motion.div
            key={line}
            initial={animate ? { opacity: 0, y: 6 } : false}
            animate={{ opacity: 1, y: 0 }}
            exit={animate ? { opacity: 0 } : undefined}
            transition={{ duration: 0.18 }}
            className="mt-2"
            aria-live="polite"
          >
            {current.kind === 'concept' ? (
              <>
                <p className="plate inline-block px-3 py-1 text-lg font-extrabold">{current.term}</p>
                <p className="mt-2 text-lg leading-relaxed">
                  <Glossed text={current.text} />
                </p>
              </>
            ) : current.kind === 'tool' ? (
              <>
                <code className="inline-block whitespace-pre-wrap bg-[var(--wood-dark)] px-3 py-1.5 font-mono text-base text-cream">
                  {current.command}
                </code>
                <p className="mt-2 text-lg leading-relaxed">
                  <Glossed text={current.text} />
                </p>
              </>
            ) : current.kind === 'plan' ? (
              <ol className="flex flex-col gap-1.5">
                {current.steps.map((step, i) => (
                  <li key={`${String(i)}-${step}`} className="flex items-start gap-2 text-base leading-snug">
                    <span className="sign shrink-0 px-2 text-xs font-extrabold">{i + 1}</span>
                    <span className="min-w-0">
                      <Glossed text={step} />
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-lg leading-relaxed">
                <Glossed text={current.text} />
              </p>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            onLine(Math.max(0, line - 1));
          }}
          disabled={line === 0}
          className="knob px-3 py-1.5 text-sm disabled:opacity-40"
        >
          {t('brief.back')}
        </button>
        <div className="flex flex-1 justify-center gap-1" aria-hidden>
          {script.map((_, i) => (
            <span key={i} className={`h-2 w-2 ${i <= line ? 'bg-[var(--gold-dark)]' : 'bg-[var(--cream-dark)]'}`} />
          ))}
        </div>
        <button
          ref={nextRef}
          type="button"
          data-testid="talk-next"
          onClick={() => {
            if (last) onDone();
            else onLine(line + 1);
          }}
          className="sign px-5 py-2 text-base font-extrabold"
        >
          {last ? t('brief.toQuiz') : t('brief.next')}
        </button>
      </div>
    </div>
  );
}

/* ---------------- 2. 理解度チェック ---------------- */

function Quiz({ questions, bag, onReward, onReview, onDone, animate, onAnswer }: {
  onAnswer?: (question: number, firstTry: boolean) => void;
  questions: readonly QuizQuestion[];
  bag: readonly string[];
  onReward: (tool: string) => void;
  onReview: (subject: string) => void;
  onDone: () => void;
  animate: boolean;
}) {
  const t = useT();
  const [index, setIndex] = useState(0);
  const [wrong, setWrong] = useState<ReadonlySet<number>>(new Set());
  const [solved, setSolved] = useState(false);
  const question = questions[index];

  if (question === undefined) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-base">{t('brief.noQuiz')}</p>
        <button type="button" onClick={onDone} className="sign w-fit px-5 py-2 font-extrabold">
          {t('brief.toTry')}
        </button>
      </div>
    );
  }

  const last = index >= questions.length - 1;
  const choose = (i: number) => {
    if (solved) return;
    if (i === question.answer) {
      setSolved(true);
      onAnswer?.(index, wrong.size === 0);
      if (question.reward !== null) onReward(question.reward);
    } else {
      setWrong((set) => new Set([...set, i]));
    }
  };

  return (
    <div className="flex flex-col gap-3" data-testid="quiz">
      <p className="font-mono text-xs text-ink-soft">{t('brief.quizTitle', { a: index + 1, b: questions.length })}</p>
      <p className="text-xl font-extrabold leading-snug">
        {question.kind === 'concept'
          ? t('brief.quizConcept', { term: question.subject })
          : t('brief.quizCommand', { command: question.subject })}
      </p>
      <ul className="flex flex-col gap-2">
        {question.choices.map((choice, i) => {
          const isWrong = wrong.has(i);
          const isRight = solved && i === question.answer;
          return (
            <li key={choice}>
              <motion.button
                type="button"
                data-choice={i}
                data-correct={i === question.answer ? 'true' : 'false'}
                disabled={isWrong || solved}
                onClick={() => {
                  choose(i);
                }}
                animate={animate && isWrong ? { x: [0, -6, 6, -4, 0] } : { x: 0 }}
                transition={{ duration: 0.3 }}
                className={`w-full border-4 px-4 py-3 text-left text-base leading-snug ${
                  isRight
                    ? 'border-[var(--ok)] bg-[#cfe8c0]'
                    : isWrong
                      ? 'border-[var(--bad)] bg-[#f3c4bb] opacity-70'
                      : 'border-wood-dark bg-white hover:bg-[var(--gold)]/30'
                }`}
              >
                {isRight ? '✓ ' : isWrong ? '✗ ' : ''}
                {choice}
              </motion.button>
            </li>
          );
        })}
      </ul>

      <div role="status" aria-live="polite">
        {solved ? (
          <motion.p
            initial={animate ? { scale: 0.8, opacity: 0 } : false}
            animate={{ scale: 1, opacity: 1 }}
            className="border-l-4 border-[var(--ok)] bg-[#cfe8c0] px-3 py-2 font-extrabold"
          >
            {t('brief.correct')}{' '}
            {question.reward !== null
              ? `🎒 ${t('brief.gotTool', { command: question.reward })}`
              : `📘 ${t('brief.gotWord', { term: question.subject })}`}
          </motion.p>
        ) : wrong.size > 0 ? (
          <div className="flex flex-wrap items-center gap-2 border-l-4 border-[var(--warn)] bg-[var(--gold)]/25 px-3 py-2">
            <span className="font-bold">{t('brief.wrong')}</span>
            <span className="text-sm">{t('brief.wrongHint', { subject: question.subject })}</span>
            <button
              type="button"
              className="knob px-2 py-0.5 text-xs"
              onClick={() => {
                onReview(question.subject);
              }}
            >
              {t('brief.review')}
            </button>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1 text-xs">
          <span className="font-extrabold">🎒 {t('brief.bag')}:</span>
          {bag.length === 0 ? (
            <span className="text-ink-soft">{t('brief.bagEmpty')}</span>
          ) : (
            bag.map((tool) => (
              <code key={tool} className="bg-[var(--wood-dark)] px-1.5 py-0.5 font-mono text-cream">
                {tool}
              </code>
            ))
          )}
        </div>
        {solved ? (
          <button
            type="button"
            data-testid="quiz-next"
            onClick={() => {
              if (last) {
                onDone();
                return;
              }
              setIndex(index + 1);
              setWrong(new Set());
              setSolved(false);
            }}
            className="sign px-5 py-2 font-extrabold"
          >
            {last ? t('brief.toTry') : t('brief.nextQuestion')}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/* ---------------- 3. 道具を試す ---------------- */

function TryTools({ tries, fieldTools, onDone }: {
  tries: readonly Tryout[];
  fieldTools: readonly { command: string; means: string }[];
  onDone: () => void;
}) {
  const t = useT();
  const [shown, setShown] = useState<ReadonlySet<number>>(new Set());
  return (
    <div className="flex flex-col gap-3" data-testid="try">
      <p className="text-base">{tries.length > 0 ? t('brief.tryLead') : t('brief.tryNone')}</p>
      <ul className="flex flex-col gap-2">
        {tries.map((tr, i) => (
          <li key={tr.command} className="border-4 border-wood-dark bg-white">
            <div className="flex flex-wrap items-center gap-2 px-3 py-2">
              <code className="bg-[var(--wood-dark)] px-2 py-1 font-mono text-sm text-cream">{tr.command}</code>
              <span className="min-w-0 flex-1 text-sm">
                <Glossed text={tr.means} />
              </span>
              <button
                type="button"
                data-try={i}
                onClick={() => {
                  setShown((set) => new Set([...set, i]));
                }}
                className="knob px-3 py-1 text-sm"
              >
                {shown.has(i) ? t('brief.tryAgain') : t('brief.tryRun')}
              </button>
            </div>
            {shown.has(i) ? (
              <pre data-testid="try-output" className="max-h-48 overflow-auto bg-[#0a0d12] px-3 py-2 font-mono text-xs leading-relaxed text-[#e6edf3]">
                <span className="text-[#9fd67a]">learner@practice:~$ </span>
                {tr.command}
                {'\n'}
                {tr.output.length > 0 ? tr.output.join('\n') : tr.ok ? t('brief.tryNoOutput') : ''}
                {tr.ok ? '' : `\n# ${t('brief.tryFailed')}`}
              </pre>
            ) : null}
          </li>
        ))}
      </ul>
      {fieldTools.length > 0 ? (
        <div>
          <p className="text-xs font-extrabold text-ink-soft">{t('brief.fieldTools')}</p>
          <ul className="mt-1 flex flex-col gap-1">
            {fieldTools.map((c) => (
              <li key={c.command} className="flex flex-wrap items-baseline gap-2 text-sm">
                <code className="bg-[var(--cream-dark)] px-1.5 py-0.5 font-mono">{c.command}</code>
                <span>
                  <Glossed text={c.means} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <button type="button" data-testid="try-next" onClick={onDone} className="sign w-fit px-5 py-2 font-extrabold">
        {t('brief.toPlan')}
      </button>
    </div>
  );
}

/* ---------------- 4. 作業の段取り ---------------- */

function Plan({ mission, onStart }: { mission: LessonDefinition; onStart: () => void }) {
  const t = useT();
  const startRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    startRef.current?.focus();
  }, []);

  return (
    <div className="flex flex-col gap-3" data-testid="plan">
      <p className="text-base">{t('brief.planLead')}</p>
      <ol className="flex flex-col gap-1.5">
        {mission.steps.map((step, i) => (
          <li key={`${String(i)}-${step.prompt}`} className="flex items-start gap-2 border-2 border-[var(--cream-dark)] bg-white px-2 py-1.5 text-sm leading-snug">
            <span className="sign shrink-0 px-2 text-xs font-extrabold">{i + 1}</span>
            <span className="min-w-0">
              <Glossed text={step.prompt} />
            </span>
          </li>
        ))}
      </ol>
      <button ref={startRef} type="button" onClick={onStart} className="sign w-fit px-8 py-3 text-lg font-extrabold">
        {t('brief.start')}
      </button>
    </div>
  );
}
