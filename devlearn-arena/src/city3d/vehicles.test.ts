import { describe, expect, it } from 'vitest';
import { CAR_COLORS } from './palette';
import { CAR_PARTS, carColor, carPartGeometry } from './vehicles';

/** 車（REWORK 7-1）。箱 1 つで済ませず、見て車と分かる部品を持つ */
describe('車の形', () => {
  it('部品が 7 つ以上ある', () => {
    expect(CAR_PARTS.length).toBeGreaterThanOrEqual(7);
  });

  it('車体・窓付きの運転席・タイヤ 4 つ・前照灯を持つ', () => {
    const names = CAR_PARTS.map((p) => p.name);
    expect(names).toContain('body');
    expect(CAR_PARTS.find((p) => p.name === 'cabin')?.surface).toBe('carGlass');
    expect(CAR_PARTS.filter((p) => p.shape === 'wheel')).toHaveLength(4);
    expect(CAR_PARTS.filter((p) => p.surface === 'headlight').length).toBeGreaterThanOrEqual(2);
  });

  it('タイヤは車体の四隅に付き、地面に接している', () => {
    const wheels = CAR_PARTS.filter((p) => p.shape === 'wheel');
    const corners = new Set(wheels.map((w) => `${String(Math.sign(w.at[0]))},${String(Math.sign(w.at[2]))}`));
    expect(corners.size).toBe(4);
    for (const wheel of wheels) expect(wheel.at[1] - wheel.size[0] / 2).toBeCloseTo(0, 5);
  });

  it('前照灯は前（+z）、尾灯は後ろにある', () => {
    for (const p of CAR_PARTS.filter((q) => q.surface === 'headlight')) expect(p.at[2]).toBeGreaterThan(0);
    for (const p of CAR_PARTS.filter((q) => q.surface === 'taillight')) expect(p.at[2]).toBeLessThan(0);
  });

  it('部品ごとに形が作れ、その部品の位置に置かれる', () => {
    for (const part of CAR_PARTS) {
      const geometry = carPartGeometry(part);
      geometry.computeBoundingBox();
      const box = geometry.boundingBox;
      expect(box).not.toBeNull();
      if (box === null) continue;
      expect((box.min.y + box.max.y) / 2).toBeCloseTo(part.at[1], 3);
      expect((box.min.z + box.max.z) / 2).toBeCloseTo(part.at[2], 3);
    }
  });

  it('色は数種類あり、番号から必ずどれかに決まる', () => {
    expect(CAR_COLORS.length).toBeGreaterThanOrEqual(4);
    const seen = new Set([0, 1, 2, 3, 4, 5, 6, -1, 13].map(carColor));
    expect(seen.size).toBe(CAR_COLORS.length);
  });
});
