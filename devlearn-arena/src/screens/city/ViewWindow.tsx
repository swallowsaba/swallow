import { useState } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { EXPLAIN } from '@/content/politics';
import { explainApproval, type Explanation } from '@/sim/explain';
import { HEAT_KINDS } from '@/sim/heat';
import { SmallWindow } from '@/ui/SmallWindow';
import type { CityStore, ViewKind } from './cityStore';
import { HEAT_INFO, stepColors } from './heatScale';
import { CITY_KINDS, FACTOR_VIEW } from './viewKinds';
import { SERIES, SERIES_INFO, type SeriesId } from './graphSeries';
import { WeeklyGraph } from './WeeklyGraph';
import './ViewWindow.css';

/**
 * 表示切替の窓（docs/ui-design.md 11 章。小さな窓）。
 * 上に支持率の「なぜ」を 1〜2 行（押すと原因の場所へ寄り、その要因のヒートマップに切り替わる）、
 * 中にヒートマップの一覧、下に週ごとのグラフ。
 */

/** 説明の文の数字を太くする */
function Bold({ text }: { text: string }) {
  return <>{text.split(/(\d+)/).map((part, i) => (/^\d+$/.test(part) ? <b key={i} className="num">{part}</b> : part))}</>;
}

export function ViewWindow({ store, stack, shifted }: { store: CityStore; stack: number; shifted: boolean }) {
  const s = useStore(store, useShallow((x) => ({
    overlay: x.overlay, setOverlay: x.setOverlay, closeWindow: x.closeWindow, openWindow: x.openWindow, focusAt: x.focusAt,
    breakdown: x.world.history.breakdown, weekly: x.world.history.weekly, city: x.world.city, names: x.world.sim.districtNames, taxRate: x.world.budget.taxRate,
  })));
  const [series, setSeries] = useState<SeriesId>('approval');
  const e: Explanation | null = explainApproval(s.breakdown, { city: s.city, districtNames: s.names, taxRate: s.taxRate }, EXPLAIN);
  const goCause = (): void => {
    if (!e?.reason) return;
    s.setOverlay(FACTOR_VIEW[e.reason.factor]);
    if (e.reason.at) s.focusAt(e.reason.at);
  };
  const row = (id: ViewKind, label: string, colors: string[] | null) => (
    <button
      key={id}
      type="button"
      className={`view-kind${s.overlay === id ? ' is-on' : ''}`}
      data-testid={`overlay-${id}`}
      aria-pressed={s.overlay === id}
      onClick={() => s.setOverlay(s.overlay === id ? null : id)}
    >
      <span className="view-kind-ramp" aria-hidden="true">
        {(colors ?? []).map((c, i) => <span key={i} style={{ background: c }} />)}
      </span>
      <span>{label}</span>
    </button>
  );
  return (
    <SmallWindow testId="view-window" icon="heat" title="表示切替" stack={stack} shifted={shifted} onClose={() => s.closeWindow('view')} onFront={() => s.openWindow('view')}>
      <section className="view-why" aria-label="支持率が動いた理由">
        {e ? (
          <button type="button" className="view-why-text" data-testid="view-explain" onClick={goCause} disabled={!e.reason} title={e.reason ? '押すと、原因の場所へ寄り、その要因のヒートマップに切り替わる' : undefined}>
            {e.lines.map((line) => <span key={line} className="view-why-line"><Bold text={line} /></span>)}
          </button>
        ) : (
          <p className="view-why-empty">支持率の動いた理由は、記録が 2 週たまると出る</p>
        )}
      </section>
      <section className="view-section" aria-label="ヒートマップ">
        <h3 className="view-heading">ヒートマップ<span className="view-heading-sub">選ぶと都市の地面に色を重ねる</span></h3>
        <div className="view-kinds">
          {HEAT_KINDS.map((k) => row(k, HEAT_INFO[k].label, stepColors(k)))}
          {CITY_KINDS.map((k) => row(k.id, k.label, null))}
        </div>
      </section>
      <section className="view-section" aria-label="グラフ">
        <h3 className="view-heading">グラフ<span className="view-heading-sub">週ごとの変化</span></h3>
        <div className="window-switch view-series" role="group" aria-label="グラフの値">
          {SERIES.map((id) => (
            <button key={id} type="button" aria-pressed={series === id} data-testid={`graph-${id}`} onClick={() => setSeries(id)}>{SERIES_INFO[id].label}</button>
          ))}
        </div>
        <WeeklyGraph samples={s.weekly} series={series} />
      </section>
    </SmallWindow>
  );
}
