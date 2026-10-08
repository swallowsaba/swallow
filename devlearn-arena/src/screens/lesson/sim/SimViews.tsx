import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { isUp, orderStatement, orderTime, stageOf, usedOf, assignTime } from '@/engines/sim/sim';
import type { AssignState, ConfigState, ConnectState, OrderState, Panel, ReadState, SimState } from '@/engines/sim/types';
import { Icon } from '@/ui/icons/Icon';
import { CHART, chartLayout } from './chartLayout';
import { SimIcon } from './SimIcon';

/**
 * 模擬環境（模）の 5 つの型の画面（docs/ui-design.md 7.1）。
 * どの操作も操作の文（connect A B など）にして send に渡す。状態を変えるのは模擬（src/engines/sim）だけ。
 */

type Send = (line: string) => void;

export function SimView({ sim, send }: { sim: SimState; send: Send }) {
  switch (sim.type) {
    case 'connect': return <ConnectView s={sim} send={send} />;
    case 'order': return <OrderView s={sim} send={send} />;
    case 'assign': return <AssignView s={sim} send={send} />;
    case 'config': return <ConfigView s={sim} send={send} />;
    case 'read': return <ReadView s={sim} send={send} />;
  }
}

/* ---------- 画面に示す情報 ---------- */

/** 英数字と記号だけの値（アドレス・番号・コマンド）は等幅で、日本語の文は本文の字で出す。短い物は途中で折らない */
const CODE = /^[ -~]+$/;
const codeClass = (v: string): string | undefined => (CODE.test(v) ? (v.length <= 20 ? 'is-code is-whole' : 'is-code') : undefined);

export function Panels({ panels }: { panels: readonly Panel[] }) {
  if (panels.length === 0) return null;
  return (
    <div className="sim-panels">
      {panels.map((p, i) => (
        <section key={i} className={`sim-panel is-${p.kind}`} aria-label={p.title}>
          <h3 className="sim-panel-title">{p.title}</h3>
          {p.kind === 'kv' ? (
            <dl className="sim-kv">
              {p.rows.map(([k, v], j) => (
                <div key={j} className="sim-kv-row"><dt>{k}</dt><dd>{v}</dd></div>
              ))}
            </dl>
          ) : p.kind === 'table' ? (
            <table className="sim-table">
              <thead><tr>{p.columns.map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
              <tbody>{p.rows.map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k} className={codeClass(c)}>{c}</td>)}</tr>)}</tbody>
            </table>
          ) : p.kind === 'log' ? (
            <pre className="sim-log-lines">{p.lines.join('\n')}</pre>
          ) : p.kind === 'chart' ? (
            <Chart panel={p} />
          ) : (
            <p className="sim-panel-text">{p.body}</p>
          )}
        </section>
      ))}
    </div>
  );
}

const SERIES = ['is-s0', 'is-s1', 'is-s2', 'is-s3'];

/** 折れ線のグラフ。縦軸は 0 から最大の値まで */
function Chart({ panel }: { panel: Extract<Panel, { kind: 'chart' }> }) {
  // 置かれた枠の幅で描く（縮めると目盛りの字が小さくなる）
  const ref = useRef<HTMLElement>(null);
  const [measured, setMeasured] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el === null) return;
    const fit = (): void => setMeasured(el.clientWidth);
    fit();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const { width: w, labels } = chartLayout(measured, panel.x);
  const { height: h, left, bottom } = CHART;
  const max = Math.max(1, ...panel.series.flatMap((s) => s.values));
  const xAt = (i: number): number => labels[i]?.x ?? left;
  const yAt = (v: number): number => 8 + (h - bottom - 8) * (1 - v / max);
  return (
    <figure className="sim-chart" ref={ref}>
      <svg viewBox={`0 0 ${String(w)} ${String(h)}`} width={w} height={h} role="img" aria-label={`${panel.title}のグラフ`}>
        <line className="sim-chart-axis" x1={left} y1={h - bottom} x2={w - 6} y2={h - bottom} />
        <line className="sim-chart-axis" x1={left} y1={8} x2={left} y2={h - bottom} />
        <text className="sim-chart-label" x={left - 6} y={14} textAnchor="end">{max}</text>
        <text className="sim-chart-label" x={left - 6} y={h - bottom} textAnchor="end">0</text>
        {labels.map((l, i) => (l.text === null ? null : <text key={i} className="sim-chart-label" x={l.x} y={h - 4} textAnchor="middle">{l.text}</text>))}
        {panel.series.map((s, k) => (
          <polyline key={s.label} className={`sim-chart-line ${SERIES[k] ?? ''}`} points={s.values.map((v, i) => `${String(xAt(i))},${String(yAt(v))}`).join(' ')} />
        ))}
      </svg>
      <figcaption className="sim-chart-legend">
        {panel.series.map((s, k) => <span key={s.label} className={`sim-chart-key ${SERIES[k] ?? ''}`}>{s.label}</span>)}
        {panel.unit ? <span className="sim-chart-unit">単位: {panel.unit}</span> : null}
      </figcaption>
    </figure>
  );
}

