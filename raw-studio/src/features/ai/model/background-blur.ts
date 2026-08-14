import { segment } from './segmentation';
import { backgroundBlurRadiusPx } from './blur-math';

export { backgroundBlurRadiusPx } from './blur-math';

/**
 * Produce a "blur the background, keep the subject sharp" composite as a
 * downloadable image. This is a one-shot 2D-canvas operation (not part of the
 * live non-destructive adjustment pipeline) — it runs subject segmentation,
 * blurs a full copy of the image, then draws the sharp subject back on top
 * using the segmentation mask as a clip.
 *
 * Unverified in this environment: OffscreenCanvas 2D + `ctx.filter` blur need
 * a real browser to confirm the visual result; the compositing logic is
 * straightforward but only syntax-checked here.
 */
export async function blurBackground(
  bitmap: ImageBitmap,
  /** Blur strength, 0..100 (not a raw pixel count — see below). */
  strength: number,
  onProgress?: (received: number, total: number) => void,
): Promise<Blob> {
  const { mask, size } = await segment('u2netp-subject', bitmap, onProgress);

  const w = bitmap.width;
  const h = bitmap.height;
  const blurPx = backgroundBlurRadiusPx(strength, Math.max(w, h));

  // 1) Full-size mask canvas, scaled up from the model's resolution.
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
  maskFullCtx.drawImage(maskSmall, 0, 0, w, h);

  // 2) Sharp subject only (mask as an alpha clip).
  const subject = new OffscreenCanvas(w, h);
  const subjectCtx = subject.getContext('2d');
  if (!subjectCtx) throw new Error('2D context unavailable.');
  subjectCtx.drawImage(bitmap, 0, 0);
  subjectCtx.globalCompositeOperation = 'destination-in';
  subjectCtx.drawImage(maskFull, 0, 0);

  // 3) Blurred full image as the background, with the sharp subject on top.
  const out = new OffscreenCanvas(w, h);
  const outCtx = out.getContext('2d');
  if (!outCtx) throw new Error('2D context unavailable.');
  outCtx.filter = `blur(${String(blurPx)}px)`;
  outCtx.drawImage(bitmap, 0, 0);
  outCtx.filter = 'none';
  outCtx.drawImage(subject, 0, 0);

  return out.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
}
