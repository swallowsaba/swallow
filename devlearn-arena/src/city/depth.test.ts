import { describe, expect, it } from 'vitest';
import { compareBoxes, depthOrder, type DepthBox } from './depth';

const box = (x: number, y: number, w: number, d: number, h = 1, z = 0): DepthBox => ({ min: [x, y, z], max: [x + w, y + d, z + h] });

describe('描画順（奥から手前）', () => {
  it('x で分かれる箱は、x の小さい方が先', () => {
    expect(compareBoxes(box(0, 0, 1, 1), box(2, 0, 1, 1))).toBeLessThan(0);
    expect(compareBoxes(box(2, 0, 1, 1), box(0, 0, 1, 1))).toBeGreaterThan(0);
  });

  it('上に載る物は、下の物の後', () => {
    expect(compareBoxes(box(0, 0, 2, 2, 0.5, 0.5), box(0, 0, 2, 2, 0.5, 0))).toBeGreaterThan(0);
  });

  it('大きな施設の右に立つ小さな木は、施設の後に描く', () => {
    // 木 (3.2.., 0.2..) の中心の和 3.55 は施設 (0..3, 0..3) の中心の和 3 に近いが、
    // x で分かれるので木が手前と決まる
    const order = depthOrder([box(3.2, 0.2, 0.3, 0.3), box(0, 0, 3, 3, 2)]);
    expect(order).toEqual([1, 0]);
  });

  it('大きな施設の奥に立つ木は、施設より先に描く', () => {
    const order = depthOrder([box(0, 0, 3, 3, 2), box(1.2, -0.6, 0.3, 0.3)]);
    expect(order).toEqual([1, 0]);
  });

  it('格子に並べた箱は、行と列の順を守る', () => {
    const boxes: DepthBox[] = [];
    for (let y = 0; y < 4; y += 1) for (let x = 0; x < 4; x += 1) boxes.push(box(x * 1.2, y * 1.2, 1, 1, 1.5));
    const pos = new Map(depthOrder(boxes).map((idx, i) => [idx, i]));
    for (let y = 0; y < 4; y += 1) {
      for (let x = 0; x < 4; x += 1) {
        const me = pos.get(y * 4 + x) as number;
        if (x + 1 < 4) expect(me).toBeLessThan(pos.get(y * 4 + x + 1) as number);
        if (y + 1 < 4) expect(me).toBeLessThan(pos.get((y + 1) * 4 + x) as number);
      }
    }
  });

  it('全ての箱を 1 回ずつ並べる', () => {
    const boxes = Array.from({ length: 50 }, (_, i) => box((i * 7) % 13, (i * 5) % 11, 1, 1, (i % 3) + 0.5));
    expect([...depthOrder(boxes)].sort((a, b) => a - b)).toEqual(boxes.map((_, i) => i));
  });
});
