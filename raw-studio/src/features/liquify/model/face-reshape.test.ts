import { describe, expect, it } from 'vitest';
import type { Box } from './face-reshape';
import {
  DEFAULT_FACE_RESHAPE,
  estimateLandmarksFromFaceBox,
  faceBoxFromSubject,
  maskBounds,
  moveLandmark,
  pickLandmark,
  proposeFaceReshape,
} from './face-reshape';

const BOX: Box = { x: 0.3, y: 0.1, w: 0.4, h: 0.4 };

describe('estimateLandmarksFromFaceBox', () => {
  it('places eyes symmetrically about the face center', () => {
    const lm = estimateLandmarksFromFaceBox(BOX);
    const cx = BOX.x + BOX.w / 2;
    expect(lm.leftEye.x).toBeLessThan(cx);
    expect(lm.rightEye.x).toBeGreaterThan(cx);
    expect(cx - lm.leftEye.x).toBeCloseTo(lm.rightEye.x - cx, 6);
    expect(lm.leftEye.y).toBeCloseTo(lm.rightEye.y, 6);
    expect(lm.eyeRadius).toBeGreaterThan(0);
  });

  it('places jaw points wide and the chin at the bottom center', () => {
    const lm = estimateLandmarksFromFaceBox(BOX);
    expect(lm.jawLeft.x).toBeLessThan(lm.leftEye.x);
    expect(lm.jawRight.x).toBeGreaterThan(lm.rightEye.x);
    expect(lm.chin.y).toBeCloseTo(BOX.y + BOX.h, 6);
    expect(lm.chin.x).toBeCloseTo(BOX.x + BOX.w / 2, 6);
  });
});

describe('proposeFaceReshape', () => {
  const lm = estimateLandmarksFromFaceBox(BOX);
  const cx = BOX.x + BOX.w / 2;

  it('returns nothing when both intensities are 0', () => {
    expect(proposeFaceReshape(lm, { eyeSize: 0, faceSlim: 0 })).toEqual([]);
  });

  it('adds two bloat ops at the eyes for eyeSize', () => {
    const ops = proposeFaceReshape(lm, { eyeSize: 1, faceSlim: 0 });
    expect(ops.length).toBe(2);
    expect(ops.every((o) => o.tool === 'bloat')).toBe(true);
    expect(ops[0]?.x).toBeCloseTo(lm.leftEye.x, 6);
    expect(ops[1]?.x).toBeCloseTo(lm.rightEye.x, 6);
    expect(ops[0]?.strength).toBeGreaterThan(0);
  });

  it('adds two inward push ops at the jaw for faceSlim', () => {
    const ops = proposeFaceReshape(lm, { eyeSize: 0, faceSlim: 1 });
    expect(ops.length).toBe(2);
    expect(ops.every((o) => o.tool === 'push')).toBe(true);
    // Left jaw pushes right (+dx toward center); right jaw pushes left (-dx).
    const left = ops.find((o) => o.x < cx);
    const right = ops.find((o) => o.x > cx);
    expect(left?.dx).toBeGreaterThan(0);
    expect(right?.dx).toBeLessThan(0);
  });

  it('combines eye + jaw ops and clamps params', () => {
    const ops = proposeFaceReshape(lm, { eyeSize: 5, faceSlim: 5 });
    expect(ops.length).toBe(4); // clamped to valid range, still both effects
  });
});

describe('maskBounds', () => {
  it('finds the tight box of covered pixels', () => {
    // 4x4 with the 2x2 bottom-right quadrant covered.
    const a = new Uint8ClampedArray(16);
    for (const [x, y] of [
      [2, 2],
      [3, 2],
      [2, 3],
      [3, 3],
    ] as const) {
      a[y * 4 + x] = 255;
    }
    const b = maskBounds(a, 4, 4);
    expect(b).not.toBeNull();
    expect(b?.x).toBeCloseTo(0.5, 6);
    expect(b?.y).toBeCloseTo(0.5, 6);
    expect(b?.w).toBeCloseTo(0.5, 6);
    expect(b?.h).toBeCloseTo(0.5, 6);
  });

  it('returns null for an empty mask', () => {
    expect(maskBounds(new Uint8ClampedArray(16), 4, 4)).toBeNull();
  });
});

describe('faceBoxFromSubject', () => {
  it('is narrower, shorter and top-aligned within the subject', () => {
    const subject: Box = { x: 0.2, y: 0.1, w: 0.6, h: 0.8 };
    const face = faceBoxFromSubject(subject);
    expect(face.w).toBeLessThan(subject.w);
    expect(face.h).toBeLessThan(subject.h);
    expect(face.y).toBeCloseTo(subject.y, 6);
    // Horizontally centered within the subject.
    expect(face.x + face.w / 2).toBeCloseTo(subject.x + subject.w / 2, 6);
  });
});

describe('DEFAULT_FACE_RESHAPE', () => {
  it('has sensible defaults', () => {
    expect(DEFAULT_FACE_RESHAPE.eyeSize).toBeGreaterThan(0);
    expect(DEFAULT_FACE_RESHAPE.faceSlim).toBeGreaterThan(0);
  });
});

describe('manual landmark refinement', () => {
  const lm = estimateLandmarksFromFaceBox(BOX);

  it('moves a point and clamps to 0..1', () => {
    const m = moveLandmark(lm, 'chin', 1.4, -0.2);
    expect(m.chin.x).toBe(1);
    expect(m.chin.y).toBe(0);
    // Others unchanged.
    expect(m.leftEye).toEqual(lm.leftEye);
  });

  it('keeps eye radius in sync when moving an eye', () => {
    const moved = moveLandmark(lm, 'rightEye', lm.rightEye.x + 0.2, lm.rightEye.y);
    const dist = Math.hypot(
      moved.rightEye.x - moved.leftEye.x,
      moved.rightEye.y - moved.leftEye.y,
    );
    expect(moved.eyeRadius).toBeCloseTo(dist * 0.35, 6);
    expect(moved.eyeRadius).toBeGreaterThan(lm.eyeRadius);
  });

  it('picks the nearest point within tolerance, else null', () => {
    expect(pickLandmark(lm, lm.chin.x, lm.chin.y, 0.05)).toBe('chin');
    expect(pickLandmark(lm, lm.leftEye.x + 0.005, lm.leftEye.y, 0.05)).toBe('leftEye');
    expect(pickLandmark(lm, 0.0, 0.99, 0.02)).toBeNull();
  });

  it('reshape reflects a manually widened jaw', () => {
    // Push the right jaw further out, then propose slim — the op should target
    // the new position.
    const widened = moveLandmark(lm, 'jawRight', 0.9, lm.jawRight.y);
    const ops = proposeFaceReshape(widened, { eyeSize: 0, faceSlim: 1 });
    const right = ops.find((o) => o.tool === 'push' && o.x > BOX.x + BOX.w / 2);
    expect(right?.x).toBeCloseTo(0.9, 6);
  });
});
