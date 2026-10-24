import { Icon } from '@/ui/icons/Icon';
import type { ViewKind } from './cityStore';
import './OverlayToggle.css';

/**
 * 表示切替（docs/ui-design.md 3 章: 右下）。今重ねている表示の名前と凡例の小さな帯。
 * 押すと表示切替の窓（11 章）。常時の UI を増やさないため、表示の一覧は窓の中に置く。
 */

export interface OverlayLegend {
  low: string;
  high: string;
  note: string;
  /** ヒートマップの値の幅と単位（「4.0〜11.0 万円／月」） */
  span?: string;
  /** 段の色（低い値から順。ヒートマップ） */
  colors?: string[];
}

export function OverlayToggle({ value, name, legend, open, onOpen }: {
  value: ViewKind | null;
  /** 今重ねている表示の名前 */
  name: string | null;
  legend: OverlayLegend | null;
  open: boolean;
  onOpen: () => void;
}) {
  return (
    <div className="overlay" data-testid="overlay-toggle" data-label-block>
      {value && legend ? (
        <div className={`overlay-legend is-${value}`} data-testid="overlay-legend">
          {legend.span ? <p className="overlay-span"><b>{name}</b> {legend.span}</p> : null}
          <div className="overlay-scale">
            <span>{legend.low}</span>
            {legend.colors ? (
              <span className="overlay-ramp is-steps">{legend.colors.map((c, i) => <span key={i} style={{ background: c }} />)}</span>
            ) : <span className="overlay-ramp" />}
            <span>{legend.high}</span>
          </div>
          <p className="overlay-note">{legend.note}</p>
        </div>
      ) : null}
      <div className="overlay-buttons">
        <span className="overlay-title">表示</span>
        <span className="overlay-current" data-testid="overlay-current">{name ?? 'なし'}</span>
        <button
          type="button"
          className={`overlay-button${open ? ' is-selected' : ''}`}
          data-testid="overlay-open"
          aria-pressed={open}
          title="表示切替の窓を開く（V）。ヒートマップ・グラフ・支持率の動いた理由"
          onClick={onOpen}
        >
          <Icon name="heat" size={16} />
          <span>表示切替</span>
          <kbd>V</kbd>
        </button>
      </div>
    </div>
  );
}
