import { describe, expect, it } from 'vitest';
import { crowdCount, crowdSpots, placardTone } from './crowd';

describe('反対する人の影（docs/city-design.md 9.1）', () => {
  it('人数は反対率に応じて 0〜6 人', () => {
    expect([0, 0.4, 16.6, 16.7, 33.4, 50, 99, 100, 140].map(crowdCount)).toEqual([0, 1, 1, 2, 3, 3, 6, 6, 6]);
  });

  it('札の色: 20% を超えると警告、50% を超えると赤', () => {
    expect([10, 20, 20.1, 50, 50.1].map(placardTone)).toEqual(['calm', 'calm', 'warn', 'warn', 'bad']);
  });

  it('入口の側（道路の側）の縁の外に、縁を等分して並ぶ', () => {
    // 3×2 を向き 0 で置くと、入口は南（y が大きい側）
    expect(crowdSpots({ origin: { x: 10, y: 20 }, w: 3, d: 2, rotation: 0 }, 2)).toEqual([{ x: 11, y: 22.3 }, { x: 12, y: 22.3 }]);
    // 向き 180 は北
    expect(crowdSpots({ origin: { x: 10, y: 20 }, w: 3, d: 2, rotation: 180 }, 1)).toEqual([{ x: 11.5, y: 19.7 }]);
    // 向き 90 は西、回すと幅と奥行きが入れ替わる（縁の長さは 3）
    expect(crowdSpots({ origin: { x: 10, y: 20 }, w: 3, d: 2, rotation: 90 }, 2)).toEqual([{ x: 9.7, y: 21 }, { x: 9.7, y: 22 }]);
    expect(crowdSpots({ origin: { x: 10, y: 20 }, w: 3, d: 2, rotation: 270 }, 0)).toEqual([]);
  });
});
