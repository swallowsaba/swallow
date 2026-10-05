import { useEffect, useMemo, useRef, useState } from 'react';
import { PRACTICE_NAMES } from '@/content/catalog';
import { ERROR_GUIDES } from '@/content/glossary';
import type { ErrorGuide, Practice } from '@/content/schema';
import { ENVIRONMENTS, initialShell, isEnvironmentId } from '@/engines/environments';
import { restoreShell, snapshotShell, type SessionOptions, type ShellSnapshotData } from '@/engines/kernel/session';
import { applyStatement, createSim, isSettled, SIM_VERBS } from '@/engines/sim/sim';
import type { SimState } from '@/engines/sim/types';
import type { PracticeAttempt, PracticeSession } from '@/game/types';
import {
  afterCommand, attemptOf, commandCandidates, currentStep, isFinished, openHint, startRun, type CommandOutcome, type PracticeRun,
} from '@/learning/practice';
import { Icon } from '@/ui/icons/Icon';
import { nowIso } from '../clock';
import { Rich } from '../Rich';
import { SimConsole } from './sim/SimConsole';
import './sim/Sim.css';
import { SIM_NAMES } from './sim/simNames';
import { TerminalView, type TerminalHandle } from './terminal/TerminalView';
import { useShellSession } from './terminal/useShellSession';
import { Feedback, Slot, StepButtons, type OnTerm } from './widgets';

/**
 * 実戦（docs/learning-design.md 6・7 章、docs/ui-design.md 7 章・7.1）。
 *
 * 左に目的と手順（打つ前に何を確かめるか、打った後に何が起きたか）とヒント 3 段、右に模擬環境（仮想端末か、画面で操作する模擬）。
 * エラーが出たら、右の下に「エラー → 内容 → 原因候補 → ヒント」の小窓を出す（調べる調子で。ゲームオーバーにしない）。
 * 判定は模擬環境の状態で行う（src/learning/practice.ts）。操作のたびに途中の状態を保存し、中断して開き直すと続きから。
 * レッスンの実戦とミッションの実戦（docs/game-design.md 8 章: 同じ模擬環境を使う）の両方で使う。
 */

export interface PracticeStageProps {
  practice: Practice;
  /** 途中の状態を保存する名前（レッスン ID。ミッションは mission:<ID>） */
  sessionId: string;
  /** 途中の状態（中断して開き直した時） */
  saved: PracticeSession | undefined;
  onSave: (session: PracticeSession) => void;
  /** 実戦を終える（成功・未達）。結果の段へ進む */
  onFinish: (attempt: Omit<PracticeAttempt, 'at'>) => void;
  onTerm: OnTerm;
  right: HTMLElement | null;
  action: HTMLElement | null;
  onBack: () => void;
  backLabel?: string;
}

export function PracticeStage(props: PracticeStageProps) {
  return props.practice.mode === 'simulation' ? <SimPractice {...props} /> : <TerminalPractice {...props} />;
}

type ShownError = { guide: ErrorGuide; said: string; line: string };

/** 実戦の進み（手順・ヒント・エラー・危ない手）。どの模擬環境でも同じ */
function useRun(p: Practice, initial: PracticeRun | undefined) {
  const [run, setRun] = useState<PracticeRun>(() => initial ?? startRun());
  const [error, setError] = useState<ShownError | null>(null);
  const [danger, setDanger] = useState<string | null>(null);
  const runRef = useRef(run);
  runRef.current = run;
  const set = (next: PracticeRun): PracticeRun => {
    runRef.current = next;
    setRun(next);
    return next;
  };
  return {
    run,
    runRef,
    error,
    setError,
    danger,
    set,
    /** 1 つの操作の結果を受け取る */
    took(r: CommandOutcome, said: string, line: string): PracticeRun {
      setError(r.error ? { guide: r.error, said: said.trim(), line: line.trim() } : null);
      if (r.danger) setDanger(r.danger.why);
      return set(r.run);
    },
    hint(): PracticeRun {
      return set(openHint(p, runRef.current));
    },
    restart(): PracticeRun {
      setError(null);
      return set({ ...runRef.current, stepIndex: 0, stepsDone: [] });
    },
  };
}

