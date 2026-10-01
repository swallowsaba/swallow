import { describe, expect, it } from 'vitest';
import { depthKey, project, rotate, TILE_H, TILE_W, unproject, unrotate, Z_UNIT, type Rotation } from './projection';

describe('等角投影（横 2 : 縦 1）', () => {
  it('x に 1 進むと右下へ、y に 1 進むと左下へ、菱形の半分ずつ動く', () => {
    expect(project({ x: 1, y: 0, z: 0 })).toEqual({ sx: TILE_W / 2, sy: TILE_H / 2 });
    expect(project({ x: 0, y: 1, z: 0 })).toEqual({ sx: -TILE_W / 2, sy: TILE_H / 2 });
  });

  it('菱形の幅と高さが 2 : 1', () => {
    const right = project({ x: 1, y: 0, z: 0 });
    const left = project({ x: 0, y: 1, z: 0 });
    const bottom = project({ x: 1, y: 1, z: 0 });
    expect(right.sx - left.sx).toBe(2 * (bottom.sy - 0));
  });

  it('高さは真上へ伸びる', () => {
    expect(project({ x: 3, y: 2, z: 1.5 })).toEqual({ sx: TILE_W / 2, sy: 5 * (TILE_H / 2) - 1.5 * Z_UNIT });
  });

  it('画面の点から地面の点へ戻せる', () => {
    for (const p of [{ x: 0, y: 0 }, { x: 12.5, y: 3.25 }, { x: 95, y: 40 }]) {
      const back = unproject(project({ ...p, z: 0 }));
      expect(back.x).toBeCloseTo(p.x, 9);
      expect(back.y).toBeCloseTo(p.y, 9);
    }
  });
});

describe('90 度単位の回転', () => {
  const size = 96;
  const rotations: Rotation[] = [0, 1, 2, 3];

  it('4 回回すと元に戻る', () => {
    const p = { x: 10.25, y: 70.5 };
    let q = p;
    for (let i = 0; i < 4; i += 1) q = rotate(q, 1, size);
    expect(q).toEqual(p);
  });

  it('回した点を逆に回すと元に戻る', () => {
    for (const r of rotations) {
      const p = { x: 31.5, y: 7 };
      expect(unrotate(rotate(p, r, size), r, size)).toEqual(p);
    }
  });

  it('地図の中心は動かない', () => {
    for (const r of rotations) expect(rotate({ x: 48, y: 48 }, r, size)).toEqual({ x: 48, y: 48 });
  });

  it('1 マスの範囲は、回した後もちょうど 1 マスに重なる', () => {
    for (const r of rotations) {
      const a = rotate({ x: 5, y: 9 }, r, size);
      const b = rotate({ x: 6, y: 10 }, r, size);
      expect(Math.abs(a.x - b.x)).toBe(1);
      expect(Math.abs(a.y - b.y)).toBe(1);
      expect(Number.isInteger(Math.min(a.x, b.x))).toBe(true);
    }
  });

  it('時計回りに 1 回回すと、奥にあった北の端が右へ来る', () => {
    // 回す前: (0, 0) が一番奥（画面の上）。1 回回すと、(0, 0) は画面の右の端へ行く
    const before = project({ ...rotate({ x: 0, y: 0 }, 0, size), z: 0 });
    const after = project({ ...rotate({ x: 0, y: 0 }, 1, size), z: 0 });
    expect(before.sx).toBe(0);
    expect(after.sx).toBeGreaterThan(0);
  });
});

describe('描画順（奥から手前）', () => {
  it('見る向きの x + y が小さいほど先に描く', () => {
    const items = [{ x: 5, y: 5 }, { x: 0, y: 1 }, { x: 3, y: 9 }, { x: 2, y: 2 }];
    const order = [...items].sort((a, b) => depthKey(a) - depthKey(b));
    expect(order).toEqual([{ x: 0, y: 1 }, { x: 2, y: 2 }, { x: 5, y: 5 }, { x: 3, y: 9 }]);
  });

  it('同じ場所なら低い物を先に描く', () => {
    expect(depthKey({ x: 4, y: 4 }, 0)).toBeLessThan(depthKey({ x: 4, y: 4 }, 2));
  });

  it('手前の行の低い物は、奥の行の高い物より後に描く', () => {
    expect(depthKey({ x: 4, y: 5 }, 0)).toBeGreaterThan(depthKey({ x: 4, y: 4 }, 30));
  });
});
