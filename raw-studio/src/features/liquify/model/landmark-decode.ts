import type { Box, FaceLandmarks } from './face-reshape';

/**
 * Pure decoding of a face-landmark model's raw output into {@link FaceLandmarks},
 * plus mapping from the face-crop space into the cropped-image space, a
 * plausibility gate, and the model-vs-estimate selection. The model run itself
 * is impure and unverified in this environment; keeping the fiddly format and
 * coordinate math here means it is deterministic and unit-tested, and the
 * plausibility gate lets the caller fall back to the proportion estimate when a
 * model is missing or returns something unreasonable.
 */

export interface LandmarkLayout {
  /** Number of (x,y) points the model emits. */
  readonly count: number;
  /** True if coords are already 0..1; false if they are pixels in inputSize. */
  readonly normalized: boolean;
  /** Interleaving of each point in the flat output. */
  readonly order: 'xy' | 'yx';
  /** 0-based indices of the semantic points within the point list. */
  readonly leftEye: number;
  readonly rightEye: number;
  readonly jawLeft: number;
  readonly jawRight: number;
  readonly chin: number;
}

export interface CropPoints {
  readonly leftEye: { x: number; y: number };
  readonly rightEye: { x: number; y: number };
  readonly jawLeft: { x: number; y: number };
  readonly jawRight: { x: number; y: number };
  readonly chin: { x: number; y: number };
}

/** Read point `idx` from a flat output, normalized to 0..1, or null if out of range. */
export function readPoint(
  raw: Float32Array | readonly number[],
  layout: LandmarkLayout,
  inputSize: number,
  idx: number,
): { x: number; y: number } | null {
  if (idx < 0 || idx >= layout.count) return null;
  const base = idx * 2;
  if (base + 1 >= raw.length) return null;
  const a = raw[base] ?? 0;
  const b = raw[base + 1] ?? 0;
  const rawX = layout.order === 'xy' ? a : b;
  const rawY = layout.order === 'xy' ? b : a;
  const scale = layout.normalized ? 1 : 1 / Math.max(1, inputSize);
  return { x: rawX * scale, y: rawY * scale };
}

/** Decode the five semantic points (in face-crop 0..1 space), or null. */
export function decodeCropLandmarks(
  raw: Float32Array | readonly number[],
  layout: LandmarkLayout,
  inputSize: number,
): CropPoints | null {
  const leftEye = readPoint(raw, layout, inputSize, layout.leftEye);
  const rightEye = readPoint(raw, layout, inputSize, layout.rightEye);
  const jawLeft = readPoint(raw, layout, inputSize, layout.jawLeft);
  const jawRight = readPoint(raw, layout, inputSize, layout.jawRight);
  const chin = readPoint(raw, layout, inputSize, layout.chin);
  if (!leftEye || !rightEye || !jawLeft || !jawRight || !chin) return null;
  return { leftEye, rightEye, jawLeft, jawRight, chin };
}

/** Map a face-crop-normalized point into the cropped-image's normalized space. */
export function cropPointToImage(
  p: { x: number; y: number },
  faceBox: Box,
): { x: number; y: number } {
  return { x: faceBox.x + p.x * faceBox.w, y: faceBox.y + p.y * faceBox.h };
}

/** Assemble full {@link FaceLandmarks} (cropped-image space) from crop points. */
export function landmarksFromCropPoints(pts: CropPoints, faceBox: Box): FaceLandmarks {
  const leftEye = cropPointToImage(pts.leftEye, faceBox);
  const rightEye = cropPointToImage(pts.rightEye, faceBox);
  const dist = Math.hypot(rightEye.x - leftEye.x, rightEye.y - leftEye.y);
  return {
    box: faceBox,
    leftEye,
    rightEye,
    eyeRadius: Math.max(0.01, dist * 0.35),
    jawLeft: cropPointToImage(pts.jawLeft, faceBox),
    jawRight: cropPointToImage(pts.jawRight, faceBox),
    chin: cropPointToImage(pts.chin, faceBox),
  };
}

function inUnit(p: { x: number; y: number }): boolean {
  return p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;
}

/**
 * Reject landmarks that don't look like a real, roughly upright face — used to
 * decide whether to trust a model's output over the proportion estimate.
 */
export function plausibleLandmarks(lm: FaceLandmarks): boolean {
  const pts = [lm.leftEye, lm.rightEye, lm.jawLeft, lm.jawRight, lm.chin];
  if (!pts.every(inUnit)) return false;
  if (lm.eyeRadius <= 0) return false;
  if (lm.leftEye.x >= lm.rightEye.x) return false; // left eye left of right eye
  if (lm.jawLeft.x >= lm.jawRight.x) return false; // jaw ordering
  const eyeY = (lm.leftEye.y + lm.rightEye.y) / 2;
  if (eyeY >= lm.chin.y) return false; // eyes above the chin
  if (eyeY >= (lm.jawLeft.y + lm.jawRight.y) / 2) return false; // eyes above the jaw
  return true;
}

export interface LandmarkChoice {
  readonly landmarks: FaceLandmarks;
  readonly source: 'model' | 'estimate';
}

/** Prefer the model's landmarks when present and plausible, else the estimate. */
export function selectLandmarks(
  model: FaceLandmarks | null,
  estimate: FaceLandmarks,
): LandmarkChoice {
  if (model && plausibleLandmarks(model)) return { landmarks: model, source: 'model' };
  return { landmarks: estimate, source: 'estimate' };
}
