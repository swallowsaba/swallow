import type { WarpOp } from '@/types';
import { defaultPushOp, radialOp } from './warp-field';

/**
 * Pure face-reshape logic. It turns a compact set of face landmarks plus a few
 * intensity params into liquify {@link WarpOp}s — bigger eyes, a slimmer
 * jawline. Everything here is deterministic and unit-tested; obtaining the
 * landmarks (a model, or an estimate from the subject mask) is separate.
 *
 * Coordinates are normalized 0..1 in the cropped image's space.
 */

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface FaceLandmarks {
  readonly box: Box;
  readonly leftEye: { readonly x: number; readonly y: number };
  readonly rightEye: { readonly x: number; readonly y: number };
  /** Approximate eye radius (normalized). */
  readonly eyeRadius: number;
  readonly jawLeft: { readonly x: number; readonly y: number };
  readonly jawRight: { readonly x: number; readonly y: number };
  readonly chin: { readonly x: number; readonly y: number };
}

export interface FaceReshapeParams {
  /** Enlarge the eyes, 0..1. */
  readonly eyeSize: number;
  /** Slim the jawline inward, 0..1. */
  readonly faceSlim: number;
}

export const DEFAULT_FACE_RESHAPE: FaceReshapeParams = { eyeSize: 0.5, faceSlim: 0.4 };

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/**
 * Estimate landmarks from a face bounding box using average frontal-portrait
 * proportions. This is a heuristic (not a true eye detector): eyes sit at ~42%
 * of the face height and ~±23% from center; the jaw points sit lower and wide.
 * Good enough to target the eye and jaw regions for reshaping.
 */
export function estimateLandmarksFromFaceBox(box: Box): FaceLandmarks {
  const cx = box.x + box.w / 2;
  const eyeY = box.y + box.h * 0.42;
  const jawY = box.y + box.h * 0.72;
  return {
    box,
    leftEye: { x: cx - box.w * 0.23, y: eyeY },
    rightEye: { x: cx + box.w * 0.23, y: eyeY },
    eyeRadius: box.w * 0.09,
    jawLeft: { x: box.x + box.w * 0.06, y: jawY },
    jawRight: { x: box.x + box.w * 0.94, y: jawY },
    chin: { x: cx, y: box.y + box.h },
  };
}

/**
 * Turn landmarks + params into warp ops. Eyes bloat outward to enlarge; the jaw
 * points push horizontally toward the face center to slim. Returns an empty
 * list when both intensities are ~0.
 */
export function proposeFaceReshape(
  landmarks: FaceLandmarks,
  params: FaceReshapeParams,
): WarpOp[] {
  const ops: WarpOp[] = [];
  const eyeSize = clamp01(params.eyeSize);
  const faceSlim = clamp01(params.faceSlim);
  const cx = landmarks.box.x + landmarks.box.w / 2;

  if (eyeSize > 0.001) {
    const r = Math.max(0.01, landmarks.eyeRadius * 2.2);
    const s = eyeSize * 0.6;
    ops.push(radialOp('bloat', landmarks.leftEye.x, landmarks.leftEye.y, r, s));
    ops.push(radialOp('bloat', landmarks.rightEye.x, landmarks.rightEye.y, r, s));
  }

  if (faceSlim > 0.001) {
    const r = Math.max(0.02, landmarks.box.w * 0.42);
    const s = faceSlim * 0.5;
    // Push each jaw point horizontally toward the face center.
    const leftDx = (cx - landmarks.jawLeft.x) * 0.5;
    const rightDx = (cx - landmarks.jawRight.x) * 0.5;
    ops.push(defaultPushOp(landmarks.jawLeft.x, landmarks.jawLeft.y, leftDx, 0, r, s));
    ops.push(defaultPushOp(landmarks.jawRight.x, landmarks.jawRight.y, rightDx, 0, r, s));
  }

  return ops;
}

/* --------------------- face box from a subject mask --------------------- */

/** Tight bounding box (normalized) of the pixels in an alpha mask above a
 *  coverage threshold. Returns null if nothing is covered. */
export function maskBounds(
  alpha: Uint8ClampedArray,
  width: number,
  height: number,
  threshold = 128,
): Box | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if ((alpha[y * width + x] ?? 0) >= threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0 || maxY < 0) return null;
  return {
    x: minX / width,
    y: minY / height,
    w: (maxX - minX + 1) / width,
    h: (maxY - minY + 1) / height,
  };
}

/**
 * Estimate a face box from a subject bounding box: for a roughly centered
 * portrait the face is the upper, horizontally-narrower part of the subject.
 * Heuristic — refined later by a real landmark model (see #3).
 */
export function faceBoxFromSubject(subject: Box): Box {
  const faceW = subject.w * 0.62;
  const faceH = subject.h * 0.38;
  return {
    x: subject.x + (subject.w - faceW) / 2,
    y: subject.y,
    w: faceW,
    h: faceH,
  };
}

/** Map a box from full-image normalized space into the cropped image's space. */
export function mapBoxToCrop(
  box: Box,
  crop: { x: number; y: number; width: number; height: number },
): Box {
  return {
    x: (box.x - crop.x) / crop.width,
    y: (box.y - crop.y) / crop.height,
    w: box.w / crop.width,
    h: box.h / crop.height,
  };
}

/* ----------------------- manual landmark refinement ---------------------- */

/** The draggable landmark points, for manual refinement of the auto estimate. */
export type LandmarkPoint = 'leftEye' | 'rightEye' | 'jawLeft' | 'jawRight' | 'chin';

export const LANDMARK_POINTS: readonly LandmarkPoint[] = [
  'leftEye',
  'rightEye',
  'jawLeft',
  'jawRight',
  'chin',
];

/** Read a landmark point's position. */
export function landmarkPoint(
  lm: FaceLandmarks,
  id: LandmarkPoint,
): { x: number; y: number } {
  return lm[id];
}

/**
 * Move one landmark point to (x,y) (clamped to 0..1). Moving an eye also keeps
 * the eye radius in sync with the inter-eye distance so bloats stay proportional
 * to how far apart the eyes are placed.
 */
export function moveLandmark(
  lm: FaceLandmarks,
  id: LandmarkPoint,
  x: number,
  y: number,
): FaceLandmarks {
  const px = clamp01(x);
  const py = clamp01(y);
  const next: FaceLandmarks = { ...lm, [id]: { x: px, y: py } };
  if (id === 'leftEye' || id === 'rightEye') {
    const dist = Math.hypot(next.rightEye.x - next.leftEye.x, next.rightEye.y - next.leftEye.y);
    return { ...next, eyeRadius: Math.max(0.01, dist * 0.35) };
  }
  return next;
}

/**
 * Hit-test the landmark points, returning the nearest within `tolerance`
 * (normalized distance) or null. Eyes are preferred on ties since they sit
 * close together.
 */
export function pickLandmark(
  lm: FaceLandmarks,
  x: number,
  y: number,
  tolerance: number,
): LandmarkPoint | null {
  let best: LandmarkPoint | null = null;
  let bestDist = tolerance;
  for (const id of LANDMARK_POINTS) {
    const p = lm[id];
    const d = Math.hypot(p.x - x, p.y - y);
    if (d <= bestDist) {
      bestDist = d;
      best = id;
    }
  }
  return best;
}
