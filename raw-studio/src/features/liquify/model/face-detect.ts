import type { CropRect } from '@/types';
import { MODELS, segment } from '@/features/ai';
import {
  estimateLandmarksFromFaceBox,
  faceBoxFromSubject,
  mapBoxToCrop,
  maskBounds,
  type FaceLandmarks,
} from './face-reshape';

/**
 * Estimate face landmarks for the current image. This reuses the on-device
 * subject segmentation to find the subject, derives a face box from it, and
 * places landmarks by portrait proportions.
 *
 * This is an approximation, not a true facial-landmark model: it targets the
 * statistically-likely eye and jaw regions of a roughly centered, frontal
 * portrait. A real landmark model can drop in behind the same
 * {@link FaceLandmarks} interface later (see the manual refinement in #3). The
 * segmentation run itself needs a browser/worker and is not exercised in the
 * headless test environment.
 */
export async function detectFaceLandmarks(
  bitmap: ImageBitmap,
  crop: CropRect,
): Promise<FaceLandmarks | null> {
  const model = MODELS['u2netp-subject'];
  if (!model) return null;
  const seg = await segment(model.id, bitmap);
  const subjectFull = maskBounds(seg.mask, seg.size, seg.size);
  if (!subjectFull) return null;
  const subjectCropped = mapBoxToCrop(subjectFull, crop);
  const faceBox = faceBoxFromSubject(subjectCropped);
  return estimateLandmarksFromFaceBox(faceBox);
}
