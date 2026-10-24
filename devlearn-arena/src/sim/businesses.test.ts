import { describe, expect, it } from 'vitest';
import { NAME_PARTS } from '@/content/politics';
import type { Building, City } from '@/city/types';
import { salesOf, settleBusinesses, type Employer, type Sales } from './businesses';
import { incomeOf, LAYERS, MONTHLY_INCOME } from './layers';
import { DISTRICT_COUNT, type Space } from './space';
import type { BusinessState, World } from './types';
import { weekStep } from './week';
import { worldFromCity } from './world';
import { town, village } from './__fixtures__/cities';

/**
 * 事業者の成長と撤退（docs/game-design.md 13.3）と税収（22.2）。
 */

const place = (id: string, level: number): Employer['place'] => ({
  building: { id, zoneId: 'z', cell: { x: 40, y: 48 }, variant: 'o', level, builtDay: 0 },
  kind: 'office', district: 0, cell: 48 * 96 + 40, front: 0,
} as unknown as Employer['place']);

const office = (level = 2): Employer => ({ id: 'b-o', kind: 'office', district: 0, slots: [0, 7, 3], place: place('b-o', level) });

function fillOf(v: number): Float64Array {
  const f = new Float64Array(DISTRICT_COUNT * 3);
  f.fill(v);
  return f;
}

function weeks(n: number, revenue: number, cost: number, fill: number, start: BusinessState = { kind: 'office', workers: [0, 0, 0], profitWeeks: 0 }) {
  let businesses: Record<string, BusinessState> = { 'b-o': start };
  let vacant: Record<string, number> = {};
  const sales: Sales = { revenue: new Map([['b-o', revenue]]), cost: new Map([['b-o', cost]]) };
  const log: { grow: string[]; closed: string[] }[] = [];
  for (let w = 1; w <= n; w += 1) {
    const r = settleBusinesses([office()], businesses, vacant, sales, fillOf(fill), w, 5);
    businesses = r.businesses;
    vacant = r.vacant;
    log.push({ grow: r.grow, closed: r.closed });
  }
  return { businesses, vacant, log };
}

describe('事業者の成長と撤退（docs/game-design.md 13.3）', () => {
  it('売上が費用を 4 週続けて上回り、働く人が集まっていれば、4 週目に高さの段が上がる', () => {
    const { log, businesses } = weeks(4, 30, 20, 1);
    expect(log.slice(0, 3).every((l) => l.grow.length === 0)).toBe(true);
    expect(log[3]?.grow).toEqual(['b-o']);
    // 上がった後は数え直す
    expect(businesses['b-o']?.profitWeeks).toBe(0);
  });

  it('働く人が集まっていなければ、黒字が続いても上がらない', () => {
    const { log } = weeks(6, 30, 20, 0.5);
    expect(log.every((l) => l.grow.length === 0)).toBe(true);
  });

  it('発展段階の上限の段では上がらない', () => {
    const sales: Sales = { revenue: new Map([['b-o', 30]]), cost: new Map([['b-o', 20]]) };
    const r = settleBusinesses([office(2)], { 'b-o': { kind: 'office', workers: [0, 0, 0], profitWeeks: 3 } }, {}, sales, fillOf(1), 1, 2);
    expect(r.grow).toEqual([]);
  });

  it('売上が費用を 8 週続けて下回ると撤退し、建物は空きになって雇用が消える', () => {
    const { log, businesses, vacant } = weeks(8, 10, 20, 1);
    expect(log.slice(0, 7).every((l) => l.closed.length === 0)).toBe(true);
    expect(log[7]?.closed).toEqual(['b-o']);
    expect(businesses['b-o']).toBeUndefined();
    expect(vacant['b-o']).toBe(8);
  });

  it('同じ業種で 8 週続けて赤字の事業者が並んでも、撤退は 1 週に 1 つ（赤字の割合の大きい物から）。客と売上が残りに移るのを待つ', () => {
    const two: Employer[] = [office(), { ...office(), id: 'b-p', place: place('b-p', 2) }];
    const losing: BusinessState = { kind: 'office', workers: [0, 0, 0], profitWeeks: -7 };
    const sales: Sales = { revenue: new Map([['b-o', 12], ['b-p', 8]]), cost: new Map([['b-o', 20], ['b-p', 20]]) };
    const r = settleBusinesses(two, { 'b-o': losing, 'b-p': losing }, {}, sales, fillOf(1), 1, 5);
    expect(r.closed).toEqual(['b-p']);
    expect(r.businesses['b-o']?.profitWeeks).toBe(-8);
    // 次の週も赤字なら、残りも撤退する
    const r2 = settleBusinesses([office()], r.businesses, r.vacant, sales, fillOf(1), 2, 5);
    expect(r2.closed).toEqual(['b-o']);
  });

  it('見本の町を 1 年流しても、事業者が一斉に撤退して失業率が跳ねない', () => {
    const { world, terrain } = town();
    let w = world;
    let worst = 0;
    for (let i = 0; i < 52; i += 1) {
      const r = weekStep(w, terrain);
      w = r.world;
      if (i >= 4) worst = Math.max(worst, r.view.unemployment);
    }
    expect(worst).toBeLessThan(0.35);
  });

  it('赤字の途中で 1 週でも黒字になると、数え直す', () => {
    const { log } = weeks(8, 10, 20, 1, { kind: 'office', workers: [0, 0, 0], profitWeeks: 1 });
    // 黒字 1 週の後なので、赤字の 8 週目で撤退する（7 週目までは残る）
    expect(log.slice(0, 7).every((l) => l.closed.length === 0)).toBe(true);
    expect(log[7]?.closed).toEqual(['b-o']);
  });

  it('税率を上げると費用が増え、同じ売上でも撤退しやすくなる（22.2）', () => {
    const space = { roadCells: [], facilities: [] } as unknown as Space;
    const costAt = (rate: number): number => salesOf(space, [office()], new Map(), 0, 0, rate).cost.get('b-o') ?? 0;
    // 働き口 10 × 賃金 2 × (1 + (税率 − 10) × 0.05)
    expect(costAt(10)).toBeCloseTo(20, 9);
    expect(costAt(20)).toBeCloseTo(30, 9);
    expect(costAt(5)).toBeCloseTo(15, 9);
    // 事務所の売上（(20 + 0 + 0) × 2.2 = 44 を 1 つで受ける）は税率で変わらない
    expect(salesOf(space, [office()], new Map(), 0, 0, 20).revenue.get('b-o')).toBeCloseTo(44, 9);
  });
});

