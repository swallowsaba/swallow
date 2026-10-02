import { describe, expect, it } from 'vitest';
import { depthOrder, type DepthBox } from './depth';
import { pickAt } from './pick';
import { project } from './projection';

/** 箱の並びと描く順から、選べる物の一覧を作る */
function pickables(boxes: DepthBox[]) {
  const order = depthOrder(boxes);
  return boxes.map((box, i) => ({ box, position: order.indexOf(i) }));
}

const at = (x: number, y: number, z: number) => project({ x, y, z });

describe('建物の選択', () => {
  // 奥の低い家（10,10）と、すぐ手前の高いビル（11,11）と、離れた所の高いビル（14,14）
  const house: DepthBox = { min: [10, 10, 0], max: [11, 11, 0.6] };
  const tower: DepthBox = { min: [11, 11, 0], max: [12, 12, 3] };
  const far: DepthBox = { min: [14, 14, 0], max: [15, 15, 3] };
  const items = pickables([house, tower, far]);

  it('建物の上を押すと、その建物が選ばれる', () => {
    expect(pickAt(pickables([house, far]), at(10.5, 10.5, 0.6))).toBe(0);
    expect(pickAt(items, at(11.5, 11.5, 2.5))).toBe(1);
    expect(pickAt(items, at(14.5, 14.5, 2))).toBe(2);
  });

  it('重なって見える所では、手前の建物が選ばれる', () => {
    // ビルの低い所は、画面では奥の家の屋根と同じ所に見える
    const p = at(11.2, 11.2, 1.0);
    expect(pickAt(pickables([house]), p)).toBe(0);
    expect(pickAt(items, p)).toBe(1);
  });

  it('何も無い地面を押すと、何も選ばれない', () => {
    expect(pickAt(items, at(20, 20, 0))).toBe(-1);
  });
});
