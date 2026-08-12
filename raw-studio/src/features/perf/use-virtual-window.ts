import { useEffect, useRef, useState } from 'react';
import { computeVisibleRange, type Range } from './model/virtual-window';

/**
 * Track the visible index range of a fixed-item-size scroller. Attach the
 * returned `ref` to the scroll container and render only items in `range`,
 * padding with spacers so the scrollbar stays correct.
 */
export function useVirtualWindow(
  count: number,
  itemSize: number,
  opts: { horizontal?: boolean; overscan?: number } = {},
): { ref: React.RefObject<HTMLDivElement | null>; range: Range } {
  const { horizontal = false, overscan = 3 } = opts;
  const ref = useRef<HTMLDivElement | null>(null);
  const [range, setRange] = useState<Range>(() => ({ start: 0, end: Math.min(count, 30) }));

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const scroll = horizontal ? el.scrollLeft : el.scrollTop;
      const viewport = horizontal ? el.clientWidth : el.clientHeight;
      setRange(computeVisibleRange(scroll, viewport, itemSize, count, overscan));
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, [count, itemSize, horizontal, overscan]);

  return { ref, range };
}
