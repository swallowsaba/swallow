import { useState } from 'react';
import { createPortal } from 'react-dom';
import { assignTime, holds, isSettled, misplaced, usedOf } from '@/engines/sim/sim';
import type { AssignState } from '@/engines/sim/types';
import { useDrag } from './drag';
import type { BoardProps } from './boardTypes';

/**
 * 置く（sim-assign）: 札を枠へドラッグして入れる（REWORK-PRACTICE.txt (3)）。
 * 入れた瞬間に枠の数が動き、枠が光る。入らない物は枠が赤く光り、理由が 1 行出る。
 * 全て置いたのに合っていなければ、置き違えた札が赤くなる
 */

interface Carry {
  item: string;
  /** 今入っている枠（置き場からなら null） */
  from: string | null;
}

export function AssignBoard({ s, act, expr }: BoardProps<AssignState>) {
  // 最後に入った枠（光らせる）と、入らなかった枠と理由。n は同じ枠でも動きをやり直すための数
  const [took, setTook] = useState<{ slot: string; n: number } | null>(null);
  const [refused, setRefused] = useState<{ slot: string; why: string; n: number } | null>(null);
  const drag = useDrag<Carry>((c, target) => {
    if (target === null) return;
    if (target === 'pool') {
      if (c.from !== null) act({ op: 'take', item: c.item, slot: c.from });
      setRefused(null);
      return;
    }
    const slot = target.startsWith('slot:') ? target.slice(5) : null;
    if (slot === null || slot === c.from) return;
    const out = act({ op: 'put', item: c.item, slot });
    const n = (took?.n ?? 0) + (refused?.n ?? 0) + 1;
    if (out.error) {
      setRefused({ slot, why: out.error, n });
      setTook(null);
    } else {
      setTook({ slot, n });
      setRefused(null);
    }
  });

  const pool = s.setup.items.filter((i) => i.multi === true || (s.placed[i.id] ?? []).length === 0);
  const timed = s.setup.items.some((i) => i.time !== undefined);
  const item = (id: string) => s.setup.items.find((i) => i.id === id);
  let wrong: string[] = [];
  try {
    wrong = expr !== null && isSettled(s) && !holds(s, expr) ? misplaced(s, expr) : [];
  } catch {
    wrong = [];
  }
  const dragging = drag.now?.payload ?? drag.held;

  const card = (id: string, from: string | null) => {
    const it = item(id);
    const lifted = drag.held?.item === id && drag.held.from === from;
    return (
      <button
        key={`${id}-${from ?? 'pool'}`}
        type="button"
        className={`sim-card is-draggable${from !== null ? ' is-in' : ''}${wrong.includes(id) && from !== null ? ' is-wrong' : ''}${lifted ? ' is-lifted' : ''}${drag.now?.payload.item === id && drag.now.payload.from === from ? ' is-dragging' : ''}`}
        data-card={id}
        aria-pressed={lifted}
        aria-label={`${it?.label ?? id}（ドラッグして枠に入れる。キーボードでは Enter で持ち上げる）`}
        onPointerDown={(e) => drag.begin(e, { item: id, from })}
        onKeyDown={(e) => drag.lift(e, { item: id, from })}
      >
        <span className="sim-card-label">{it?.label ?? id}</span>
        {it?.size !== undefined ? <span className="sim-card-time num">{it.size}</span> : null}
        {it?.note ? <span className="sim-card-needs">{it.note}</span> : null}
      </button>
    );
  };

  return (
    <div className={`sim-assign${dragging ? ' is-carrying' : ''}`} data-testid="sim-assign">
      <p className="sim-how">札を枠へドラッグして入れる。入れた札を下の置き場へドラッグすると戻る。別の枠へドラッグすると移る。</p>
      <div className="sim-slots">
        {s.setup.slots.map((x) => {
          const inside = Object.entries(s.placed).filter(([, slots]) => slots.includes(x.id)).map(([id]) => id);
          const used = usedOf(s, x.id);
          const over = drag.now?.over === `slot:${x.id}`;
          const isRefused = refused?.slot === x.id;
          const isTook = took?.slot === x.id;
          return (
            <section
              key={x.id}
              className={`sim-slot${over ? ' is-over' : ''}${isRefused ? ' is-refused' : ''}${isTook ? ' is-took' : ''}${dragging ? ' is-target' : ''}`}
              data-drop={`slot:${x.id}`}
              data-slot={x.id}
              tabIndex={drag.held ? 0 : -1}
              onKeyDown={(e) => drag.place(e, `slot:${x.id}`)}
              aria-label={x.label}
            >
              <header className="sim-slot-head" key={isTook ? `t${String(took.n)}` : isRefused ? `r${String(refused.n)}` : 'h'}>
                <span className="sim-slot-label">{x.label}</span>
                {x.capacity !== undefined ? <span className={`sim-slot-cap num${used > x.capacity ? ' is-over' : ''}`}>{used} / {x.capacity}{x.unit ?? ''}</span> : null}
              </header>
              {x.capacity !== undefined ? (
                <span className="sim-slot-meter" aria-hidden="true">
                  <span className="sim-slot-meter-fill" style={{ width: `${String(Math.min(100, x.capacity === 0 ? 0 : (used / x.capacity) * 100))}%` }} />
                </span>
              ) : null}
              {x.note ? <p className="sim-slot-note">{x.note}</p> : null}
              <div className="sim-slot-cards">
                {inside.length === 0 ? <span className="sim-slot-empty">ここへドラッグ</span> : inside.map((id) => card(id, x.id))}
              </div>
              {isRefused ? <p className="sim-slot-why" role="status" key={`w${String(refused.n)}`}>入らない: {refused.why}</p> : null}
            </section>
          );
        })}
      </div>
      {timed ? <p className="sim-total">かかる時間の合計: <span className="num">{assignTime(s)}</span></p> : null}
      <div
        className={`sim-pool${drag.now?.over === 'pool' ? ' is-over' : ''}`}
        data-drop="pool"
        tabIndex={drag.held?.from ? 0 : -1}
        onKeyDown={(e) => drag.place(e, 'pool')}
        aria-label="置き場"
      >
        <span className="sim-pool-label">置き場</span>
        {pool.length === 0 ? <span className="sim-pool-empty">全て入れた</span> : pool.map((i) => card(i.id, null))}
      </div>
      {drag.now ? createPortal(
        <div className="sim-ghost" style={{ left: drag.now.x, top: drag.now.y }} aria-hidden="true">
          {item(drag.now.payload.item)?.label ?? drag.now.payload.item}
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
