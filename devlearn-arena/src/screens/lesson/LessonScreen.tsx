import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useStore } from 'zustand';
import { FACILITY_DEFS } from '@/city/facilities';
import type { FacilityType } from '@/city/types';
import { domainDef, entryOf, LEVEL_NAMES } from '@/content/catalog';
import { AUTHORED, loadLesson } from '@/content/lessons';
import type { Lesson } from '@/content/schema';
import { instantOf } from '@/game/time';
import type { LessonStage } from '@/game/types';
import { isAfter, openStages, resumeStage, STAGE_NAMES, STAGES } from '@/learning/lessonFlow';
import { statusOf } from '@/learning/library';
import { Icon } from '@/ui/icons/Icon';
import { nowIso } from '../clock';
import type { Session } from '../session';
import { useSkills } from '../skills';
import { backdropOf } from './backdrops';
import { DoneStage } from './DoneStage';
import { ExplainStage } from './ExplainStage';
import { PracticeStage } from './PracticeStage';
import { QuizStage } from './QuizStage';
import { ResultStage } from './ResultStage';
import { SummaryStage } from './SummaryStage';
import { TermPopover } from './TermPopover';
import { UnderstandStage } from './UnderstandStage';
import './LessonScreen.css';
import './LessonStages.css';

/**
 * レッスン画面（docs/ui-design.md 7 章・docs/decisions.md D-07）。都市の施設の中に入る別の画面。
 * 背景にその施設の中の景色を薄く敷き、上の帯に施設名・レッスン名・7 段の進み・「中断して都市へ」。
 * 左に段の中身、右に図（実戦では模擬環境）、下に推奨前提・関連・次に学ぶとよいと「次へ」。
 *
 * どの段でも中断でき、進んだ段は記録に残る（次に開くとその段から）。終わった段は上の帯から戻って見られる。
 */

/** 左の欄の幅（%）の範囲。実戦では右（端末）を広くできる */
const SPLIT_MIN = 30;
const SPLIT_MAX = 70;

