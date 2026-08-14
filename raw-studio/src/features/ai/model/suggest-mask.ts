import { autoThreshold, dilateMask, sobelMagnitude, toLuminance } from './edge-detect';

/**
 * Suggest a starting mask for the Remove Object tool by finding dense,
 * regular fine-edge patterns (like a net or chain-link fence). Runs at a
 * reduced working resolution for speed, then scales the result back up.
 * Returns an OffscreenCanvas whose alpha channel is 255 where the pattern
 * was detected — meant to be composited onto the paint canvas as a
 * starting point the person reviews and refines, not applied blindly.
 */
export async function suggestMeshMask(
  bitmap: ImageBitmap,
  color: readonly [number, number, number] = [255, 60, 60],
): Promise<OffscreenCanvas> {
  const workingEdge = 512;
  const scale = Math.min(1, workingEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const small = new OffscreenCanvas(w, h);
  const smallCtx = small.getContext('2d');
  if (!smallCtx) throw new Error('2D context unavailable.');
  smallCtx.drawImage(bitmap, 0, 0, w, h);
  const rgba = smallCtx.getImageData(0, 0, w, h).data;

  const luminance = toLuminance(rgba, w, h);
  const magnitude = sobelMagnitude(luminance, w, h);
  // Try progressively coarser thresholds until coverage lands in a sane
  // range — too little (nothing usable) or too much (probably not a fine
  // pattern, would over-select) both mean "try a more lenient threshold".
  const threshold = autoThreshold(magnitude, [1.2, 0.9, 0.6, 0.4, 0.25], 0.03, 0.35);
  const edges = new Uint8ClampedArray(w * h);
  for (let i = 0; i < magnitude.length; i++) {
    edges[i] = (magnitude[i] ?? 0) > threshold ? 255 : 0;
  }
  const dilated = dilateMask(edges, w, h, 2);

  // Build a small RGBA canvas: solid brush color, alpha = the mask.
  const maskSmall = new OffscreenCanvas(w, h);
  const maskCtx = maskSmall.getContext('2d');
  if (!maskCtx) throw new Error('2D context unavailable.');
  const imageData = maskCtx.createImageData(w, h);
  const [cr, cg, cb] = color;
  for (let i = 0; i < dilated.length; i++) {
    imageData.data[i * 4] = cr;
    imageData.data[i * 4 + 1] = cg;
    imageData.data[i * 4 + 2] = cb;
    imageData.data[i * 4 + 3] = dilated[i] ?? 0;
  }
  maskCtx.putImageData(imageData, 0, 0);

  // Scale back up to the bitmap's full resolution.
  const full = new OffscreenCanvas(bitmap.width, bitmap.height);
  const fullCtx = full.getContext('2d');
  if (!fullCtx) throw new Error('2D context unavailable.');
  fullCtx.drawImage(maskSmall, 0, 0, bitmap.width, bitmap.height);
  return full;
}
