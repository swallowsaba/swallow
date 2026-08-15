import type { CropRect } from '@/types';
import { MODELS, getModel, runModelRaw, segment } from '@/features/ai';
import type { ModelDef } from '@/features/ai';
import {
  estimateLandmarksFromFaceBox,
  faceBoxFromSubject,
  mapBoxToCrop,
  maskBounds,
  type Box,
  type FaceLandmarks,
} from './face-reshape';
import {
  decodeCropLandmarks,
  landmarksFromCropPoints,
  selectLandmarks,
  type LandmarkChoice,
  type LandmarkLayout,
} from './landmark-decode';

/**
 * Face-landmark detection with a graceful fallback.
 *
 * 1. The on-device subject segmentation locates the subject; a face box is
 *    derived from it and landmarks are estimated by portrait proportions.
 * 2. If a real facial-landmark model is registered (kind:'landmark' with a
 *    layout below), it is run on the face crop and its output decoded; the
 *    result is used only if it passes plausibility, otherwise the proportion
 *    estimate is kept.
 *
 * No landmark model ships by default: a real model's exact I/O tensor names and
 * point indices must be verified against its model card, and shipping guessed
 * values would silently misalign the reshape. To enable real landmarks, add a
 * `kind:'landmark'` entry to the AI model registry and its point layout to
 * LANDMARK_LAYOUTS below — the decode/mapping/plausibility pipeline is already
 * complete and unit-tested. Until then the app uses the estimate.
 */

/** Point layouts keyed by model id. Fill this in when adding a real model. */
const LANDMARK_LAYOUTS: Record<string, LandmarkLayout> = {
  // Example (PFLD-98, WFLW indices) — VERIFY against the model card before use:
  // 'face-landmark': {
  //   count: 98, normalized: true, order: 'xy',
  //   leftEye: 96, rightEye: 97, jawLeft: 0, jawRight: 32, chin: 16,
  // },
};

/** The registered landmark model, if any (none by default). */
function getLandmarkModel(): { model: ModelDef; layout: LandmarkLayout } | null {
  for (const id of Object.keys(LANDMARK_LAYOUTS)) {
    const model = getModel(id);
    const layout = LANDMARK_LAYOUTS[id];
    if (model && model.kind === 'landmark' && layout) return { model, layout };
  }
  return null;
}

/** Draw the face region (given in cropped-image space) into a square RGBA. */
function faceCropRgba(
  bitmap: ImageBitmap,
  faceBox: Box,
  crop: CropRect,
  size: number,
): Uint8ClampedArray {
  const fullX = (crop.x + faceBox.x * crop.width) * bitmap.width;
  const fullY = (crop.y + faceBox.y * crop.height) * bitmap.height;
  const fullW = Math.max(1, faceBox.w * crop.width * bitmap.width);
  const fullH = Math.max(1, faceBox.h * crop.height * bitmap.height);
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable.');
  ctx.drawImage(bitmap, fullX, fullY, fullW, fullH, 0, 0, size, size);
  return ctx.getImageData(0, 0, size, size).data;
}

/** Run the landmark model over the face crop; returns landmarks or null. */
async function runLandmarkModel(
  bitmap: ImageBitmap,
  faceBox: Box,
  crop: CropRect,
  model: ModelDef,
  layout: LandmarkLayout,
): Promise<FaceLandmarks | null> {
  const rgba = faceCropRgba(bitmap, faceBox, crop, model.inputSize);
  const raw = await runModelRaw(model, rgba);
  const pts = decodeCropLandmarks(raw, layout, model.inputSize);
  if (!pts) return null;
  return landmarksFromCropPoints(pts, faceBox);
}

/**
 * Detect face landmarks for the current image, returning both the landmarks and
 * whether they came from a real model or the proportion estimate. Returns null
 * only when no subject could be found at all.
 */
export async function detectFaceLandmarks(
  bitmap: ImageBitmap,
  crop: CropRect,
): Promise<LandmarkChoice | null> {
  const subjectModel = MODELS['u2netp-subject'];
  if (!subjectModel) return null;
  const seg = await segment(subjectModel.id, bitmap);
  const subjectFull = maskBounds(seg.mask, seg.size, seg.size);
  if (!subjectFull) return null;
  const subjectCropped = mapBoxToCrop(subjectFull, crop);
  const faceBox = faceBoxFromSubject(subjectCropped);
  const estimate = estimateLandmarksFromFaceBox(faceBox);

  const registered = getLandmarkModel();
  if (registered) {
    try {
      const model = await runLandmarkModel(
        bitmap,
        faceBox,
        crop,
        registered.model,
        registered.layout,
      );
      return selectLandmarks(model, estimate);
    } catch {
      return { landmarks: estimate, source: 'estimate' };
    }
  }
  return { landmarks: estimate, source: 'estimate' };
}
