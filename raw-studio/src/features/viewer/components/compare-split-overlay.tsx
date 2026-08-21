import * as React from 'react';
import { useT } from '@/i18n';
import { useViewerStore } from '../model/viewer-store';

/**
 * The draggable divider for before/after split compare. The two halves are
 * drawn by the renderer (same quad, scissored), so this layer only owns the
 * handle: everything left of it is the untouched original, everything right is
 * the current edit.
 */
export function CompareSplitOverlay({
  unavailable = false,
}: {
  /** True when masks/liquify route rendering through the multi-pass path,
   *  which the scissored split doesn't cover. */
  unavailable?: boolean;
}): React.JSX.Element | null {
  const compareSplit = useViewerStore((s) => s.compareSplit);
  const setCompareSplit = useViewerStore((s) => s.setCompareSplit);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const draggingRef = React.useRef(false);
  const t = useT();

  if (compareSplit === null) return null;

  if (unavailable) {
    return (
      <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center">
        <div className="rounded bg-black/70 px-2 py-1 text-[10px] text-white">
          {t('compare.unavailable')}
        </div>
      </div>
    );
  }

  const toNorm = (clientX: number): number => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0.5;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  };

  const onDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    draggingRef.current = true;
    setCompareSplit(toNorm(e.clientX));
  };
  const onMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    setCompareSplit(toNorm(e.clientX));
  };
  const onUp = () => {
    draggingRef.current = false;
  };

  const pct = compareSplit * 100;

  return (
    <div
      ref={rootRef}
      className="absolute inset-0"
      style={{ pointerEvents: 'none' }}
      onPointerMove={onMove}
      onPointerUp={onUp}
    >
      {/* labels */}
      <div
        className="absolute top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white"
        style={{ left: 8 }}
      >
        {t('compare.before')}
      </div>
      <div
        className="absolute top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white"
        style={{ right: 8 }}
      >
        {t('compare.after')}
      </div>
      {/* divider line + handle */}
      <div
        className="absolute inset-y-0 w-px bg-white/80"
        style={{ left: `${String(pct)}%` }}
      />
      <div
        className="absolute top-1/2 grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/80 bg-black/60 text-white"
        style={{ left: `${String(pct)}%`, pointerEvents: 'auto', cursor: 'ew-resize', touchAction: 'none' }}
        onPointerDown={onDown}
        aria-label={t('compare.divider')}
      >
        <span className="text-[11px] leading-none">‹›</span>
      </div>
    </div>
  );
}
