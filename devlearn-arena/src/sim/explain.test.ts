import { describe, expect, it } from 'vitest';
import type { Building, City, Zone } from '@/city/types';
import { EXPLAIN, NAME_PARTS } from '@/content/politics';
import { explainApproval, type ExplainContext } from './explain';
import { FACTORS, layerOf } from './layers';
import { districtOf } from './space';
import type { WeeklyBreakdown, World } from './types';
import { weekStep } from './week';
import { worldFromCity } from './world';
import { village } from './__fixtures__/cities';

/**
 * 平易な言葉の説明（docs/game-design.md 14 章・docs/testing-strategy.md 10.2「説明の文」）。
 */

const zero = (): number[][] => FACTORS.map(() => new Array<number>(12).fill(0));

/** 決めた内訳: 4 週前は 50、今は騒音で 6.4 下がり、税で 0.3 上がった */
function fixture(): { breakdown: WeeklyBreakdown[]; ctx: ExplainContext } {
  const names = Array.from({ length: 144 }, (_, i) => `地区${String(i)}`);
  names[districtOf(41, 46)] = '北浜町';
  const ctx: ExplainContext = {
    city: {
      zones: [{ id: 'z-fac', kind: 'industrial', cells: [{ x: 41, y: 46 }, { x: 42, y: 46 }] }],
      buildings: [
        { id: 'b1', zoneId: 'z-fac', cell: { x: 41, y: 46 }, variant: 'f', level: 3, builtDay: 0 },
        { id: 'b2', zoneId: 'z-fac', cell: { x: 42, y: 46 }, variant: 'f', level: 3, builtDay: 0 },
      ],
      facilities: [],
      roads: [],
    },
    districtNames: names,
    taxRate: 9,
  };
  const prevF = zero();
  const lastF = zero();
  (lastF[FACTORS.indexOf('noise')] as number[])[layerOf(3, 1)] = -6.4;
  (lastF[FACTORS.indexOf('tax')] as number[])[layerOf(1, 1)] = 0.3;
  const prevLayers = new Array<number>(12).fill(50);
  const lastLayers = prevLayers.map((v, l) => (l === layerOf(3, 1) ? 39 : l === layerOf(0, 0) ? 48 : v));
  const breakdown: WeeklyBreakdown[] = [
    { week: 10, factors: prevF, causes: [], approval: 50, layers: prevLayers },
    { week: 11, factors: zero(), causes: [], approval: 49, layers: prevLayers },
    { week: 14, factors: lastF, approval: 43.9, layers: lastLayers, causes: [
      { factor: 'noise', source: { kind: 'building', id: 'b1', at: { x: 41.5, y: 46.5 } }, points: -3.6 },
      { factor: 'noise', source: { kind: 'building', id: 'b2', at: { x: 42.5, y: 46.5 } }, points: -2.8 },
      { factor: 'tax', source: { kind: 'decision', id: 'tax', at: { x: 40.5, y: 48.5 } }, points: 0.3 },
    ] },
  ];
  return { breakdown, ctx };
}

