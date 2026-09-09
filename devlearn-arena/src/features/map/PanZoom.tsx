import type { ReactNode } from 'react';
import { useT } from '@/i18n/useT';
import { MAX_K, MIN_K } from './panZoomMath';
import { usePanZoom } from './usePanZoom';

interface Props {
  children: ReactNode;
  /** 枠の高さ。地図の種類で変えたいので外から渡す */
  className?: string;
}

/**
 * 地図をマウスで動かせるようにする枠。
 * ホイールで拡大縮小、ドラッグで移動。中身の座標系には手を入れず、
 * 包む要素の transform だけを変える。
 */
export function PanZoom({ children, className }: Props) {
  const t = useT();
  const pz = usePanZoom();
  const percent = Math.round(pz.viewport.k * 100);

  return (
    <div className="relative">
      <div
        ref={pz.hostRef}
        role="application"
        aria-label={t('map.panZoom')}
        tabIndex={0}
        onPointerDown={pz.onPointerDown}
        onKeyDown={pz.onKeyDown}
        // ドラッグ直後の click は選択とみなさない
        onClickCapture={(e) => {
          if (pz.movedRef.current) {
            e.preventDefault();
            e.stopPropagation();
            pz.movedRef.current = false;
          }
        }}
        onDragStart={(e) => {
          e.preventDefault();
        }}
        className={`overflow-hidden touch-none select-none ${
          pz.dragging ? 'cursor-grabbing' : 'cursor-grab'
        } ${className ?? ''}`}
      >
        <div
          style={{
            transform: `translate(${String(pz.viewport.x)}px, ${String(pz.viewport.y)}px) scale(${String(pz.viewport.k)})`,
            transformOrigin: 'center center',
          }}
        >
          {children}
        </div>
      </div>

      <div className="absolute right-2 top-2 flex items-center gap-1">
        <button
          type="button"
          onClick={() => {
            pz.zoomBy(1 / 1.3);
          }}
          disabled={pz.viewport.k <= MIN_K + 1e-6}
          aria-label={t('map.zoomOut')}
          className="knob h-9 w-9 text-lg font-extrabold leading-none disabled:opacity-40"
        >
          −
        </button>
        <span className="knob px-2 py-1 font-mono text-xs tabular-nums">{percent}%</span>
        <button
          type="button"
          onClick={() => {
            pz.zoomBy(1.3);
          }}
          disabled={pz.viewport.k >= MAX_K - 1e-6}
          aria-label={t('map.zoomIn')}
          className="knob h-9 w-9 text-lg font-extrabold leading-none disabled:opacity-40"
        >
          ＋
        </button>
        <button
          type="button"
          onClick={pz.reset}
          className="knob px-2 py-1 text-xs font-bold"
        >
          {t('map.zoomReset')}
        </button>
      </div>

      <p className="pointer-events-none absolute bottom-2 left-2 bg-[rgb(0_0_0/45%)] px-2 py-0.5 text-xs text-white">
        {t('map.panHint')}
      </p>
    </div>
  );
}
