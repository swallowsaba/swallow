import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { Panel } from '@/engines/sim/types';
import { CHART, chartLayout, codeClass } from './chartLayout';

/**
 * 模擬環境（模）の画面に示す情報（表・グラフ・ログ・項目と値・文。docs/ui-design.md 7.1）。
 * 読む所を押すと、その部分が強調され、大きく写した物（拡大）が出る（REWORK-PRACTICE.txt (3) sim-read）。もう一度押すと戻る
 */


/** 強調している所（何番目の情報の、何番目の行。グラフと文は行が無いので -1） */
export interface PanelFocus {
  panel: number;
  part: number;
}

/** 押せる所（マウスで押す・キーボードで Enter） */
function pressable(on: () => void, label: string) {
  return {
    role: 'button',
    tabIndex: 0,
    'aria-label': label,
    onClick: on,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      on();
    },
  } as const;
}

export function Panels({ panels, focus, onFocus }: { panels: readonly Panel[]; focus: PanelFocus | null; onFocus: (f: PanelFocus | null) => void }) {
  if (panels.length === 0) return null;
  const toggle = (panel: number, part: number) => () => onFocus(focus?.panel === panel && focus.part === part ? null : { panel, part });
  const is = (panel: number, part: number): string => (focus?.panel === panel && focus.part === part ? ' is-focus' : '');
  return (
    <div className="sim-panels" data-testid="sim-panels">
      {panels.map((p, i) => (
        <section key={`${p.title}-${String(i)}`} className={`sim-panel is-${p.kind}${focus?.panel === i ? ' has-focus' : ''}`} aria-label={p.title}>
          <h3 className="sim-panel-title">{p.title}</h3>
          {p.kind === 'kv' ? (
            <dl className="sim-kv">
              {p.rows.map(([k, v], j) => (
                <div key={j} className={`sim-kv-row sim-part${is(i, j)}`} data-part={`${String(i)}:${String(j)}`} {...pressable(toggle(i, j), `${k} を大きく見る`)}>
                  <dt>{k}</dt><dd>{v}</dd>
                </div>
              ))}
            </dl>
          ) : p.kind === 'table' ? (
            <table className="sim-table">
              <thead><tr>{p.columns.map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
              <tbody>
                {p.rows.map((r, j) => (
                  <tr key={j} className={`sim-part${is(i, j)}`} data-part={`${String(i)}:${String(j)}`} {...pressable(toggle(i, j), `${r[0] ?? ''} の行を大きく見る`)}>
                    {r.map((c, k) => <td key={k} className={codeClass(c)}>{c}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : p.kind === 'log' ? (
            <pre className="sim-log-lines">
              {p.lines.map((l, j) => (
                <span key={j} className={`sim-log-line sim-part${is(i, j)}`} data-part={`${String(i)}:${String(j)}`} {...pressable(toggle(i, j), `${String(j + 1)} 行目を大きく見る`)}>{l}{'\n'}</span>
              ))}
            </pre>
          ) : p.kind === 'chart' ? (
            <div className={`sim-part sim-chart-part${is(i, -1)}`} data-part={`${String(i)}:-1`} {...pressable(toggle(i, -1), `${p.title}を大きく見る`)}>
              <Chart panel={p} />
            </div>
          ) : (
            <p className={`sim-panel-text sim-part${is(i, -1)}`} data-part={`${String(i)}:-1`} {...pressable(toggle(i, -1), `${p.title}を大きく見る`)}>{p.body}</p>
          )}
        </section>
      ))}
    </div>
  );
}

/** 強調した所を大きく写す（拡大）。表は見出しと一緒に写す */
export function PanelZoom({ panels, focus, onClose }: { panels: readonly Panel[]; focus: PanelFocus | null; onClose: () => void }) {
  const p = focus === null ? undefined : panels[focus.panel];
  if (!p || focus === null) return null;
  let body: ReactNode;
  if (p.kind === 'kv') {
    const [k, v] = p.rows[focus.part] ?? ['', ''];
    body = <dl className="sim-zoom-kv"><dt>{k}</dt><dd>{v}</dd></dl>;
  } else if (p.kind === 'table') {
    const row = p.rows[focus.part] ?? [];
    body = (
      <dl className="sim-zoom-kv">
        {p.columns.map((c, k) => (
          <div key={c} className="sim-zoom-pair"><dt>{c}</dt><dd className={codeClass(row[k] ?? '')}>{row[k] ?? ''}</dd></div>
        ))}
      </dl>
    );
  } else if (p.kind === 'log') {
    body = <pre className="sim-zoom-line">{p.lines[focus.part] ?? ''}</pre>;
  } else if (p.kind === 'chart') {
    body = <Chart panel={p} tall />;
  } else {
    body = <p className="sim-zoom-text">{p.body}</p>;
  }
  return (
    <section className="sim-zoom" aria-label={`拡大: ${p.title}`} data-testid="sim-zoom" key={`${String(focus.panel)}:${String(focus.part)}`}>
      <header className="sim-zoom-head">
        <span className="sim-zoom-title">拡大: {p.title}</span>
        <button type="button" className="sim-tool" onClick={onClose}>元に戻す</button>
      </header>
      {body}
    </section>
  );
}

const SERIES = ['is-s0', 'is-s1', 'is-s2', 'is-s3'];

/** 折れ線のグラフ。縦軸は 0 から最大の値まで */
function Chart({ panel, tall = false }: { panel: Extract<Panel, { kind: 'chart' }>; tall?: boolean }) {
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
  const { left, bottom } = CHART;
  const h = tall ? CHART.height * 1.6 : CHART.height;
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
        {tall ? panel.series.map((s, k) => s.values.map((v, i) => (
          <g key={`${s.label}-${String(i)}`} className={`sim-chart-point ${SERIES[k] ?? ''}`}>
            <circle cx={xAt(i)} cy={yAt(v)} r={3} />
            <text className="sim-chart-value" x={xAt(i)} y={yAt(v) - 8} textAnchor="middle">{v}</text>
          </g>
        ))) : null}
      </svg>
      <figcaption className="sim-chart-legend">
        {panel.series.map((s, k) => <span key={s.label} className={`sim-chart-key ${SERIES[k] ?? ''}`}>{s.label}</span>)}
        {panel.unit ? <span className="sim-chart-unit">単位: {panel.unit}</span> : null}
      </figcaption>
    </figure>
  );
}