describe('平易な言葉の説明（docs/game-design.md 14 章）', () => {
  it('決めた内訳から決まった文: 1 行目は全体と主な理由（区画の建物は区画にまとめる）、2 行目は一番動いた層', () => {
    const { breakdown, ctx } = fixture();
    // 4 週前（10 週）の記録が無くても、いちばん古い記録と比べる
    const e = explainApproval(breakdown, ctx, EXPLAIN);
    expect(e?.lines).toEqual([
      'この 4 週で支持率が 6 下がった。主な理由は、北浜町の工業区画（騒音）',
      '特に、中くらいの収入の高齢で 11 下がった',
    ]);
    expect(e?.reason).toMatchObject({ factor: 'noise', kind: 'zone', id: 'z-fac' });
    // 押した時に寄る場所は、その区画の建物のどれか
    expect(e?.reason?.at).toEqual({ x: 41.5, y: 46.5 });
  });

  it('文の数字は、内訳の支持率の変化を四捨五入した物', () => {
    const { breakdown, ctx } = fixture();
    const e = explainApproval(breakdown, ctx, EXPLAIN);
    const last = breakdown.at(-1) as WeeklyBreakdown;
    const first = breakdown[0] as WeeklyBreakdown;
    expect(e?.delta).toBeCloseTo(last.approval - first.approval, 9);
    const sum = (b: WeeklyBreakdown): number => b.factors.reduce((s, r) => s + r.reduce((x, v) => x + v, 0), 0);
    expect(Math.round(Math.abs(sum(last) - sum(first)))).toBe(6);
  });

  it('上がった時は「上がった」。理由は上がる向きに効いた物', () => {
    const { breakdown, ctx } = fixture();
    const up = breakdown.map((b, i) => (i === 2 ? { ...b, approval: 53, causes: [{ factor: 'tax' as const, source: { kind: 'decision' as const, id: 'tax' }, points: 3 }] } : b));
    const e = explainApproval(up, ctx, EXPLAIN);
    expect(e?.lines[0]).toBe('この 4 週で支持率が 3 上がった。主な理由は、税率 9%（税）');
  });

  it('変化が 1 未満なら「ほぼ変わらない」。記録が 1 週しか無ければ説明しない', () => {
    const { breakdown, ctx } = fixture();
    const flat = breakdown.map((b, i) => (i === 2 ? { ...b, approval: 50.4 } : b));
    expect(explainApproval(flat, ctx, EXPLAIN)?.lines).toEqual(['この 4 週、支持率はほぼ変わらない']);
    expect(explainApproval(breakdown.slice(0, 1), ctx, EXPLAIN)).toBeNull();
  });

  it('4 週前の記録があれば、それと比べる', () => {
    const { breakdown, ctx } = fixture();
    const more = [{ ...(breakdown[0] as WeeklyBreakdown), week: 9, approval: 30 }, ...breakdown];
    expect(explainApproval(more, ctx, EXPLAIN)?.weeks).toBe(4);
    expect(explainApproval(more, ctx, EXPLAIN)?.lines[0]).toContain('6 下がった');
  });
});

describe('工業区画を住宅の隣に塗って時間を進める（docs/development-plan.md G2 の完成条件）', () => {
  it('説明が「騒音」と、その区画を主な理由に挙げる', () => {
    const { world, terrain } = village();
    // 一般道（y = 47）の南に住宅 8 棟、北の西の端に店と事務所（皆が働ける）
    const homes: Building[] = [38, 39, 40, 41, 42, 43, 44, 45].map((x) => ({ id: `h${String(x)}`, zoneId: 'z-home', cell: { x, y: 48 }, variant: 'h', level: 2, builtDay: -10 }));
    const work: Building[] = [
      { id: 'o1', zoneId: 'z-off', cell: { x: 38, y: 46 }, variant: 'o', level: 3, builtDay: -10 },
      { id: 's1', zoneId: 'z-shop', cell: { x: 39, y: 46 }, variant: 's', level: 3, builtDay: -10 },
    ];
    const zones: Zone[] = [
      { id: 'z-home', kind: 'residential', cells: homes.map((h) => h.cell) },
      { id: 'z-off', kind: 'office', cells: [{ x: 38, y: 46 }] },
      { id: 'z-shop', kind: 'commercial', cells: [{ x: 39, y: 46 }] },
    ];
    const city: City = { ...world.city, stage: 3, zones, buildings: [...homes, ...work] };
    let w: World = worldFromCity(city, terrain, NAME_PARTS);
    for (let i = 0; i < 2; i += 1) w = weekStep(w, terrain).world;
    // 道路の向かいに工業区画（工場 6 棟）
    const factories: Building[] = [40, 41, 42, 43, 44, 45].map((x) => ({ id: `f${String(x)}`, zoneId: 'z-fac', cell: { x, y: 46 }, variant: 'f', level: 3, builtDay: -10 }));
    w = { ...w, city: { ...w.city, zones: [...w.city.zones, { id: 'z-fac', kind: 'industrial', cells: factories.map((b) => b.cell) }], buildings: [...w.city.buildings, ...factories] } };
    for (let i = 0; i < 4; i += 1) w = weekStep(w, terrain).world;
    const e = explainApproval(w.history.breakdown, { city: w.city, districtNames: w.sim.districtNames, taxRate: w.budget.taxRate }, EXPLAIN);
    expect(e?.delta).toBeLessThan(-1);
    expect(e?.reason).toMatchObject({ factor: 'noise', kind: 'zone', id: 'z-fac' });
    expect(e?.lines[0]).toMatch(/^この 4 週で支持率が \d+ 下がった。主な理由は、.+の工業区画（騒音）$/);
  });
});
