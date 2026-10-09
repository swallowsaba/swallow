import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { connectProblem, isUp, sendRoute } from '@/engines/sim/sim';
import type { ConnectState } from '@/engines/sim/types';
import { useDrag } from './drag';
import type { BoardProps } from './boardTypes';
import { SimIcon } from './SimIcon';

/**
 * つなぐ（sim-connect）: 点から点へドラッグして線を引く（REWORK-PRACTICE.txt (3)）。
 * つながると、線を光の粒が流れる。つながらない組み合わせは線が引けず、ドラッグの途中で理由が出る。
 * 送るボタンを押すと、荷物が線をたどって進み、届かなければ止まった所が赤くなる
 */

/** 送った荷物の動き。n は同じ送り方でも動きをやり直すための数 */
interface Packet {
  path: string[];
  arrived: boolean;
  why: string | null;
  n: number;
}

/** 荷物が 1 区間を進む秒数 */
const HOP = 0.45;

export function ConnectBoard({ s, act }: BoardProps<ConnectState>) {
  const boardRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [note, setNote] = useState<{ text: string; n: number } | null>(null);
  const [packet, setPacket] = useState<Packet | null>(null);
  useLayoutEffect(() => {
    const el = boardRef.current;
    if (el === null) return;
    const fit = (): void => setSize({ w: el.clientWidth, h: el.clientHeight });
    fit();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const counter = useRef(0);
  const drag = useDrag<{ from: string }>((c, target) => {
    if (target === null || !target.startsWith('node:')) return;
    const to = target.slice(5);
    if (to === c.from) return;
    const out = act({ op: 'connect', a: c.from, b: to });
    counter.current += 1;
    setNote(out.error ? { text: out.error.startsWith('つなげない') ? out.error : `線を引けない: ${out.error}`, n: counter.current } : null);
    setPacket(null);
  });

  const pos = new Map(s.setup.nodes.map((n) => [n.id, { x: (n.x / 100) * size.w, y: (n.y / 100) * size.h }]));
  const at = (id: string) => pos.get(id) ?? { x: 0, y: 0 };
  const rect = boardRef.current?.getBoundingClientRect();
  const label = (id: string): string => s.setup.nodes.find((n) => n.id === id)?.label ?? id;

  // ドラッグの途中: 押さえた点から指先までの線。上にある点につなげなければ、その理由
  const from = drag.now?.payload.from ?? null;
  const overNode = drag.now?.over?.startsWith('node:') ? drag.now.over.slice(5) : null;
  const problem = from !== null && overNode !== null && overNode !== from ? connectProblem(s, from, overNode) : null;

  const send = (fromId: string, to: string): void => {
    const route = sendRoute(s, fromId, to);
    const out = act({ op: 'send', from: fromId, to });
    counter.current += 1;
    setPacket({ path: route.path, arrived: out.error === null, why: out.error, n: counter.current });
    setNote(null);
  };
  const packetEnd = packet === null ? null : packet.path[packet.path.length - 1] ?? null;
  const packetTime = packet === null ? 0 : Math.max(1, packet.path.length - 1) * HOP;

  return (
    <div className={`sim-connect${from !== null ? ' is-carrying' : ''}`} data-testid="sim-connect">
      <p className="sim-how">
        部品から部品へドラッグして線を引く。線を押すと外れる。{s.setup.directed ? '線は、ドラッグを始めた部品から、放した部品へ向く。' : ''}
      </p>
      {(s.setup.sends ?? []).length > 0 ? (
        <div className="sim-sends">
          {(s.setup.sends ?? []).map((x) => {
            const arrived = s.sent.some(([a, b]) => a === x.from && b === x.to);
            return (
              <button key={`${x.from}-${x.to}`} type="button" className={`sim-send${arrived ? ' is-arrived' : ''}`} data-send={`${x.from}>${x.to}`} onClick={() => send(x.from, x.to)}>
                <span className="sim-send-label">{x.label}</span>
                <span className="sim-send-state">{arrived ? '届いた' : `${label(x.from)} → ${label(x.to)}`}</span>
              </button>
            );
          })}
        </div>
      ) : null}
      <div className="sim-board" ref={boardRef}>
        <svg className="sim-wires" width={size.w} height={size.h} role="group" aria-label="つながり">
          {s.links.map(([a, b]) => {
            const p = at(a);
            const q = at(b);
            const live = isUp(s, a) && isUp(s, b);
            const angle = (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI;
            const hx = p.x + (q.x - p.x) * 0.7;
            const hy = p.y + (q.y - p.y) * 0.7;
            return (
              <g
                key={`${a}-${b}`}
                className={`sim-wire${live ? ' is-live' : ''}`}
                data-wire={`${a}-${b}`}
                role="button"
                tabIndex={0}
                aria-label={`${label(a)} と ${label(b)} の線（押すと外れる）`}
                onClick={() => act({ op: 'cut', a, b })}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' && e.key !== ' ') return;
                  e.preventDefault();
                  act({ op: 'cut', a, b });
                }}
              >
                <title>{`${label(a)} と ${label(b)} の線（押すと外れる）`}</title>
                <line className="sim-wire-hit" x1={p.x} y1={p.y} x2={q.x} y2={q.y} />
                <line className="sim-wire-line" x1={p.x} y1={p.y} x2={q.x} y2={q.y} />
                {s.setup.directed ? <polygon className="sim-wire-head" points="-6,-5 6,0 -6,5" transform={`translate(${String(hx)} ${String(hy)}) rotate(${String(angle)})`} /> : null}
              </g>
            );
          })}
          {from !== null && drag.now && rect ? (
            <line
              className={`sim-wire-draft${problem ? ' is-bad' : overNode !== null && overNode !== from ? ' is-good' : ''}`}
              x1={at(from).x} y1={at(from).y} x2={drag.now.x - rect.left} y2={drag.now.y - rect.top}
            />
          ) : null}
        </svg>
        <div className="sim-flow" aria-hidden="true">
          {s.links.filter(([a, b]) => isUp(s, a) && isUp(s, b)).flatMap(([a, b]) => {
            const p = at(a);
            const q = at(b);
            const path = `path('M ${String(p.x)} ${String(p.y)} L ${String(q.x)} ${String(q.y)}')`;
            return [0, 1, 2].map((k) => (
              <span key={`${a}-${b}-${String(k)}`} className="sim-particle" style={{ offsetPath: path, animationDelay: `${String(-k * 0.6)}s` }} />
            ));
          })}
          {packet !== null && packet.path.length > 1 ? (
            <span
              key={packet.n}
              className={`sim-packet${packet.arrived ? '' : ' is-stuck'}`}
              style={{ offsetPath: `path('M ${packet.path.map((id) => `${String(at(id).x)} ${String(at(id).y)}`).join(' L ')}')`, animationDuration: `${String(packetTime)}s` }}
            />
          ) : null}
        </div>
        {s.setup.nodes.map((n) => {
          const up = isUp(s, n.id);
          const end = packet !== null && packetEnd === n.id;
          return (
            <div
              key={end ? `${n.id}-${String(packet.n)}` : n.id}
              className={`sim-node${up ? '' : ' is-down'}${overNode === n.id && from !== null && n.id !== from ? (problem ? ' is-refuse' : ' is-over') : ''}${from === n.id ? ' is-from' : ''}${end ? (packet.arrived ? ' is-arrived' : ' is-stuck') : ''}`}
              style={{ left: `${String(n.x)}%`, top: `${String(n.y)}%`, '--delay': `${String(packetTime)}s` } as CSSProperties}
            >
              <div
                className="sim-node-body"
                data-drop={`node:${n.id}`}
                data-node={n.id}
                role="button"
                tabIndex={0}
                aria-label={`${n.label}（ほかの部品へドラッグして線を引く。キーボードでは Enter で選び、つなぐ先で Enter）`}
                aria-pressed={drag.held?.from === n.id}
                onPointerDown={(e) => drag.begin(e, { from: n.id })}
                onKeyDown={(e) => {
                  if (drag.held !== null && drag.held.from !== n.id) drag.place(e, `node:${n.id}`);
                  else drag.lift(e, { from: n.id });
                }}
              >
                <SimIcon name={n.icon ?? 'box'} />
                <span className="sim-node-label">{n.label}</span>
                {n.note ? <span className="sim-node-note">{n.note}</span> : null}
              </div>
              {up ? null : (
                <button type="button" className="sim-node-start" onClick={() => act({ op: 'start', node: n.id })} data-start={n.id}>
                  止まっている・動かす
                </button>
              )}
              {end && !packet.arrived ? <span className="sim-node-stuck" key={packet.n}>ここで止まった</span> : null}
            </div>
          );
        })}
        {from !== null && drag.now && rect && overNode !== null && overNode !== from ? (
          <span className={`sim-drag-tip${problem ? ' is-bad' : ''}`} style={{ left: drag.now.x - rect.left, top: drag.now.y - rect.top }}>
            {problem ? `つなげない: ${problem}` : `${label(overNode)} へつなぐ`}
          </span>
        ) : null}
      </div>
      {note ? <p className="sim-note is-bad" role="status" key={note.n}>{note.text}</p> : null}
      {packet !== null && packet.why !== null ? <p className="sim-note is-bad" role="status" key={`p${String(packet.n)}`}>{packet.why}</p> : null}
      {packet !== null && packet.arrived ? <p className="sim-note is-good" role="status" key={`p${String(packet.n)}`}>届いた: {packet.path.map(label).join(' → ')}</p> : null}
    </div>
  );
}
