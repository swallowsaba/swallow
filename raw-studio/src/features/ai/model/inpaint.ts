import { fetchModel } from './model-cache';
import { getModel } from './model-registry';
import { loadModel, runModel } from './inference-client';
import { chw255ToRgba, maskToNchw1, rgbaToNchw } from './tensor';
import { cropRegionForMask, isWorthCropping, maskBounds, type Rect } from './inpaint-crop';

/**
 * Remove the content under a user-painted mask and fill it in with an
 * AI-generated, context-aware fill (LaMa inpainting).
 *
 * LaMa accepts a fixed square input (512²). Rather than always downscaling the
 * WHOLE image into that square (which makes the fill soft on big photos), we
 * crop a padded square region around the mask and feed only that. When the mask
 * covers a small part of the frame — a wire, a net, a sign — the crop is much
 * smaller than the whole image, so the fill is reconstructed at a far higher
 * effective resolution and stays crisp. For masks that cover most of the frame
 * we fall back to whole-image processing (no resolution gain to be had).
 */
export async function inpaint(
  modelId: string,
  bitmap: ImageBitmap,
  /** A full-resolution mask canvas matching the bitmap's size: 255 where the
   *  user painted "remove this" (in the ALPHA channel), 0 elsewhere. */
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

  // Read the full-res mask alpha to find where the user painted.
  const maskFullCtx = maskCanvas.getContext('2d');
  if (!maskFullCtx) throw new Error('2D context unavailable.');
  const maskFullData = maskFullCtx.getImageData(0, 0, w, h).data;
  const maskAlphaFull = new Uint8ClampedArray(w * h);
  for (let i = 0; i < maskAlphaFull.length; i++) {
    maskAlphaFull[i] = maskFullData[i * 4 + 3] ?? 0;
  }

  // Decide the region to feed the model: a padded square around the mask, or
  // the whole image if the mask is large/spread out.
  const bounds = maskBounds(maskAlphaFull, w, h);
  if (!bounds) {
    // Nothing painted — return the original image unchanged.
    const passthrough = new OffscreenCanvas(w, h);
    const pctx = passthrough.getContext('2d');
    if (!pctx) throw new Error('2D context unavailable.');
    pctx.drawImage(bitmap, 0, 0);
    return passthrough.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
  }
  const crop: Rect = cropRegionForMask(bounds, w, h);
  const useCrop = isWorthCropping(crop, w, h);
  const region: Rect = useCrop ? crop : { x: 0, y: 0, width: w, height: h };

  // 1) Draw the region's image into the model's square input.
  const imgCanvas = new OffscreenCanvas(size, size);
  const imgCtx = imgCanvas.getContext('2d');
  if (!imgCtx) throw new Error('2D context unavailable.');
  imgCtx.drawImage(bitmap, region.x, region.y, region.width, region.height, 0, 0, size, size);
  const imgRgba = imgCtx.getImageData(0, 0, size, size).data;

  // Region's mask into the same square.
  const maskSmall = new OffscreenCanvas(size, size);
  const maskSmallCtx = maskSmall.getContext('2d');
  if (!maskSmallCtx) throw new Error('2D context unavailable.');
  maskSmallCtx.drawImage(
    maskCanvas,
    region.x,
    region.y,
    region.width,
    region.height,
    0,
    0,
    size,
    size,
  );
  const maskRgba = maskSmallCtx.getImageData(0, 0, size, size).data;
  const maskAlpha = new Uint8ClampedArray(size * size);
  for (let i = 0; i < maskAlpha.length; i++) {
    maskAlpha[i] = maskRgba[i * 4 + 3] ?? 0;
  }

  // 2) Run the model on the region.
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

  // 3) Put the model's square result back at the region's size.
  const filledSmall = new OffscreenCanvas(size, size);
  const filledSmallCtx = filledSmall.getContext('2d');
  if (!filledSmallCtx) throw new Error('2D context unavailable.');
  const filledRgbaCopy = new Uint8ClampedArray(filledRgba);
  filledSmallCtx.putImageData(new ImageData(filledRgbaCopy, size, size), 0, 0);

  // Upscale the filled square to the region's pixel size.
  const filledRegion = new OffscreenCanvas(region.width, region.height);
  const filledRegionCtx = filledRegion.getContext('2d');
  if (!filledRegionCtx) throw new Error('2D context unavailable.');
  filledRegionCtx.imageSmoothingEnabled = true;
  filledRegionCtx.drawImage(filledSmall, 0, 0, region.width, region.height);

  // Clip the fill to the mask (within the region) so only erased pixels change.
  // Slight blur on the mask edge blends the seam.
  filledRegionCtx.globalCompositeOperation = 'destination-in';
  filledRegionCtx.filter = 'blur(2px)';
  filledRegionCtx.drawImage(
    maskCanvas,
    region.x,
    region.y,
    region.width,
    region.height,
    0,
    0,
    region.width,
    region.height,
  );
  filledRegionCtx.filter = 'none';

  // 4) Composite: original full image, then the filled region pasted back in.
  const out = new OffscreenCanvas(w, h);
  const outCtx = out.getContext('2d');
  if (!outCtx) throw new Error('2D context unavailable.');
  outCtx.drawImage(bitmap, 0, 0);
  outCtx.drawImage(filledRegion, region.x, region.y);

  return out.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
}
