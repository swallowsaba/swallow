import { describe, expect, it } from 'vitest';
import { growDay } from '@/city/growth';
import { POLITICS_RULES } from '@/content/politics';
import { applyOp } from './commands';
import { demandBar, demandOfTerms, demandTermsOf, spendingPerShopJob, type DemandInput } from './demand';
import type { World } from './types';
import { stepDay } from './world';
import { grownVillage, village } from './__fixtures__/cities';

/**
 * 需要（RCI。docs/game-design.md 23 章・docs/testing-strategy.md 10 章「需要の式」）
 */

const ZERO: DemandInput = {
  openJobs: 0, attraction: 0, vacantPeople: 0, spending: 0, taxRate: 10, shopJobs: 0, techPower: 0, officeJobs: 0, unemployedLowMid: 0, roadCells: 0, factoryJobs: 0,
};

describe('需要の式（23 章）', () => {
  it('住宅 = 空いた仕事 × 1.2 + 魅力 × 2 − 空いている戸に住める人', () => {
    const t = demandTermsOf({ ...ZERO, openJobs: 50, attraction: -8, vacantPeople: 23 });
    expect(t.residential).toEqual([60, -16, -23]);
    expect(demandOfTerms(t).residential).toBe(21);
  });

  it('商業 = 買い物の量 ÷ 店の働き口 1 つが賄う量 − 店の働き口。税率が上がると、1 つが賄う量が増える', () => {
    expect(spendingPerShopJob(10)).toBe(2);
    expect(spendingPerShopJob(20)).toBeCloseTo(3, 9);
    const t = demandTermsOf({ ...ZERO, spending: 90, shopJobs: 30 });
    expect(t.commercial).toEqual([45, -30, 0]);
    expect(demandOfTerms(demandTermsOf({ ...ZERO, spending: 90, shopJobs: 30, taxRate: 20 })).commercial).toBe(0);
  });

  it('オフィス = 20 + 技術力 × 15 − 事務所と IT 企業の働き口。工業 = 低と中の失業者 + 道路 × 0.5 − 工場の働き口', () => {
    const t = demandTermsOf({ ...ZERO, techPower: 4, officeJobs: 70, unemployedLowMid: 12, roadCells: 40, factoryJobs: 25 });
    expect(t.office).toEqual([20, 60, -70]);
    expect(t.industrial).toEqual([12, 20, -25]);
    expect(demandOfTerms(t)).toMatchObject({ office: 10, industrial: 7 });
  });

  it('棒は −100〜+100 に収める', () => {
    expect([demandBar(250), demandBar(-130), demandBar(42)]).toEqual([100, -100, 42]);
  });
});

describe('模擬の週の値から（23 章）', () => {
  it('週の終わりに、空いた仕事・魅力・空き室・買い物・技術力・働き口・失業者・道路から需要を出し、保存する', () => {
    const w = grownVillage(90).world;
    const t = w.sim.lastWeek.demand;
    if (!t) throw new Error('需要が無い');
    // オフィスの基本は 20、技術力の項は技術力 × 15
    expect(t.office[0]).toBe(20);
    expect(t.office[1]).toBe(w.city.techPower * 15);
    // 工業の道路の項は、道路のマスの数 × 0.5
    expect(t.industrial[1]).toBeGreaterThan(0);
    // 公共サービスの無い村は、魅力の項が負（13.8 の治安・教育・医療・防災の点）
    expect(t.residential[1]).toBeLessThan(0);
  });

  it('毎日の区画の建物は、前の週の需要に従って建つ: 住宅の需要が負なら新しい住宅は建たず、正なら建つ', () => {
    const { world, terrain } = village();
    let w: World = applyOp({ ...world, city: { ...world.city, funds: 20000 } }, { kind: 'zone', zone: 'residential', a: { x: 38, y: 48 }, b: { x: 49, y: 48 } }, terrain);
    const homes = (x: World): number => x.city.buildings.length;
    const plus = { ...w, sim: { ...w.sim, lastWeek: { ...w.sim.lastWeek, demand: { residential: [60, 0, 0], commercial: [0, 0], office: [0, 0, 0], industrial: [0, 0, 0] } } } };
    const minus = { ...w, sim: { ...w.sim, lastWeek: { ...w.sim.lastWeek, demand: { residential: [0, -30, 0], commercial: [0, 0], office: [0, 0, 0], industrial: [0, 0, 0] } } } };
    expect(homes(stepDay(plus, terrain, POLITICS_RULES))).toBeGreaterThan(homes(w));
    expect(homes(stepDay(minus, terrain, POLITICS_RULES))).toBe(homes(w));
    // 需要を渡さなければ、都市の模型の前の決まり（docs/game-design.md 7 章）のまま
    w = { ...w, sim: { ...w.sim, lastWeek: { ...w.sim.lastWeek } } };
    delete w.sim.lastWeek.demand;
    expect(growDay(w.city, 1).buildings.length).toBeGreaterThan(0);
  });
});
