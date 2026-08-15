import { fetchModel } from './model-cache';
import { getModel, type ModelDef } from './model-registry';
import { loadModel, runModel } from './inference-client';
import { outputToMask, rgbaToNchw } from './tensor';

/** Result of a segmentation run: an 8-bit alpha mask at model resolution. */
export interface SegmentationResult {
  mask: Uint8ClampedArray;
  size: number;
}

/** Resize a bitmap to size×size and return its RGBA bytes. */
function bitmapToSquareRgba(bitmap: ImageBitmap, size: number): Uint8ClampedArray {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable.');
  ctx.drawImage(bitmap, 0, 0, size, size);
  return ctx.getImageData(0, 0, size, size).data;
}

/**
 * Fetch + load + run a model on an already-square RGBA buffer (size = the
 * model's inputSize), returning the raw output tensor. Shared by segmentation
 * and any other single-input/single-output model (e.g. face landmarks).
 */
export async function runModelRaw(
  model: ModelDef,
  rgba: Uint8ClampedArray,
  onProgress?: (received: number, total: number) => void,
): Promise<Float32Array> {
  const bytes = await fetchModel(model.url, onProgress);
  await loadModel(model.id, bytes);
  const input = rgbaToNchw(rgba, model.inputSize, model.normalization);
  return runModel(model.id, model.inputName, model.outputName, input, model.inputSize);
}

/**
 * Run a segmentation model over a bitmap and return an alpha mask. Downloads and
 * caches the model on first use. Progress is reported for the download phase.
 */
export async function segment(
  modelId: string,
  bitmap: ImageBitmap,
  onProgress?: (received: number, total: number) => void,
): Promise<SegmentationResult> {
  const model = getModel(modelId);
  if (!model) throw new Error(`Unknown model: ${modelId}`);

  const rgba = bitmapToSquareRgba(bitmap, model.inputSize);
  const output = await runModelRaw(model, rgba, onProgress);

  return { mask: outputToMask(output, model.inputSize), size: model.inputSize };
}
