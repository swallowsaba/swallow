/**
 * Pure tensor helpers for ONNX image models. Kept free of onnxruntime and the
 * DOM so they can be unit-tested; the worker calls these around `session.run`.
 */

export interface Normalization {
  readonly mean: readonly [number, number, number];
  readonly std: readonly [number, number, number];
}

/** ImageNet-style normalization, a common default for vision models. */
export const IMAGENET_NORM: Normalization = {
  mean: [0.485, 0.456, 0.406],
  std: [0.229, 0.224, 0.225],
};

/**
 * Convert an RGBA buffer (already resized to size×size) into a planar NCHW
 * Float32 tensor with the given normalization. Returns length 3*size*size.
 */
export function rgbaToNchw(
  rgba: Uint8ClampedArray,
  size: number,
  norm: Normalization,
): Float32Array {
  const plane = size * size;
  const out = new Float32Array(3 * plane);
  for (let p = 0; p < plane; p++) {
    const r = (rgba[p * 4] ?? 0) / 255;
    const g = (rgba[p * 4 + 1] ?? 0) / 255;
    const b = (rgba[p * 4 + 2] ?? 0) / 255;
    out[p] = (r - norm.mean[0]) / norm.std[0];
    out[plane + p] = (g - norm.mean[1]) / norm.std[1];
    out[2 * plane + p] = (b - norm.mean[2]) / norm.std[2];
  }
  return out;
}

/**
 * Convert an 8-bit alpha mask (size×size, 255=erase/inpaint, 0=keep) into the
 * single-channel float32[1,size,size] tensor LaMa-style inpainting models
 * expect (1.0=erase, 0.0=keep).
 */
export function maskToNchw1(mask: Uint8ClampedArray, size: number): Float32Array {
  const out = new Float32Array(size * size);
  for (let i = 0; i < out.length; i++) {
    out[i] = (mask[i] ?? 0) / 255;
  }
  return out;
}

/**
 * Convert a planar CHW float32 tensor already in 0..255 range (LaMa's output
 * contract) back into an interleaved RGBA Uint8ClampedArray, alpha opaque.
 */
export function chw255ToRgba(chw: Float32Array, size: number): Uint8ClampedArray {
  const plane = size * size;
  const out = new Uint8ClampedArray(plane * 4);
  for (let p = 0; p < plane; p++) {
    out[p * 4] = chw[p] ?? 0;
    out[p * 4 + 1] = chw[plane + p] ?? 0;
    out[p * 4 + 2] = chw[2 * plane + p] ?? 0;
    out[p * 4 + 3] = 255;
  }
  return out;
}
function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/**
 * Convert a single-channel model output (size×size) into an 8-bit alpha mask.
 * Applies sigmoid when values fall outside [0,1], then normalizes.
 */
export function outputToMask(output: Float32Array, size: number): Uint8ClampedArray {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < output.length; i++) {
    const v = output[i] ?? 0;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const needsSigmoid = min < 0 || max > 1;
  const mask = new Uint8ClampedArray(size * size);
  const range = max - min || 1;
  for (let i = 0; i < mask.length; i++) {
    const raw = output[i] ?? 0;
    const v = needsSigmoid ? sigmoid(raw) : (raw - min) / range;
    mask[i] = Math.round(v * 255);
  }
  return mask;
}
