import { segment } from './segmentation';

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

/**
 * Softens detail (skin texture, minor blemishes) within the detected subject
 * only — the background stays completely untouched. This deliberately does
 * NOT reshape any facial features or change identity; it's the same category
 * of effect as a soft-focus filter or a gentle "clarity in reverse", applied
 * selectively via the existing subject mask rather than anything
 * face-specific. Precisely targeting just eyes/teeth would need a face
 * landmark model — a separate, larger addition (see the AI panel notes).
 */
export async function smoothPortrait(
  bitmap: ImageBitmap,
  /** 0..100 smoothing strength. */
  strength: number,
  onProgress?: (received: number, total: number) => void,
): Promise<Blob> {
  const { mask, size } = await segment('u2netp-subject', bitmap, onProgress);

  const w = bitmap.width;
  const h = bitmap.height;
  const blurPx = Math.max(2, Math.round(Math.max(w, h) / 60));

  // 1) Full-size mask canvas, scaled up from the model's resolution, with a
  // soft edge so there's no visible hard seam at the subject boundary.
  const maskSmall = new OffscreenCanvas(size, size);
  const maskSmallCtx = maskSmall.getContext('2d');
  if (!maskSmallCtx) throw new Error('2D context unavailable.');
  const maskImageData = maskSmallCtx.createImageData(size, size);
  for (let i = 0; i < mask.length; i++) {
    const v = mask[i] ?? 0;
    maskImageData.data[i * 4] = 255;
    maskImageData.data[i * 4 + 1] = 255;
    maskImageData.data[i * 4 + 2] = 255;
    maskImageData.data[i * 4 + 3] = v;
  }
  maskSmallCtx.putImageData(maskImageData, 0, 0);

  const maskFull = new OffscreenCanvas(w, h);
  const maskFullCtx = maskFull.getContext('2d');
  if (!maskFullCtx) throw new Error('2D context unavailable.');
  maskFullCtx.filter = 'blur(3px)';
  maskFullCtx.drawImage(maskSmall, 0, 0, w, h);
  maskFullCtx.filter = 'none';

  // 2) Blend sharp -> blurred at `strength` opacity (0 = untouched, 100 =
  // fully smoothed), then clip to the subject via the mask.
  const softened = new OffscreenCanvas(w, h);
  const softenedCtx = softened.getContext('2d');
  if (!softenedCtx) throw new Error('2D context unavailable.');
  softenedCtx.drawImage(bitmap, 0, 0);
  softenedCtx.filter = `blur(${String(blurPx)}px)`;
  softenedCtx.globalAlpha = clamp01(strength / 100);
  softenedCtx.drawImage(bitmap, 0, 0);
  softenedCtx.filter = 'none';
  softenedCtx.globalAlpha = 1;
  softenedCtx.globalCompositeOperation = 'destination-in';
  softenedCtx.drawImage(maskFull, 0, 0);

  // 3) Sharp original everywhere, with the softened+masked subject on top.
  const out = new OffscreenCanvas(w, h);
  const outCtx = out.getContext('2d');
  if (!outCtx) throw new Error('2D context unavailable.');
  outCtx.drawImage(bitmap, 0, 0);
  outCtx.drawImage(softened, 0, 0);

  return out.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
}
