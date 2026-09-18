import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Facility } from '@/content/city';
import type { MissionTrack } from '@/engines/lesson/types';
import { useT } from '@/i18n/useT';
import { useMotionEnabled } from '@/ui/motion';
import { Glossed } from '@/ui/Term';
import { FooterBar } from '@/ui/FooterBar';
import { FOOTER_SLOT_CLASS, useFooterSlot } from '@/ui/footerSlot';
import { FitBox } from '@/ui/FitBox';
import { Streak } from '@/ui/AnswerStamp';
import { useSfx } from '@/lib/useSfx';
import { AnalogyVisual, DemoPlayer, HowRoute, PitfallRoad, TroubleScene, WhyVisual } from './LessonVisuals';
import { CITY_COLOR } from '@/visual/game/cityColor';
import { CityPortrait, FacilityPlot, PLOT_H, PLOT_W } from '@/visual/game/cityArt';
import { Icon, type IconName } from '@/ui/Icon';

interface Props {
  facility: Facility;
  track: MissionTrack;
  guide: { name: string; role: string };
  /** すでに建てているか（学び直し） */
  built: boolean;
  /** 審査に合格して施設を建てる */
  onBuild: () => void;
  onClose: () => void;
  /** 建てたあとに動かす任務。無ければ出さない */
  firstMissionId: string | null;
  /** 画面の中に埋め込む（重ねて出さない） */
  inline?: boolean;
  /** 建てたあとに次へ進む（埋め込みのとき） */
  onContinue?: () => void;
  /** 判断問題に正解した（firstTry = 一度も間違えずに）。街の予算になる */
  onAnswer?: (question: number, firstTry: boolean) => void;
}

type Step = 'trouble' | 'what' | 'why' | 'how' | 'demo' | 'field' | 'exam';
const STEPS: readonly Step[] = ['trouble', 'what', 'why', 'how', 'demo', 'field', 'exam'];
const STEP_ICON: Record<Step, IconName> = {
  trouble: 'request',
  what: 'search',
  why: 'target',
  how: 'settings',
  demo: 'play',
  field: 'alert',
  exam: 'board',
};

/**
 * 施設を建てるための学習。コマンドは打たない。
 * 住民の困りごと → 何なのか（街で例えると）→ なぜ現場で必要か → 仕組みを順に → 現場の落とし穴とプロの心得 → 建設審査（場面の判断問題）。
 * 審査の場面にすべて正しく判断できたら施設が建つ。間違えても理由を読んで何度でも考え直せる。
 */
