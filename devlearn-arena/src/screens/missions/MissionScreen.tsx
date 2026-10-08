import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useStore } from 'zustand';
import { FACILITY_DEFS, landmarkOf } from '@/city/facilities';
import { svgView } from '@/city/generate/svg';
import { monumentAsset } from '@/city/render/sprites';
import { entryOf } from '@/content/catalog';
import { missionOf } from '@/content/missions';
import type { Mission } from '@/content/schema';
import type { Outcome } from '@/game/progress';
import type { PracticeAttempt } from '@/game/types';
import { statusOf } from '@/learning/library';
import { missionFacility } from '@/learning/missions';
import { resultKind } from '@/learning/practice';
import { attemptLines } from '../lesson/attemptLines';
import { Icon } from '@/ui/icons/Icon';
import { nowIso } from '../clock';
import { backdropOf } from '../lesson/backdrops';
import { PracticeStage } from '../lesson/PracticeStage';
import { useStepKeys } from '../lesson/stepKeys';
import { TermPopover } from '../lesson/TermPopover';
import { Slot, StepButtons, type OnTerm } from '../lesson/widgets';
import { missionSession } from '../progressStore';
import { Rich } from '../Rich';
import type { Session } from '../session';
import '../lesson/LessonScreen.css';
import '../lesson/LessonStages.css';
import './MissionScreen.css';

/**
 * ミッションの実戦（docs/ui-design.md 2.1: ミッション一覧 → ミッションの実戦 → 都市画面）。
 * レッスン画面と同じく、依頼を出した施設の中に入る別の画面（docs/decisions.md D-07）。実戦はレッスンと同じ模擬環境を使う（docs/game-design.md 8 章）。
 * 左に都市の課題と手順・ヒント、右に仮想端末。達成すると報酬（XP・資金・記念碑）と、できるようになったことを示し、都市へ戻る。
 */

type View = 'practice' | 'result';

