import { computeCoverRect, computeGridLayout, type Size } from './collage-layout';
import { computeTextPosition, type TextAnchor } from './text-layout';

export interface CollageImageSource {
  bitmap: ImageBitmap;
}

export interface CollageText {
  content: string;
  anchor: TextAnchor;
  /** Font size as a percentage of the canvas's short edge, 1..20. */
  sizePct: number;
  color: string;
}

export interface CollageOptions {
  /** Long edge of the output canvas, in pixels. */
  maxEdge: number;
  /** Gap between grid cells, in pixels. */
  gap: number;
  backgroundColor: string;
  text?: CollageText;
}

export const DEFAULT_COLLAGE_OPTIONS: CollageOptions = {
  maxEdge: 1600,
  gap: 8,
  backgroundColor: '#ffffff',
};

/**
 * Compose multiple images into a single grid collage, with an optional
 * caption drawn on top. Output canvas is always square-ish (derived from the
 * grid), sized to `maxEdge` on its long side.
 */
export async function encodeCollage(
  images: readonly CollageImageSource[],
  options: CollageOptions = DEFAULT_COLLAGE_OPTIONS,
): Promise<Blob> {
  if (images.length === 0) throw new Error('No images to compose.');

  // A near-square canvas sized by the grid's row/column count, capped to
  // maxEdge on the long side.
  const columns = Math.ceil(Math.sqrt(images.length));
  const rows = Math.ceil(images.length / columns);
  const canvas: Size =
    columns >= rows
      ? { width: options.maxEdge, height: Math.round((options.maxEdge * rows) / columns) }
      : { width: Math.round((options.maxEdge * columns) / rows), height: options.maxEdge };

  const offscreen = new OffscreenCanvas(canvas.width, canvas.height);
  const ctx = offscreen.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable.');

  ctx.fillStyle = options.backgroundColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const cells = computeGridLayout(images.length, canvas, options.gap);
  for (let i = 0; i < images.length; i++) {
    const image = images[i];
    const cell = cells[i];
    if (!image || !cell) continue;
    const src: Size = { width: image.bitmap.width, height: image.bitmap.height };
    const fit = computeCoverRect(src, { width: cell.width, height: cell.height });
    // Clip to the cell so a cover-fit image doesn't bleed into neighbors.
    ctx.save();
    ctx.beginPath();
    ctx.rect(cell.x, cell.y, cell.width, cell.height);
    ctx.clip();
    ctx.drawImage(image.bitmap, cell.x + fit.x, cell.y + fit.y, fit.width, fit.height);
    ctx.restore();
  }

  if (options.text && options.text.content.trim()) {
    const { content, anchor, sizePct, color } = options.text;
    const fontPx = Math.max(
      10,
      Math.round((Math.min(canvas.width, canvas.height) * sizePct) / 100),
    );
    ctx.font = `700 ${String(fontPx)}px -apple-system, system-ui, sans-serif`;
    ctx.textBaseline = 'alphabetic';
    const textWidth = ctx.measureText(content).width;
    const margin = Math.round(fontPx * 0.6);
    const pos = computeTextPosition(anchor, canvas, textWidth, fontPx, margin);

    // A soft shadow keeps the caption legible over busy photo content.
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillText(content, pos.x + 1, pos.y + 1);
    ctx.fillStyle = color;
    ctx.fillText(content, pos.x, pos.y);
  }

  return offscreen.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
}
