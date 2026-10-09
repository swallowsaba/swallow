import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { isSettled, orderStop, orderTime, stageOf, stageTime } from '@/engines/sim/sim';
import type { OrderState } from '@/engines/sim/types';
import { useDrag } from './drag';
import { moveTo, type Carry } from './orderMove';
import type { BoardProps } from './boardTypes';

/**
 * 並べる（sim-order）: 札をドラッグして順番を入れ替える（REWORK-PRACTICE.txt (3)）。
 * 並べ終えたら、上の段から順に処理が進む様子が動く。順が違うと、止まった段が赤くなり理由が出る
 */


export function OrderBoard({ s, act }: BoardProps<OrderState>) {
  const drag = useDrag<Carry>((c, target) => {
    if (target === null) return;
    const stages = moveTo(s, c, target);
    if (stages !== null) act({ op: 'arrange', stages });
  });
  const items = new Map(s.setup.items.map((i) => [i.id, i]));
  const pool = s.setup.items.filter((i) => stageOf(s, i.id) < 0);
  const timed = s.setup.items.some((i) => i.minutes !== undefined);
  const unit = s.setup.unit ?? '分';
  const settled = isSettled(s);
  // 並べるたびに、上の段から流してみせる（並べ終える前でも、どこで止まるかが分かる）
  const running = s.stages.length > 0;
  const stop = running ? orderStop(s) : null;
  // 並びが変わるたびに、流れの動きを初めからやり直す
  const runKey = JSON.stringify(s.stages);
  const dragging = drag.now?.payload ?? drag.held;
  const over = drag.now?.over ?? null;

  const card = (id: string, from: number | null) => {
    const it = items.get(id);
    const lifted = drag.held?.item === id;
    return (
      <button
        key={id}
        type="button"
        className={`sim-card is-draggable${stop?.item === id ? ' is-wrong' : ''}${lifted ? ' is-lifted' : ''}${drag.now?.payload.item === id ? ' is-dragging' : ''}`}
        data-card={id}
        aria-pressed={lifted}
        aria-label={`${it?.label ?? id}（ドラッグして並べる。キーボードでは Enter で持ち上げる）`}
        onPointerDown={(e) => drag.begin(e, { item: id, from })}
        onKeyDown={(e) => drag.lift(e, { item: id, from })}
      >
        <span className="sim-card-label">{it?.label ?? id}</span>
        {it?.minutes !== undefined ? <span className="sim-card-time num">{it.minutes} {unit}</span> : null}
        {it?.needs?.length ? <span className="sim-card-needs">先に要る: {it.needs.map((n) => items.get(n)?.label ?? n).join('・')}</span> : null}
        {it?.note ? <span className="sim-card-needs">{it.note}</span> : null}
      </button>
    );
  };

  const zone = (target: string, label: string) => (
    <li
      key={target}
      className={`sim-gap${over === target ? ' is-over' : ''}`}
      data-drop={target}
      tabIndex={drag.held ? 0 : -1}
      onKeyDown={(e) => drag.place(e, target)}
      aria-label={label}
    >
      <span className="sim-gap-mark">{label}</span>
    </li>
  );

  return (
    <div className={`sim-order${dragging ? ' is-carrying' : ''}${s.setup.parallel ? ' is-parallel' : ''}`} data-testid="sim-order">
      <p className="sim-how">
        札をドラッグして、上から順に並べる。{s.setup.parallel ? '段の上に落とすと同じ段（並行して進む）、段の間に落とすと新しい段になる。' : '並んだ札の上に落とすと、そこに入る。'}
        置き場へドラッグすると外れる。全て並べると、上から順に流れる。
      </p>
      <ol className={`sim-stages${running ? ' is-run' : ''}${stop ? ' is-stopped' : ''}`} aria-label="並び" key={runKey} data-testid="sim-stages" style={{ '--n': s.stages.length } as CSSProperties}>
        {s.stages.flatMap((g, at) => {
          const state = stop === null ? '' : at === stop.stage ? ' is-stop' : at > stop.stage ? ' is-unreached' : '';
          const row = (
            <li
              key={`stage-${String(at)}`}
              className={`sim-stage${over === `stage:${String(at)}` ? ' is-over' : ''}${state}`}
              style={{ '--i': at } as CSSProperties}
              data-drop={`stage:${String(at)}`}
              data-stage={at}
              tabIndex={drag.held ? 0 : -1}
              onKeyDown={(e) => drag.place(e, `stage:${String(at)}`)}
            >
              <span className="sim-stage-no num">{at + 1}</span>
              <div className="sim-stage-cards">{g.map((id) => card(id, at))}</div>
              {timed ? <span className="sim-stage-time num">{stageTime(s, g)} {unit}</span> : null}
              {stop?.stage === at ? <p className="sim-stage-why" role="status">止まった: {stop.reason}</p> : null}
            </li>
          );
          return s.setup.parallel && dragging ? [zone(`gap:${String(at)}`, 'ここに新しい段'), row] : [row];
        })}
        {zone('end', s.stages.length === 0 ? 'ここへドラッグして並べ始める' : '一番下に並べる')}
        {running && stop === null ? (
          <li className={`sim-stage-done${settled ? ' is-all' : ''}`} style={{ '--i': s.stages.length } as CSSProperties} role="status">
            {settled ? '最後まで流れた' : 'ここまで流れた（置き場に、まだ並べていない札がある）'}{timed ? `（合計 ${String(orderTime(s))} ${unit}）` : ''}
          </li>
        ) : null}
      </ol>
      {timed && !(running && stop === null) ? <p className="sim-total">合計の時間（各段で最も長い札の時間の和）: <span className="num">{orderTime(s)}</span> {unit}</p> : null}
      <div
        className={`sim-pool${over === 'pool' ? ' is-over' : ''}`}
        data-drop="pool"
        tabIndex={drag.held && drag.held.from !== null ? 0 : -1}
        onKeyDown={(e) => drag.place(e, 'pool')}
        aria-label="置き場"
      >
        <span className="sim-pool-label">置き場</span>
        {pool.length === 0 ? <span className="sim-pool-empty">全て並べた</span> : pool.map((i) => card(i.id, null))}
      </div>
      {drag.now ? createPortal(
        <div className="sim-ghost" style={{ left: drag.now.x, top: drag.now.y }} aria-hidden="true">
          {items.get(drag.now.payload.item)?.label ?? drag.now.payload.item}
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
