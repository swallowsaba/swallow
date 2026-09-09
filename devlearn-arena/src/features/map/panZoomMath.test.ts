import { describe, expect, it } from 'vitest';
import {
  clampK, clampPan, IDENTITY, keyPan, MAX_K, MIN_K, wheelFactor, zoomAt,
} from './panZoomMath';

describe('clampK', () => {
  it('下限と上限で止まる', () => {
    expect(clampK(0.01)).toBe(MIN_K);
    expect(clampK(999)).toBe(MAX_K);
    expect(clampK(2)).toBe(2);
  });
});

describe('clampPan', () => {
  it('等倍では動かす余地がないので中央へ戻る', () => {
    expect(clampPan({ k: 1, x: 300, y: -200 }, 800, 600)).toEqual({ k: 1, x: 0, y: 0 });
  });

  it('拡大した分だけ動かせる', () => {
    // 800px を 2 倍にすると片側 400px ぶんはみ出す
    expect(clampPan({ k: 2, x: 1000, y: 0 }, 800, 600)).toEqual({ k: 2, x: 400, y: 0 });
    expect(clampPan({ k: 2, x: -1000, y: 0 }, 800, 600)).toEqual({ k: 2, x: -400, y: 0 });
    expect(clampPan({ k: 2, x: 100, y: 50 }, 800, 600)).toEqual({ k: 2, x: 100, y: 50 });
  });
});

describe('zoomAt', () => {
  it('中心で拡大すると平行移動は生まれない', () => {
    expect(zoomAt(IDENTITY, 2, 0, 0)).toEqual({ k: 2, x: 0, y: 0 });
  });

  it('指定した点は拡大の前後で同じ位置に留まる', () => {
    const before = { k: 1, x: 0, y: 0 };
    const cx = 120;
    const cy = -80;
    const after = zoomAt(before, 2.5, cx, cy);
    // 中身の座標 p が画面座標 c に写る関係は c = x + k * p
    const px = (cx - before.x) / before.k;
    const py = (cy - before.y) / before.k;
    expect(after.x + after.k * px).toBeCloseTo(cx, 6);
    expect(after.y + after.k * py).toBeCloseTo(cy, 6);
  });

  it('上限に達したら同じ値を返す', () => {
    const at = { k: MAX_K, x: 3, y: 4 };
    expect(zoomAt(at, 2, 10, 10)).toBe(at);
  });
});

describe('wheelFactor', () => {
  it('上へ回すと拡大、下へ回すと縮小', () => {
    expect(wheelFactor(-100)).toBeGreaterThan(1);
    expect(wheelFactor(100)).toBeLessThan(1);
    expect(wheelFactor(0)).toBe(1);
  });
});

describe('keyPan', () => {
  it('矢印キーだけを拾う', () => {
    expect(keyPan('ArrowLeft', 40)).toEqual({ dx: 40, dy: 0 });
    expect(keyPan('ArrowDown', 40)).toEqual({ dx: 0, dy: -40 });
    expect(keyPan('a', 40)).toBeNull();
  });
});
