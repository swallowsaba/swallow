import { describe, expect, it } from 'vitest';
import { AVENUE, blockGrid, LOT, planTown, ringOrder, SIDEWALK, STREET, type PlanDistrict } from './plan';

const district = (id: string, n: number, shape?: 'block' | 'row'): PlanDistrict => ({
  id,
  members: Array.from({ length: n }, (_, i) => `${id}:${String(i)}`),
  ...(shape ? { shape } : {}),
});

describe('街区の形', () => {
  it('区画の数から、正方形に近い街区になる', () => {
    expect(blockGrid(1, 'block')).toEqual({ cols: 1, rows: 1 });
    expect(blockGrid(4, 'block')).toEqual({ cols: 3, rows: 2 });
    expect(blockGrid(9, 'block')).toEqual({ cols: 4, rows: 3 });
    // 列は増えすぎない（細長い街区にしない）
    expect(blockGrid(60, 'block').cols).toBeLessThanOrEqual(6);
  });

  it('順番に意味があるものは一列に並べる', () => {
    expect(blockGrid(5, 'row')).toEqual({ cols: 5, rows: 1 });
  });
});

describe('区画の並び', () => {
  it('外周から内側へ回る（先に通りに面した区画が埋まる）', () => {
    const order = ringOrder(3, 3);
    expect(order).toHaveLength(9);
    // 最後の 1 つだけが内側
    expect(order[8]).toEqual({ col: 1, row: 1, facing: 'n' });
    // 外周はすべて外を向く
    expect(order.slice(0, 8).every((c) => c.col === 0 || c.row === 0 || c.col === 2 || c.row === 2)).toBe(true);
  });

  it('区画は近い側の通りを向く', () => {
    const order = ringOrder(3, 3);
    expect(order[0]?.facing).toBe('n');
    expect(order.find((c) => c.col === 2 && c.row === 1)?.facing).toBe('e');
    expect(order.find((c) => c.col === 1 && c.row === 2)?.facing).toBe('s');
    expect(order.find((c) => c.col === 0 && c.row === 1)?.facing).toBe('w');
  });
});