export function FacilityLesson({ facility, track, guide, built, onBuild, onClose, firstMissionId, inline = false, onContinue, onAnswer }: Props) {
  const t = useT();
  const animate = useMotionEnabled();
  const [step, setStep] = useState<Step>('trouble');
  const [howIndex, setHowIndex] = useState(0);
  const [done, setDone] = useState(false);
  const footer = useFooterSlot();
  const index = STEPS.indexOf(step);
  const goto = (next: Step) => {
    setStep(next);
    setHowIndex(0);
  };

  useEffect(() => {
    if (inline) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose, inline]);

  return (
    <div className={inline ? 'ui flex h-full min-h-0 flex-col' : 'ui fixed inset-0 z-40 overflow-y-auto bg-[rgba(23,22,26,0.55)] p-3 backdrop-blur-sm sm:p-6'}>
      <div
        role={inline ? undefined : 'dialog'}
        aria-modal={inline ? undefined : true}
        aria-labelledby="facility-title"
        data-testid="facility-lesson"
        className={inline ? 'flex min-h-0 flex-1 flex-col' : 'ui-card mx-auto flex min-h-full max-w-4xl flex-col overflow-hidden'}
      >
        <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-[var(--u-line)] bg-[var(--u-card)] px-4 py-3">
          <span className="ui-chip ui-chip-accent">
            <Icon name="build" size={14} />
            {t('facility.label')}
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="facility-title" className="truncate text-[15px] font-bold tracking-tight">
              {facility.name}
            </h2>
            <p className="truncate text-[11px] text-[var(--u-text-3)]">{t('facility.concept', { concept: facility.concept })}</p>
          </div>
          <div className="ui-track w-20 shrink-0">
            <span style={{ width: `${(((index + 1) / STEPS.length) * 100).toFixed(0)}%` }} />
          </div>
          {inline ? null : (
            <button type="button" onClick={onClose} className="ui-btn ui-btn-plain h-8 px-2.5 text-xs">
              <Icon name="close" size={14} />
              {t('facility.close')}
            </button>
          )}
        </header>

        {done ? (
          <Built facility={facility} track={track} animate={animate} firstMissionId={firstMissionId} onClose={onClose} onContinue={onContinue} />
        ) : (
          <>
            <div className="shrink-0 border-b border-[var(--u-line)] bg-[var(--u-card)] px-4 pb-3">
              <nav aria-label={t('facility.steps')} className="ui-steps">
                {STEPS.map((s, i) => (
                  <button
                    key={s}
                    type="button"
                    data-step={s}
                    aria-current={step === s ? 'step' : undefined}
                    data-done={i < index ? 'true' : 'false'}
                    onClick={() => {
                      goto(s);
                    }}
                    className="flex items-center gap-1.5"
                  >
                    <Icon name={i < index ? 'check' : STEP_ICON[s]} size={13} />
                    {t(`facility.step.${s}`)}
                  </button>
                ))}
              </nav>
            </div>

            <FitBox className={inline ? 'flex-1' : ''} testId="facility-fit">
            <div className={`grid gap-4 sm:grid-cols-[auto_1fr] ${inline ? 'p-4' : 'p-4 sm:p-6'}`}>
              <div className="flex flex-row items-center gap-2 sm:flex-col">
                <CityPortrait track={track} resident={step === 'trouble'} talking animate={animate} size={inline ? 4 : 6} />
                <span className="ui-chip max-w-[8rem] justify-center text-center leading-tight">
                  {step === 'trouble' ? facility.trouble.who : t('brief.giver', guide)}
                </span>
              </div>

              <div className="min-w-0">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`${step}-${String(howIndex)}`}
                    initial={animate ? { opacity: 0, y: 8 } : false}
                    animate={{ opacity: 1, y: 0 }}
                    exit={animate ? { opacity: 0 } : undefined}
                    transition={{ duration: 0.18 }}
                  >
                    {step === 'trouble' ? (
                      <div className="flex flex-col gap-3">
                        <TroubleScene facility={facility} track={track} animate={animate} />
                        <Card label={t('facility.step.trouble')} icon="request">
                          <p className="text-[15px] leading-relaxed">「{facility.trouble.text}」</p>
                        </Card>
                      </div>
                    ) : step === 'what' ? (
                      <div className="flex flex-col gap-3">
                        <AnalogyVisual facility={facility} track={track} />
                        <Card label={t('facility.step.what')} icon="search">
                          <p className="text-[15px] leading-relaxed">
                            <Glossed text={facility.what} />
                          </p>
                        </Card>
                        <Card label={t('facility.analogy')} icon="city" tone="ok">
                          <p className="text-[14px] leading-relaxed">{facility.analogy}</p>
                        </Card>
                      </div>
                    ) : step === 'why' ? (
                      <div className="flex flex-col gap-3">
                        <WhyVisual facility={facility} track={track} />
                        <Card label={t('facility.step.why')} icon="target">
                          <p className="text-[15px] leading-relaxed">
                            <Glossed text={facility.why} />
                          </p>
                        </Card>
                      </div>
                    ) : step === 'how' ? (
                      <div className="flex flex-col gap-3">
                        <HowRoute count={facility.how.length} index={howIndex} track={track} animate={animate} />
                        <How facility={facility} track={track} index={howIndex} animate={animate} />
                      </div>
                    ) : step === 'demo' ? (
                      <DemoPlayer facility={facility} track={track} animate={animate} />
                    ) : step === 'field' ? (
                      <div className="flex flex-col gap-3">
                        <PitfallRoad count={facility.pitfalls.length} />
                        <Card label={t('facility.pitfalls')} icon="alert" tone="bad">
                          <ul className="flex flex-col gap-2">
                            {facility.pitfalls.map((p) => (
                              <li key={p} className="flex gap-2 text-[14px] leading-relaxed">
                                <Icon name="close" size={15} strokeWidth={2.2} className="mt-1 text-[var(--u-bad)]" />
                                <span>
                                  <Glossed text={p} />
                                </span>
                              </li>
                            ))}
                          </ul>
                        </Card>
                        <Card label={t('facility.pro')} icon="sparkle" tone="warn">
                          <p className="text-[14px] font-semibold leading-relaxed">
                            <Glossed text={facility.pro} />
                          </p>
                        </Card>
                      </div>
                    ) : (
                      <Exam
                        facility={facility}
                        built={built}
                        animate={animate}
                        slot={footer.slot}
                        onBack={() => {
                          goto('field');
                        }}
                        onAnswer={onAnswer}
                        onPassed={() => {
                          onBuild();
                          setDone(true);
                        }}
                      />
                    )}
                  </motion.div>
                </AnimatePresence>

                {step !== 'exam' ? (
                  <FooterBar
                    slot={footer.slot}
                    left={
                      <button
                        type="button"
                        data-testid="lesson-back"
                        disabled={index === 0 && howIndex === 0}
                        onClick={() => {
                          if (step === 'how' && howIndex > 0) setHowIndex(howIndex - 1);
                          else goto(STEPS[Math.max(0, index - 1)] ?? 'trouble');
                        }}
                        className="knob w-28 px-3 py-2 text-sm disabled:opacity-40"
                      >
                        {t('facility.back')}
                      </button>
                    }
                    center={
                      <span className="font-mono text-xs text-ink-soft">
                        {index + 1} / {STEPS.length}
                      </span>
                    }
                    right={
                      <button
                        type="button"
                        data-testid="lesson-next"
                        onClick={() => {
                          if (step === 'how' && howIndex < facility.how.length - 1) setHowIndex(howIndex + 1);
                          else goto(STEPS[index + 1] ?? 'exam');
                        }}
                        className="sign w-44 px-5 py-2 text-base font-extrabold"
                      >
                        {step === 'field' ? t('facility.toExam') : t('facility.next')}
                      </button>
                    }
                  />
                ) : null}
              </div>
            </div>
            </FitBox>
            <div ref={footer.ref} className={`shrink-0 ${FOOTER_SLOT_CLASS}`} />
          </>
        )}
      </div>
    </div>
  );
}

