import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { entryOf } from '@/content/catalog';
import type { DomainId } from '@/content/schema';
import { domainOuterRadius, domainRadius, GRAPH_HEIGHT, GRAPH_WIDTH, labelBox, labelSides, lessonRadius, ringRadius, type KnowledgeGraph } from '@/learning/graph';
import { STATUS_NAMES } from '@/learning/library';

/**
 * 知識グラフ（docs/ui-design.md 6 章）。分野を大きな点、レッスンを小さな点で、推奨前提の辺を矢印で描く。
 * 修了したレッスンは金色に光り、分野の点の周りの輪が修了の割合だけ光る。押すと入口の札。
 * 分野どうしの推奨前提は常に描き、レッスンどうしの推奨前提は、選んだ（指した）レッスンの物だけを描く（全てを描くと線で埋まるため）。
 *
 * 配置は src/learning/graph.ts の座標を、窓の大きさに合わせて縮める。文字の大きさは縮めない。
 */

export function KnowledgeGraphView({ graph, selected, onSelect }: { graph: KnowledgeGraph; selected: string | null; onSelect: (id: string) => void }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: GRAPH_WIDTH, h: GRAPH_HEIGHT });
  const [hover, setHover] = useState<string | null>(null);
  const [focusDomain, setFocusDomain] = useState<DomainId | null>(null);

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const fit = (): void => setSize({ w: el.clientWidth || GRAPH_WIDTH, h: el.clientHeight || GRAPH_HEIGHT });
    fit();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit);
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);

  const s = Math.min(size.w / GRAPH_WIDTH, size.h / GRAPH_HEIGHT);
  const ox = (size.w - GRAPH_WIDTH * s) / 2;
  const oy = (size.h - GRAPH_HEIGHT * s) / 2;
  const X = (x: number): number => ox + x * s;
  const Y = (y: number): number => oy + y * s;
  const dot = lessonRadius(s);
  const dr = domainRadius(s);
  const rr = ringRadius(s);

  const sides = useMemo(() => labelSides(graph, s), [graph, s]);
  const lessonAt = useMemo(() => new Map(graph.lessons.map((l) => [l.id, l])), [graph]);
  const domainAt = useMemo(() => new Map(graph.domains.map((d) => [d.id, d])), [graph]);
  const focus = hover ?? selected;
  const focusEdges = focus ? graph.lessonEdges.filter((e) => e.to === focus || e.from === focus) : [];
  const near = new Set(focusEdges.flatMap((e) => [e.from, e.to]));
  const hovered = hover ? entryOf(hover) : undefined;
  const hoveredAt = hover ? lessonAt.get(hover) : undefined;
  // 指したレッスンの説明は、その分野のレッスンの段の下に出す（点の上の分野の名前と、同じ分野の点を隠さない）
  const tipTop = hoveredAt ? Math.max(...graph.lessons.filter((l) => l.domain === hoveredAt.domain).map((l) => Y(l.y))) + dot + 8 : 0;

  return (
    <div className="graph" ref={boxRef} data-testid="knowledge-graph" onMouseLeave={() => setHover(null)}>
      <svg width={size.w} height={size.h} role="img" aria-label="知識グラフ: 分野とレッスンのつながり">
        <defs>
          <marker id="kg-arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" className="graph-arrow-head" />
          </marker>
          <marker id="kg-arrow-in" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" className="graph-arrow-head is-in" />
          </marker>
          <marker id="kg-arrow-out" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" className="graph-arrow-head is-out" />
          </marker>
          <filter id="kg-glow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="2.2" />
          </filter>
        </defs>

        {/* 分野どうしの推奨前提（前提 → 分野） */}
        <g className="graph-domain-edges">
          {graph.domainEdges.map((e) => {
            const a = domainAt.get(e.from as DomainId);
            const b = domainAt.get(e.to as DomainId);
            if (!a || !b) return null;
            const dx = X(b.x) - X(a.x);
            const dy = Y(b.y) - Y(a.y);
            const len = Math.hypot(dx, dy) || 1;
            const r = domainOuterRadius(s) + 1;
            const lit = focusDomain !== null && (e.from === focusDomain || e.to === focusDomain);
            return (
              <path
                key={`${e.from}-${e.to}`}
                className={`graph-domain-edge${lit ? ' is-lit' : ''}`}
                d={`M${String(X(a.x) + (dx / len) * r)} ${String(Y(a.y) + (dy / len) * r)} L${String(X(b.x) - (dx / len) * r)} ${String(Y(b.y) - (dy / len) * r)}`}
                markerEnd="url(#kg-arrow)"
              />
            );
          })}
        </g>

        {/* 選んだ（指した）レッスンの推奨前提（入る辺）と、それを前提にするレッスン（出る辺） */}
        <g className="graph-lesson-edges">
          {focusEdges.map((e) => {
            const a = lessonAt.get(e.from);
            const b = lessonAt.get(e.to);
            if (!a || !b) return null;
            const incoming = e.to === focus;
            const mx = (X(a.x) + X(b.x)) / 2;
            const my = Math.min(Y(a.y), Y(b.y)) - 24;
            return (
              <path
                key={`${e.from}-${e.to}`}
                className={`graph-lesson-edge ${incoming ? 'is-in' : 'is-out'}`}
                d={`M${String(X(a.x))} ${String(Y(a.y))} Q${String(mx)} ${String(my)} ${String(X(b.x))} ${String(Y(b.y))}`}
                markerEnd={`url(#kg-arrow-${incoming ? 'in' : 'out'})`}
              />
            );
          })}
        </g>

        {/* レッスン */}
        <g className="graph-lessons">
          {graph.lessons.map((l) => {
            const isFocus = l.id === focus;
            return (
              <g key={l.id} className={`graph-lesson is-${l.status}${isFocus ? ' is-focus' : ''}${near.has(l.id) ? ' is-near' : ''}`} style={{ '--c': `var(--domain-${l.domain})` } as CSSProperties}>
                {l.status === 'completed' ? <circle cx={X(l.x)} cy={Y(l.y)} r={dot + 2} className="graph-glow" filter="url(#kg-glow)" /> : null}
                <circle
                  cx={X(l.x)}
                  cy={Y(l.y)}
                  r={isFocus ? dot + 2 : dot}
                  data-lesson={l.id}
                  onMouseEnter={() => setHover(l.id)}
                  onClick={() => onSelect(l.id)}
                >
                  <title>{`${entryOf(l.id)?.title ?? l.id}（${STATUS_NAMES[l.status]}）`}</title>
                </circle>
              </g>
            );
          })}
        </g>

        {/* 分野 */}
        <g className="graph-domains">
          {graph.domains.map((d) => {
            const ratio = d.completed / Math.max(1, d.total);
            const ring = 2 * Math.PI * rr;
            return (
              <g
                key={d.id}
                className={`graph-domain${focusDomain === d.id ? ' is-focus' : ''}`}
                style={{ '--c': `var(--domain-${d.id})` } as CSSProperties}
                tabIndex={0}
                role="button"
                aria-label={`${d.name}（修了 ${String(d.completed)} / ${String(d.total)}）`}
                data-domain={d.id}
                onClick={() => setFocusDomain(focusDomain === d.id ? null : d.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setFocusDomain(focusDomain === d.id ? null : d.id);
                  }
                }}
              >
                <circle cx={X(d.x)} cy={Y(d.y)} r={rr} className="graph-domain-track" />
                {ratio > 0 ? (
                  <circle
                    cx={X(d.x)}
                    cy={Y(d.y)}
                    r={rr}
                    className="graph-domain-ring"
                    strokeDasharray={`${String(ring * ratio)} ${String(ring)}`}
                    transform={`rotate(-90 ${String(X(d.x))} ${String(Y(d.y))})`}
                  />
                ) : null}
                <circle cx={X(d.x)} cy={Y(d.y)} r={dr} className="graph-domain-dot" />
                {(() => {
                  const b = labelBox(d, s, sides[d.id]);
                  return <text x={ox + b.x} y={oy + b.y + b.h * 0.8} className="graph-domain-name">{d.name}</text>;
                })()}
              </g>
            );
          })}
        </g>
      </svg>

      {hovered && hoveredAt ? (
        <p className="graph-tip" style={{ left: X(hoveredAt.x), top: tipTop }}>
          <span className="graph-tip-title">{hovered.title}</span>
          <span className="graph-tip-sub">{STATUS_NAMES[hoveredAt.status]}・押すと入口の札</span>
        </p>
      ) : null}

      <p className="graph-legend" aria-hidden="true">
        <span><i className="graph-key is-completed" />修了</span>
        <span><i className="graph-key is-in-progress" />学習中</span>
        <span><i className="graph-key is-not-started" />未修了</span>
        <span><i className="graph-key-line is-in" />推奨前提</span>
        <span><i className="graph-key-line is-out" />これを前提にする</span>
        <span className="graph-legend-note">分野を押すと、その分野の前提のつながりを強める</span>
      </p>
    </div>
  );
}
