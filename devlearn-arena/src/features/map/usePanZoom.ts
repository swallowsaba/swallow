import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clampPan, IDENTITY, keyPan, wheelFactor, zoomAt, type Viewport,
} from './panZoomMath';

export interface PanZoomState {
  viewport: Viewport;
  /** 中身を包む要素に渡す。大きさの計測にも使う */
  hostRef: React.RefObject<HTMLDivElement>;
  dragging: boolean;
  /** 直前のポインタ操作が「移動」だったか。click の握り潰しに使う */
  movedRef: React.MutableRefObject<boolean>;
  zoomBy: (factor: number) => void;
  reset: () => void;
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
}

/**
 * マウスとキーボードで地図を動かす。
 * ホイールは「ポインタの下の一点を固定したまま」拡大縮小する。
 * 中身の座標系には触らず、包む要素の transform だけを変える。
 */
export function usePanZoom(): PanZoomState {
  const hostRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<Viewport>(IDENTITY);
  const [dragging, setDragging] = useState(false);
  const movedRef = useRef(false);
  const originRef = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  // ドラッグ中の計算に使う。再描画を挟まずに読めるよう ref にも持つ
  const viewRef = useRef(viewport);
  viewRef.current = viewport;

  const apply = useCallback((next: (prev: Viewport) => Viewport) => {
    const el = hostRef.current;
    const w = el?.clientWidth ?? 0;
    const h = el?.clientHeight ?? 0;
    setViewport((prev) => clampPan(next(prev), w, h));
  }, []);

  const zoomTo = useCallback(
    (factor: number, cx: number, cy: number) => {
      apply((prev) => zoomAt(prev, factor, cx, cy));
    },
    [apply],
  );

  const zoomBy = useCallback(
    (factor: number) => {
      zoomTo(factor, 0, 0);
    },
    [zoomTo],
  );

  const reset = useCallback(() => {
    setViewport(IDENTITY);
  }, []);

  // ホイールは既定の画面送りを止めたいので、passive でない listener を自分で張る
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomTo(
        wheelFactor(e.deltaY),
        e.clientX - rect.left - rect.width / 2,
        e.clientY - rect.top - rect.height / 2,
      );
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
    };
  }, [zoomTo]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // 主ボタンと中ボタンだけ。右クリックのメニューは邪魔しない
    if (e.button !== 0 && e.button !== 1) return;
    movedRef.current = false;
    originRef.current = {
      px: e.clientX,
      py: e.clientY,
      x: viewRef.current.x,
      y: viewRef.current.y,
    };
    setDragging(true);
  }, []);

  // 掴んでいる間だけ window で追う。枠の外へ出ても、離すまで動かせるようにする
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      const origin = originRef.current;
      if (!origin) return;
      const dx = e.clientX - origin.px;
      const dy = e.clientY - origin.py;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) movedRef.current = true;
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

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const move = keyPan(e.key, e.shiftKey ? 120 : 40);
      if (move) {
        e.preventDefault();
        apply((prev) => ({ k: prev.k, x: prev.x + move.dx, y: prev.y + move.dy }));
        return;
      }
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        zoomBy(1.25);
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        zoomBy(1 / 1.25);
      } else if (e.key === '0') {
        e.preventDefault();
        reset();
      }
    },
    [apply, zoomBy, reset],
  );

  return { viewport, hostRef, dragging, movedRef, zoomBy, reset, onPointerDown, onKeyDown };
}
