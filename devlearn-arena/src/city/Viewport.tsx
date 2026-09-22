import { useCallback, useEffect, useRef, useState } from 'react';
import { wheelFactor, zoomAround, type Size, type View } from '@/visual/viewportMath';
import { fitCity } from './view';

/**
 * 街を映す枠。CityCanvas を包む。
 *
 * ホイールで拡大縮小、ドラッグで移動、ダブルクリックで全体表示。
 * 開いた直後は街全体が枠に収まる。
 */
interface Props {
  /** 絵の大きさ（px） */
  content: Size;
  children: React.ReactNode;
  label?: string;
}

export function Viewport({ content, children, label }: Props) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState<Size>({ w: 0, h: 0 });
  const [view, setView] = useState<View>({ k: 1, x: 0, y: 0 });
  // 一度でも自分で動かしたら、枠の大きさが変わっても勝手に戻さない
  const touched = useRef(false);
  const drag = useRef<{ x: number; y: number; view: View } | null>(null);

  // 枠の大きさを測る。初期表示は必ず全体が収まるようにする
  const { w: contentW, h: contentH } = content;
  useEffect(() => {
    const node = frameRef.current;
    if (node === null) return;
    const measure = (): void => {
      const size = { w: node.clientWidth, h: node.clientHeight };
      setFrame(size);
      if (!touched.current) setView(fitCity(size, { w: contentW, h: contentH }));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [contentW, contentH]);

  const fit = useCallback(() => {
    touched.current = false;
    setView(fitCity({ w: frameRef.current?.clientWidth ?? frame.w, h: frameRef.current?.clientHeight ?? frame.h }, { w: contentW, h: contentH }));
  }, [contentW, contentH, frame.w, frame.h]);

  return (
    <div
      ref={frameRef}
      data-testid="city-viewport"
      aria-label={label}
      className="relative h-full w-full touch-none overflow-hidden"
      onWheel={(e) => {
        const box = frameRef.current?.getBoundingClientRect();
        if (box === undefined) return;
        touched.current = true;
        setView((prev) => zoomAround(prev, wheelFactor(e.deltaY), e.clientX - box.left, e.clientY - box.top));
      }}
      onPointerDown={(e) => {
        drag.current = { x: e.clientX, y: e.clientY, view };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const start = drag.current;
        if (start === null) return;
        touched.current = true;
        setView({ k: start.view.k, x: start.view.x + (e.clientX - start.x), y: start.view.y + (e.clientY - start.y) });
      }}
      onPointerUp={(e) => {
        drag.current = null;
        e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onDoubleClick={fit}
    >
      <div
        data-testid="city-stage"
        data-view={`${view.k.toFixed(3)},${Math.round(view.x).toString()},${Math.round(view.y).toString()}`}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          transformOrigin: '0 0',
          transform: `translate(${String(view.x)}px, ${String(view.y)}px) scale(${String(view.k)})`,
        }}
      >
        {children}
      </div>
    </div>
  );
}
