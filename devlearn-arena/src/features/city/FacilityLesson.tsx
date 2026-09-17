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
import { AnalogyVisual, DemoPlayer, HowRoute, PitfallRoad, TroubleScene, WhyVisual } from './LessonVisuals';
import { CITY_COLOR } from '@/visual/game/cityColor';
import { CityPortrait, FacilityPlot, PLOT_H, PLOT_W } from '@/visual/game/cityArt';

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
    <div className={inline ? 'flex min-h-full flex-col' : 'fixed inset-0 z-40 overflow-y-auto bg-[rgba(44,29,16,0.72)] p-3 sm:p-6'}>
      <div
        role={inline ? undefined : 'dialog'}
        aria-modal={inline ? undefined : true}
        aria-labelledby="facility-title"
        data-testid="facility-lesson"
        className={inline ? 'flex flex-1 flex-col' : 'mx-auto flex min-h-full max-w-4xl flex-col border-4 border-wood-dark bg-cream shadow-lg'}
      >
        <header className="flex flex-wrap items-center gap-3 border-b-4 border-wood-dark bg-[var(--wood)] px-4 py-3">
          <span className="sign px-3 py-1 text-sm font-extrabold">🏗 {t('facility.label')}</span>
          <div className="min-w-0 flex-1">
            <h2 id="facility-title" className="truncate text-xl font-extrabold text-cream">
              {facility.name}
            </h2>
            <p className="truncate text-xs font-bold text-cream opacity-90">{t('facility.concept', { concept: facility.concept })}</p>
          </div>
          {inline ? null : (
            <button type="button" onClick={onClose} className="knob px-3 py-1.5 text-xs">
              {t('facility.close')}
            </button>
          )}
        </header>

        {done ? (
          <Built facility={facility} track={track} animate={animate} firstMissionId={firstMissionId} onClose={onClose} onContinue={onContinue} />
        ) : (
          <>
            <nav aria-label={t('facility.steps')} className="flex flex-wrap gap-1 border-b-2 border-[var(--cream-dark)] bg-[var(--cream-dark)] px-3 py-2">
              {STEPS.map((s, i) => (
                <button
                  key={s}
                  type="button"
                  data-step={s}
                  aria-current={step === s ? 'step' : undefined}
                  onClick={() => {
                    goto(s);
                  }}
                  className={`px-2.5 py-1 text-sm font-extrabold ${step === s ? 'bg-gold text-ink' : i < index ? 'text-ink' : 'text-ink-soft hover:text-ink'}`}
                >
                  {i + 1}. {t(`facility.step.${s}`)}
                </button>
              ))}
            </nav>

            <div className={`grid gap-3 sm:grid-cols-[auto_1fr] ${inline ? 'p-3' : 'p-4 sm:p-6'}`}>
              <div className="flex flex-row items-end gap-3 sm:flex-col sm:items-center">
                <CityPortrait track={track} resident={step === 'trouble'} talking animate={animate} size={inline ? 4 : 6} />
                <span className="plate px-3 py-1 text-center text-xs font-extrabold">
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
                        <Card label={t('facility.step.trouble')}>
                          <p className="text-lg leading-relaxed">「{facility.trouble.text}」</p>
                        </Card>
                      </div>
                    ) : step === 'what' ? (
                      <div className="flex flex-col gap-3">
                        <AnalogyVisual facility={facility} track={track} />
                        <Card label={t('facility.step.what')}>
                          <p className="text-lg leading-relaxed">
                            <Glossed text={facility.what} />
                          </p>
                        </Card>
                        <Card label={`🏙 ${t('facility.analogy')}`} tone="#eef6e6">
                          <p className="text-base leading-relaxed">{facility.analogy}</p>
                        </Card>
                      </div>
                    ) : step === 'why' ? (
                      <div className="flex flex-col gap-3">
                        <WhyVisual facility={facility} track={track} />
                        <Card label={t('facility.step.why')}>
                          <p className="text-lg leading-relaxed">
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
                        <Card label={`⚠ ${t('facility.pitfalls')}`} tone="#fbeae5">
                          <ul className="flex flex-col gap-2">
                            {facility.pitfalls.map((p) => (
                              <li key={p} className="flex gap-2 text-base leading-relaxed">
                                <span aria-hidden>✗</span>
                                <span>
                                  <Glossed text={p} />
                                </span>
                              </li>
                            ))}
                          </ul>
                        </Card>
                        <Card label={`★ ${t('facility.pro')}`} tone="#fff4d6">
                          <p className="text-base font-bold leading-relaxed">
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
            <div ref={footer.ref} className={FOOTER_SLOT_CLASS} />
          </>
        )}
      </div>
    </div>
  );
}

function Card({ label, tone = '#ffffff', children }: { label: string; tone?: string; children: React.ReactNode }) {
  return (
    <section className="border-4 border-wood-dark px-5 py-4 shadow-[4px_4px_0_rgba(0,0,0,0.2)]" style={{ backgroundColor: tone }}>
      <p className="mb-2 text-xs font-extrabold text-ink-soft">{label}</p>
      {children}
    </section>
  );
}

