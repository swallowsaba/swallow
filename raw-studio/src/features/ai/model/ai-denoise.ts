import { fetchModel } from './model-cache';
import { getDenoiseModelId, getModel } from './model-registry';
import { loadModel, runModelDynamic } from './inference-client';
import { denoiseWorkSize, maxEdgeForDevice } from './denoise-size';

/** Rough device-class check: treat coarse-pointer / small-viewport as mobile. */
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
 * AI denoise a photo with SCUNet, entirely on-device (ONNX Runtime Web). The
 * image is processed at a device-appropriate working size (mobile capped harder
 * than desktop), then the result is drawn back at the original resolution.
 *
 * SCUNet I/O contract: input float32 [1,3,H,W] in 0..1 (H/W multiples of 8),
 * output the same shape in 0..1. Tensor names are read from the session, so a
 * community export with different names still works.
 */
export async function aiDenoise(
  bitmap: ImageBitmap,
  opts: { mobile?: boolean } = {},
  onProgress?: (received: number, total: number) => void,
): Promise<Blob> {
  const mobile = opts.mobile ?? isMobileDevice();
  const model = getModel(getDenoiseModelId(mobile));
  if (!model || model.kind !== 'denoise') throw new Error('Denoise model missing.');

  const bytes = await fetchModel(model.url, onProgress);
  await loadModel(model.id, bytes);

  const maxEdge = maxEdgeForDevice(mobile, model.maxEdge ?? 1024);
  const { width: w, height: h } = denoiseWorkSize(
    bitmap.width,
    bitmap.height,
    maxEdge,
    model.sizeMultiple ?? 8,
  );

  // Draw the image at the working size and read RGBA.
  const inCanvas = new OffscreenCanvas(w, h);
  const inCtx = inCanvas.getContext('2d');
  if (!inCtx) throw new Error('2D context unavailable.');
  inCtx.drawImage(bitmap, 0, 0, w, h);
  const rgba = inCtx.getImageData(0, 0, w, h).data;

  // Preprocess: RGBA -> CHW float32 in 0..1 (no ImageNet norm).
  const plane = w * h;
  const chw = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    chw[i] = (rgba[i * 4] ?? 0) / 255;
    chw[plane + i] = (rgba[i * 4 + 1] ?? 0) / 255;
    chw[2 * plane + i] = (rgba[i * 4 + 2] ?? 0) / 255;
  }

  // Run the model.
  const out = await runModelDynamic(model.id, chw, w, h);

  // Postprocess: CHW 0..1 -> RGBA.
  const outRgba = new Uint8ClampedArray(plane * 4);
  for (let i = 0; i < plane; i++) {
    outRgba[i * 4] = Math.max(0, Math.min(1, out[i] ?? 0)) * 255;
    outRgba[i * 4 + 1] = Math.max(0, Math.min(1, out[plane + i] ?? 0)) * 255;
    outRgba[i * 4 + 2] = Math.max(0, Math.min(1, out[2 * plane + i] ?? 0)) * 255;
    outRgba[i * 4 + 3] = 255;
  }

  // Put the denoised working image on a canvas, then scale back to full size.
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
