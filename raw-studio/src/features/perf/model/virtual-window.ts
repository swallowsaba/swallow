/** Half-open range [start, end). */
export interface Range {
  start: number;
  end: number;
}

/**
 * Which item indices are visible in a fixed-item-size scroller, plus overscan.
 * Used to render only the on-screen thumbnails in long libraries/filmstrips.
 */
export function computeVisibleRange(
  scroll: number,
  viewport: number,
  itemSize: number,
  count: number,
  overscan = 3,
): Range {
  if (itemSize <= 0 || count <= 0 || viewport <= 0) return { start: 0, end: 0 };
  const first = Math.floor(Math.max(0, scroll) / itemSize);
  const visible = Math.ceil(viewport / itemSize);
  const start = Math.max(0, first - overscan);
  const end = Math.min(count, first + visible + overscan);
  return { start, end };
}
