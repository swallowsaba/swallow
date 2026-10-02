import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { Icon } from '@/ui/icons/Icon';
import { Rich } from '../Rich';

/**
 * 理解とクイズで共有する答えの部品。
 */

export type OnTerm = (id: string, el: HTMLElement) => void;

/** 右の欄・下の操作の場所へ描く（無ければ描かない） */
export function Slot({ to, children }: { to: HTMLElement | null; children: ReactNode }) {
  return to ? createPortal(children, to) : null;
}

export interface ChoiceView {
  id: string;
  text: string;
  /** 答えた後の印 */
  mark?: 'ok' | 'bad' | 'missed' | undefined;
  /** 答えた後に添える理由 */
  note?: string | undefined;
}

/** 選択肢の並び。multi なら複数を選べる。answered の後は印と理由を出し、押せなくする */
export function ChoiceList({ choices, picked, multi = false, answered, onToggle, onTerm, label }: {
  choices: readonly ChoiceView[];
  picked: readonly string[];
  multi?: boolean;
  answered: boolean;
  onToggle: (id: string) => void;
  onTerm: OnTerm;
  label: string;
}) {
  return (
    <ol className={`choices${multi ? ' is-multi' : ''}`} role="group" aria-label={label}>
      {choices.map((c, i) => {
        const on = picked.includes(c.id);
        return (
          <li key={c.id} className={`choice${on ? ' is-picked' : ''}${c.mark ? ` is-${c.mark}` : ''}`}>
            <button
              type="button"
              className="choice-button"
              aria-pressed={on}
              disabled={answered}
              data-choice={c.id}
              onClick={() => onToggle(c.id)}
            >
              <span className="choice-key num">{String.fromCharCode(65 + i)}</span>
              <span className="choice-text"><Rich text={c.text} /></span>
              {c.mark === 'ok' ? <span className="choice-mark"><Icon name="check" size={16} /></span> : null}
              {c.mark === 'bad' ? <span className="choice-mark"><Icon name="close" size={14} /></span> : null}
            </button>
            {c.note ? <p className="choice-note"><Rich text={c.note} onTerm={onTerm} /></p> : null}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * 順に並べる部品。下の札を押した順に上へ並ぶ（もう一度押すと外れる）。キーボードでも同じ操作。
 * wrong は位置の違う項目（確かめた後に印を付ける）
 */
export function OrderPicker({ pool, order, onChange, wrong, done, label }: {
  pool: readonly string[];
  order: readonly string[];
  onChange: (order: string[]) => void;
  wrong: readonly string[];
  done: boolean;
  label: string;
}) {
  const rest = pool.filter((x) => !order.includes(x));
  return (
    <div className="order" role="group" aria-label={label}>
      <ol className="order-placed" aria-label="並べた順">
        {pool.map((_, i) => {
          const item = order[i];
          return (
            <li key={i} className={`order-slot${item ? ' is-filled' : ''}${item && wrong.includes(item) ? ' is-bad' : ''}${done ? ' is-ok' : ''}`}>
              <span className="order-no num">{i + 1}</span>
              {item ? (
                <button type="button" className="order-item" disabled={done} onClick={() => onChange(order.filter((x) => x !== item))} title="外す">
                  <Rich text={item} />
                </button>
              ) : <span className="order-empty">ここに並ぶ</span>}
            </li>
          );
        })}
      </ol>
      {rest.length > 0 ? (
        <ul className="order-pool" aria-label="残り">
          {rest.map((item) => (
            <li key={item}>
              <button type="button" className="order-item is-pool" disabled={done} onClick={() => onChange([...order, item])}>
                <Rich text={item} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** 答えた後の知らせ（正しい・もう一度）。調べる調子で、責めない */
export function Feedback({ ok, title, children }: { ok: boolean; title: string; children?: ReactNode }) {
  return (
    <div className={`feedback is-${ok ? 'ok' : 'retry'}`} role="status" data-testid="feedback">
      <p className="feedback-title">
        <Icon name={ok ? 'check' : 'alert'} size={16} />
        {title}
      </p>
      {children}
    </div>
  );
}

/** 下の操作の場所に置く「次へ」と「前へ」 */
export function StepButtons({ onBack, backLabel = '前へ', onNext, nextLabel = '次へ', nextEnabled = true, nextTestId = 'lesson-next' }: {
  onBack?: (() => void) | undefined;
  backLabel?: string;
  onNext?: (() => void) | undefined;
  nextLabel?: string;
  nextEnabled?: boolean;
  nextTestId?: string;
}) {
  return (
    <>
      {onBack ? <button type="button" className="lesson-back" onClick={onBack} data-testid="lesson-back">{backLabel}</button> : null}
      {onNext ? (
        <button type="button" className="lesson-next" onClick={onNext} disabled={!nextEnabled} data-testid={nextTestId}>
          {nextLabel}
          <Icon name="start" size={14} />
        </button>
      ) : null}
    </>
  );
}
