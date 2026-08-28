import { fetchModel } from './model-cache';
import { getModel } from './model-registry';
import { loadModel, runModel } from './inference-client';
import { chw255ToRgba, maskToNchw1, rgbaToNchw } from './tensor';
import {
  isWorthCropping,
  maskBounds,
  tileRegionsForMask,
  type Rect,
} from './inpaint-crop';

/**
 * Remove the content under a user-painted mask and fill it in with an
 * AI-generated, context-aware fill (LaMa inpainting).
 *
 * LaMa accepts a fixed square input (512²). Feeding the whole downscaled image
 * makes fills soft; instead we crop the mask's neighbourhood. For an elongated
 * target (a post, a wire) a single square crop is still huge and low-res, so we
 * split the mask's bounding box into near-square TILES and inpaint each at high
 * effective resolution, compositing them back. Small compact masks are a single
 * tile; large/spread masks fall back to whole-image.
 */
export async function inpaint(
  modelId: string,
  bitmap: ImageBitmap,
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

  const bounds = maskBounds(maskAlphaFull, w, h);

  // Output starts as the original image; each processed tile is pasted in.
  const out = new OffscreenCanvas(w, h);
  const outCtx = out.getContext('2d');
  if (!outCtx) throw new Error('2D context unavailable.');
  outCtx.drawImage(bitmap, 0, 0);

  if (!bounds) {
    // Nothing painted — return original unchanged.
    return out.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
  }

  // Decide tiles: near-square small masks -> 1 tile; elongated -> several;
  // very large/spread -> whole image.
  const singleCrop = tileRegionsForMask(bounds, w, h);
  const tiles: Rect[] =
    singleCrop.length === 1 && !isWorthCropping(singleCrop[0]!, w, h)
      ? [{ x: 0, y: 0, width: w, height: h }]
      : singleCrop;

  // Process each tile: crop image+mask into the model square, run LaMa, paste
  // the masked fill back (mask-clipped with a soft edge to blend seams).
  for (const region of tiles) {
    // Skip tiles that contain no mask (can happen at padded ends).
    const imgCanvas = new OffscreenCanvas(size, size);
    const imgCtx = imgCanvas.getContext('2d');
    if (!imgCtx) throw new Error('2D context unavailable.');
    imgCtx.drawImage(bitmap, region.x, region.y, region.width, region.height, 0, 0, size, size);
    const imgRgba = imgCtx.getImageData(0, 0, size, size).data;

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
    let any = false;
    for (let i = 0; i < maskAlpha.length; i++) {
      const a = maskRgba[i * 4 + 3] ?? 0;
      maskAlpha[i] = a;
      if (a > 0) any = true;
    }
    if (!any) continue; // no mask in this tile

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

    const filledSmall = new OffscreenCanvas(size, size);
    const filledSmallCtx = filledSmall.getContext('2d');
    if (!filledSmallCtx) throw new Error('2D context unavailable.');
    filledSmallCtx.putImageData(new ImageData(new Uint8ClampedArray(filledRgba), size, size), 0, 0);

    const filledRegion = new OffscreenCanvas(region.width, region.height);
    const frCtx = filledRegion.getContext('2d');
    if (!frCtx) throw new Error('2D context unavailable.');
    frCtx.imageSmoothingEnabled = true;
    frCtx.drawImage(filledSmall, 0, 0, region.width, region.height);

    // Clip fill to the mask (soft edge) so only erased pixels change.
    frCtx.globalCompositeOperation = 'destination-in';
    frCtx.filter = 'blur(2px)';
    frCtx.drawImage(
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
    frCtx.filter = 'none';

    outCtx.drawImage(filledRegion, region.x, region.y);
  }

  return out.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
}
