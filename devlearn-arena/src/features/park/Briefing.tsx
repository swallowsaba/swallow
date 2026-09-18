import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  briefingQuiz, briefingScript, QUEST_GIVER, quizPool, tryouts, type BriefingLine, type QuizQuestion, type Tryout,
} from '@/engines/lesson/briefing';
import { createSession } from '@/engines/kernel/session';
import type { ShellState } from '@/engines/kernel/registry';
import type { LessonDefinition, MissionTrack } from '@/engines/lesson/types';
import { useT } from '@/i18n/useT';
import { useMotionEnabled } from '@/ui/motion';
import { Glossed } from '@/ui/Term';
import { CityPortrait } from '@/visual/game/cityArt';
import { FooterBar } from '@/ui/FooterBar';
import { FOOTER_SLOT_CLASS, useFooterSlot } from '@/ui/footerSlot';
import { Streak } from '@/ui/AnswerStamp';
import { FitBox } from '@/ui/FitBox';
import { Icon, type IconName } from '@/ui/Icon';
import { useSfx } from '@/lib/useSfx';
import { PrerequisiteNote } from './PrerequisiteNote';
import { TalkStage, ToolRun } from './TalkStage';

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
const PHASE_ICON: Record<Phase, IconName> = { talk: 'request', quiz: 'quiz', try: 'tool', plan: 'plan' };

/**
 * 任務を始める前の「依頼」。
 *
 * 説明を文章の一覧で読ませる代わりに、街の依頼主が 1 つずつ話す（なぜ要るか・言葉・道具・工程）。
 * 次に理解度チェックで言葉とコマンドの意味を確かめ、正解したコマンドは道具として手に入る。
 * 穴埋めの無い道具は練習用の街で実際に打って結果を見てから、建設計画を確かめて建設（端末での作業）に入る。
 * どの段階も飛ばせる。間違えても罰は無い。
 */
