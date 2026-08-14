export interface Size {
  width: number;
  height: number;
}
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The common canvas size for a GIF: every frame is drawn into the same
 * dimensions, so mixed-size source photos need one shared size to target.
 * Uses the first image's aspect ratio, capped to `maxEdge` on the long side
 * (keeps file size and encode time reasonable — GIFs get large fast).
 */
export function computeGifCanvasSize(first: Size, maxEdge: number): Size {
  if (first.width <= 0 || first.height <= 0) return { width: maxEdge, height: maxEdge };
  const scale = Math.min(1, maxEdge / Math.max(first.width, first.height));
  return {
    width: Math.max(1, Math.round(first.width * scale)),
    height: Math.max(1, Math.round(first.height * scale)),
  };
}

/**
 * A "cover" rect: the largest centered crop of `src` that fills `dst`
 * completely (like CSS `object-fit: cover`), so each frame fills the whole
 * GIF canvas with no letterboxing regardless of its own aspect ratio.
 */
export function computeCoverRect(src: Size, dst: Size): Rect {
  if (src.width <= 0 || src.height <= 0 || dst.width <= 0 || dst.height <= 0) {
    return { x: 0, y: 0, width: dst.width, height: dst.height };
  }
  const scale = Math.max(dst.width / src.width, dst.height / src.height);
  const width = src.width * scale;
  const height = src.height * scale;
  return {
    x: (dst.width - width) / 2,
    y: (dst.height - height) / 2,
    width,
    height,
  };
}
