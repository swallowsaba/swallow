import { useState } from 'react';
import type { ZoneKind } from '@/city/types';
import { DEMAND_BAR, DEMAND_NAMES, DEMAND_TERM_NAMES, DEMAND_TERMS, demandBar, demandOfTerms, type DemandTerms } from '@/sim/demand';

/**
 * 需要（RCI）の棒 3 本（docs/ui-design.md 11.4・docs/game-design.md 23 章）。区画の道具の引き出しの中にだけ出す（常時の UI に足さない）。
 * 住宅・商業（店とオフィスに分ける）・工業。−100〜+100 で 0 の線。棒を押すと、その需要の内訳（項ごとの数）を小窓で出す
 */

const ROWS: { id: 'residential' | 'commercial' | 'industrial'; label: string; kinds: ZoneKind[] }[] = [
  { id: 'residential', label: '住宅', kinds: ['residential'] },
  { id: 'commercial', label: '商業', kinds: ['commercial', 'office'] },
  { id: 'industrial', label: '工業', kinds: ['industrial'] },
];

const signed = (v: number): string => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(Math.round(v)).toLocaleString('ja-JP')}`;

function Bar({ value, kind }: { value: number; kind: ZoneKind }) {
  const v = demandBar(value);
  const half = (Math.abs(v) / DEMAND_BAR) * 50;
  return (
    <span className={`demand-track is-${kind}`} aria-hidden="true">
      <span className="demand-zero" />
      <span className={`demand-fill${v < 0 ? ' is-minus' : ''}`} style={v >= 0 ? { left: '50%', width: `${String(half)}%` } : { left: `${String(50 - half)}%`, width: `${String(half)}%` }} />
    </span>
  );
}

export function DemandBars({ demand }: { demand?: DemandTerms | undefined }) {
  const [open, setOpen] = useState<(typeof ROWS)[number]['id'] | null>(null);
  if (!demand) return <p className="build-note" data-testid="demand-none">需要は週の終わりに出る</p>;
  const totals = demandOfTerms(demand);
  return (
    <div className="demand" data-testid="demand-bars" role="group" aria-label="需要（−100〜+100）">
      {ROWS.map((row) => (
        <button
          key={row.id}
          type="button"
          className={`demand-row${open === row.id ? ' is-open' : ''}`}
          aria-expanded={open === row.id}
          data-testid={`demand-${row.id}`}
          onClick={() => setOpen(open === row.id ? null : row.id)}
          title="押すと内訳"
        >
          <span className="demand-label">{row.label}</span>
          <span className="demand-bars">
            {row.kinds.map((k) => (
              <span key={k} className="demand-line">
                <span className="demand-sub">{row.kinds.length > 1 ? DEMAND_NAMES[k] : ''}</span>
                <Bar value={totals[k]} kind={k} />
                <span className="demand-value num" data-testid={`demand-value-${k}`}>{signed(demandBar(totals[k]))}</span>
              </span>
            ))}
          </span>
        </button>
      ))}
      {open ? (
        <div className="demand-pop" role="dialog" aria-label={`${ROWS.find((r) => r.id === open)?.label ?? ''}の需要の内訳`} data-testid="demand-pop">
          {(ROWS.find((r) => r.id === open)?.kinds ?? []).map((k) => (
            <dl key={k} className="demand-terms">
              <dt className="demand-terms-head">{DEMAND_NAMES[k]}<span className="num">{signed(totals[k])}</span></dt>
              {/* 褒賞の建物の項は、建てた時だけ並べる */}
              {DEMAND_TERMS[k].map((t, i) => (t === 'award' && !demand[k][i] ? null : (
                <dd key={t}><span>{DEMAND_TERM_NAMES[t]}</span><span className="num">{signed(demand[k][i] ?? 0)}</span></dd>
              )))}
            </dl>
          ))}
          <p className="demand-pop-note">正ならその区画に建物が建ち・育つ。負なら空きが出る</p>
        </div>
      ) : null}
    </div>
  );
}
