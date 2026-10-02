import type { Lesson } from '@/content/schema';
import type { PracticeAttempt } from '@/game/types';
import { resultKind, type ResultKind } from '@/learning/practice';
import { Icon } from '@/ui/icons/Icon';
import { Rich } from '../Rich';
import { Figure } from './Figure';
import { Slot, StepButtons, type OnTerm } from './widgets';

/**
 * 結果・フィードバック（docs/learning-design.md 2 章）。点数だけを出さず、何ができ、何が足りないかを示す。
 * 成功・失敗の理由（できたこと）、よかった手、改善の余地。未達でも責めず、どこで外れたかと再挑戦の道を示す。
 */

const TITLES: Record<ResultKind, string> = {
  success: '自分の手で通せた',
  partial: 'ヒントを使って通せた',
  retry: 'まだ途中。もう一度やってみよう',
};

export function ResultStage({ lesson, attempt, onTerm, right, action, onRetry, onNext }: {
  lesson: Lesson;
  /** この回の最後の実戦の記録（無ければ、まだ実戦を終えていない） */
  attempt: PracticeAttempt | undefined;
  onTerm: OnTerm;
  right: HTMLElement | null;
  action: HTMLElement | null;
  onRetry: () => void;
  onNext: () => void;
}) {
  const kind: ResultKind = attempt ? resultKind(attempt) : 'retry';
  const steps = lesson.practice.steps;
  const done = steps.filter((s) => attempt?.stepsDone.includes(s.id));
  const missed = steps.filter((s) => !attempt?.stepsDone.includes(s.id));
  const errors = attempt?.errors.length ?? 0;
  const better: string[] = [];
  if (attempt) {
    if (attempt.hintsUsed > 0) better.push(`ヒントを ${String(attempt.hintsUsed)} 段目まで開いた。次は、1 段目の方向だけで組み立ててみよう。`);
    if (attempt.dangerousUsed.length > 0) better.push('気を付けたい操作を使った。本物の機械では、取り返しのつかないことがある。');
    if (errors > 0 && !attempt.recoveredFromError && attempt.success) better.push(`エラーが ${String(errors)} 回出た。エラーの文の中の名前を、打った行と見比べる癖をつけよう。`);
    if (!attempt.success) better.push('達成条件はまだ満たしていない。下の「まだの手順」から、もう一度。');
  }

  return (
    <section className="stage stage-result" aria-label="結果" data-testid="stage-result" data-result={kind}>
      <p className={`result-badge is-${kind}`} data-testid="result-kind">
        <Icon name={kind === 'retry' ? 'alert' : 'check'} size={18} />
        {TITLES[kind]}
      </p>
      <p className="stage-text"><Rich text={lesson.result[kind]} onTerm={onTerm} /></p>

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

      <h3 className="stage-subheading">よかった手</h3>
      <ul className="result-list">
        {attempt?.success && attempt.hintsUsed === 0 ? <li><Icon name="check" size={14} />ヒントを開かずに、自分で組み立てた。</li> : null}
        {attempt?.recoveredFromError ? <li><Icon name="check" size={14} />エラーの文を読み、自分で立て直した（トラブルシューティング）。</li> : null}
        {attempt?.success && attempt.hintsUsed > 0 ? <li><Icon name="check" size={14} />詰まった所でヒントを使い、最後まで通した。</li> : null}
        {!attempt?.success ? <li><Icon name="check" size={14} />安全な模擬環境で、実際に手を動かして確かめた。</li> : null}
      </ul>

      {better.length > 0 ? (
        <>
          <h3 className="stage-subheading">次はここを</h3>
          <ul className="result-list is-todo">
            {better.map((b) => <li key={b}><Icon name="hint" size={14} />{b}</li>)}
          </ul>
        </>
      ) : null}

      {attempt && attempt.commands.length > 0 ? (
        <>
          <h3 className="stage-subheading">打ったコマンド</h3>
          <pre className="result-commands" data-testid="result-commands">{attempt.commands.map((c) => `$ ${c}`).join('\n')}</pre>
        </>
      ) : null}

      <Slot to={right}>
        <Figure id={lesson.explain.figures[0] ?? ''} />
      </Slot>
      <Slot to={action}>
        <StepButtons
          onBack={onRetry}
          backLabel={kind === 'retry' ? 'もう一度挑戦する' : '実戦をやり直す'}
          onNext={onNext}
          nextLabel="まとめへ"
        />
      </Slot>
    </section>
  );
}
