import { describe, expect, it } from 'vitest';
import type { DrawOp } from './mesh';
import { clockwise, dropHidden, groupOps } from './svgCompact';

/**
 * 施設の SVG を 30KB に収める詰め方（docs/visual-design.md 5 章）。描いた結果の見た目を変えないこと。
 */

const rect = (x0: number, y0: number, x1: number, y1: number, fill: string, alpha?: number): DrawOp => ({
  kind: 'poly', pts: [x0, y0, x1, y0, x1, y1, x0, y1], fill, ...(alpha !== undefined ? { alpha } : {}),
});

describe('隠れた命令を省く', () => {
  it('後から描く不透明な物に全て覆われる命令だけを省く', () => {
    const hidden = rect(2, 2, 4, 4, '#111');
    const partly = rect(8, 0, 12, 4, '#222');
    const cover = rect(0, 0, 10, 10, '#333');
    expect(dropHidden([hidden, partly, cover])).toEqual([partly, cover]);
  });

  it('半透明の物（影）は下の物を隠さず、自分も省かれない', () => {
    const under = rect(2, 2, 4, 4, '#111');
    const shadow = rect(0, 0, 10, 10, '#000', 0.3);
    const rgbaShadow = rect(0, 0, 10, 10, 'rgba(0,0,0,0.25)');
    expect(dropHidden([under, shadow, rgbaShadow])).toEqual([under, shadow, rgbaShadow]);
  });

  it('楕円に覆われた物も省き、楕円の外にはみ出す物は残す', () => {
    const inside: DrawOp = rect(-1, -1, 1, 1, '#111');
    const outside: DrawOp = rect(4, -1, 7, 1, '#222');
    const disc: DrawOp = { kind: 'ellipse', cx: 0, cy: 0, rx: 5, ry: 5, fill: '#333' };
    expect(dropHidden([inside, outside, disc])).toEqual([outside, disc]);
  });
});

describe('同じ色の命令を 1 つの path にまとめる', () => {
  it('間に重なる物が無ければ、離れた同じ色の物を前の組にまとめる', () => {
    const a = rect(0, 0, 1, 1, '#aaa');
    const b = rect(5, 5, 6, 6, '#bbb');
    const c = rect(10, 0, 11, 1, '#aaa');
    const groups = groupOps([a, b, c]);
    expect(groups.map((g) => g.ops)).toEqual([[a, c], [b]]);
  });

  it('間に重なる別の色の物があれば、まとめずに描く順を守る', () => {
    const a = rect(0, 0, 4, 4, '#aaa');
    const b = rect(2, 2, 6, 6, '#bbb');
    const c = rect(3, 3, 5, 5, '#aaa');
    const groups = groupOps([a, b, c]);
    expect(groups.map((g) => g.ops)).toEqual([[a], [b], [c]]);
  });

  it('半透明の物と楕円はまとめない', () => {
    const s1 = rect(0, 0, 1, 1, '#000', 0.3);
    const s2 = rect(5, 0, 6, 1, '#000', 0.3);
    const e1: DrawOp = { kind: 'ellipse', cx: 10, cy: 0, rx: 1, ry: 1, fill: '#ccc' };
    const e2: DrawOp = { kind: 'ellipse', cx: 20, cy: 0, rx: 1, ry: 1, fill: '#ccc' };
    expect(groupOps([s1, s2, e1, e2])).toHaveLength(4);
  });
});

describe('多角形の向きを揃える', () => {
  it('反時計回りの点は逆に並べ、時計回りはそのまま', () => {
    const cw = [0, 0, 1, 0, 1, 1, 0, 1];
    const ccw = [0, 0, 0, 1, 1, 1, 1, 0];
    expect(clockwise(cw)).toEqual(cw);
    expect(clockwise(ccw)).toEqual([1, 0, 1, 1, 0, 1, 0, 0]);
  });
});
