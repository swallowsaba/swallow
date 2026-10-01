import { describe, expect, it } from 'vitest';
import { zoneBuildingModel } from './buildings';
import { brightness, facesViewer, meshModel, normalOf, rotateLocal, type Model } from './mesh';
import { box, boxShapes } from './shapes';

describe('建物の面の向きと光', () => {
  it('箱の 5 面の法線は外を向く', () => {
    const faces = boxShapes({ x0: 0, y0: 0, z0: 0, x1: 1, y1: 1, z1: 1, wall: '#000000' });
    expect(faces.map((f) => normalOf(f.pts).map((v) => Math.round(v)))).toEqual([[1, 0, 0], [0, 1, 0], [-1, 0, 0], [0, -1, 0], [0, 0, 1]]);
  });

  it('見る人には上面・左面（+y）・右面（+x）の 3 面だけが見える', () => {
    expect(facesViewer([0, 0, 1])).toBe(true);
    expect(facesViewer([1, 0, 0])).toBe(true);
    expect(facesViewer([0, 1, 0])).toBe(true);
    expect(facesViewer([-1, 0, 0])).toBe(false);
    expect(facesViewer([0, -1, 0])).toBe(false);
  });

  it('上面 1.0・左面 0.8・右面 0.6 の明るさ（光は左上から）', () => {
    expect(brightness([0, 0, 1])).toBeCloseTo(1.0);
    expect(brightness([0, 1, 0])).toBeCloseTo(0.8);
    expect(brightness([1, 0, 0])).toBeCloseTo(0.6);
  });

  it('箱を描くと、見える 3 面と接地の影の 4 つになる', () => {
    const model: Model = { w: 1, d: 1, parts: [box({ x0: 0.2, y0: 0.2, z0: 0, x1: 0.8, y1: 0.8, z1: 1, wall: '#808080' })], shadowHeight: 1 };
    const d = meshModel(model, 0);
    expect(d.ops).toHaveLength(4);
    // 影が最初（建物の下）
    expect(d.ops[0]?.fill).toMatch(/^rgba/);
  });

  it('90 度ずつ回すと、敷地の縦横が入れ替わり、4 回で元に戻る', () => {
    const p = [0.25, 0.75, 0.5] as const;
    let q: readonly [number, number, number] = p;
    for (let i = 0; i < 4; i += 1) q = rotateLocal(q, 1, 1, 1);
    expect(q.map((v) => Math.round(v * 1e9) / 1e9)).toEqual([...p]);
  });
});

describe('区画の建物の生成', () => {
  it('同じ seed からは同じ建物になる', () => {
    expect(meshModel(zoneBuildingModel('residential', 1, 42), 0)).toEqual(meshModel(zoneBuildingModel('residential', 1, 42), 0));
  });

  it('seed が違えば違う姿の家が建つ', () => {
    const shapes = new Set<string>();
    for (let seed = 1; seed <= 12; seed += 1) shapes.add(JSON.stringify(meshModel(zoneBuildingModel('residential', 1, seed), 0).ops.length));
    expect(shapes.size).toBeGreaterThan(2);
  });

  it('どの区画の建物も、窓・入口・細部を持つ（四角と三角だけにならない）', () => {
    for (const kind of ['residential', 'commercial', 'office'] as const) {
      for (const level of [1, 2]) {
        const d = meshModel(zoneBuildingModel(kind, level, 7), 0);
        // 箱の 3 面と屋根 2 面だけなら 6 つ程度。細部があれば数十になる
        expect(d.ops.length, `${kind} Lv${String(level)}`).toBeGreaterThan(40);
        // 灯りの色（窓）がある
        expect(d.ops.some((op) => op.fill === '#ffcf7a')).toBe(true);
      }
    }
  });
});
