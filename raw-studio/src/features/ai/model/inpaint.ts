import { fetchModel } from './model-cache';
import { getModel } from './model-registry';
import { loadModel, runModel } from './inference-client';
import { chw255ToRgba, maskToNchw1, rgbaToNchw } from './tensor';

/**
 * Remove the content under a user-painted mask and fill it in with an
 * AI-generated, context-aware fill (LaMa inpainting).
 *
 * The model only sees a fixed 512×512 downscaled view of the whole image, so
 * the filled-in area is composited back at that effective resolution — full
 * detail is preserved everywhere OUTSIDE the mask (untouched original
 * pixels), but the removed area itself will look correspondingly softer on
 * a large photo, especially for small/thin objects like a net or wire.
 */
export async function inpaint(
  modelId: string,
  bitmap: ImageBitmap,
  /** A full-resolution mask canvas matching the bitmap's size: 255 where the
   *  user painted "remove this", 0 elsewhere. */
  maskCanvas: OffscreenCanvas,
  onProgress?: (received: number, total: number) => void,
): Promise<Blob> {
  const model = getModel(modelId);
  if (!model || model.kind !== 'inpaint' || !model.maskInputName) {
    throw new Error(`Unknown or non-inpainting model: ${modelId}`);
  }

  const bytes = await fetchModel(model.url, onProgress);
  await loadModel(model.id, bytes);

  const size = model.inputSize;
  const w = bitmap.width;
  const h = bitmap.height;

  // 1) Downscale the image and the mask to the model's fixed input size.
  const imgCanvas = new OffscreenCanvas(size, size);
  const imgCtx = imgCanvas.getContext('2d');
  if (!imgCtx) throw new Error('2D context unavailable.');
  imgCtx.drawImage(bitmap, 0, 0, size, size);
  const imgRgba = imgCtx.getImageData(0, 0, size, size).data;

  const maskSmall = new OffscreenCanvas(size, size);
  const maskSmallCtx = maskSmall.getContext('2d');
  if (!maskSmallCtx) throw new Error('2D context unavailable.');
  maskSmallCtx.drawImage(maskCanvas, 0, 0, size, size);
  const maskRgba = maskSmallCtx.getImageData(0, 0, size, size).data;
  // The mask canvas encodes "erase" in the alpha channel.
  const maskAlpha = new Uint8ClampedArray(size * size);
  for (let i = 0; i < maskAlpha.length; i++) {
    maskAlpha[i] = maskRgba[i * 4 + 3] ?? 0;
  }

  // 2) Run the model.
  const imageTensor = rgbaToNchw(imgRgba, size, model.normalization);
  const maskTensor = maskToNchw1(maskAlpha, size);
  const output = await runModel(
    model.id,
    model.inputName,
    model.outputName,
    imageTensor,
    size,
    model.maskInputName,
    maskTensor,
  );
  const filledRgba = chw255ToRgba(output, size);

  // 3) Composite: upscale the model's filled 512x512 result and blend it
  // into the ORIGINAL full-resolution image using the (full-res, feathered)
  // mask, so everything outside the erased area stays pixel-perfect.
  const filledSmall = new OffscreenCanvas(size, size);
  const filledSmallCtx = filledSmall.getContext('2d');
  if (!filledSmallCtx) throw new Error('2D context unavailable.');
  // Newer TypeScript types Uint8ClampedArray as possibly SharedArrayBuffer-backed,
  // while the ImageData constructor requires a plain ArrayBuffer-backed one. Copy
  // into a fresh Uint8ClampedArray to guarantee that regardless of the source.
  const filledRgbaCopy = new Uint8ClampedArray(filledRgba);
  filledSmallCtx.putImageData(new ImageData(filledRgbaCopy, size, size), 0, 0);

  const filledFull = new OffscreenCanvas(w, h);
  const filledFullCtx = filledFull.getContext('2d');
  if (!filledFullCtx) throw new Error('2D context unavailable.');
  filledFullCtx.imageSmoothingEnabled = true;
  filledFullCtx.drawImage(filledSmall, 0, 0, w, h);
  // Clip the upscaled fill to the mask (blurred slightly so the seam blends).
  filledFullCtx.globalCompositeOperation = 'destination-in';
  filledFullCtx.filter = 'blur(2px)';
  filledFullCtx.drawImage(maskCanvas, 0, 0);
  filledFullCtx.filter = 'none';

  const out = new OffscreenCanvas(w, h);
  const outCtx = out.getContext('2d');
  if (!outCtx) throw new Error('2D context unavailable.');
  outCtx.drawImage(bitmap, 0, 0);
  outCtx.drawImage(filledFull, 0, 0);

  return out.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
}
