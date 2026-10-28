import { describe, expect, it } from 'vitest';
import { POLITICS_RULES } from '@/content/politics';
import { applyOp } from './commands';
import { EXTERNAL_PRICE, setTaxRate, TAX_RANGE } from './budget';
import { factorIndex } from './layers';
import { powerUse } from './power';
import type { World } from './types';
import { stepDay } from './world';
import { grownVillage } from './__fixtures__/cities';

/**
 * 予算（docs/game-design.md 22.2）: 税率は 5〜20%（1% ずつ）で次の週から効く・週ごとの収支・財政・赤字の続いた週。
 * 赤字は学習にも開発資金にも効かない
 */

const GROWN = grownVillage(120);
const T = GROWN.terrain;
const days = (world: World, n: number): World => {
  let w = world;
  for (let i = 0; i < n; i += 1) w = stepDay(w, T, POLITICS_RULES);
  return w;
};
/** 次の週の終わりまで進める */
const toWeekEnd = (w: World): World => days(w, 7 - (Math.floor(w.city.day) % 7));
const taxPointsOf = (w: World): number => (w.history.breakdown.at(-1)?.factors[factorIndex('tax')] ?? []).reduce((a, b) => a + b, 0);

describe('税率（22.2）', () => {
  it('5〜20% の 1% ずつ。外れた値は端に寄せ、端数は丸める', () => {
    expect(TAX_RANGE).toEqual({ min: 5, max: 20 });
    const w = GROWN.world;
    expect(setTaxRate(w, 12).budget.pendingTaxRate).toBe(12);
    expect(setTaxRate(w, 35).budget.pendingTaxRate).toBe(20);
    expect(setTaxRate(w, 0).budget.pendingTaxRate).toBe(5);
    expect(setTaxRate(w, 12.6).budget.pendingTaxRate).toBe(13);
    // 今の税率に戻すと、待っている値は消える
    expect(setTaxRate(setTaxRate(w, 12), w.budget.taxRate).budget.pendingTaxRate).toBeUndefined();
  });

  it('決めた週は今の税率のまま。次の週から、税収が増え、満足の「税」の点が下がる', () => {
    const w0 = toWeekEnd(GROWN.world);
    const raised = applyOp(w0, { kind: 'taxRate', rate: 15 }, T, POLITICS_RULES);
    expect(raised.budget.taxRate).toBe(10);
    // 決めた週の終わり: まだ 10% で計算し、終わりに 15% になる
    const w1 = toWeekEnd(raised);
    const same = toWeekEnd(w0);
    expect(w1.budget.ledger.at(-1)?.income).toEqual(same.budget.ledger.at(-1)?.income);
    expect(w1.budget.taxRate).toBe(15);
    expect(w1.budget.pendingTaxRate).toBeUndefined();
    // 次の週: 税収が増え、税の点が下がる
    const w2 = toWeekEnd(w1);
    const s2 = toWeekEnd(same);
    const inc = (w: World): number => (w.budget.ledger.at(-1)?.income.residents ?? 0) + (w.budget.ledger.at(-1)?.income.businesses ?? 0);
    expect(inc(w2)).toBeGreaterThan(inc(s2));
    expect(taxPointsOf(w2)).toBeLessThan(taxPointsOf(s2));
    // 税率が変わった週に、グラフの印
    expect(w1.history.weekly.at(-1)?.marks).toContain('tax');
  });
});

describe('週ごとの収支と財政（22.2）', () => {
  it('財政 = 前の週 + 税収 − 支出。支出の外からの電気の代金は、使う量（上限まで）× 週 2', () => {
    const w0 = toWeekEnd(GROWN.world);
    const w1 = toWeekEnd(w0);
    const row = w1.budget.ledger.at(-1);
    expect(row?.week).toBe(w1.sim.week);
    const mw = Math.min(powerUse(w1.city, POLITICS_RULES), w1.sim.power.externalCapMW);
    expect(row?.spend.external).toBeCloseTo(mw * EXTERNAL_PRICE, 2);
    const spend = (row?.spend.services ?? 0) + (row?.spend.power ?? 0) + (row?.spend.external ?? 0) + (row?.spend.petitions ?? 0);
    expect(w1.budget.treasury).toBeCloseTo(w0.budget.treasury + (row?.income.residents ?? 0) + (row?.income.businesses ?? 0) - spend, 2);
    // グラフの財政も同じ値
    expect(w1.history.weekly.at(-1)?.treasury).toBe(w1.budget.treasury);
  });

  it('赤字の続いた週を数え、黒字に戻ると 0。赤字でも開発資金（学習から）は変わらない', () => {
    const w0 = toWeekEnd(GROWN.world);
    const poor = { ...w0, budget: { ...w0.budget, treasury: -500 } };
    const w1 = toWeekEnd(poor);
    expect(w1.budget.deficitWeeks).toBe(1);
    expect(toWeekEnd(w1).budget.deficitWeeks).toBe(2);
    expect(w1.city.funds).toBe(toWeekEnd(w0).city.funds);
    const rich = toWeekEnd({ ...w1, budget: { ...w1.budget, treasury: 5000 } });
    expect(rich.budget.deficitWeeks).toBe(0);
  });
});
