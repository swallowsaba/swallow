import { describe, expect, it } from 'vitest';
import { computeAutoGrade } from './auto-grade';
import type { ImageStats } from './image-stats';

const NEUTRAL_STATS: ImageStats = {
  meanR: 0.45,
  meanG: 0.45,
  meanB: 0.45,
  medianLuma: 0.45,
  p01: 0.02,
  p99: 0.98,
  meanSat: 0.32,
  sampleCount: 1000,
};

const WARM_LOWCONTRAST_STATS: ImageStats = {
  meanR: 0.6,
  meanG: 0.5,
  meanB: 0.3,
  medianLuma: 0.5,
  p01: 0.2,
  p99: 0.8,
  meanSat: 0.15,
  sampleCount: 1000,
};

describe('computeAutoGrade', () => {
  it('always applies the style tone curve (shadow lift + highlight rolloff)', () => {
    const grade = computeAutoGrade(NEUTRAL_STATS);
    const points = grade.toneCurves?.rgb;
    expect(points).toBeDefined();
    expect(points?.length).toBe(5);
    const shadowPoint = points?.find((p) => p.x === 0.25);
    expect(shadowPoint?.y).toBeGreaterThan(0.25);
    const highlightPoint = points?.find((p) => p.x === 0.75);
    expect(highlightPoint?.y).toBeLessThan(0.75);
  });

  it('trades saturation for vibrance (muted overall, rich key colors)', () => {
    const grade = computeAutoGrade(NEUTRAL_STATS);
    expect(grade.basic?.saturation).toBeLessThan(0);
    expect(grade.basic?.vibrance).toBeGreaterThan(0);
  });

  it('a near-neutral photo gets a small corrective exposure/WB nudge', () => {
    const grade = computeAutoGrade(NEUTRAL_STATS);
    expect(Math.abs(grade.basic?.exposure ?? 0)).toBeLessThan(0.5);
    expect(Math.abs(grade.basic?.temperature ?? 0)).toBeLessThan(20);
  });

  it('a warm, low-contrast photo gets meaningfully corrected on top of the style', () => {
    const grade = computeAutoGrade(WARM_LOWCONTRAST_STATS);
    expect(grade.basic?.temperature ?? 0).toBeLessThan(0);
    expect(grade.basic?.contrast ?? 0).toBeGreaterThan(10);
  });

  it('all numeric basic fields stay within the -300..300 slider range', () => {
    const grade = computeAutoGrade(WARM_LOWCONTRAST_STATS);
    const basic = grade.basic ?? {};
    for (const key of Object.keys(basic) as (keyof typeof basic)[]) {
      const v = basic[key];
      if (typeof v === 'number') {
        expect(v).toBeGreaterThanOrEqual(-300);
        expect(v).toBeLessThanOrEqual(300);
      }
    }
  });
});