describe('街の割り付け', () => {
  it('街区は歩道のぶんだけ区画より大きく、区画は街区の中に収まる', () => {
    const plan = planTown([district('a', 5)]);
    const block = plan.blocks[0];
    expect(block).toBeDefined();
    if (!block) return;
    const { cols, rows } = blockGrid(5, 'block');
    expect(block.w).toBe(cols * LOT + SIDEWALK * 2);
    expect(block.d).toBe(rows * LOT + SIDEWALK * 2);
    for (const lot of plan.lots.values()) {
      expect(lot.x).toBeGreaterThanOrEqual(block.x + SIDEWALK);
      expect(lot.y).toBeGreaterThanOrEqual(block.y + SIDEWALK);
      expect(lot.x + lot.w).toBeLessThanOrEqual(block.x + block.w - SIDEWALK);
      expect(lot.y + lot.d).toBeLessThanOrEqual(block.y + block.d - SIDEWALK);
    }
  });

  it('区画は重ならない', () => {
    const plan = planTown([district('a', 7), district('b', 4), district('c', 12)]);
    const lots = [...plan.lots.values()];
    for (let i = 0; i < lots.length; i += 1) {
      for (let k = i + 1; k < lots.length; k += 1) {
        const a = lots[i];
        const b = lots[k];
        if (!a || !b) continue;
        const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.d <= b.y || b.y + b.d <= a.y;
        expect(apart, `${a.id} と ${b.id} が重なっている`).toBe(true);
      }
    }
  });

  it('街区は重ならず、間には必ず通りが入る', () => {
    const plan = planTown([district('a', 6), district('b', 6), district('c', 6), district('d', 6)]);
    const blocks = plan.blocks;
    for (let i = 0; i < blocks.length; i += 1) {
      for (let k = i + 1; k < blocks.length; k += 1) {
        const a = blocks[i];
        const b = blocks[k];
        if (!a || !b) continue;
        const gapX = a.x + a.w <= b.x - STREET || b.x + b.w <= a.x - STREET;
        const gapY = a.y + a.d <= b.y || b.y + b.d <= a.y;
        expect(gapX || gapY, `${a.id} と ${b.id} の間に道が無い`).toBe(true);
      }
    }
  });

  it('縦横どちらの道も通り、碁盤の目になる', () => {
    const plan = planTown([district('a', 6), district('b', 6), district('c', 6)]);
    expect(plan.roads.some((r) => r.axis === 'x' && r.kind === 'avenue')).toBe(true);
    expect(plan.roads.some((r) => r.axis === 'y' && r.kind === 'street')).toBe(true);
    // 交差点は縦の通りと大通りの数だけできる
    expect(plan.crossings.length).toBeGreaterThan(0);
    for (const c of plan.crossings) {
      expect(c.d).toBe(AVENUE);
      expect(plan.roads.some((r) => r.axis === 'x' && r.y === c.y)).toBe(true);
    }
  });

  it('横に広がりすぎたら次の段へ折り返す（縦一列にならない）', () => {
    const many = Array.from({ length: 8 }, (_, i) => district(`d${String(i)}`, 6));
    const plan = planTown(many);
    const rows = new Set(plan.blocks.map((b) => b.y));
    const cols = new Set(plan.blocks.map((b) => b.x));
    expect(rows.size).toBeGreaterThan(1);
    expect(cols.size).toBeGreaterThan(1);
  });

  it('何も開いていなければ、となりの街からの街道しか通っていない', () => {
    const plan = planTown([{ id: 'wild', members: [], min: 9 }]);
    expect(plan.roads.map((r) => r.kind)).toEqual(['trunk']);
    expect(plan.blocks[0]?.developed).toBe(false);
    expect(plan.crossings).toEqual([]);
  });

  it('街道は街の端から端まで通り、街はそこから広がる', () => {
    const plan = planTown([district('a', 4)]);
    const trunk = plan.roads.find((r) => r.kind === 'trunk');
    expect(trunk).toBeDefined();
    expect(trunk?.x).toBe(0);
    expect(trunk?.d).toBe(plan.height);
  });

  it('開いた街区のまわりにだけ道が伸びる', () => {
    const plan = planTown([district('open', 4), { id: 'wild', members: [], min: 9 }]);
    const open = plan.blocks.find((b) => b.id === 'open');
    const wild = plan.blocks.find((b) => b.id === 'wild');
    expect(open?.developed).toBe(true);
    expect(wild?.developed).toBe(false);
    if (!open || !wild) return;
    // 開いた街区の右には通りがあり、原野の右には無い
    expect(plan.roads.some((r) => r.axis === 'y' && r.kind === 'street' && r.x === open.x + open.w)).toBe(true);
    expect(plan.roads.some((r) => r.axis === 'y' && r.kind === 'street' && r.x === wild.x + wild.w)).toBe(false);
    // 大通りは、開いた街区のある所までしか伸びない
    const avenue = plan.roads.find((r) => r.kind === 'avenue');
    expect(avenue?.w).toBeLessThanOrEqual(open.x + open.w + STREET);
  });

  it('中身が少ない街区でも、更地の区画を確保して形を保つ', () => {
    const plan = planTown([{ id: 'empty', members: [], min: 6 }]);
    const block = plan.blocks[0];
    expect(block?.w).toBeGreaterThan(LOT);
    expect(block?.d).toBeGreaterThan(LOT);
  });

  it('大きい街区は内側に中庭が残る', () => {
    const plan = planTown([{ id: 'park', members: ['a', 'b', 'c'], min: 16 }]);
    expect(plan.blocks[0]?.yard).not.toBeNull();
  });
});