export function LessonScreen({ session, lessonId, onExit, onLesson, onGlossary }: {
  session: Session;
  lessonId: string;
  /** 中断して都市へ（進みは保存されている） */
  onExit: () => void;
  /** 推奨前提・関連・次のレッスンの入口の札へ */
  onLesson: (id: string) => void;
  onGlossary: (termId: string) => void;
}) {
  const entry = entryOf(lessonId);
  const authored = AUTHORED.has(lessonId);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const lp = useStore(session.progress, (s) => s.progress.lessons[lessonId]);
  const xpLog = useStore(session.progress, (s) => s.progress.xpLog);
  const practiceSessions = useStore(session.progress, (s) => s.practiceSessions);
  const skills = useSkills(session.progress);
  const [view, setView] = useState<LessonStage | null>(null);
  const [pop, setPop] = useState<{ id: string; x: number; y: number } | null>(null);
  const [split, setSplit] = useState(46);
  const [right, setRight] = useState<HTMLElement | null>(null);
  const [action, setAction] = useState<HTMLElement | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const popRef = useRef(pop);
  popRef.current = pop;
  const exitRef = useRef(onExit);
  exitRef.current = onExit;

  // 開いたら、そのレッスンを始める（学習中なら続きから）。中身が書き起こされていないレッスンは記録しない
  useEffect(() => {
    setLesson(null);
    setView(null);
    if (!authored) return;
    let alive = true;
    session.progress.getState().start(lessonId, nowIso());
    void loadLesson(lessonId).then((l) => {
      if (!alive || !l) return;
      setLesson(l);
      setView(resumeStage(session.progress.getState().progress.lessons[lessonId]));
    });
    return () => {
      alive = false;
    };
  }, [lessonId, authored, session]);

  // Esc: 用語の小窓が開いていれば閉じ、それ以外は中断して都市へ
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      if (popRef.current) setPop(null);
      else exitRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onTerm = useCallback((id: string, el: HTMLElement): void => {
    const root = rootRef.current?.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (!root) return;
    const x = Math.min(Math.max(8, r.left - root.left), root.width - 380);
    const below = r.bottom - root.top + 6;
    setPop({ id, x, y: below + 300 > root.height ? Math.max(8, r.top - root.top - 306) : below });
  }, []);

  const reached: LessonStage = lp?.status === 'in-progress' ? lp.stage : lp?.status === 'completed' ? 'done' : 'explain';
  const go = (stage: LessonStage): void => {
    session.progress.getState().reach(lessonId, stage);
    setView(stage);
    setPop(null);
  };

  // 実戦では右（端末）を広くする。ほかの段では元の幅に戻す（どちらも境は動かせる）
  useEffect(() => {
    if (view === 'practice') setSplit(38);
    else if (view !== null) setSplit(46);
  }, [view]);

  // この回で得た XP（クイズ・実戦・修了）と、この回の間に上がったこの分野のスキルの段階
  const since = lp?.startedAt ? instantOf(lp.startedAt) : null;
  const runEvents = since === null ? [] : xpLog.filter((e) => instantOf(e.at) >= since && (e.ref === lessonId || (e.source === 'skill-up' && e.ref === entry?.domain)));
  const runXp = runEvents.filter((e) => e.ref === lessonId).reduce((s, e) => s + e.amount, 0);
  const lastAttempt = since === null ? undefined : [...(lp?.practice ?? [])].reverse().find((a) => instantOf(a.at) >= since);

  const finishLesson = (): void => {
    if (lp?.status !== 'completed') session.progress.getState().complete(lessonId, nowIso());
    setView('done');
    setPop(null);
  };

  const facilityType = (entry ? domainDef(entry.domain)?.facility : undefined) as FacilityType | undefined;
  const facility = facilityType ? FACILITY_DEFS[facilityType] : undefined;
  const backdrop = backdropOf(facilityType);

  if (!entry) return null;
  const open = openStages(reached);

  return (
    <div
      ref={rootRef}
      className={`lesson${view === 'practice' ? ' is-practice' : ''}`}
      data-testid="lesson-screen"
      data-lesson={lessonId}
      style={{ '--c': `var(--domain-${entry.domain})` } as CSSProperties}
    >
      {backdrop ? <img className="lesson-backdrop" src={backdrop} alt="" aria-hidden="true" data-testid="lesson-backdrop" data-facility={facilityType} /> : null}

      <header className="lesson-bar">
        <p className="lesson-where">
          <span className="lesson-facility" data-testid="lesson-facility"><Icon name="facility" size={16} />{facility?.name ?? ''}</span>
          <span className="lesson-title" data-testid="lesson-title" title={entry.title}>{entry.title}</span>
          <span className="lesson-level">{LEVEL_NAMES[entry.level]}</span>
        </p>
        <ol className="lesson-stages" aria-label="7 段の進み">
          {STAGES.map((s, k) => {
            const can = authored && lesson !== null && open.includes(s);
            const state = view === s ? 'is-current' : isAfter(reached, s) || reached === s ? 'is-reached' : '';
            return (
              <li key={s} className={`lesson-stage ${state}`}>
                <button type="button" disabled={!can} aria-current={view === s ? 'step' : undefined} data-stage={s} onClick={() => setView(s)}>
                  <span className="num lesson-stage-no">{k + 1}</span>
                  {STAGE_NAMES[s]}
                </button>
              </li>
            );
          })}
        </ol>
        <p className="lesson-xp" title="このレッスンの今の回で得た XP">
          <span className="num" data-testid="lesson-xp">+{runXp}</span><span className="lesson-xp-unit"> XP</span>
        </p>
        <button type="button" className="lesson-exit" onClick={onExit} data-testid="lesson-exit" title="中断して都市へ（Esc）。進んだ段は保存される">
          <Icon name="close" size={16} />中断して都市へ
        </button>
      </header>

      <div className="lesson-body" ref={bodyRef} style={{ gridTemplateColumns: `${String(split)}fr 12px ${String(100 - split)}fr` }}>
        <main className="lesson-left">
          {!authored ? (
            <section className="stage" data-testid="lesson-preparing">
              <h2 className="stage-heading">このレッスンは準備中</h2>
              <p className="stage-text">到達目標: {entry.goal}</p>
              <p className="stage-text is-sub">中身はまだ書き起こしていない。下の推奨前提・関連・次に学ぶとよいレッスンから、ほかのレッスンを選べる。</p>
            </section>
          ) : !lesson || !view ? (
            <p className="stage-text is-sub">読み込み中</p>
          ) : view === 'explain' ? (
            <ExplainStage lesson={lesson} onTerm={onTerm} right={right} action={action} onDone={() => go('understand')} />
          ) : view === 'understand' ? (
            <UnderstandStage lesson={lesson} onTerm={onTerm} right={right} action={action} onDone={() => go('quiz')} onBack={() => setView('explain')} />
          ) : view === 'quiz' ? (
            <QuizStage
              lesson={lesson}
              lp={lp}
              onTerm={onTerm}
              right={right}
              action={action}
              onAnswer={(quizId, choiceIds, correct) => session.progress.getState().answer({ lessonId, quizId, choiceIds, correct }, nowIso())}
              onDone={() => go('practice')}
            />
          ) : view === 'practice' ? (
            <PracticeStage
              key={`${lessonId}:${String(lastAttempt?.at ?? '')}`}
              practice={lesson.practice}
              sessionId={lessonId}
              saved={practiceSessions[lessonId]}
              onSave={(ps) => session.progress.getState().savePractice(ps)}
              onFinish={(attempt) => {
                session.progress.getState().finishPractice(lessonId, attempt, nowIso());
                go('result');
              }}
              onTerm={onTerm}
              right={right}
              action={action}
              onBack={() => setView('quiz')}
            />
          ) : view === 'result' ? (
            <ResultStage lesson={lesson} attempt={lastAttempt} onTerm={onTerm} right={right} action={action} onRetry={() => setView('practice')} onNext={() => go('summary')} />
          ) : view === 'summary' ? (
            <SummaryStage lesson={lesson} onTerm={onTerm} onLesson={onLesson} right={right} action={action} onBack={() => setView('result')} onNext={finishLesson} />
          ) : (
            <DoneStage lesson={lesson} events={runEvents} skill={skills[lesson.domain]} right={right} action={action} onExit={onExit} />
          )}
        </main>
        <div
          className="lesson-split"
          role="separator"
          aria-orientation="vertical"
          aria-label="左右の境（矢印で動かす）"
          aria-valuemin={SPLIT_MIN}
          aria-valuemax={SPLIT_MAX}
          aria-valuenow={split}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') setSplit((v) => Math.max(SPLIT_MIN, v - 4));
            if (e.key === 'ArrowRight') setSplit((v) => Math.min(SPLIT_MAX, v + 4));
          }}
          onPointerDown={(e) => {
            const body = bodyRef.current?.getBoundingClientRect();
            if (!body) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            const move = (ev: PointerEvent): void => setSplit(Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, ((ev.clientX - body.left) / body.width) * 100)));
            const up = (): void => {
              window.removeEventListener('pointermove', move);
              window.removeEventListener('pointerup', up);
            };
            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', up);
          }}
        />
        <aside className={`lesson-right${view === 'practice' ? ' is-console' : ''}`} ref={setRight} aria-label={view === 'practice' ? '仮想端末' : '図'} />
      </div>

      <footer className="lesson-foot">
        <LinkRow title="推奨前提" ids={entry.prerequisites} session={session} onLesson={onLesson} />
        <LinkRow title="関連" ids={entry.related} session={session} onLesson={onLesson} />
        <LinkRow title="次に学ぶとよい" ids={entry.next} session={session} onLesson={onLesson} />
        <div className="lesson-actions" ref={setAction} />
      </footer>

      {pop ? (
        <TermPopover
          termId={pop.id}
          at={pop}
          onTerm={(id) => setPop({ ...pop, id })}
          onClose={() => setPop(null)}
          onGlossary={onGlossary}
        />
      ) : null}
    </div>
  );
}

function LinkRow({ title, ids, session, onLesson }: { title: string; ids: readonly string[]; session: Session; onLesson: (id: string) => void }) {
  const progress = useStore(session.progress, (s) => s.progress);
  return (
    <section className="lesson-links" aria-label={title}>
      <h3 className="lesson-links-title">{title}</h3>
      {ids.length === 0 ? <span className="lesson-links-none">なし</span> : null}
      {ids.map((id) => {
        const e = entryOf(id);
        if (!e) return null;
        const done = statusOf(id, progress) === 'completed';
        return (
          <button key={id} type="button" className={`lesson-link${done ? ' is-done' : ''}`} style={{ '--c': `var(--domain-${e.domain})` } as CSSProperties} onClick={() => onLesson(id)} title="入口の札を開く">
            <span className="lesson-link-swatch" />
            {e.title}
            {done ? <Icon name="check" size={12} /> : null}
          </button>
        );
      })}
    </section>
  );
}
