import { describe, expect, it } from 'vitest';
import { clampView, fitView, IDENTITY, MAX_K, MIN_K, wheelFactor, zoomAround } from './viewportMath';

describe('枠に合わせて全体を入れる', () => {
  it('大きい図は、全体が入るまで縮める', () => {
    const view = fitView({ w: 400, h: 300 }, { w: 800, h: 300 });
    expect(view.k).toBe(0.5);
    expect(800 * view.k).toBeLessThanOrEqual(400);
    expect(300 * view.k).toBeLessThanOrEqual(300);
  });

  it('縦に長い図は縦で決まる', () => {
    const view = fitView({ w: 400, h: 300 }, { w: 400, h: 1200 });
    expect(view.k).toBe(0.25);
    // 横は真ん中に寄せる
    expect(view.x).toBe((400 - 400 * 0.25) / 2);
    expect(view.y).toBe(0);
  });

  it('小さい図は等倍のまま', () => {
    expect(fitView({ w: 800, h: 600 }, { w: 200, h: 100 }).k).toBe(1);
  });

  it('大きさが分からないうちは等倍', () => {
    expect(fitView({ w: 0, h: 0 }, { w: 100, h: 100 })).toBe(IDENTITY);
  });
});

describe('拡大縮小と移動', () => {
  it('ポインタの下の一点は動かない', () => {
    const before = { k: 1, x: 10, y: 20 };
    const after = zoomAround(before, 2, 110, 120);
    // (110,120) にあった図の点は、拡大後も (110,120) にある
    const pointBefore = { x: (110 - before.x) / before.k, y: (120 - before.y) / before.k };
    expect(pointBefore.x * after.k + after.x).toBeCloseTo(110);
    expect(pointBefore.y * after.k + after.y).toBeCloseTo(120);
  });

  it('拡大率には上限と下限がある', () => {
    expect(zoomAround({ k: MAX_K, x: 0, y: 0 }, 2, 0, 0).k).toBe(MAX_K);
    expect(zoomAround({ k: MIN_K, x: 0, y: 0 }, 0.5, 0, 0).k).toBe(MIN_K);
  });

  it('上へ回すと拡大、下へ回すと縮小', () => {
    expect(wheelFactor(-100)).toBeGreaterThan(1);
    expect(wheelFactor(100)).toBeLessThan(1);
  });

  it('図を枠の外へ投げ飛ばしても、端が枠の中に残る', () => {
    const frame = { w: 400, h: 300 };
    const content = { w: 400, h: 300 };
    const far = clampView({ k: 1, x: 10000, y: -10000 }, frame, content);
    expect(far.x).toBeLessThanOrEqual(frame.w - 48);
    expect(far.y + content.h).toBeGreaterThanOrEqual(48);
  });
});
