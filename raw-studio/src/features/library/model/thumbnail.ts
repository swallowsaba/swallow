/** Downscale a decoded bitmap into a small JPEG blob for the library grid. */
export async function createThumbnailBlob(
  bitmap: ImageBitmap,
  maxEdge = 256,
): Promise<Blob> {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable for thumbnail.');
  ctx.drawImage(bitmap, 0, 0, w, h);
  return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
}
