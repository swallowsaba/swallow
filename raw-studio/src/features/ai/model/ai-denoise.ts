import { getDenoiseModelId, getModel } from './model-registry';
import { isMobileDevice, runRestorationModel } from './ai-restore';

export { isMobileDevice } from './ai-restore';

/**
 * AI denoise a photo with SCUNet (or the device-appropriate denoise model),
 * entirely on-device. Delegates to the shared restoration runner.
 */
export async function aiDenoise(
  bitmap: ImageBitmap,
  opts: { mobile?: boolean } = {},
  onProgress?: (received: number, total: number) => void,
): Promise<Blob> {
  const mobile = opts.mobile ?? isMobileDevice();
  const model = getModel(getDenoiseModelId(mobile));
  if (!model || model.kind !== 'denoise') throw new Error('Denoise model missing.');
  return runRestorationModel(model, bitmap, mobile, onProgress);
}
