import { GIFEncoder, applyPalette, quantize } from 'gifenc';
import { computeCoverRect, computeGifCanvasSize, type Size } from './gif-layout';

export interface GifFrameSource {
  bitmap: ImageBitmap;
}

export interface GifOptions {
  /** Milliseconds each frame is shown. */
  delayMs: number;
  /** Longest edge of the output GIF, in pixels — GIFs get large fast, so this
   *  is capped well below typical photo resolution by default. */
  maxEdge: number;
  /** -1 = play once, 0 = loop forever, N = loop N times. */
  repeat: 0 | -1;
}

export const DEFAULT_GIF_OPTIONS: GifOptions = {
  delayMs: 500,
  maxEdge: 480,
  repeat: 0,
};

/**
 * Build an animated GIF from a sequence of images. Each source is cover-fit
 * (cropped to fill, like CSS `object-fit: cover`) into one shared canvas size
 * derived from the first frame, since GIF frames must share dimensions.
 *
 * The color palette is quantized once from the FIRST frame and reused for
 * every frame (gifenc's `writeFrame` only requires a palette on frame 1).
 * This keeps colors consistent across frames and the encode fast, at the
 * cost of later frames with very different color content being mapped to a
 * palette that wasn't built from them — acceptable for typical photo-to-GIF
 * use where frames are visually related.
 */
export async function encodeGif(
  frames: readonly GifFrameSource[],
  options: GifOptions = DEFAULT_GIF_OPTIONS,
): Promise<Blob> {
  if (frames.length === 0) throw new Error('No frames to encode.');
  const first = frames[0];
  if (!first) throw new Error('No frames to encode.');

  const canvasSize: Size = computeGifCanvasSize(
    { width: first.bitmap.width, height: first.bitmap.height },
    options.maxEdge,
  );

  const gif = GIFEncoder();
  let palette: number[][] | null = null;

  for (const frame of frames) {
    const canvas = new OffscreenCanvas(canvasSize.width, canvasSize.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D context unavailable.');

    const rect = computeCoverRect(
      { width: frame.bitmap.width, height: frame.bitmap.height },
      canvasSize,
    );
    ctx.drawImage(frame.bitmap, rect.x, rect.y, rect.width, rect.height);

    const { data } = ctx.getImageData(0, 0, canvasSize.width, canvasSize.height);
    palette ??= quantize(data, 256);
    const index = applyPalette(data, palette);

    gif.writeFrame(index, canvasSize.width, canvasSize.height, {
      palette: frame === first ? palette : undefined,
      delay: options.delayMs,
      repeat: options.repeat,
    });
  }

  gif.finish();
  return new Blob([gif.bytes()], { type: 'image/gif' });
}
