import { useEffect, useMemo, useRef, useState } from 'react';
import { PRACTICE_NAMES } from '@/content/catalog';
import { ERROR_GUIDES } from '@/content/glossary';
import type { ErrorGuide, Lesson } from '@/content/schema';
import { ENVIRONMENTS, initialShell, isEnvironmentId } from '@/engines/environments';
import { restoreShell, snapshotShell, type SessionOptions, type ShellSnapshotData } from '@/engines/kernel/session';
import type { PracticeAttempt, PracticeSession } from '@/game/types';
import {
  afterCommand, attemptOf, commandCandidates, currentStep, isFinished, openHint, startRun, type PracticeRun,
} from '@/learning/practice';
import { Icon } from '@/ui/icons/Icon';
import { nowIso } from '../clock';
import { Rich } from '../Rich';
import { TerminalView, type TerminalHandle } from './terminal/TerminalView';
import { useShellSession } from './terminal/useShellSession';
import { Feedback, Slot, StepButtons, type OnTerm } from './widgets';

/**
 * 実戦（docs/learning-design.md 6・7 章、docs/ui-design.md 7 章）。
 *
 * 左に目的と手順（打つ前に何を確かめるか、打った後に何が起きたか）とヒント 3 段、右に仮想端末。
 * エラーが出たら、端末の下に「エラー → 内容 → 原因候補 → ヒント」の小窓を出す（調べる調子で。ゲームオーバーにしない）。
 * 判定は模擬環境の状態で行う（src/learning/practice.ts）。打つたびに途中の状態を保存し、中断して開き直すと続きから。
 */

interface Saved {
  shell: ShellSnapshotData;
  run: PracticeRun;
}

export function PracticeStage({ lesson, saved, onSave, onFinish, onTerm, right, action, onBack }: {
  lesson: Lesson;
  /** 途中の状態（中断して開き直した時） */
  saved: PracticeSession | undefined;
  onSave: (session: PracticeSession) => void;
  /** 実戦を終える（成功・未達）。結果の段へ進む */
  onFinish: (attempt: Omit<PracticeAttempt, 'at'>) => void;
  onTerm: OnTerm;
  right: HTMLElement | null;
  action: HTMLElement | null;
  onBack: () => void;
}) {
  const p = lesson.practice;
  const restored = saved?.engineState as Saved | undefined;
  const fresh = useMemo<SessionOptions>(() => ({ restore: initialShell(p.environment, p.setup) }), [p]);
  const shell = useShellSession(restored ? { restore: restoreShell(restored.shell) } : fresh);
  const [run, setRun] = useState<PracticeRun>(() => restored?.run ?? startRun());
  const [error, setError] = useState<{ guide: ErrorGuide; said: string; line: string } | null>(null);
  const [danger, setDanger] = useState<string | null>(null);
  const termRef = useRef<TerminalHandle>(null);
  const runRef = useRef(run);
  runRef.current = run;

  // 実戦の段に入ったら、すぐ打てるように端末に焦点を置く
  useEffect(() => {
    termRef.current?.focus();
  }, [right]);

  const finished = isFinished(p, run);
  const step = currentStep(p, run);
  const envName = isEnvironmentId(p.environment) ? ENVIRONMENTS[p.environment].name : p.environment;

  const save = (next: PracticeRun): void => {
    onSave({ lessonId: lesson.id, stepIndex: next.stepIndex, engineState: { shell: snapshotShell(shell.getState()), run: next } satisfies Saved, savedAt: nowIso() });
  };

  const onExecuted = (line: string, _code: number, stderr: string): void => {
    const r = afterCommand(p, runRef.current, { line, stderr, shell: shell.getState() }, ERROR_GUIDES);
    runRef.current = r.run;
    setRun(r.run);
    setError(r.error ? { guide: r.error, said: stderr.trim(), line: line.trim() } : null);
    if (r.danger) setDanger(r.danger.why);
    save(r.run);
  };

  const hint = (): void => {
    const next = openHint(p, runRef.current);
    runRef.current = next;
    setRun(next);
    save(next);
  };

  const reset = (): void => {
    shell.load(fresh);
    const next: PracticeRun = { ...runRef.current, stepIndex: 0, stepsDone: [] };
    runRef.current = next;
    setRun(next);
    setError(null);
    save(next);
    termRef.current?.focus();
  };

  const shown = step ? (run.hints[step.id] ?? 0) : 0;

  return (
    <section className="stage stage-practice" aria-label="実戦" data-testid="stage-practice">
      <p className="stage-count">
        <span className="stage-kind">{PRACTICE_NAMES[p.mode]}</span>
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
            <button type="button" className="practice-hint-open" onClick={hint} data-testid="practice-hint">
              <Icon name="hint" size={16} />
              ヒントを見る（{shown + 1} / 3{shown === 2 ? '。そのまま打てる答え' : ''}）
            </button>
          ) : null}
          <p className="stage-hint">ヒントは方向 → 具体 → そのまま打てる答えの順。使っても失敗にはならない。</p>
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
          {error ? <ErrorGuidePanel error={error} onTerm={onTerm} onClose={() => { setError(null); termRef.current?.focus(); }} /> : null}
          {step && !error ? (
            <p className="practice-candidates" data-testid="practice-candidates">
              <span className="practice-candidates-label">今打てるコマンドの候補</span>
              {[...commandCandidates(step), 'help'].map((c) => <code key={c} className="practice-candidate">{c}</code>)}
            </p>
          ) : null}
        </div>
      </Slot>
      <Slot to={action}>
        <StepButtons
          onBack={onBack}
          backLabel="クイズへ戻る"
          onNext={() => onFinish(attemptOf(p, runRef.current))}
          nextLabel={finished ? '結果へ' : 'ここで終えて結果を見る'}
          nextTestId={finished ? 'lesson-next' : 'practice-giveup'}
        />
      </Slot>
    </section>
  );
}

/** エラーの小窓（docs/learning-design.md 7 章: エラー → 内容 → 原因候補 → ヒント → 再挑戦） */
function ErrorGuidePanel({ error, onTerm, onClose }: { error: { guide: ErrorGuide; said: string; line: string }; onTerm: OnTerm; onClose: () => void }) {
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
      <p className="practice-error-retry">確かめたら、もう一度打ってみよう。</p>
    </section>
  );
}
