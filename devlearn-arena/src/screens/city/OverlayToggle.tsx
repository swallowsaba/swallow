import type { OverlayKind } from '@/city/overlay';
import './OverlayToggle.css';

/**
 * 表示切替（docs/ui-design.md 3 章: 右下。学習の進み・人口・交通・発展段階を色で重ねる）。
 */

const KINDS: { id: OverlayKind; label: string }[] = [
  { id: 'learning', label: '学習の進み' },
  { id: 'population', label: '人口' },
  { id: 'traffic', label: '交通' },
  { id: 'stage', label: '発展段階' },
];

export interface OverlayLegend {
  low: string;
  high: string;
  note: string;
}

export function OverlayToggle({ value, onChange, legend }: { value: OverlayKind | null; onChange: (v: OverlayKind | null) => void; legend: OverlayLegend | null }) {
  return (
    <div className="overlay" data-testid="overlay-toggle" data-label-block>
      {value && legend ? (
        <div className={`overlay-legend is-${value}`}>
          <div className="overlay-scale">
            <span>{legend.low}</span>
            <span className="overlay-ramp" />
            <span>{legend.high}</span>
          </div>
          <p className="overlay-note">{legend.note}</p>
        </div>
      ) : null}
      <div className="overlay-buttons" role="group" aria-label="表示切替">
        <span className="overlay-title">表示</span>
        {KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            className={`overlay-button${value === k.id ? ' is-selected' : ''}`}
            aria-pressed={value === k.id}
            data-testid={`overlay-${k.id}`}
            onClick={() => onChange(value === k.id ? null : k.id)}
          >
            {k.label}
          </button>
        ))}
      </div>
    </div>
  );
}