export function MissionScreen({ session, missionId, onExit, onBoard, onLesson, onGlossary }: {
  session: Session;
  missionId: string;
  /** 都市へ戻る（途中なら、進みは保存されている） */
  onExit: () => void;
  /** ミッション一覧へ */
  onBoard: () => void;
  onLesson: (id: string) => void;
  onGlossary: (termId: string) => void;
}) {
  const mission = missionOf(missionId);
  const status = useStore(session.progress, (s) => s.progress.missions[missionId]?.status ?? 'available');
  const progress = useStore(session.progress, (s) => s.progress);
  const saved = useStore(session.progress, (s) => s.practiceSessions[missionSession(missionId)]);
  const [view, setView] = useState<View>('practice');
  const [last, setLast] = useState<{ attempt: PracticeAttempt; outcome: Outcome } | null>(null);
  const [run, setRun] = useState(0);
  const [pop, setPop] = useState<{ id: string; x: number; y: number } | null>(null);
  const [right, setRight] = useState<HTMLElement | null>(null);
  const [action, setAction] = useState<HTMLElement | null>(null);
  // Enter で次へ・Backspace で戻る（レッスン画面と同じ。docs/ui-design.md 4 章）
  useStepKeys(action, pop === null);
  const rootRef = useRef<HTMLDivElement>(null);
  const popRef = useRef(pop);
  popRef.current = pop;
  const exitRef = useRef(onExit);
  exitRef.current = onExit;

  // 開いたら受ける（前提は要らない。達成済みなら、そのまま挑戦し直せる）
  useEffect(() => {
    if (mission) session.progress.getState().startMission(mission.id);
    setView('practice');
    setLast(null);
  }, [mission, session]);

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

  const onTerm = useCallback<OnTerm>((id, el) => {
    const root = rootRef.current?.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (!root) return;
    const x = Math.min(Math.max(8, r.left - root.left), root.width - 380);
    const below = r.bottom - root.top + 6;
    setPop({ id, x, y: below + 300 > root.height ? Math.max(8, r.top - root.top - 306) : below });
  }, []);

  if (!mission) return null;
  const facility = missionFacility(mission);
  const backdrop = backdropOf(facility);
  const main = mission.domains[0];

  return (
    <div
      ref={rootRef}
      className={`lesson mission-run${view === 'practice' ? ' is-practice' : ''}`}
      data-testid="mission-screen"
      data-mission={mission.id}
      style={{ '--c': `var(--domain-${main ?? 'found'})` } as CSSProperties}
    >
      {backdrop ? <img className="lesson-backdrop" src={backdrop} alt="" aria-hidden="true" data-testid="mission-backdrop" data-facility={facility} /> : null}

      <header className="lesson-bar">
        <p className="lesson-where">
          <span className="lesson-facility"><Icon name="mission" size={16} />{facility ? `${FACILITY_DEFS[facility].name}からの依頼` : 'ミッション'}</span>
          <span className="lesson-title" data-testid="mission-run-title">{mission.title}</span>
          <span className="lesson-level">{status === 'completed' ? '達成済み' : '挑戦中'}</span>
        </p>
        <ol className="lesson-stages" aria-label="ミッションの進み">
          {(['practice', 'result'] as const).map((s, k) => (
            <li key={s} className={`lesson-stage ${view === s ? 'is-current' : ''}`}>
              <button type="button" disabled={s === 'result' && !last} aria-current={view === s ? 'step' : undefined} onClick={() => setView(s)}>
                <span className="num lesson-stage-no">{k + 1}</span>
                {s === 'practice' ? '実戦' : '結果と報酬'}
              </button>
            </li>
          ))}
        </ol>
        <p className="lesson-xp" title="達成した時の報酬">
          <span className="num">+{mission.rewards.xp}</span><span className="lesson-xp-unit"> XP</span>
        </p>
        <button type="button" className="lesson-exit" onClick={onExit} data-testid="mission-exit" title="中断して都市へ（Esc）。打った所までは保存される">
          <Icon name="close" size={16} />中断して都市へ
        </button>
      </header>

      <div className="lesson-body" style={{ gridTemplateColumns: view === 'practice' ? '38fr 12px 62fr' : '46fr 12px 54fr' }}>
        <main className="lesson-left">
          <div className="lesson-left-content">
            {view === 'practice' ? (
              <>
                <section className="mission-brief" aria-label="都市の課題">
                  <p className="stage-text"><Rich text={mission.story} onTerm={onTerm} /></p>
                </section>
                <PracticeStage
                  key={`${mission.id}:${String(run)}`}
                  practice={mission.practice}
                  sessionId={missionSession(mission.id)}
                  saved={saved}
                  onSave={(ps) => session.progress.getState().savePractice(ps)}
                  onFinish={(attempt) => {
                    const outcome = session.progress.getState().finishMission(mission.id, attempt, nowIso());
                    setLast({ attempt: { ...attempt, at: nowIso() }, outcome });
                    setView('result');
                    setPop(null);
                  }}
                  onTerm={onTerm}
                  right={right}
                  action={action}
                  onBack={onBoard}
                  backLabel="依頼の一覧へ"
                />
              </>
            ) : last ? (
              <MissionResult
                mission={mission}
                attempt={last.attempt}
                outcome={last.outcome}
                onTerm={onTerm}
                right={right}
                action={action}
                onRetry={() => {
                  setRun((n) => n + 1);
                  setView('practice');
                }}
                onExit={onExit}
              />
            ) : null}
          </div>
          {/* 次へ・戻るは、段の中身の直下（docs/ui-design.md 7 章） */}
          <div className="lesson-actions" ref={setAction} />
        </main>
        <div className="lesson-split" aria-hidden="true" />
        <aside className={`lesson-right${view === 'practice' ? ' is-console' : ''}`} ref={setRight} aria-label={view === 'practice' ? '仮想端末' : '報酬'} />
      </div>

      <footer className="lesson-foot">
        <section className="lesson-links" aria-label="おすすめのレッスン">
          <h3 className="lesson-links-title">おすすめのレッスン</h3>
          {mission.recommended.map((id) => {
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
      </footer>

      {pop ? <TermPopover termId={pop.id} at={pop} onTerm={(id) => setPop({ ...pop, id })} onClose={() => setPop(null)} onGlossary={onGlossary} /> : null}
    </div>
  );
}

/**
 * 結果と報酬。報酬は数字だけを並べず、都市に現れる物（資金・記念碑）と、できるようになったことを一緒に示す（docs/game-design.md 10 章）。
 * 未達でも責めず、どの手順が残ったかと、再挑戦の道を示す
 */
function MissionResult({ mission: m, attempt, outcome, onTerm, right, action, onRetry, onExit }: {
  mission: Mission;
  attempt: PracticeAttempt;
  outcome: Outcome;
  onTerm: OnTerm;
  right: HTMLElement | null;
  action: HTMLElement | null;
  onRetry: () => void;
  onExit: () => void;
}) {
  const kind = resultKind(attempt);
  const rewarded = outcome.events.some((e) => e.source === 'mission');
  const done = m.practice.steps.filter((s) => attempt.stepsDone.includes(s.id));
  const missed = m.practice.steps.filter((s) => !attempt.stepsDone.includes(s.id));
  const landmark = m.rewards.landmark ? landmarkOf(m.rewards.landmark) : undefined;
  const art = m.rewards.landmark ? monumentAsset(m.rewards.landmark)?.svg : undefined;
  const image = art ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgView(art, 'front').svg)}` : null;
  const xp = outcome.events.reduce((n, e) => n + e.amount, 0);

  return (
    <section className="stage stage-result" aria-label="結果と報酬" data-testid="mission-result" data-result={kind} data-rewarded={rewarded}>
      <p className={`result-badge is-${kind}`} data-testid="mission-result-kind">
        <Icon name={kind === 'retry' ? 'alert' : 'check'} size={18} />
        {kind === 'retry' ? 'まだ途中。もう一度やってみよう' : rewarded ? 'ミッション達成' : 'もう一度通せた（報酬は受け取り済み）'}
      </p>
      {kind === 'retry' ? (
        <p className="stage-text">達成条件はまだ満たしていない。残った手順から、もう一度。ヒントは使っても失敗にならない。</p>
      ) : (
        <p className="stage-text">都市の課題を解いた。<Rich text={m.practice.purpose} onTerm={onTerm} /></p>
      )}

      <h3 className="stage-subheading">できたこと</h3>
      {done.length > 0 ? (
        <ul className="result-list is-ok">
          {done.map((s) => <li key={s.id}><Icon name="check" size={14} /><span><Rich text={s.afterward} onTerm={onTerm} /></span></li>)}
        </ul>
      ) : <p className="stage-text is-sub">まだ達成した手順は無い。</p>}
      {missed.length > 0 ? (
        <>
          <h3 className="stage-subheading">まだの手順</h3>
          <ul className="result-list is-todo">
            {missed.map((s) => <li key={s.id}><Icon name="start" size={14} /><span><Rich text={s.purpose} onTerm={onTerm} /></span></li>)}
          </ul>
        </>
      ) : null}
      {attempt.commands.length > 0 ? (
        <>
          <h3 className="stage-subheading">{attemptLines(m.practice.mode, attempt.commands).title}</h3>
          <pre className="result-commands">{attemptLines(m.practice.mode, attempt.commands).text}</pre>
        </>
      ) : null}

      <Slot to={right}>
        <div className="mission-prize" data-testid="mission-prize">
          <h3 className="mission-prize-head">{rewarded ? '受け取った報酬' : '達成した時の報酬'}</h3>
          {image ? <img className="mission-prize-art" src={image} alt="" /> : null}
          {landmark ? (
            <p className="mission-prize-landmark"><strong>{landmark.name}</strong>{landmark.about}</p>
          ) : null}
          <dl className="mission-prize-list">
            <div><dt><Icon name="xp" size={16} />XP</dt><dd className="num">+{rewarded ? xp : m.rewards.xp}</dd></div>
            <div><dt><Icon name="funds" size={16} />開発資金</dt><dd className="num">+{(rewarded ? outcome.funds : m.rewards.xp + m.rewards.funds).toLocaleString('ja-JP')}</dd></div>
          </dl>
          <p className="mission-prize-note">
            {rewarded
              ? '都市へ戻ると、建設メニューの「公園」から記念碑を置ける。資金で施設を上げられる。'
              : kind === 'retry' ? '達成すると受け取れる。' : 'このミッションの報酬は、もう受け取っている。'}
          </p>
        </div>
      </Slot>
      <Slot to={action}>
        <StepButtons
          onBack={onRetry}
          backLabel={kind === 'retry' ? 'もう一度挑戦する' : '実戦をやり直す'}
          onNext={onExit}
          nextLabel="都市へ戻る"
          nextTestId="mission-to-city"
        />
      </Slot>
    </section>
  );
}