/* ---------- つなぐ ---------- */

function ConnectView({ s, send }: { s: ConnectState; send: Send }) {
  const [picked, setPicked] = useState<string | null>(null);
  const pos = new Map(s.setup.nodes.map((n) => [n.id, n]));
  const pick = (id: string): void => {
    if (picked === null) setPicked(id);
    else if (picked === id) setPicked(null);
    else {
      send(`connect ${picked} ${id}`);
      setPicked(null);
    }
  };
  return (
    <div className="sim-connect" data-testid="sim-connect">
      <p className="sim-how">部品を 2 つ順に押すと線でつながる。線を押すと外れる。{s.setup.directed ? '線は先に押した方から、後に押した方へ向く。' : ''}</p>
      {(s.setup.sends ?? []).length > 0 ? (
        <div className="sim-sends">
          {(s.setup.sends ?? []).map((x) => {
            const arrived = s.sent.some(([a, b]) => a === x.from && b === x.to);
            return (
              <button key={`${x.from}-${x.to}`} type="button" className={`sim-tool is-strong${arrived ? ' is-arrived' : ''}`} data-send={`${x.from}>${x.to}`} onClick={() => send(`send ${x.from} ${x.to}`)}>
                {x.label}{arrived ? '（届いた）' : ''}
              </button>
            );
          })}
        </div>
      ) : null}
      <div className="sim-board">
        <svg className="sim-wires" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="false" role="group" aria-label="つながり">
          {s.links.map(([a, b]) => {
            const p = pos.get(a);
            const q = pos.get(b);
            if (!p || !q) return null;
            const live = isUp(s, a) && isUp(s, b);
            return (
              <g key={`${a}-${b}`} className={`sim-wire${live ? ' is-live' : ''}`}>
                <line className="sim-wire-hit" x1={p.x} y1={p.y} x2={q.x} y2={q.y} onClick={() => send(`cut ${a} ${b}`)}>
                  <title>{`${a} と ${b} の線（押すと外れる）`}</title>
                </line>
                <line className="sim-wire-line" x1={p.x} y1={p.y} x2={q.x} y2={q.y} vectorEffect="non-scaling-stroke" />
                {s.setup.directed ? <circle className="sim-wire-head" cx={p.x + (q.x - p.x) * 0.72} cy={p.y + (q.y - p.y) * 0.72} r={1.1} /> : null}
              </g>
            );
          })}
        </svg>
        {s.setup.nodes.map((n) => {
          const up = isUp(s, n.id);
          return (
            <div key={n.id} className={`sim-node${picked === n.id ? ' is-picked' : ''}${up ? '' : ' is-down'}`} style={{ left: `${String(n.x)}%`, top: `${String(n.y)}%` }}>
              <button type="button" className="sim-node-button" data-node={n.id} aria-pressed={picked === n.id} onClick={() => pick(n.id)}>
                <SimIcon name={n.icon ?? 'box'} />
                <span className="sim-node-label">{n.label}</span>
                {n.note ? <span className="sim-node-note">{n.note}</span> : null}
                {n.id !== n.label ? <span className="sim-node-id">{n.id}</span> : null}
              </button>
              {up ? null : (
                <button type="button" className="sim-node-start" onClick={() => send(`start ${n.id}`)} data-start={n.id}>
                  止まっている・動かす
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- 並べる ---------- */

function OrderView({ s, send }: { s: OrderState; send: Send }) {
  const [picked, setPicked] = useState<string | null>(null);
  const items = new Map(s.setup.items.map((i) => [i.id, i]));
  const pool = s.setup.items.filter((i) => stageOf(s, i.id) < 0);
  const timed = s.setup.items.some((i) => i.minutes !== undefined);
  const without = (id: string): string[][] => s.stages.map((g) => g.filter((x) => x !== id)).filter((g) => g.length > 0);
  const apply = (stages: string[][]): void => {
    send(orderStatement(stages));
    setPicked(null);
  };
  const putIn = (at: number): void => {
    if (picked === null) return;
    const rest = s.stages.map((g) => g.filter((x) => x !== picked));
    const target = rest[at];
    if (target) target.push(picked);
    apply(rest);
  };
  const newStage = (at: number): void => {
    if (picked === null) return;
    const rest = s.stages.map((g) => g.filter((x) => x !== picked));
    rest.splice(at, 0, [picked]);
    apply(rest);
  };
  const moveStage = (at: number, by: number): void => {
    const next = s.stages.map((g) => [...g]);
    const [g] = next.splice(at, 1);
    if (g) next.splice(at + by, 0, g);
    apply(next);
  };
  const card = (id: string) => {
    const it = items.get(id);
    return (
      <button key={id} type="button" className={`sim-card${picked === id ? ' is-picked' : ''}`} data-card={id} aria-pressed={picked === id} onClick={() => setPicked(picked === id ? null : id)}>
        <span className="sim-card-label">{it?.label ?? id}</span>
        {it?.minutes !== undefined ? <span className="sim-card-time num">{it.minutes} 分</span> : null}
        {it?.needs?.length ? <span className="sim-card-needs">先に要る: {it.needs.map((n) => items.get(n)?.label ?? n).join('・')}</span> : null}
      </button>
    );
  };
  return (
    <div className="sim-order" data-testid="sim-order">
      <p className="sim-how">
        札を押して選び、{s.setup.parallel ? '段の「ここに入れる」か「新しい段」' : '「ここに並べる」'}を押す。上の段から順に進む。
        {s.setup.parallel ? '同じ段の札は並行して進む。' : ''}
      </p>
      <ol className="sim-stages" aria-label="並び">
        {s.stages.map((g, at) => (
          <li key={at} className="sim-stage">
            <span className="sim-stage-no num">{at + 1}</span>
            <div className="sim-stage-cards">{g.map((id) => card(id))}</div>
            <div className="sim-stage-tools">
              {s.setup.parallel && picked !== null && !g.includes(picked) ? (
                <button type="button" className="sim-tool is-strong" onClick={() => putIn(at)}>ここに入れる</button>
              ) : null}
              {!s.setup.parallel && picked !== null && !g.includes(picked) ? (
                <button type="button" className="sim-tool is-strong" onClick={() => newStage(at)}>この前に並べる</button>
              ) : null}
              <button type="button" className="sim-tool" disabled={at === 0} onClick={() => moveStage(at, -1)} aria-label={`${String(at + 1)} 段目を上へ`}>上へ</button>
              <button type="button" className="sim-tool" disabled={at === s.stages.length - 1} onClick={() => moveStage(at, 1)} aria-label={`${String(at + 1)} 段目を下へ`}>下へ</button>
            </div>
          </li>
        ))}
        <li className="sim-stage is-new">
          <span className="sim-stage-no num">{s.stages.length + 1}</span>
          <button type="button" className="sim-tool is-strong" disabled={picked === null} onClick={() => newStage(s.stages.length)}>
            {s.setup.parallel ? '新しい段に入れる' : 'ここに並べる'}
          </button>
          {picked !== null && stageOf(s, picked) >= 0 ? (
            <button type="button" className="sim-tool" onClick={() => apply(without(picked))}>選んだ札を置き場に戻す</button>
          ) : null}
        </li>
      </ol>
      {timed ? <p className="sim-total">合計の時間（各段で最も長い札の時間の和）: <span className="num">{orderTime(s)}</span> 分</p> : null}
      <div className="sim-pool" aria-label="置き場">
        <span className="sim-pool-label">置き場</span>
        {pool.length === 0 ? <span className="sim-pool-empty">全て並べた</span> : pool.map((i) => card(i.id))}
      </div>
    </div>
  );
}

/* ---------- 割り振る ---------- */

function AssignView({ s, send }: { s: AssignState; send: Send }) {
  const [picked, setPicked] = useState<string | null>(null);
  const pool = s.setup.items.filter((i) => i.multi === true || (s.placed[i.id] ?? []).length === 0);
  const timed = s.setup.items.some((i) => i.time !== undefined);
  const label = (id: string): string => s.setup.items.find((i) => i.id === id)?.label ?? id;
  return (
    <div className="sim-assign" data-testid="sim-assign">
      <p className="sim-how">札を押して選び、入れたい枠を押す。枠の中の札を押すと置き場に戻る。</p>
      <div className="sim-slots">
        {s.setup.slots.map((x) => {
          const inside = Object.entries(s.placed).filter(([, slots]) => slots.includes(x.id)).map(([item]) => item);
          const used = usedOf(s, x.id);
          return (
            <section key={x.id} className={`sim-slot${picked !== null ? ' is-target' : ''}`} aria-label={x.label}>
              <button type="button" className="sim-slot-head" data-slot={x.id} disabled={picked === null} onClick={() => {
                if (picked === null) return;
                send(`put ${picked} ${x.id}`);
                setPicked(null);
              }}>
                <span className="sim-slot-label">{x.label}</span>
                {x.id !== x.label ? <span className="sim-slot-id">{x.id}</span> : null}
                {x.capacity !== undefined ? <span className={`sim-slot-cap num${used > x.capacity ? ' is-over' : ''}`}>{used} / {x.capacity}{x.unit ?? ''}</span> : null}
              </button>
              {x.note ? <p className="sim-slot-note">{x.note}</p> : null}
              <div className="sim-slot-cards">
                {inside.length === 0 ? <span className="sim-slot-empty">空き</span> : inside.map((id) => (
                  <button key={id} type="button" className="sim-card is-in" data-card={id} onClick={() => send(`take ${id} ${x.id}`)} title="押すと置き場に戻る">
                    <span className="sim-card-label">{label(id)}</span>
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>
      {timed ? <p className="sim-total">かかる時間の合計: <span className="num">{assignTime(s)}</span></p> : null}
      <div className="sim-pool" aria-label="置き場">
        <span className="sim-pool-label">置き場</span>
        {pool.length === 0 ? <span className="sim-pool-empty">全て入れた</span> : pool.map((i) => (
          <button key={i.id} type="button" className={`sim-card${picked === i.id ? ' is-picked' : ''}`} data-card={i.id} aria-pressed={picked === i.id} onClick={() => setPicked(picked === i.id ? null : i.id)}>
            <span className="sim-card-label">{i.label}</span>
            {i.size !== undefined ? <span className="sim-card-time num">{i.size}</span> : null}
            {i.note ? <span className="sim-card-needs">{i.note}</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------- 設定する ---------- */

function ConfigView({ s, send }: { s: ConfigState; send: Send }) {
  return (
    <div className="sim-config" data-testid="sim-config">
      {(s.setup.fields ?? []).length > 0 ? (
        <div className="sim-fields">
          {(s.setup.fields ?? []).map((f) => (
            <FieldInput key={f.id} id={f.id} label={f.label} note={f.note} options={f.options} value={s.fields[f.id] ?? ''} onSet={(v) => send(`set ${f.id} ${v}`)} />
          ))}
        </div>
      ) : null}
      {(s.setup.tables ?? []).map((t) => <TableEditor key={t.id} table={t} rows={s.tables[t.id] ?? []} send={send} />)}
    </div>
  );
}

function FieldInput({ id, label, note, options, value, onSet }: { id: string; label: string; note?: string | undefined; options?: string[] | undefined; value: string; onSet: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  return (
    <div className="sim-field">
      <label className="sim-field-label" htmlFor={`sim-field-${id}`}>
        {label}{id !== label ? <span className="sim-field-id">{id}</span> : null}
      </label>
      {options ? (
        <Select id={`sim-field-${id}`} value={value} data-field={id} onChange={onSet}>
          {value === '' ? <option value="">選ぶ</option> : null}
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </Select>
      ) : (
        <form className="sim-field-form" onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim() !== '') onSet(draft.trim());
        }}>
          <input id={`sim-field-${id}`} className="sim-input" value={draft} data-field={id} onChange={(e) => setDraft(e.target.value)} spellCheck={false} autoComplete="off" />
          <button type="submit" className="sim-tool is-strong">設定</button>
        </form>
      )}
      {note ? <span className="sim-field-note">{note}</span> : null}
      {!options && value !== '' ? <span className="sim-field-now">今の値: <code>{value}</code></span> : null}
    </div>
  );
}

/** 選ぶ欄。ブラウザの標準の矢印を消し、自作の印を重ねる */
function Select({ value, onChange, children, ...rest }: { value: string; onChange: (v: string) => void; children: ReactNode; id?: string; 'aria-label'?: string; 'data-field'?: string }) {
  return (
    <span className="sim-select-wrap">
      <select {...rest} className="sim-select" value={value} onChange={(e) => onChange(e.target.value)}>{children}</select>
      <Icon name="down" size={14} />
    </span>
  );
}

function TableEditor({ table, rows, send }: { table: NonNullable<ConfigState['setup']['tables']>[number]; rows: Record<string, string>[]; send: Send }) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const add = (): void => {
    const pairs = table.columns.filter((c) => (draft[c.id] ?? '').trim() !== '').map((c) => `${c.id}=${(draft[c.id] ?? '').trim()}`);
    if (pairs.length === 0) return;
    send(`add ${table.id} ${pairs.join(' ')}`);
    setDraft({});
  };
  return (
    <section className="sim-config-table" aria-label={table.label}>
      <h3 className="sim-panel-title">{table.label}{table.id !== table.label ? <span className="sim-field-id">{table.id}</span> : null}</h3>
      <table className="sim-table">
        <thead>
          <tr>
            <th scope="col" className="sim-table-no">#</th>
            {table.columns.map((c) => <th key={c.id} scope="col">{c.label}{c.id !== c.label ? <span className="sim-field-id">{c.id}</span> : null}</th>)}
            <th scope="col" aria-label="操作" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="sim-table-no num">{i + 1}</td>
              {table.columns.map((c) => <td key={c.id} className={codeClass(r[c.id] ?? '')}>{r[c.id] ?? ''}</td>)}
              <td><button type="button" className="sim-tool" onClick={() => send(`del ${table.id} ${String(i + 1)}`)}>消す</button></td>
            </tr>
          ))}
          <tr className="sim-table-new">
            <td className="sim-table-no">新</td>
            {table.columns.map((c) => (
              <td key={c.id}>
                {c.options ? (
                  <Select aria-label={`新しい行の${c.label}`} value={draft[c.id] ?? ''} onChange={(v) => setDraft({ ...draft, [c.id]: v })}>
                    <option value="">選ぶ</option>
                    {c.options.map((o) => <option key={o} value={o}>{o}</option>)}
                  </Select>
                ) : (
                  <input className="sim-input" aria-label={`新しい行の${c.label}`} value={draft[c.id] ?? ''} spellCheck={false} autoComplete="off" onChange={(e) => setDraft({ ...draft, [c.id]: e.target.value })} />
                )}
              </td>
            ))}
            <td><button type="button" className="sim-tool is-strong" onClick={add}>足す</button></td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

/* ---------- 読み取って答える ---------- */

function ReadView({ s, send }: { s: ReadState; send: Send }) {
  return (
    <div className="sim-read" data-testid="sim-read">
      <p className="sim-how">上の情報を読み、問いに答える。答え直してもよい。</p>
      {s.setup.questions.map((q) => (
        <div key={q.id} className="sim-question">
          <p className="sim-question-prompt">{q.prompt}{q.id !== q.prompt ? <span className="sim-field-id">{q.id}</span> : null}</p>
          {q.options ? (
            <div className="sim-question-options" role="group" aria-label={q.prompt}>
              {q.options.map((o) => (
                <button key={o} type="button" className={`sim-option${s.answers[q.id] === o ? ' is-picked' : ''}`} aria-pressed={s.answers[q.id] === o} onClick={() => send(`answer ${q.id} ${o}`)}>
                  {s.answers[q.id] === o ? <Icon name="check" size={12} /> : null}{o}
                </button>
              ))}
            </div>
          ) : (
            <FieldInput id={q.id} label="答え" value={s.answers[q.id] ?? ''} onSet={(v) => send(`answer ${q.id} ${v}`)} />
          )}
        </div>
      ))}
    </div>
  );
}
