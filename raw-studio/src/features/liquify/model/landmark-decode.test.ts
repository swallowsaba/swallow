import { describe, expect, it } from 'vitest';
import type { Box, FaceLandmarks } from './face-reshape';
import { estimateLandmarksFromFaceBox } from './face-reshape';
import {
  cropPointToImage,
  decodeCropLandmarks,
  landmarksFromCropPoints,
  plausibleLandmarks,
  readPoint,
  selectLandmarks,
  type LandmarkLayout,
} from './landmark-decode';

const LAYOUT: LandmarkLayout = {
  count: 5,
  normalized: true,
  order: 'xy',
  leftEye: 0,
  rightEye: 1,
  jawLeft: 2,
  jawRight: 3,
  chin: 4,
};

// 5 points (xy, normalized): leftEye, rightEye, jawLeft, jawRight, chin.
const RAW = [0.35, 0.4, 0.65, 0.4, 0.1, 0.6, 0.9, 0.6, 0.5, 0.95];
const FACE: Box = { x: 0.3, y: 0.1, w: 0.4, h: 0.4 };

describe('readPoint', () => {
  it('reads xy normalized', () => {
    expect(readPoint(RAW, LAYOUT, 256, 0)).toEqual({ x: 0.35, y: 0.4 });
    expect(readPoint(RAW, LAYOUT, 256, 4)).toEqual({ x: 0.5, y: 0.95 });
  });
  it('handles yx order and pixel scaling', () => {
    const yx: LandmarkLayout = { ...LAYOUT, order: 'yx', normalized: false };
    const px = [40, 35]; // y=40, x=35 in a 100px input
    const p = readPoint(px, { ...yx, count: 1 }, 100, 0);
    expect(p?.x).toBeCloseTo(0.35, 6);
    expect(p?.y).toBeCloseTo(0.4, 6);
  });
  it('returns null out of range', () => {
    expect(readPoint(RAW, LAYOUT, 256, 9)).toBeNull();
    expect(readPoint([0.1], LAYOUT, 256, 0)).toBeNull();
  });
});

describe('decodeCropLandmarks', () => {
  it('decodes all five points', () => {
    const pts = decodeCropLandmarks(RAW, LAYOUT, 256);
    expect(pts).not.toBeNull();
    expect(pts?.leftEye).toEqual({ x: 0.35, y: 0.4 });
    expect(pts?.chin).toEqual({ x: 0.5, y: 0.95 });
  });
  it('returns null when the array is too short', () => {
    expect(decodeCropLandmarks([0.1, 0.2], LAYOUT, 256)).toBeNull();
  });
});

describe('cropPointToImage + landmarksFromCropPoints', () => {
  it('maps crop coords into the face box', () => {
    const p = cropPointToImage({ x: 0.5, y: 0.5 }, FACE);
    expect(p.x).toBeCloseTo(FACE.x + 0.2, 6);
    expect(p.y).toBeCloseTo(FACE.y + 0.2, 6);
  });
  it('builds landmarks with a positive eye radius', () => {
    const pts = decodeCropLandmarks(RAW, LAYOUT, 256)!;
    const lm = landmarksFromCropPoints(pts, FACE);
    expect(lm.leftEye.x).toBeLessThan(lm.rightEye.x);
    expect(lm.eyeRadius).toBeGreaterThan(0);
    expect(lm.box).toEqual(FACE);
  });
});

describe('plausibleLandmarks', () => {
  it('accepts the proportion estimate', () => {
    expect(plausibleLandmarks(estimateLandmarksFromFaceBox(FACE))).toBe(true);
  });
  it('accepts decoded model landmarks that look face-like', () => {
    const lm = landmarksFromCropPoints(decodeCropLandmarks(RAW, LAYOUT, 256)!, FACE);
    expect(plausibleLandmarks(lm)).toBe(true);
  });
  it('rejects swapped eyes', () => {
    const lm = estimateLandmarksFromFaceBox(FACE);
    const swapped: FaceLandmarks = { ...lm, leftEye: lm.rightEye, rightEye: lm.leftEye };
    expect(plausibleLandmarks(swapped)).toBe(false);
  });
  it('rejects out-of-frame points', () => {
    const lm = estimateLandmarksFromFaceBox(FACE);
    const bad: FaceLandmarks = { ...lm, chin: { x: 1.5, y: 0.9 } };
    expect(plausibleLandmarks(bad)).toBe(false);
  });
  it('rejects eyes below the chin', () => {
    const lm = estimateLandmarksFromFaceBox(FACE);
    const bad: FaceLandmarks = {
      ...lm,
      leftEye: { x: lm.leftEye.x, y: 0.99 },
      rightEye: { x: lm.rightEye.x, y: 0.99 },
    };
    expect(plausibleLandmarks(bad)).toBe(false);
  });
});

describe('selectLandmarks', () => {
  const estimate = estimateLandmarksFromFaceBox(FACE);
  it('uses the model when plausible', () => {
    const model = landmarksFromCropPoints(decodeCropLandmarks(RAW, LAYOUT, 256)!, FACE);
    const choice = selectLandmarks(model, estimate);
    expect(choice.source).toBe('model');
    expect(choice.landmarks).toBe(model);
  });
  it('falls back to the estimate when the model is null', () => {
    const choice = selectLandmarks(null, estimate);
    expect(choice.source).toBe('estimate');
    expect(choice.landmarks).toBe(estimate);
  });
  it('falls back when the model output is implausible', () => {
    const bad: FaceLandmarks = { ...estimate, leftEye: estimate.rightEye, rightEye: estimate.leftEye };
    const choice = selectLandmarks(bad, estimate);
    expect(choice.source).toBe('estimate');
  });
});
