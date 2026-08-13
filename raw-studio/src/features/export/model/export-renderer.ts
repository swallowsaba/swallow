import { toAdjustmentUniforms } from '@/features/adjustments/model/adjustment-math';
import { toAdvancedUniforms } from '@/features/adjustments/model/advanced-math';
import { WebGLImageRenderer } from '@/features/viewer/model/webgl-renderer';
import { croppedImageSize } from '@/features/viewer/model/crop-math';
import type { EditState } from '@/types';
import type { ExportOptions, WatermarkPosition } from './export-options';
import { MIME } from './export-options';
import { computeExportSize, type Size } from './resize';

/**
 * Render an edited image at export resolution and encode it to a Blob. Uses the
 * same WebGL adjustment pipeline as the viewer (so the export matches the
 * preview, crop included), then composites an optional watermark on a 2D
 * canvas.
 */
export async function renderExport(
  bitmap: ImageBitmap,
  edit: EditState,
  options: ExportOptions,
): Promise<Blob> {
  const crop = edit.geometry.crop;
  const cropped = croppedImageSize({ width: bitmap.width, height: bitmap.height }, crop);
  const target = computeExportSize(cropped, options.resize);

  // 1) Adjustments pass on a WebGL offscreen canvas.
  const glCanvas = new OffscreenCanvas(target.width, target.height);
  const renderer = new WebGLImageRenderer(glCanvas);
  try {
    renderer.setImage(bitmap);
    const scale = target.width / cropped.width;
    renderer.render(
      { scale, offset: { x: 0, y: 0 }, rotationDeg: 0 },
      { width: target.width, height: target.height },
      1,
      toAdjustmentUniforms(edit.adjustments.basic),
      toAdvancedUniforms(edit.adjustments),
      crop,
    );
  } finally {
    // Keep the renderer alive until after we read pixels below.
  }

  // 2) Composite onto a 2D canvas (also required for watermark + encoding).
  const outCanvas = new OffscreenCanvas(target.width, target.height);
  const ctx = outCanvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable for export.');
  ctx.drawImage(glCanvas, 0, 0);
  renderer.dispose();

  if (options.watermark.enabled && options.watermark.text.trim()) {
    drawWatermark(ctx, target, options);
  }

  const encodeOptions: ImageEncodeOptions =
    options.format === 'png'
      ? { type: MIME[options.format] }
      : { type: MIME[options.format], quality: options.quality / 100 };
  return outCanvas.convertToBlob(encodeOptions);
}

function drawWatermark(
  ctx: OffscreenCanvasRenderingContext2D,
  size: Size,
  options: ExportOptions,
): void {
  const wm = options.watermark;
  const fontPx = Math.max(10, Math.round((Math.min(size.width, size.height) * wm.sizePct) / 100));
  ctx.font = `600 ${String(fontPx)}px -apple-system, system-ui, sans-serif`;
  ctx.textBaseline = 'alphabetic';
  ctx.globalAlpha = wm.opacity / 100;

  const metrics = ctx.measureText(wm.text);
  const textWidth = metrics.width;
  const margin = Math.round(fontPx * 0.6);
  const { x, y } = watermarkXy(wm.position, size, textWidth, fontPx, margin);

  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillText(wm.text, x + 1, y + 1);
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.fillText(wm.text, x, y);
  ctx.globalAlpha = 1;
}

function watermarkXy(
  position: WatermarkPosition,
  size: Size,
  textWidth: number,
  fontPx: number,
  margin: number,
): { x: number; y: number } {
  const left = margin;
  const right = size.width - textWidth - margin;
  const top = margin + fontPx;
  const bottom = size.height - margin;
  const centerX = (size.width - textWidth) / 2;
  const centerY = size.height / 2;
  switch (position) {
    case 'tl':
      return { x: left, y: top };
    case 'tr':
      return { x: right, y: top };
    case 'bl':
      return { x: left, y: bottom };
    case 'br':
      return { x: right, y: bottom };
    case 'center':
      return { x: centerX, y: centerY };
  }
}