describe('税収（docs/game-design.md 22.2。G1 は計算して記録するだけ）', () => {
  it('税収（週）= Σ 世帯 × 月の収入（万円）× 税率 × 0.03 + Σ 雇う人 × 0.05 × 税率 ÷ 10%。財政に足し、帳簿に残す', () => {
    const { world, terrain } = village();
    const home: Building = { id: 'b-h', zoneId: 'z-h', cell: { x: 40, y: 48 }, variant: 'h', level: 2, builtDay: -10 };
    const shop: Building = { id: 'b-s', zoneId: 'z-s', cell: { x: 42, y: 48 }, variant: 's', level: 1, builtDay: -10 };
    const city: City = { ...world.city, zones: [{ id: 'z-h', kind: 'residential', cells: [home.cell] }, { id: 'z-s', kind: 'commercial', cells: [shop.cell] }], buildings: [home, shop] };
    const base = worldFromCity(city, terrain, NAME_PARTS);
    for (const rate of [10, 15]) {
      const w0: World = { ...base, budget: { ...base.budget, taxRate: rate } };
      const { world: w1 } = weekStep(w0, terrain);
      const hh = w1.sim.households['b-h'] as number[];
      const residents = LAYERS.reduce((s, l) => s + (hh[l] as number) * (MONTHLY_INCOME[incomeOf(l)] as number) * (rate / 100) * 0.03, 0);
      const employed = Object.values(w1.sim.employed).reduce((s, v) => s + v, 0);
      const businesses = employed * 0.05 * (rate / 10);
      const entry = w1.budget.ledger.at(-1);
      expect(entry?.income.residents).toBeCloseTo(residents, 1);
      expect(entry?.income.businesses).toBeCloseTo(businesses, 1);
      expect(w1.budget.treasury).toBeCloseTo(w0.budget.treasury + residents + businesses, 1);
    }
  });

  it('税率を上げると、次の週の税収が増える', () => {
    const { world, terrain } = town();
    const income = (rate: number): number => {
      const e = weekStep({ ...world, budget: { ...world.budget, taxRate: rate } }, terrain).world.budget.ledger.at(-1);
      return (e?.income.residents ?? 0) + (e?.income.businesses ?? 0);
    };
    expect(income(12)).toBeGreaterThan(income(10));
  });
});
