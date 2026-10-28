import { powerUse } from './power';
import type { Budget, PoliticsRules, World } from './types';

/**
 * 予算（docs/game-design.md 22.2）。純粋な計算。
 * 税収は週の計算（week.ts）が出し、ここは支出を払って財政を決め、赤字の続いた週を数え、待っている税率を次の週から効かせる。
 * 財政は開発資金（学習から）と別の財布で、赤字は学習にも開発資金にも効かない
 */

/** 税率の幅（%。1% ずつ） */
export const TAX_RANGE = { min: 5, max: 20 } as const;
/** 外からの電気の代金（1 MW あたり週。24.1） */
export const EXTERNAL_PRICE = 2;

const round2 = (v: number): number => Math.round(v * 100) / 100;

/** 税率を決める（5〜20 に寄せて 1% に丸める）。次の週から効く。今の税率に戻すと、待っている値は消える */
export function setTaxRate(world: World, rate: number): World {
  const r = Math.min(TAX_RANGE.max, Math.max(TAX_RANGE.min, Math.round(rate)));
  const budget: Budget = { ...world.budget };
  if (r === budget.taxRate) delete budget.pendingTaxRate;
  else budget.pendingTaxRate = r;
  return { ...world, budget };
}

/** 週の支出（公共サービスの維持と発電所の維持は G10 で足す） */
export function weeklySpend(world: World, rules: PoliticsRules, petitions = 0): Budget['ledger'][number]['spend'] {
  const external = round2(Math.min(powerUse(world.city, rules), world.sim.power.externalCapMW) * EXTERNAL_PRICE);
  return { services: 0, power: 0, external, petitions: round2(petitions) };
}

/**
 * 週の終わりの払い（週の計算の直後に呼ぶ）: 財政 = 前の週 + 税収 − 支出。赤字の続いた週。待っている税率をここで今の税率にする
 * （決めた週の税収は前の税率のまま、次の週から新しい税率）。税率が変わった週は、グラフに印を付ける
 */
export function settleWeek(world: World, rules: PoliticsRules, petitions = 0): World {
  const { budget } = world;
  const row = budget.ledger.at(-1);
  if (!row || row.week !== world.sim.week) return world;
  const spend = weeklySpend(world, rules, petitions);
  const treasury = round2(budget.treasury - spend.services - spend.power - spend.external - spend.petitions);
  const changed = budget.pendingTaxRate !== undefined && budget.pendingTaxRate !== budget.taxRate;
  const next: Budget = {
    ...budget,
    treasury,
    taxRate: budget.pendingTaxRate ?? budget.taxRate,
    ledger: [...budget.ledger.slice(0, -1), { ...row, spend }],
    deficitWeeks: treasury < 0 ? budget.deficitWeeks + 1 : 0,
  };
  delete next.pendingTaxRate;
  const weekly = world.history.weekly;
  const sample = weekly.at(-1);
  const history = sample && sample.week === world.sim.week
    ? { ...world.history, weekly: [...weekly.slice(0, -1), { ...sample, treasury, marks: changed ? [...sample.marks, 'tax'] : sample.marks }] }
    : world.history;
  return { ...world, budget: next, history };
}