/** 仕組みを 1 手順ずつ。進んだ手順は積み上がって残り、いまの手順が光る */
function How({ facility, track, index, animate }: { facility: Facility; track: MissionTrack; index: number; animate: boolean }) {
  const t = useT();
  return (
    <Card label={`${t('facility.step.how')} — ${t('facility.howStep', { a: index + 1, b: facility.how.length })}`}>
      <ol className="flex flex-col gap-2">
        {facility.how.slice(0, index + 1).map((line, i) => (
          <motion.li
            key={line}
            initial={animate && i === index ? { opacity: 0, x: -10 } : false}
            animate={{ opacity: 1, x: 0 }}
            className={`flex gap-3 border-l-4 px-3 py-2 text-base leading-relaxed ${i === index ? 'border-[var(--gold-dark)] bg-[var(--gold)]/25 font-bold' : 'border-[var(--cream-dark)] text-ink-soft'}`}
          >
            <span className="sign h-fit shrink-0 px-2 text-xs font-extrabold">{i + 1}</span>
            <span>
              <Glossed text={line} />
            </span>
          </motion.li>
        ))}
      </ol>
      <div className="mt-3 flex items-center gap-1" aria-hidden>
        {facility.how.map((_, i) => (
          <span key={i} className={`h-2 flex-1 ${i <= index ? '' : 'opacity-30'}`} style={{ backgroundColor: CITY_COLOR[track].roof }} />
        ))}
      </div>
    </Card>
  );
}

/** 建設審査。場面ごとに判断し、すべて正しく判断できたら建てられる */
function Exam({ facility, built, animate, slot, onBack, onPassed, onAnswer }: { facility: Facility; built: boolean; animate: boolean; slot: HTMLElement | null; onBack: () => void; onPassed: () => void; onAnswer?: ((question: number, firstTry: boolean) => void) | undefined }) {
  const t = useT();
  const [index, setIndex] = useState(0);
  const [wrong, setWrong] = useState<ReadonlySet<number>>(new Set());
  const [solved, setSolved] = useState(false);
  const quiz = facility.quiz[index];
  const last = index >= facility.quiz.length - 1;
  if (quiz === undefined) return null;

  return (
    <div className="flex flex-col gap-3" data-testid="exam">
      <p className="text-sm">{t('facility.examLead')}</p>
      <p className="font-mono text-xs text-ink-soft">{t('facility.question', { a: index + 1, b: facility.quiz.length })}</p>
      <Card label={`📝 ${t('facility.step.exam')}`}>
        <p className="text-lg font-bold leading-relaxed">{quiz.situation}</p>
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
                disabled={isWrong || solved}
                onClick={() => {
                  if (i === quiz.answer) {
                    setSolved(true);
                    onAnswer?.(index, wrong.size === 0);
                  } else {
                    setWrong((set) => new Set([...set, i]));
                  }
                }}
                animate={animate && isWrong ? { x: [0, -6, 6, -4, 0] } : { x: 0 }}
                transition={{ duration: 0.3 }}
                className={`w-full border-4 px-4 py-3 text-left text-base leading-snug ${
                  isRight ? 'border-[var(--ok)] bg-[#cfe8c0]' : isWrong ? 'border-[var(--bad)] bg-[#f3c4bb] opacity-75' : 'border-wood-dark bg-white hover:bg-[var(--gold)]/30'
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
        {solved || wrong.size > 0 ? (
          <div className={`border-l-4 px-3 py-2 ${solved ? 'border-[var(--ok)] bg-[#dff0cf]' : 'border-[var(--warn)] bg-[var(--gold)]/25'}`}>
            <p className="font-extrabold">{solved ? t('facility.correct') : t('facility.wrong')}</p>
            {solved ? (
              <p className="mt-1 text-sm leading-relaxed" data-testid="explain">
                <Glossed text={quiz.explain} />
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
      <FooterBar
        slot={slot}
        left={
          <button type="button" data-testid="lesson-back" onClick={onBack} className="knob w-28 px-3 py-2 text-sm">
            {t('facility.back')}
          </button>
        }
        center={
          <span className="font-mono text-xs text-ink-soft">{t('facility.question', { a: index + 1, b: facility.quiz.length })}</span>
        }
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
              className="sign w-44 px-4 py-2 text-base font-extrabold"
            >
              {last ? (built ? t('facility.relearnDone') : t('facility.build')) : t('facility.nextQuestion')}
            </button>
          ) : (
            <span className="w-44 text-center text-xs text-ink-soft">{t('facility.pick')}</span>
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
    <div className="flex flex-col items-center gap-4 p-6 text-center" data-testid="facility-built">
      <svg width={PLOT_W + 40} height={PLOT_H + 20} viewBox={`-20 -10 ${String(PLOT_W + 40)} ${String(PLOT_H + 20)}`} aria-hidden>
        <rect x={-20} y={-10} width={PLOT_W + 40} height={PLOT_H + 20} fill={CITY_COLOR[track].ground} />
        <FacilityPlot kind={facility.building} track={track} state="built" x={0} y={0} animate={animate} />
      </svg>
      <p className="title text-4xl text-[var(--ok)]">{t('facility.builtTitle', { name: facility.name })}</p>
      <p className="max-w-xl text-base">{t('facility.builtLead')}</p>
      <div className="flex flex-wrap justify-center gap-3">
        {onContinue ? (
          <button ref={continueRef} type="button" data-testid="facility-continue" onClick={onContinue} className="sign px-6 py-3 text-lg font-extrabold">
            {t('facility.toMission')}
          </button>
        ) : firstMissionId !== null ? (
          <Link ref={closeRef} to={`/?mission=${encodeURIComponent(firstMissionId)}`} className="sign px-6 py-3 text-lg font-extrabold">
            {t('facility.toMission')}
          </Link>
        ) : null}
        {onContinue ? null : (
          <button type="button" onClick={onClose} className="knob px-5 py-3 text-base font-bold">
            {t('facility.stay')}
          </button>
        )}
      </div>
    </div>
  );
}