export function Briefing({ mission, prerequisites = [], onStart, onSwitch, canSkip = false, onAnswer }: Props) {
  const t = useT();
  const animate = useMotionEnabled();
  const giver = QUEST_GIVER[mission.track];
  const script = useMemo(() => briefingScript(mission.title, mission.intro, mission.steps), [mission]);
  const quiz = useMemo(() => briefingQuiz(mission.id, mission.intro, quizPool(mission.track)), [mission]);
  const tries = useMemo(() => tryouts(mission.intro, mission.initial), [mission]);
  // 「コマンドを打つ前の現場」。要望や理由を聞いている間、動く絵として出す
  const initialState = useMemo(() => createSession(mission.initial).state, [mission]);

  const [phase, setPhase] = useState<Phase>('talk');
  const [line, setLine] = useState(0);
  const [bag, setBag] = useState<string[]>([]);
  const [learned, setLearned] = useState(0);
  const footer = useFooterSlot();

  const reviewLine = useCallback(
    (subject: string) => {
      const index = script.findIndex((l) => (l.kind === 'concept' && l.term === subject) || (l.kind === 'tool' && l.command === subject));
      setLine(Math.max(0, index));
      setPhase('talk');
    },
    [script],
  );

  const reached = PHASES.indexOf(phase);
  const within = phase === 'talk' ? line / Math.max(1, script.length - 1) : 1;

  return (
    <section aria-labelledby="briefing-title" data-testid="briefing" className="ui flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 flex-col gap-2.5 border-b border-[var(--u-line)] bg-[var(--u-card)] px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="ui-chip ui-chip-accent">
            <Icon name="request" size={14} />
            {t('brief.label')}
          </span>
          <h2 id="briefing-title" className="min-w-0 flex-1 truncate text-[15px] font-bold tracking-tight">
            {mission.title}
          </h2>
          <span data-testid="brief-learned" className="shrink-0 font-mono text-[11px] text-[var(--u-text-3)]">
            {t('brief.tally', { a: learned, b: bag.length })}
          </span>
          {canSkip ? (
            <button type="button" onClick={onStart} className="ui-btn ui-btn-plain px-2.5 py-1 text-xs">
              {t('brief.skip')}
              <Icon name="next" size={14} />
            </button>
          ) : null}
        </div>

        <div className="flex items-center gap-3">
          <nav aria-label={t('brief.phases')} className="ui-seg">
            {PHASES.map((p, i) => (
              <button
                key={p}
                type="button"
                aria-current={phase === p ? 'step' : undefined}
                data-phase={p}
                data-done={i < reached ? 'true' : 'false'}
                onClick={() => {
                  setPhase(p);
                }}
                className="flex items-center gap-1.5"
              >
                <Icon name={i < reached ? 'check' : PHASE_ICON[p]} size={13} />
                {t(`brief.phase.${p}`)}
              </button>
            ))}
          </nav>
          <div data-testid="brief-gauge" className="ui-track min-w-0 flex-1">
            <span style={{ width: `${((reached + within) * 25).toFixed(1)}%` }} />
          </div>
        </div>
      </header>

      {onSwitch && prerequisites.length > 0 ? (
        <div className="shrink-0 px-4 pt-3">
          <PrerequisiteNote prerequisites={prerequisites} onSwitch={onSwitch} />
        </div>
      ) : null}

      <FitBox className="flex-1" testId="brief-fit">
        <div className="grid gap-4 p-4 sm:grid-cols-[auto_1fr]">
          <div className="flex flex-row items-center gap-2 sm:flex-col">
            <CityPortrait track={mission.track} talking={phase === 'talk'} animate={animate} size={4} />
            <span className="ui-chip whitespace-nowrap">{t('brief.giver', giver)}</span>
          </div>

          <div className="min-w-0">
            {phase === 'talk' ? (
              <Talk
                slot={footer.slot}
                script={script}
                line={line}
                onLine={setLine}
                animate={animate}
                track={mission.track}
                initial={initialState}
                tries={tries}
                onDone={() => {
                  setPhase(quiz.length > 0 ? 'quiz' : 'try');
                }}
              />
            ) : phase === 'quiz' ? (
              <Quiz
                slot={footer.slot}
                onBack={() => {
                  setPhase('talk');
                }}
                questions={quiz}
                bag={bag}
                animate={animate}
                onAnswer={(q, first) => {
                  setLearned((n) => n + 1);
                  onAnswer?.(q, first);
                }}
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
                slot={footer.slot}
                track={mission.track}
                onBack={() => {
                  setPhase(quiz.length > 0 ? 'quiz' : 'talk');
                }}
                tries={tries}
                fieldTools={mission.intro.commands.filter((c) => !tries.some((tr) => tr.command === c.command))}
                onDone={() => {
                  setPhase('plan');
                }}
              />
            ) : (
              <Plan
                slot={footer.slot}
                mission={mission}
                onStart={onStart}
                onBack={() => {
                  setPhase('try');
                }}
              />
            )}
          </div>
        </div>
      </FitBox>
      <div ref={footer.ref} className={`shrink-0 ${FOOTER_SLOT_CLASS}`} />
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

function Talk({ slot, script, line, onLine, onDone, animate, track, initial, tries }: {
  slot: HTMLElement | null;
  script: readonly BriefingLine[];
  line: number;
  onLine: (n: number) => void;
  onDone: () => void;
  animate: boolean;
  track: MissionTrack;
  initial: ShellState;
  tries: readonly Tryout[];
}) {
  const t = useT();
  const nextRef = useRef<HTMLButtonElement>(null);
  const [replay, setReplay] = useState(0);
  const current = script[line];
  const last = line >= script.length - 1;

  useEffect(() => {
    nextRef.current?.focus();
  }, [line]);

  // ← → でも行き来できる
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable]')) return;
      if (event.key === 'ArrowLeft' && line > 0) onLine(line - 1);
      if (event.key === 'ArrowRight' && !last) onLine(line + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [line, last, onLine]);

  if (current === undefined) return null;
  return (
    <div className="flex flex-col gap-3">
      <div className="ui-card px-4 py-3.5" data-testid="speech">
        <div className="flex items-center justify-between gap-2">
          <p className="ui-eyebrow">{t(LINE_LABEL[current.kind])}</p>
          <p className="font-mono text-[11px] text-[var(--u-text-3)]">{t('brief.lineCount', { a: line + 1, b: script.length })}</p>
        </div>
        <AnimatePresence mode="wait">
          <motion.div
            key={line}
            initial={animate ? { opacity: 0, y: 4 } : false}
            animate={{ opacity: 1, y: 0 }}
            exit={animate ? { opacity: 0 } : undefined}
            transition={{ duration: 0.16 }}
            className="mt-1.5"
            aria-live="polite"
          >
            {current.kind === 'concept' ? (
              <>
                <p className="ui-chip ui-chip-accent text-[13px]">{current.term}</p>
                <p className="mt-2 text-[15px] leading-relaxed">
                  <Glossed text={current.text} />
                </p>
              </>
            ) : current.kind === 'tool' ? (
              <>
                <code className="inline-block whitespace-pre-wrap rounded-md bg-[#12131a] px-2.5 py-1 font-mono text-[13px] text-[#e6edf3]">
                  {current.command}
                </code>
                <p className="mt-2 text-[15px] leading-relaxed">
                  <Glossed text={current.text} />
                </p>
              </>
            ) : current.kind === 'plan' ? (
              <ol className="flex flex-col gap-1.5">
                {current.steps.map((step, i) => (
                  <li key={`${String(i)}-${step}`} className="flex items-start gap-2.5 text-[14px] leading-snug">
                    <span className="ui-key mt-0.5">{i + 1}</span>
                    <span className="min-w-0 pt-0.5">
                      <Glossed text={step} />
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-[15px] leading-relaxed">
                <Glossed text={current.text} />
              </p>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <TalkStage
        line={current}
        track={track}
        initial={initial}
        tries={tries}
        animate={animate}
        replay={replay}
        onReplay={() => {
          setReplay((n) => n + 1);
        }}
      />

      <FooterBar
        slot={slot}
        left={
          <button
            type="button"
            data-testid="talk-back"
            onClick={() => {
              onLine(Math.max(0, line - 1));
            }}
            disabled={line === 0}
            className="ui-btn ui-btn-plain h-9 w-24 text-[13px]"
          >
            <Icon name="back" size={15} />
            {t('brief.back')}
          </button>
        }
        center={
          <div className="flex flex-wrap justify-center gap-1" aria-hidden>
            {script.map((_, i) => (
              <span
                key={i}
                className="h-1.5 rounded-full transition-all duration-300"
                style={{ width: i === line ? 14 : 6, background: i <= line ? 'var(--accent)' : 'var(--u-line-strong)' }}
              />
            ))}
          </div>
        }
        right={
          <button
            ref={nextRef}
            type="button"
            data-testid="talk-next"
            onClick={() => {
              if (last) onDone();
              else onLine(line + 1);
            }}
            className="ui-btn ui-btn-primary h-10 w-44 text-[14px]"
          >
            {last ? t('brief.toQuiz') : t('brief.next')}
            <Icon name="next" size={16} />
          </button>
        }
      />
    </div>
  );
}

/* ---------------- 2. 理解度チェック ---------------- */

function Quiz({ slot, onBack, questions, bag, onReward, onReview, onDone, animate, onAnswer }: {
  slot: HTMLElement | null;
  onBack: () => void;
  onAnswer?: (question: number, firstTry: boolean) => void;
  questions: readonly QuizQuestion[];
  bag: readonly string[];
  onReward: (tool: string) => void;
  onReview: (subject: string) => void;
  onDone: () => void;
  animate: boolean;
}) {
  const t = useT();
  const sound = useSfx();
  const [index, setIndex] = useState(0);
  const [wrong, setWrong] = useState<ReadonlySet<number>>(new Set());
  const [solved, setSolved] = useState(false);
  const [streak, setStreak] = useState(0);
  const question = questions[index];

  const choose = useCallback(
    (i: number) => {
      if (!question || solved || wrong.has(i)) return;
      if (i === question.answer) {
        setSolved(true);
        if (wrong.size === 0) setStreak((n) => n + 1);
        sound.step();
        onAnswer?.(index, wrong.size === 0);
        if (question.reward !== null) onReward(question.reward);
      } else {
        setStreak(0);
        sound.error();
        setWrong((set) => new Set([...set, i]));
      }
    },
    [question, solved, wrong, sound, onAnswer, index, onReward],
  );

  // 1〜9 の数字キーでも選べる
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable]')) return;
      const n = Number(event.key);
      if (Number.isInteger(n) && n >= 1 && n <= (question?.choices.length ?? 0)) choose(n - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [choose, question]);

  if (question === undefined) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-[15px]">{t('brief.noQuiz')}</p>
        <button type="button" onClick={onDone} className="ui-btn ui-btn-primary h-10 w-fit px-5">
          {t('brief.toTry')}
          <Icon name="next" size={16} />
        </button>
      </div>
    );
  }

  const last = index >= questions.length - 1;

  return (
    <div className="flex flex-col gap-3" data-testid="quiz">
      <div className="flex items-center gap-2">
        <span className="ui-eyebrow">{t('brief.quizTitle', { a: index + 1, b: questions.length })}</span>
        <Streak count={streak} animate={animate} />
      </div>
      <p className="text-[19px] font-bold leading-snug tracking-tight">
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
                data-state={isRight ? 'right' : isWrong ? 'wrong' : 'open'}
                disabled={isWrong || solved}
                onClick={() => {
                  choose(i);
                }}
                animate={animate && isWrong ? { x: [0, -5, 5, -3, 0] } : { x: 0 }}
                transition={{ duration: 0.28 }}
                className="ui-option"
              >
                <span className="ui-key" aria-hidden>
                  {isRight ? <Icon name="check" size={13} strokeWidth={2.6} /> : isWrong ? <Icon name="close" size={13} strokeWidth={2.6} /> : i + 1}
                </span>
                <span className="min-w-0 text-[14px] leading-snug">{choice}</span>
              </motion.button>
            </li>
          );
        })}
      </ul>

      <div role="status" aria-live="polite">
        {solved ? (
          <motion.div
            initial={animate ? { opacity: 0, y: -3 } : false}
            animate={{ opacity: 1, y: 0 }}
            className="ui-note ui-note-ok flex flex-wrap items-center gap-x-2.5 gap-y-1"
          >
            <span className="inline-flex items-center gap-1.5 font-bold">
              <Icon name="check" size={15} strokeWidth={2.4} />
              {t('brief.correct')}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Icon name={question.reward !== null ? 'tool' : 'book'} size={14} />
              {question.reward !== null ? t('brief.gotTool', { command: question.reward }) : t('brief.gotWord', { term: question.subject })}
            </span>
          </motion.div>
        ) : wrong.size > 0 ? (
          <div className="ui-note ui-note-warn flex flex-wrap items-center gap-2">
            <span className="font-bold">{t('brief.wrong')}</span>
            <span>{t('brief.wrongHint', { subject: question.subject })}</span>
            <button
              type="button"
              className="ui-btn ui-btn-quiet h-7 px-2.5 text-xs"
              onClick={() => {
                onReview(question.subject);
              }}
            >
              <Icon name="back" size={13} />
              {t('brief.review')}
            </button>
          </div>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs">
        <span className="ui-eyebrow inline-flex items-center gap-1">
          <Icon name="tool" size={13} />
          {t('brief.bag')}
        </span>
        {bag.length === 0 ? (
          <span className="text-[var(--u-text-3)]">{t('brief.bagEmpty')}</span>
        ) : (
          bag.map((tool) => (
            <code key={tool} className="rounded-md bg-[#12131a] px-1.5 py-0.5 font-mono text-[11px] text-[#e6edf3]">
              {tool}
            </code>
          ))
        )}
      </div>

      <FooterBar
        slot={slot}
        left={
          <button type="button" data-testid="quiz-back" onClick={onBack} className="ui-btn ui-btn-plain h-9 w-24 text-[13px]">
            <Icon name="back" size={15} />
            {t('brief.back')}
          </button>
        }
        center={<span className="font-mono text-[11px] text-[var(--u-text-3)]">{t('brief.quizTitle', { a: index + 1, b: questions.length })}</span>}
        right={
          solved ? (
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
              className="ui-btn ui-btn-primary h-10 w-44 text-[14px]"
            >
              {last ? t('brief.toTry') : t('brief.nextQuestion')}
              <Icon name="next" size={16} />
            </button>
          ) : (
            <span className="w-44 text-center text-[11px] text-[var(--u-text-3)]">{t('facility.pick')}</span>
          )
        }
      />
    </div>
  );
}

/* ---------------- 3. 道具を試す ---------------- */

function TryTools({ slot, track, onBack, tries, fieldTools, onDone }: {
  slot: HTMLElement | null;
  track: LessonDefinition['track'];
  onBack: () => void;
  tries: readonly Tryout[];
  fieldTools: readonly { command: string; means: string }[];
  onDone: () => void;
}) {
  const t = useT();
  const animate = useMotionEnabled();
  // 一度に 1 つだけ動かす。全部を並べると読むのに画面を送ることになる
  const [pick, setPick] = useState(0);
  const [replay, setReplay] = useState(0);
  const [tried, setTried] = useState<ReadonlySet<number>>(new Set([0]));
  const current = tries[pick];

  return (
    <div className="flex flex-col gap-3" data-testid="try">
      <p className="text-[14px] text-[var(--u-text-2)]">{tries.length > 0 ? t('brief.tryLead') : t('brief.tryNone')}</p>

      {tries.length > 0 ? (
        <ul className="flex flex-wrap items-center gap-2" aria-label={t('brief.bag')}>
          {tries.map((tr, i) => (
            <li key={tr.command}>
              <button
                type="button"
                data-try={i}
                aria-pressed={i === pick}
                onClick={() => {
                  setPick(i);
                  setReplay((n) => n + 1);
                  setTried((set) => new Set([...set, i]));
                }}
                className={`ui-btn h-8 px-3 font-mono text-[12px] ${i === pick ? 'ui-btn-primary' : 'ui-btn-quiet'}`}
              >
                {tried.has(i) ? <Icon name="check" size={13} strokeWidth={2.4} /> : null}
                {tr.command}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {current ? (
        <>
          <p className="text-[14px]">
            <Glossed text={current.means} />
          </p>
          <ToolRun
            key={`${current.command}:${String(replay)}`}
            tryout={current}
            track={track}
            animate={animate}
            label={t('brief.tryStage', { command: current.command })}
            onReplay={() => {
              setReplay((n) => n + 1);
            }}
          />
        </>
      ) : null}

      {fieldTools.length > 0 ? (
        <div>
          <p className="ui-eyebrow">{t('brief.fieldTools')}</p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {fieldTools.map((c) => (
              <li key={c.command} className="ui-flat flex items-baseline gap-1.5 px-2 py-1 text-[11px]">
                <code className="font-mono font-bold">{c.command}</code>
                <span className="text-[var(--u-text-2)]">
                  <Glossed text={c.means} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <FooterBar
        slot={slot}
        left={
          <button type="button" onClick={onBack} className="ui-btn ui-btn-plain h-9 w-24 text-[13px]">
            <Icon name="back" size={15} />
            {t('brief.back')}
          </button>
        }
        center={
          tries.length > 0 ? (
            <span className="font-mono text-[11px] text-[var(--u-text-3)]">{t('brief.tryCount', { a: tried.size, b: tries.length })}</span>
          ) : null
        }
        right={
          <button type="button" data-testid="try-next" onClick={onDone} className="ui-btn ui-btn-primary h-10 w-44 text-[14px]">
            {t('brief.toPlan')}
            <Icon name="next" size={16} />
          </button>
        }
      />
    </div>
  );
}

/* ---------------- 4. 作業の段取り ---------------- */

function Plan({ slot, mission, onStart, onBack }: { slot: HTMLElement | null; mission: LessonDefinition; onStart: () => void; onBack: () => void }) {
  const t = useT();
  const startRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    startRef.current?.focus();
  }, []);

  return (
    <div className="flex flex-col gap-3" data-testid="plan">
      <p className="text-[14px] text-[var(--u-text-2)]">{t('brief.planLead')}</p>
      <ol className="flex flex-col gap-1.5">
        {mission.steps.map((step, i) => (
          <li key={`${String(i)}-${step.prompt}`} className="ui-card flex items-start gap-2.5 px-3 py-2 text-[14px] leading-snug">
            <span className="ui-key mt-0.5">{i + 1}</span>
            <span className="min-w-0 pt-0.5">
              <Glossed text={step.prompt} />
            </span>
          </li>
        ))}
      </ol>
      <FooterBar
        slot={slot}
        left={
          <button type="button" onClick={onBack} className="ui-btn ui-btn-plain h-9 w-24 text-[13px]">
            <Icon name="back" size={15} />
            {t('brief.back')}
          </button>
        }
        right={
          <button ref={startRef} type="button" onClick={onStart} className="ui-btn ui-btn-primary h-10 w-44 text-[14px]">
            <Icon name="terminal" size={16} />
            {t('brief.start')}
          </button>
        }
      />
    </div>
  );
}
