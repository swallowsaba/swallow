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
 * Arrange `count` cells into a near-square grid within `canvas`, separated
 * by `gap` pixels. Columns = ceil(sqrt(count)), rows = ceil(count/columns) —
 * this naturally gives 1x2 for 2 images, 2x2 for 4, etc. The last row may
 * have fewer cells than `columns` if `count` doesn't divide evenly; those
 * cells are simply left empty (not stretched to fill the gap), which keeps
 * every cell the same size regardless of position.
 */
export function computeGridLayout(count: number, canvas: Size, gap: number): Rect[] {
  if (count <= 0 || canvas.width <= 0 || canvas.height <= 0) return [];
  const columns = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / columns);

  const cellWidth = (canvas.width - gap * (columns - 1)) / columns;
  const cellHeight = (canvas.height - gap * (rows - 1)) / rows;

  const rects: Rect[] = [];
  for (let i = 0; i < count; i++) {
    const col = i % columns;
    const row = Math.floor(i / columns);
    rects.push({
      x: col * (cellWidth + gap),
      y: row * (cellHeight + gap),
      width: Math.max(1, cellWidth),
      height: Math.max(1, cellHeight),
    });
  }
  return rects;
}

/**
 * A "cover" rect: the largest centered crop of `src` that fills `dst`
 * completely (like CSS `object-fit: cover`). Shared with the GIF tool's
 * layout math (identical formula, kept separate to avoid a cross-feature
 * dependency between gif/ and collage/).
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
