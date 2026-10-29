/**
 * 決定性を比べる時の、模擬の結果の要約（docs/testing-strategy.md 10.1: 人口・支持率・反対率・採決・財政）。
 * 画面の Worker で流した世界（e2e/determinism.spec.ts）と、同じ関数を直接呼んだ世界（tools/sim-direct.mts）を、この形にして比べる
 */
export function summaryOf(world) {
  return {
    day: Math.floor(world.city.day),
    population: world.city.population,
    weekly: world.history.weekly.map((w) => ({ week: w.week, population: w.population, approval: w.approval, treasury: w.treasury, jobs: w.jobs })),
    applications: world.applications.map((a) => ({
      id: a.id,
      kind: a.kind,
      stage: a.stage,
      opposition: a.opposition,
      yes: a.vote ? a.vote.members.filter((m) => m.yes).length : null,
      passed: a.vote ? a.vote.passed : null,
    })),
    treasury: world.budget.treasury,
    capital: world.politics.capital,
  };
}
