import { detectThinStructures, optionsForSensitivity } from './thin-structure';

/**
 * Suggest a starting mask for the Remove Object tool by detecting thin,
 * distracting structures (net/fence mesh, wires, cables). Uses the same
 * connected-component detector as auto-remove — so it keeps only components
 * that are thin, elongated and small, and does NOT grab textured walls or the
 * subject. Runs at a reduced working resolution for speed, then scales the
 * result back up. Returns an OffscreenCanvas whose alpha channel is 255 where
 * structure was detected — meant as a starting point the person reviews and
 * refines by hand, not applied blindly.
 *
 * @param sensitivity 0..100 — higher casts a wider net (default 45, a touch
 *  more lenient than auto-remove since the user will refine the result).
 */
export async function suggestMeshMask(
  bitmap: ImageBitmap,
  color: readonly [number, number, number] = [255, 60, 60],
  sensitivity = 45,
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

  const mask = detectThinStructures(rgba, w, h, optionsForSensitivity(sensitivity));

  // Build a small RGBA canvas: solid brush color, alpha = the mask.
  const maskSmall = new OffscreenCanvas(w, h);
  const maskCtx = maskSmall.getContext('2d');
  if (!maskCtx) throw new Error('2D context unavailable.');
  const imageData = maskCtx.createImageData(w, h);
  const [cr, cg, cb] = color;
  for (let i = 0; i < mask.length; i++) {
    imageData.data[i * 4] = cr;
    imageData.data[i * 4 + 1] = cg;
    imageData.data[i * 4 + 2] = cb;
    imageData.data[i * 4 + 3] = mask[i] ?? 0;
  }
  maskCtx.putImageData(imageData, 0, 0);

  // Scale the small mask back up to full resolution.
  const full = new OffscreenCanvas(bitmap.width, bitmap.height);
  const fullCtx = full.getContext('2d');
  if (!fullCtx) throw new Error('2D context unavailable.');
  fullCtx.imageSmoothingEnabled = true;
  fullCtx.drawImage(maskSmall, 0, 0, bitmap.width, bitmap.height);
  return full;
}
