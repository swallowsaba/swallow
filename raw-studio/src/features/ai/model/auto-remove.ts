import { detectThinStructures, type ThinStructureOptions } from './thin-structure';
import { inpaint } from './inpaint';
import { maskCoverage } from './edge-detect';

/**
 * Turn a 0/255 detection mask into the OffscreenCanvas inpaint() expects, where
 * "remove this" is encoded in the ALPHA channel (255 = erase). Pure-ish (only
 * touches an OffscreenCanvas), kept separate so detection stays unit-testable.
 */
export function maskToInpaintCanvas(
  mask: Uint8ClampedArray,
  width: number,
  height: number,
): OffscreenCanvas {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable.');
  const img = ctx.createImageData(width, height);
  for (let i = 0; i < width * height; i++) {
    const on = (mask[i] ?? 0) > 0 ? 255 : 0;
    img.data[i * 4] = 255;
    img.data[i * 4 + 1] = 255;
    img.data[i * 4 + 2] = 255;
    img.data[i * 4 + 3] = on; // alpha carries the erase signal
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export interface AutoRemoveResult {
  /** The inpainted image, or null when nothing worth removing was found. */
  readonly blob: Blob | null;
  /** Fraction of the image the detected mask covered. */
  readonly coverage: number;
}

/**
 * One-shot "remove distractions": detect thin structures (wires, nets, fences)
 * and inpaint them away with LaMa. Returns null blob when the detected mask is
 * essentially empty, so the UI can tell the user nothing was found rather than
 * running the model pointlessly.
 */
export async function autoRemoveThinStructures(
  modelId: string,
  bitmap: ImageBitmap,
  options: ThinStructureOptions = {},
  onProgress?: (received: number, total: number) => void,
): Promise<AutoRemoveResult> {
  const w = bitmap.width;
  const h = bitmap.height;
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable.');
  ctx.drawImage(bitmap, 0, 0);
  const rgba = ctx.getImageData(0, 0, w, h).data;

  const mask = detectThinStructures(rgba, w, h, options);
  const coverage = maskCoverage(mask);
  // Below ~0.1% coverage there's effectively nothing to remove.
  if (coverage < 0.001) return { blob: null, coverage };

  const maskCanvas = maskToInpaintCanvas(mask, w, h);
  const blob = await inpaint(modelId, bitmap, maskCanvas, onProgress);
  return { blob, coverage };
}
