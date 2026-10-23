// 都市の模擬の性能の計測（docs/architecture.md 9.3・docs/testing-strategy.md 10.6）。
// 最も重い形の都市（島の全体を使った技術都市）を作り、1 日と 1 週の計算の時間を出す。
// 使い方: npm run bench:sim（vite-node で動かす。src の @/ の読み込みのため）
import { performance } from 'node:perf_hooks';
import { gridCity } from '../src/sim/__fixtures__/cities.ts';
import { stepDay } from '../src/sim/world.ts';
import { weekStep } from '../src/sim/week.ts';
import { spaceOf } from '../src/sim/space.ts';
import { networkOf, resetNetworkCache } from '../src/sim/network.ts';

const LIMITS = { dayMs: 0.5, weekMs: 60 };

const t0 = performance.now();
const { world, terrain } = gridCity(true);
const built = performance.now() - t0;
const space = spaceOf(world.city, terrain);
console.log(`都市: 建物 ${world.city.buildings.length}・施設 ${world.city.facilities.length}・道路のマス ${space.roadCells.length}・人口 ${world.city.population.toLocaleString('ja-JP')}（作るのに ${built.toFixed(0)}ms）`);

// 道路の距離（道路が変わった週だけ）
resetNetworkCache();
const n0 = performance.now();
networkOf(space);
const netMs = performance.now() - n0;
console.log(`道路の網（地区ごとの探索。道路が変わった週だけ）: ${netMs.toFixed(1)}ms`);

// 毎週の計算。始めの 2 週は温める（JIT）。道路が変わった週（網を作り直す）と、使い回す週を測る
let w = world;
for (let i = 0; i < 2; i += 1) w = weekStep(w, terrain).world;
resetNetworkCache();
const r0 = performance.now();
w = weekStep(w, terrain).world;
const roadWeek = performance.now() - r0;
const weeks = [roadWeek];
for (let i = 0; i < 10; i += 1) {
  const s = performance.now();
  w = weekStep(w, terrain).world;
  weeks.push(performance.now() - s);
}
const maxWeek = Math.max(...weeks);
const meanWeek = weeks.reduce((a, b) => a + b, 0) / weeks.length;

// 毎日の計算（週の終わりでない日）。始めの 2 週は温める
let d = w;
for (let i = 0; i < 14; i += 1) d = stepDay(d, terrain);
const days = [];
while (days.length < 30) {
  const next = Math.floor(d.city.day) + 1;
  const s = performance.now();
  d = stepDay(d, terrain);
  const ms = performance.now() - s;
  if (next % 7 !== 0) days.push(ms);
}
const meanDay = days.reduce((a, b) => a + b, 0) / days.length;
const maxDay = Math.max(...days);

console.log(`1 日（週の終わりでない日）: 平均 ${meanDay.toFixed(3)}ms・最大 ${maxDay.toFixed(3)}ms（目安 ${LIMITS.dayMs}ms 以下）`);
console.log(`1 週（毎週の計算）: 平均 ${meanWeek.toFixed(1)}ms・最大 ${maxWeek.toFixed(1)}ms・道路が変わった週 ${roadWeek.toFixed(1)}ms（目安 30〜${LIMITS.weekMs}ms）`);
console.log(`支持率 ${w.sim.lastWeek.approval.toFixed(1)}%・失業率 ${(w.sim.lastWeek.unemployment * 100).toFixed(1)}%・仕事 ${w.sim.lastWeek.jobs.toLocaleString('ja-JP')}`);
const ok = meanDay <= LIMITS.dayMs && maxWeek <= LIMITS.weekMs;
console.log(ok ? '結果: 目安以内' : '結果: 目安を超えた');
process.exitCode = ok ? 0 : 1;