/** 左: 目的・手順・ヒント・知らせ。下: 戻る・結果へ */
function PracticeLeft({ p, run, kind, onHint, danger, onTerm, action, onBack, backLabel, onFinish }: {
  p: Practice;
  run: PracticeRun;
  kind: string;
  onHint: () => void;
  danger: string | null;
  onTerm: OnTerm;
  action: HTMLElement | null;
  onBack: () => void;
  backLabel: string;
  onFinish: () => void;
}) {
  const finished = isFinished(p, run);
  const step = currentStep(p, run);
  const shown = step ? (run.hints[step.id] ?? 0) : 0;
  const answerWord = p.mode === 'simulation' ? 'そのまま入れられる答え' : 'そのまま打てる答え';
  return (
    <section className="stage stage-practice" aria-label="実戦" data-testid="stage-practice">
      <p className="stage-count">
        <span className="stage-kind">{kind}</span>
        <span className="stage-count-note">安全な模擬環境で操作する。本物の機械には何もしない</span>
      </p>
      <h2 className="stage-heading">目的</h2>
      <p className="stage-text"><Rich text={p.purpose} onTerm={onTerm} /></p>

      <ol className="practice-steps" aria-label="手順">
        {p.steps.map((s, i) => {
          const done = run.stepsDone.includes(s.id);
          const now = i === run.stepIndex;
          return (
            <li key={s.id} className={`practice-step${done ? ' is-done' : ''}${now ? ' is-current' : ''}`} data-step={s.id} data-done={done}>
              <span className="practice-step-mark num">{done ? <Icon name="check" size={14} /> : <span>{i + 1}</span>}</span>
              <div className="practice-step-body">
                <p className="practice-step-text"><Rich text={s.purpose} onTerm={onTerm} /></p>
                {done ? (
                  <p className="practice-afterward" data-testid="practice-afterward">
                    <span className="practice-afterward-label">何が起きたか</span>
                    <Rich text={s.afterward} onTerm={onTerm} />
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      {step ? (
        <div className="practice-hints" data-testid="practice-hints">
          {step.hints.slice(0, shown).map((h, i) => (
            <p key={i} className="practice-hint" data-hint={i + 1}>
              <span className="practice-hint-no">ヒント {i + 1}</span>
              <Rich text={h} onTerm={onTerm} />
            </p>
          ))}
          {shown < 3 ? (
            <button type="button" className="practice-hint-open" onClick={onHint} data-testid="practice-hint">
              <Icon name="hint" size={16} />
              ヒントを見る（{shown + 1} / 3{shown === 2 ? `。${answerWord}` : ''}）
            </button>
          ) : null}
          <p className="stage-hint">ヒントは方向 → 具体 → {answerWord}の順。使っても失敗にはならない。</p>
        </div>
      ) : null}

      {danger ? (
        <Feedback ok={false} title="気を付けたい操作だった">
          <p className="feedback-text">{danger}</p>
        </Feedback>
      ) : null}

      {finished ? (
        <Feedback ok title="達成した">
          <p className="feedback-text">模擬環境の状態が、達成条件を満たした。結果を見てみよう。</p>
        </Feedback>
      ) : null}

      <Slot to={action}>
        <StepButtons
          onBack={onBack}
          backLabel={backLabel}
          onNext={onFinish}
          nextLabel={finished ? '結果へ' : 'ここで終えて結果を見る'}
          nextTestId={finished ? 'lesson-next' : 'practice-giveup'}
        />
      </Slot>
    </section>
  );
}

/* ---------- 仮想端末 ---------- */

/** エラーの解説の match（正規表現か文字列）が行に当たるか */
function safeTest(pattern: string, line: string): boolean {
  try {
    return new RegExp(pattern).test(line);
  } catch {
    return false;
  }
}

interface TerminalSaved {
  shell: ShellSnapshotData;
  run: PracticeRun;
}

function TerminalPractice({ practice: p, sessionId, saved, onSave, onFinish, onTerm, right, action, onBack, backLabel = 'クイズへ戻る' }: PracticeStageProps) {
  const restored = saved?.engineState as TerminalSaved | undefined;
  const fresh = useMemo<SessionOptions>(() => ({ restore: initialShell(p.environment, p.setup) }), [p]);
  const shell = useShellSession(restored ? { restore: restoreShell(restored.shell) } : fresh);
  const r = useRun(p, restored?.run);
  const termRef = useRef<TerminalHandle>(null);

  // 実戦の段に入ったら、すぐ打てるように端末に焦点を置く
  useEffect(() => {
    termRef.current?.focus();
  }, [right]);

  const step = currentStep(p, r.run);
  const envName = isEnvironmentId(p.environment) ? ENVIRONMENTS[p.environment].name : p.environment;

  const save = (next: PracticeRun): void => {
    onSave({ lessonId: sessionId, stepIndex: next.stepIndex, engineState: { shell: snapshotShell(shell.getState()), run: next } satisfies TerminalSaved, savedAt: nowIso() });
  };

  const onExecuted = (line: string, _code: number, stderr: string, stdout: string): void => {
    const outcome = afterCommand(p, r.runRef.current, { line, stderr, stdout, shell: shell.getState() }, ERROR_GUIDES);
    // 出力に出たエラー（HTTP の 4xx・5xx）は、その行を「言われたこと」として示す
    const match = outcome.error?.match ?? '';
    const said = stderr.trim() !== '' || !outcome.error ? stderr : (stdout.split('\n').find((l) => l.includes(match) || safeTest(match, l)) ?? stdout);
    save(r.took(outcome, said, line));
  };

  /** 答える形（answer）の手順の答え。端末の状態は変えない */
  const onAnswer = (answer: string): void => {
    const line = `（答え）${answer}`;
    save(r.took(afterCommand(p, r.runRef.current, { line, stderr: '', shell: shell.getState(), answer }, ERROR_GUIDES), '', line));
  };

  const reset = (): void => {
    shell.load(fresh);
    save(r.restart());
    termRef.current?.focus();
  };

  return (
    <>
      <PracticeLeft
        p={p} run={r.run} kind={PRACTICE_NAMES[p.mode]} onHint={() => save(r.hint())} danger={r.danger} onTerm={onTerm}
        action={action} onBack={onBack} backLabel={backLabel} onFinish={() => onFinish(attemptOf(p, r.runRef.current))}
      />
      <Slot to={right}>
        <div className="practice-console">
          <div className="practice-console-bar">
            <span className="practice-console-name"><Icon name="terminal" size={16} />{envName}</span>
            <button type="button" className="practice-reset" onClick={reset} title="模擬環境を初めの状態に戻す（ヒントの記録は残る）" data-testid="practice-reset">
              <Icon name="rotate" size={14} />初めに戻す
            </button>
          </div>
          <div className="practice-term">
            <TerminalView ref={termRef} session={shell} onExecuted={onExecuted} banner={restored ? '中断した所から続ける' : 'help で使えるコマンドの一覧が出る'} />
          </div>
          {step?.check.kind === 'answer' ? <AnswerForm key={step.id} onAnswer={onAnswer} /> : null}
          {r.error ? <ErrorGuidePanel error={r.error} onTerm={onTerm} onClose={() => { r.setError(null); termRef.current?.focus(); }} /> : null}
          {step && !r.error ? (
            <p className="practice-candidates" data-testid="practice-candidates">
              <span className="practice-candidates-label">今打てるコマンドの候補</span>
              {[...commandCandidates(step), 'help'].map((c) => <code key={c} className="practice-candidate">{c}</code>)}
            </p>
          ) : null}
        </div>
      </Slot>
    </>
  );
}

/* ---------- 画面で操作する模擬（模） ---------- */

export interface SimLogEntry {
  line: string;
  error: string | null;
}

interface SimSaved {
  sim: SimState;
  log: SimLogEntry[];
  run: PracticeRun;
}

function SimPractice({ practice: p, sessionId, saved, onSave, onFinish, onTerm, right, action, onBack, backLabel = 'クイズへ戻る' }: PracticeStageProps) {
  const restored = saved?.engineState as SimSaved | undefined;
  const fresh = useMemo(() => createSim(p.environment, p.setup), [p]);
  const [sim, setSim] = useState<SimState>(restored?.sim ?? fresh);
  const [log, setLog] = useState<SimLogEntry[]>(restored?.log ?? []);
  const simRef = useRef(sim);
  simRef.current = sim;
  const logRef = useRef(log);
  logRef.current = log;
  const r = useRun(p, restored?.run);

  const save = (next: PracticeRun, s: SimState, l: SimLogEntry[]): void => {
    onSave({ lessonId: sessionId, stepIndex: next.stepIndex, engineState: { sim: s, log: l, run: next } satisfies SimSaved, savedAt: nowIso() });
  };

  const send = (line: string): void => {
    const text = line.trim();
    if (text === '') return;
    const out = applyStatement(simRef.current, text);
    const nextLog = [...logRef.current, { line: text, error: out.error }];
    simRef.current = out.state;
    logRef.current = nextLog;
    setSim(out.state);
    setLog(nextLog);
    const outcome = afterCommand(p, r.runRef.current, { line: text, stderr: out.error ?? '', sim: out.state, settled: out.error === null && isSettled(out.state) }, ERROR_GUIDES);
    save(r.took(outcome, out.error ?? '', text), out.state, nextLog);
  };

  const reset = (): void => {
    simRef.current = fresh;
    logRef.current = [];
    setSim(fresh);
    setLog([]);
    save(r.restart(), fresh, []);
  };

  const kind = SIM_NAMES[sim.type];
  return (
    <>
      <PracticeLeft
        p={p} run={r.run} kind={`${PRACTICE_NAMES[p.mode]}（${kind}）`} onHint={() => save(r.hint(), simRef.current, logRef.current)} danger={r.danger} onTerm={onTerm}
        action={action} onBack={onBack} backLabel={backLabel} onFinish={() => onFinish(attemptOf(p, r.runRef.current))}
      />
      <Slot to={right}>
        <SimConsole
          sim={sim}
          log={log}
          verbs={SIM_VERBS[sim.type]}
          send={send}
          onReset={reset}
          restored={restored !== undefined}
          error={r.error ? <ErrorGuidePanel error={r.error} onTerm={onTerm} onClose={() => r.setError(null)} /> : null}
        />
      </Slot>
    </>
  );
}

/** 答える形の手順の、答えの欄（端末で調べて、ここに答える） */
function AnswerForm({ onAnswer }: { onAnswer: (answer: string) => void }) {
  const [draft, setDraft] = useState('');
  return (
    <form className="sim-command practice-answer" data-testid="practice-answer" onSubmit={(e) => {
      e.preventDefault();
      if (draft.trim() !== '') onAnswer(draft.trim());
    }}>
      <label className="sim-command-label" htmlFor="practice-answer">端末で調べて答える</label>
      <input id="practice-answer" className="sim-input is-command" value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={false} autoComplete="off" />
      <button type="submit" className="sim-tool is-strong" disabled={draft.trim() === ''}>答える</button>
    </form>
  );
}

/** エラーの小窓（docs/learning-design.md 7 章: エラー → 内容 → 原因候補 → ヒント → 再挑戦） */
function ErrorGuidePanel({ error, onTerm, onClose }: { error: ShownError; onTerm: OnTerm; onClose: () => void }) {
  const g = error.guide;
  return (
    <section className="practice-error" role="status" aria-label="エラーを調べる" data-testid="practice-error" data-guide={g.id}>
      <header className="practice-error-head">
        <Icon name="search" size={16} />
        <h3 className="practice-error-title">エラーが出た。調べてみよう</h3>
        <button type="button" className="practice-error-close" onClick={onClose} aria-label="閉じて打ち直す"><Icon name="close" size={14} /></button>
      </header>
      <pre className="practice-error-said"><span className="practice-error-line">{error.line}</span>{'\n'}{error.said}</pre>
      <ol className="practice-error-flow">
        <li>
          <span className="practice-error-label">何と言われたか</span>
          <p><Rich text={g.meaning} onTerm={onTerm} /></p>
        </li>
        <li>
          <span className="practice-error-label">考えられる理由</span>
          <ul className="practice-error-causes">
            {g.causes.map((c, i) => <li key={i}><Rich text={c} onTerm={onTerm} /></li>)}
          </ul>
        </li>
        <li>
          <span className="practice-error-label">次に確かめること</span>
          <p><Rich text={g.hint} onTerm={onTerm} /></p>
        </li>
      </ol>
      <p className="practice-error-retry">確かめたら、もう一度やってみよう。</p>
    </section>
  );
}
