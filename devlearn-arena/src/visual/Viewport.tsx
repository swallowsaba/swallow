import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useT } from '@/i18n/useT';
import {
  clampView, fitView, IDENTITY, MAX_K, MIN_K, wheelFactor, zoomAround, type Size, type View,
} from './viewportMath';

interface Props {
  children: ReactNode;
  /** 読み上げ用の名前 */
  label: string;
}

/** ドラッグとみなす移動量（px）。これより小さければクリックとして通す */
const DRAG_THRESHOLD = 4;

/** 押せる部品の上でのダブルクリックは、全体表示に使わない（部品の操作を優先する） */
function onControl(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('button, a, input, [role="button"]') !== null;
}

/**
 * 図を入れる枠。すべての図がこれを使う。
 * - 初めて描いたとき・図の大きさが変わったとき（まだ動かしていなければ）、全体が枠に入るよう縮める
 * - ホイールで拡大縮小（ポインタの下の一点を固定）、ドラッグで平行移動、ダブルクリックで全体表示に戻す
 * 図の中身はふつうに描き、包む要素の transform だけを変える。部品のクリックはそのまま届く。
 */
export function Viewport({ children, label }: Props) {
  const t = useT();
  const frameRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>(IDENTITY);
  const [frameWidth, setFrameWidth] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  // 自分で動かしたか。動かしたあとは、図が変わっても勝手に全体表示へ戻さない
  const touchedRef = useRef(false);
  const movedRef = useRef(false);
  const originRef = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;

  const sizes = useCallback((): { frame: Size; content: Size } => {
    const frame = frameRef.current;
    const content = contentRef.current;
    return {
      frame: { w: frame?.clientWidth ?? 0, h: frame?.clientHeight ?? 0 },
      content: { w: content?.scrollWidth ?? 0, h: content?.scrollHeight ?? 0 },
    };
  }, []);

  const fit = useCallback(() => {
    const { frame, content } = sizes();
    setView(fitView(frame, content));
  }, [sizes]);

  const apply = useCallback(
    (next: (prev: View) => View) => {
      touchedRef.current = true;
      const { frame, content } = sizes();
      setView((prev) => clampView(next(prev), frame, content));
    },
    [sizes],
  );

  const zoomBy = useCallback(
    (factor: number) => {
      const { frame } = sizes();
      apply((prev) => zoomAround(prev, factor, frame.w / 2, frame.h / 2));
    },
    [apply, sizes],
  );

  const reset = useCallback(() => {
    touchedRef.current = false;
    fit();
  }, [fit]);

  // 枠と図の大きさを見張り、まだ動かしていなければ全体表示に合わせ直す
  useLayoutEffect(() => {
    const frame = frameRef.current;
    const content = contentRef.current;
    if (!frame || !content) return;
    const refresh = () => {
      setFrameWidth(frame.clientWidth);
      if (!touchedRef.current) fit();
    };
    refresh();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(refresh);
    observer.observe(frame);
    observer.observe(content);
    return () => {
      observer.disconnect();
    };
  }, [fit]);

  // ホイールは既定の画面送りを止めたいので、passive でない listener を自分で張る
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      apply((prev) => zoomAround(prev, wheelFactor(e.deltaY), e.clientX - rect.left, e.clientY - rect.top));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
    };
  }, [apply]);

  // 掴んでいる間だけ window で追う。枠の外へ出ても、離すまで動かせる
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      const origin = originRef.current;
      if (!origin) return;
      const dx = e.clientX - origin.px;
      const dy = e.clientY - origin.py;
      if (!movedRef.current && Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
      movedRef.current = true;
      apply((prev) => ({ k: prev.k, x: origin.x + dx, y: origin.y + dy }));
    };
    const stop = () => {
      setDragging(false);
      originRef.current = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
  }, [dragging, apply]);

  const percent = Math.round(view.k * 100);

  return (
    <div className="relative h-full min-h-0 w-full">
      <div
        ref={frameRef}
        role="application"
        aria-label={label}
        tabIndex={0}
        data-testid="viewport"
        data-scale={view.k.toFixed(3)}
        className={`absolute inset-0 overflow-hidden touch-none ${dragging ? 'cursor-grabbing select-none' : 'cursor-grab'}`}
        onPointerDown={(e) => {
          // 主ボタンと中ボタンだけ。右クリックのメニューは邪魔しない
          if (e.button !== 0 && e.button !== 1) return;
          movedRef.current = false;
          originRef.current = { px: e.clientX, py: e.clientY, x: viewRef.current.x, y: viewRef.current.y };
          setDragging(true);
        }}
        // ドラッグした直後の click は、部品を押したことにしない
        onClickCapture={(e) => {
          if (movedRef.current) {
            e.preventDefault();
            e.stopPropagation();
            movedRef.current = false;
          }
        }}
        onDoubleClick={(e) => {
          if (onControl(e.target)) return;
          reset();
        }}
        onDragStart={(e) => {
          e.preventDefault();
        }}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 120 : 40;
          const moves: Record<string, [number, number]> = {
            ArrowLeft: [step, 0],
            ArrowRight: [-step, 0],
            ArrowUp: [0, step],
            ArrowDown: [0, -step],
          };
          const move = moves[e.key];
          if (move && e.target === e.currentTarget) {
            e.preventDefault();
            apply((prev) => ({ k: prev.k, x: prev.x + move[0], y: prev.y + move[1] }));
          } else if (e.key === '+' || e.key === '=') {
            zoomBy(1.25);
          } else if (e.key === '-') {
            zoomBy(1 / 1.25);
          } else if (e.key === '0') {
            reset();
          }
        }}
      >
        <div
          ref={contentRef}
          data-testid="viewport-content"
          style={{
            width: frameWidth ?? '100%',
            transform: `translate(${String(view.x)}px, ${String(view.y)}px) scale(${String(view.k)})`,
            transformOrigin: '0 0',
          }}
        >
          {children}
        </div>
      </div>

      <div className="absolute right-2 top-2 z-10 flex items-center gap-1">
        <button
          type="button"
          onClick={() => {
            zoomBy(1 / 1.25);
          }}
          disabled={view.k <= MIN_K + 1e-6}
          aria-label={t('viewport.zoomOut')}
          className="knob h-7 w-7 text-base font-extrabold leading-none disabled:opacity-40"
        >
          −
        </button>
        <span className="knob px-1.5 py-0.5 font-mono text-xs tabular-nums">{percent}%</span>
        <button
          type="button"
          onClick={() => {
            zoomBy(1.25);
          }}
          disabled={view.k >= MAX_K - 1e-6}
          aria-label={t('viewport.zoomIn')}
          className="knob h-7 w-7 text-base font-extrabold leading-none disabled:opacity-40"
        >
          ＋
        </button>
        <button type="button" onClick={reset} className="knob px-2 py-0.5 text-xs font-bold" title={t('viewport.fitHint')}>
          {t('viewport.fit')}
        </button>
      </div>
    </div>
  );
}
