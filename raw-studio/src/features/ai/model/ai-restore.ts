import { fetchModel } from './model-cache';
import { getModel, type ModelDef } from './model-registry';
import { loadModel, runModelDynamic } from './inference-client';
import { denoiseWorkSize, maxEdgeForDevice } from './denoise-size';

/** Rough device-class check: treat coarse-pointer / small-viewport / mobile UA
 *  as mobile. */
export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return true;
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(pointer: coarse)').matches && window.innerWidth < 900;
  }
  return false;
}

/**
 * Run a dynamic-size, single-input restoration model (SCUNet denoise, NAFNet
 * restore/sharpen) over a photo, entirely on-device. Processes at a
 * device-appropriate working size (mobile capped harder), then scales the
 * result back to the original resolution. I/O contract for these models:
 * float32 [1,3,H,W] in 0..1, sides multiples of 8; tensor names are read from
 * the session at runtime so exact export names need not be known.
 */
export async function runRestorationModel(
  model: ModelDef,
  bitmap: ImageBitmap,
  mobile: boolean,
  onProgress?: (received: number, total: number) => void,
): Promise<Blob> {
  const bytes = await fetchModel(model.url, onProgress);
  await loadModel(model.id, bytes);

  const maxEdge = maxEdgeForDevice(mobile, model.maxEdge ?? 1024);
  const { width: w, height: h } = denoiseWorkSize(
    bitmap.width,
    bitmap.height,
    maxEdge,
    model.sizeMultiple ?? 8,
  );

  const inCanvas = new OffscreenCanvas(w, h);
  const inCtx = inCanvas.getContext('2d');
  if (!inCtx) throw new Error('2D context unavailable.');
  inCtx.drawImage(bitmap, 0, 0, w, h);
  const rgba = inCtx.getImageData(0, 0, w, h).data;

  const plane = w * h;
  const chw = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    chw[i] = (rgba[i * 4] ?? 0) / 255;
    chw[plane + i] = (rgba[i * 4 + 1] ?? 0) / 255;
    chw[2 * plane + i] = (rgba[i * 4 + 2] ?? 0) / 255;
  }

  const out = await runModelDynamic(model.id, chw, w, h);

  const outRgba = new Uint8ClampedArray(plane * 4);
  for (let i = 0; i < plane; i++) {
    outRgba[i * 4] = Math.max(0, Math.min(1, out[i] ?? 0)) * 255;
    outRgba[i * 4 + 1] = Math.max(0, Math.min(1, out[plane + i] ?? 0)) * 255;
    outRgba[i * 4 + 2] = Math.max(0, Math.min(1, out[2 * plane + i] ?? 0)) * 255;
    outRgba[i * 4 + 3] = 255;
  }

  const workCanvas = new OffscreenCanvas(w, h);
  const workCtx = workCanvas.getContext('2d');
  if (!workCtx) throw new Error('2D context unavailable.');
  workCtx.putImageData(new ImageData(outRgba, w, h), 0, 0);

  const outCanvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const outCtx = outCanvas.getContext('2d');
  if (!outCtx) throw new Error('2D context unavailable.');
  outCtx.imageSmoothingEnabled = true;
  outCtx.drawImage(workCanvas, 0, 0, bitmap.width, bitmap.height);

  return outCanvas.convertToBlob({ type: 'image/jpeg', quality: 0.95 });
}

/** AI sharpen / restore with NAFNet. */
export async function aiSharpen(
  bitmap: ImageBitmap,
  opts: { mobile?: boolean } = {},
  onProgress?: (received: number, total: number) => void,
): Promise<Blob> {
  const model = getModel('nafnet-restore');
  if (!model || model.kind !== 'restore') throw new Error('Restore model missing.');
  const mobile = opts.mobile ?? isMobileDevice();
  return runRestorationModel(model, bitmap, mobile, onProgress);
}
