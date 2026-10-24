import type { WeeklySample } from '@/sim/types';
import { H, linePoints, num, PAD, SERIES_INFO, W, weekLabel, type SeriesId } from './graphSeries';

/**
 * 週ごとの変化のグラフ（docs/ui-design.md 11.2）。横は週（直近 1 任期は全て、それより前は 4 週ごとの点）、縦は値と単位。
 * 出来事のあった週（申請の可決・完成・税率の変更・選挙）に小さな印。印を指すと何があったかを出す。
 * 色は CSS の変数（tokens）だけで塗る。
 */

export function WeeklyGraph({ samples, series }: { samples: readonly WeeklySample[]; series: SeriesId }) {
  const info = SERIES_INFO[series];
  if (samples.length < 2) {
    return <p className="graph-empty">記録が 2 週たまると、ここに線が出る（週の終わりに 1 点ずつ増える）</p>;
  }
  const fixed: [number, number] | undefined = series === 'approval' ? [0, 100] : undefined;
  const vs = samples.map(info.value);
  const lo = fixed ? fixed[0] : Math.min(...vs);
  const hi = fixed ? fixed[1] : Math.max(...vs);
  const pts = linePoints(samples, info.value, fixed);
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  // 雇用は、失業率も線で重ねる（0〜100%）
  const sub = series === 'jobs' ? linePoints(samples, (s) => s.unemployment * 100, [0, 100]) : null;
  const last = samples[samples.length - 1] as WeeklySample;
  return (
    <figure className="view-graph" data-testid="view-graph">
      <svg width={W} height={H} viewBox={`0 0 ${String(W)} ${String(H)}`} role="img" aria-label={`${info.label}の週ごとの変化`}>
        <line className="graph-axis" x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={H - PAD.bottom} />
        <line className="graph-axis" x1={PAD.left} y1={H - PAD.bottom} x2={W - PAD.right} y2={H - PAD.bottom} />
        <text className="graph-tick" x={PAD.left - 4} y={PAD.top + 9} textAnchor="end">{num(hi)}</text>
        <text className="graph-tick" x={PAD.left - 4} y={H - PAD.bottom} textAnchor="end">{num(lo)}</text>
        <text className="graph-tick" x={PAD.left} y={H - 4}>{weekLabel((samples[0] as WeeklySample).week)}</text>
        <text className="graph-tick" x={W - PAD.right} y={H - 4} textAnchor="end">{weekLabel(last.week)}</text>
        {sub ? <path className="graph-line is-sub" d={sub.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')} /> : null}
        <path className="graph-line" d={d} />
        {samples.map((s, i) => (s.marks.length > 0 ? (
          <g key={s.week} className="graph-mark">
            <line x1={(pts[i] as { x: number }).x} y1={PAD.top} x2={(pts[i] as { x: number }).x} y2={H - PAD.bottom} />
            <title>{`${weekLabel(s.week)}: ${s.marks.join('・')}`}</title>
          </g>
        ) : null))}
      </svg>
      <figcaption className="graph-caption">
        今 <b className="num">{num(info.value(last))}</b> {info.unit}
        {series === 'jobs' ? <>・失業率 <b className="num">{num(last.unemployment * 100)}</b>%（細い線）</> : null}
      </figcaption>
    </figure>
  );
}