function Card({ label, icon, tone, children }: { label: string; icon?: IconName; tone?: 'ok' | 'warn' | 'bad'; children: React.ReactNode }) {
  return (
    <section className={`ui-card px-4 py-3.5 ${tone === 'warn' ? 'bg-[var(--u-warn-soft)]' : tone === 'bad' ? 'bg-[var(--u-bad-soft)]' : tone === 'ok' ? 'bg-[var(--u-ok-soft)]' : ''}`}>
      <p className="ui-eyebrow mb-1.5 flex items-center gap-1.5">
        {icon ? <Icon name={icon} size={13} /> : null}
        {label}
      </p>
      {children}
    </section>
  );
}

/** 仕組みを 1 手順ずつ。進んだ手順は積み上がって残り、いまの手順が光る */
function How({ facility, track, index, animate }: { facility: Facility; track: MissionTrack; index: number; animate: boolean }) {
  const t = useT();
  return (
    <Card label={`${t('facility.step.how')} — ${t('facility.howStep', { a: index + 1, b: facility.how.length })}`} icon="settings">
      <ol className="flex flex-col gap-2">
        {facility.how.slice(0, index + 1).map((line, i) => (
          <motion.li
            key={line}
            initial={animate && i === index ? { opacity: 0, x: -10 } : false}
            animate={{ opacity: 1, x: 0 }}
            className={`flex gap-2.5 rounded-lg px-3 py-2 text-[14px] leading-relaxed ${i === index ? 'bg-[var(--accent-soft)] font-semibold' : 'text-[var(--u-text-2)]'}`}
          >
            <span className="ui-key mt-0.5">{i + 1}</span>
            <span>
              <Glossed text={line} />
            </span>
          </motion.li>
        ))}
      </ol>
      <div className="mt-3 flex items-center gap-1" aria-hidden>
        {facility.how.map((_, i) => (
          <span key={i} className="h-1 flex-1 rounded-full" style={{ backgroundColor: i <= index ? CITY_COLOR[track].roof : 'var(--u-line)' }} />
        ))}
      </div>
    </Card>
  );
}

