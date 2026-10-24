import { describe, expect, it } from 'vitest';
import { adultsOf, LAYERS, sizeOf } from './layers';
import { heatOf } from './heat';
import { SimRunner } from './runner';
import { indexOf } from './space';
import { thin, weekStep } from './week';
import { town } from './__fixtures__/cities';

/**
 * ヒートマップの値（docs/testing-strategy.md 10.2: ヒートマップの値がマスの模擬の値と一致する）。
 */
describe('ヒートマップの値（docs/ui-design.md 11.1）', () => {
  it('地価・騒音は毎週の計算のマスの値、家賃・人口・支持率は住宅の建物の値、雇用は働き口の数', () => {
    const { world, terrain } = town();
    const { world: w, view } = weekStep(world, terrain);
    const heat = heatOf(w, view);
    expect(heat.week).toBe(w.sim.week);
    const zb = view.space.residential[0];
    expect(zb).toBeDefined();
    if (!zb) return;
    const i = zb.cell;
    expect(heat.cells.land[i]).toBeCloseTo(view.field.land[i] as number, 4);
    expect(heat.cells.noise[i]).toBeCloseTo(view.field.noise[i] as number, 4);
    expect(heat.cells.rent[i]).toBeCloseTo(view.rent.get(zb.building.id)?.rent ?? NaN, 0);
    const hh = w.sim.households[zb.building.id] as number[];
    expect(heat.cells.density[i]).toBeCloseTo(LAYERS.reduce((s, l) => s + (hh[l] as number) * sizeOf(l), 0), 3);
    const sup = w.sim.support[zb.district] as number[];
    const a = LAYERS.reduce((s, l) => s + (hh[l] as number) * adultsOf(l), 0);
    expect(heat.cells.approval[i]).toBeCloseTo(LAYERS.reduce((s, l) => s + (hh[l] as number) * adultsOf(l) * (sup[l] as number), 0) / a, 3);
    // 雇用: 区画の建物の働き口の数
    const e = view.employers.find((x) => x.place);
    if (e?.place) expect(heat.cells.jobs[e.place.cell]).toBeCloseTo(e.slots[0] + e.slots[1] + e.slots[2], 4);
    // 道路と海のマスには、地価も騒音も塗らない
    const road = view.space.roadCells[0] as number;
    expect(Number.isNaN(heat.cells.land[road])).toBe(true);
    expect(Number.isNaN(heat.cells.land[indexOf(0, 0)])).toBe(true);
    // 住宅でないマスには家賃が無い
    if (e?.place) expect(Number.isNaN(heat.cells.rent[e.place.cell])).toBe(true);
  });

  it('模擬の入れ物は、読み込んだ時と週の終わりにだけヒートマップの値を返す（毎日は返さない）', () => {
    const { world } = town();
    const runner = new SimRunner(world);
    runner.load(world, 0);
    expect(runner.state().heat?.week).toBe(world.sim.week);
    const day = Math.floor(world.city.day);
    runner.advance(day + 1);
    expect(runner.state().heat).toBeUndefined();
    runner.advance(Math.ceil((day + 1) / 7) * 7 + 7);
    expect(runner.state().heat?.week).toBe(runner.current.sim.week);
  });
});

describe('グラフの記録の間引き（docs/game-design.md 14 章）', () => {
  it('直近 208 週は全て、それより前は 4 週ごとに残す', () => {
    const samples = Array.from({ length: 300 }, (_, i) => ({ week: i + 1, population: 0, funds: 0, treasury: 0, approval: 50, jobs: 0, unemployment: 0, marks: [] }));
    const kept = thin(samples, 300);
    const weeks = kept.map((s) => s.week);
    // 93〜300 週（直近 208 週）は全て
    for (let w = 93; w <= 300; w += 1) expect(weeks).toContain(w);
    // それより前は 4 の倍数の週だけ
    expect(weeks.filter((w) => w < 93).every((w) => w % 4 === 0)).toBe(true);
    expect(weeks.filter((w) => w < 93)).toHaveLength(23);
    // 208 週を超えるまでは間引かない
    expect(thin(samples.slice(0, 208), 208)).toHaveLength(208);
  });
});

describe('雇用のヒートマップで住宅を指した時の失業率', () => {
  it('住宅のマスに、その住民の地区（前の道路の地区）の失業率を持つ', () => {
    const { world, terrain } = town();
    const { world: w, view } = weekStep(world, terrain);
    const heat = heatOf(w, view);
    const zb = view.space.residential[0];
    if (!zb) throw new Error('住宅が無い');
    let employed = 0;
    let all = 0;
    for (let b = 0; b < 3; b += 1) {
      employed += view.commute.employed[zb.district * 3 + b] as number;
      all += view.workers[zb.district * 3 + b] as number;
    }
    expect(heat.jobless[zb.cell]).toBeCloseTo(all > 0 ? 1 - employed / all : 0, 5);
  });
});
