import { useEffect, useRef } from 'react';
import type { DemolishTarget } from '@/city/place';
import { Icon } from '@/ui/icons/Icon';
import type { Hint } from './cityStore';
import './CityOverlays.css';

const format = (n: number): string => n.toLocaleString('ja-JP');

/** カーソルの横の小窓: 何を置くか・費用・置けない理由（docs/city-design.md 8 章） */
export function PlacementHint({ hint }: { hint: Hint | null }) {
  if (!hint) return null;
  return (
    <div className={`place-hint${hint.ok ? ' is-ok' : ' is-bad'}`} style={{ left: hint.x, top: hint.y }} role="status" data-testid="place-hint">
      <div className="place-hint-title">{hint.title}</div>
      {hint.cost > 0 ? (
        <div className="place-hint-cost">
          <Icon name="funds" size={14} />
          <span className="num">{format(hint.cost)}</span>
          <span className="place-hint-unit">資金</span>
        </div>
      ) : null}
      {hint.reasons.length > 0 ? (
        <ul className="place-hint-reasons" data-testid="place-reasons">
          {hint.reasons.map((r) => (
            <li key={r.code}>
              <Icon name="alert" size={14} />
              <span>{r.text}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** 取り壊しの確認（docs/city-design.md 8 章: 取り壊しは確認してから） */
export function DemolishConfirm({ target, onYes, onNo }: { target: DemolishTarget | null; onYes: () => void; onNo: () => void }) {
  const yes = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!target) return;
    yes.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onNo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [target, onNo]);
  if (!target) return null;
  return (
    <div className="confirm" role="dialog" aria-modal="true" aria-labelledby="confirm-title" data-testid="demolish-confirm">
      <h2 id="confirm-title" className="confirm-title">
        <Icon name="demolish" size={22} />
        「{target.name}」を取り壊しますか
      </h2>
      <p className="confirm-body">
        {target.kind === 'facility'
          ? '施設を壊しても、学習の記録は消えません。'
          : target.kind === 'road'
            ? 'この道路だけに面していた建物は、道路に面さなくなるので取り壊されます。'
            : 'このマスは区画から外れます。'}
      </p>
      <div className="confirm-actions">
        <button ref={yes} type="button" className="confirm-yes" onClick={onYes} data-testid="demolish-yes">
          取り壊す
        </button>
        <button type="button" className="confirm-no" onClick={onNo}>
          やめる（Esc）
        </button>
      </div>
    </div>
  );
}

/** 上の帯の下、右寄せの 1 行の知らせ（docs/ui-design.md 3 章）と、一時停止の印 */
export function CityNotice({ text, paused }: { text: string | null; paused: boolean }) {
  return (
    <div className="city-notices">
      {paused ? (
        <div className="city-notice is-paused" data-testid="paused">
          <Icon name="pause" size={16} />
          一時停止中（Space で再開）
        </div>
      ) : null}
      {text ? (
        <div className="city-notice" role="status">
          {text}
        </div>
      ) : null}
    </div>
  );
}