/** 建設審査。場面ごとに判断し、すべて正しく判断できたら建てられる */
function Exam({ facility, built, animate, slot, onBack, onPassed, onAnswer }: { facility: Facility; built: boolean; animate: boolean; slot: HTMLElement | null; onBack: () => void; onPassed: () => void; onAnswer?: ((question: number, firstTry: boolean) => void) | undefined }) {
  const t = useT();
  const sound = useSfx();
  const [index, setIndex] = useState(0);
  const [wrong, setWrong] = useState<ReadonlySet<number>>(new Set());
  const [solved, setSolved] = useState(false);
  const [streak, setStreak] = useState(0);
  const quiz = facility.quiz[index];
  const last = index >= facility.quiz.length - 1;
  if (quiz === undefined) return null;

  return (
    <div className="flex flex-col gap-3" data-testid="exam">
      <p className="text-[14px] text-[var(--u-text-2)]">{t('facility.examLead')}</p>
      {streak >= 2 ? <Streak count={streak} animate={animate} /> : null}
      <Card label={t('facility.step.exam')} icon="board">
        <p className="text-[17px] font-bold leading-snug tracking-tight">{quiz.situation}</p>
      </Card>
      <ul className="flex flex-col gap-2">
        {quiz.choices.map((choice, i) => {
          const isWrong = wrong.has(i);
          const isRight = solved && i === quiz.answer;
          return (
            <li key={choice}>
              <motion.button
                type="button"
                data-choice={i}
                data-correct={i === quiz.answer ? 'true' : 'false'}
                data-state={isRight ? 'right' : isWrong ? 'wrong' : 'open'}
                disabled={isWrong || solved}
                onClick={() => {
                  if (i === quiz.answer) {
                    setSolved(true);
                    if (wrong.size === 0) setStreak((n) => n + 1);
                    sound.step();
                    onAnswer?.(index, wrong.size === 0);
                  } else {
                    setStreak(0);
                    sound.error();
                    setWrong((set) => new Set([...set, i]));
                  }
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
        {solved || wrong.size > 0 ? (
          <div className={`ui-note ${solved ? 'ui-note-ok' : 'ui-note-warn'}`}>
            <p className="flex flex-wrap items-center gap-1.5 font-bold">
              <Icon name={solved ? 'check' : 'alert'} size={15} strokeWidth={2.2} />
              {solved ? t('facility.correct') : t('facility.wrong')}
            </p>
            {solved ? (
              <p className="mt-1 leading-relaxed" data-testid="explain">
                <Glossed text={quiz.explain} />
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
      <FooterBar
        slot={slot}
        left={
          <button type="button" data-testid="lesson-back" onClick={onBack} className="ui-btn ui-btn-plain h-9 w-24 text-[13px]">
            <Icon name="back" size={15} />
            {t('facility.back')}
          </button>
        }
        center={<span className="font-mono text-[11px] text-[var(--u-text-3)]">{t('facility.question', { a: index + 1, b: facility.quiz.length })}</span>}
        right={
          solved ? (
            <button
              type="button"
              data-testid="exam-next"
              onClick={() => {
                if (last) {
                  onPassed();
                  return;
                }
                setIndex(index + 1);
                setWrong(new Set());
                setSolved(false);
              }}
              className="ui-btn ui-btn-primary h-10 w-44 text-[14px]"
            >
              {last ? <Icon name="build" size={16} /> : null}
              {last ? (built ? t('facility.relearnDone') : t('facility.build')) : t('facility.nextQuestion')}
              {last ? null : <Icon name="next" size={16} />}
            </button>
          ) : (
            <span className="w-44 text-center text-[11px] text-[var(--u-text-3)]">{t('facility.pick')}</span>
          )
        }
      />
    </div>
  );
}

/** 建った瞬間の演出と、次にやること（任務で動かす） */
function Built({ facility, track, animate, firstMissionId, onClose, onContinue }: { facility: Facility; track: MissionTrack; animate: boolean; firstMissionId: string | null; onClose: () => void; onContinue?: (() => void) | undefined }) {
  const t = useT();
  const closeRef = useRef<HTMLAnchorElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    (continueRef.current ?? closeRef.current)?.focus();
  }, []);
  return (
    <div className="flex flex-col items-center gap-3 p-6 text-center" data-testid="facility-built">
      <motion.svg
        width={PLOT_W + 40}
        height={PLOT_H + 20}
        viewBox={`-20 -10 ${String(PLOT_W + 40)} ${String(PLOT_H + 20)}`}
        aria-hidden
        className="overflow-hidden rounded-xl"
        initial={animate ? { scale: 0.92, opacity: 0 } : false}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 180, damping: 18 }}
      >
        <rect x={-20} y={-10} width={PLOT_W + 40} height={PLOT_H + 20} fill={CITY_COLOR[track].ground} />
        <FacilityPlot kind={facility.building} track={track} state="built" x={0} y={0} animate={animate} />
      </motion.svg>
      <span className="ui-chip ui-chip-accent">
        <Icon name="check" size={14} strokeWidth={2.4} />
        {facility.concept}
      </span>
      <p className="text-[26px] font-bold leading-tight tracking-tight">{t('facility.builtTitle', { name: facility.name })}</p>
      <p className="max-w-xl text-[14px] text-[var(--u-text-2)]">{t('facility.builtLead')}</p>
      <div className="mt-1 flex flex-wrap justify-center gap-2">
        {onContinue ? (
          <button ref={continueRef} type="button" data-testid="facility-continue" onClick={onContinue} className="ui-btn ui-btn-primary h-11 px-6 text-[15px]">
            {t('facility.toMission')}
            <Icon name="next" size={17} />
          </button>
        ) : firstMissionId !== null ? (
          <Link ref={closeRef} to={`/?mission=${encodeURIComponent(firstMissionId)}`} className="ui-btn ui-btn-primary h-11 px-6 text-[15px]">
            {t('facility.toMission')}
            <Icon name="next" size={17} />
          </Link>
        ) : null}
        {onContinue ? null : (
          <button type="button" onClick={onClose} className="ui-btn ui-btn-quiet h-11 px-5 text-[14px]">
            {t('facility.stay')}
          </button>
        )}
      </div>
    </div>
  );
}
