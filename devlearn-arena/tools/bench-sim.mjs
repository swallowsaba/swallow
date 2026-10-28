// 都市の模擬の性能の計測（docs/architecture.md 9.3・docs/testing-strategy.md 10.6）。
// 最も重い形の都市（島の全体を使った技術都市）を作り、1 日と 1 週の計算の時間を出す。
// 使い方: npm run bench:sim（vite-node で動かす。src の @/ の読み込みのため）
import { performance } from 'node:perf_hooks';
import { gridCity } from '../src/sim/__fixtures__/cities.ts';
import { stepDay } from '../src/sim/world.ts';
import { weekStep } from '../src/sim/week.ts';
import { spaceOf } from '../src/sim/space.ts';
import { networkOf, resetNetworkCache } from '../src/sim/network.ts';
import { oppositionOf } from '../src/sim/opposition.ts';
import { POLITICS_RULES } from '../src/content/politics.ts';

const LIMITS = { dayMs: 0.5, weekMs: 60, assessMs: 30 };

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

// 市政を含めた週の終わりの日（毎週の計算・払い・請願の届き・選挙の確かめ・新聞の記事。docs/game-design.md 22 章）
let p = { ...d, petitions: { inbox: [], handled: {}, effects: [] } };
const civic = [];
while (civic.length < 4) {
  const next = Math.floor(p.city.day) + 1;
  const s = performance.now();
  p = stepDay(p, terrain, POLITICS_RULES);
  const ms = performance.now() - s;
  if (next % 7 === 0) civic.push(ms);
}
const maxCivic = Math.max(...civic);
console.log(`週の終わりの日（市政を含む）: 最大 ${maxCivic.toFixed(1)}ms（目安 30〜${LIMITS.weekMs}ms）・届いた請願 ${String(p.petitions.inbox.length)}・記事 ${String(p.history.news.length)}`);

// 申請の見込み（反対の受付に入った日。完成した形を仮に入れた 1 週分。docs/architecture.md 9.3）
// 道路の真ん中の 1 マスにデータセンターを仮に置き、データの理由（騒音・電力・雇用・冷却水）を全て計算する
const dcApp = (x, y) => ({
  id: 'bench', kind: 'facility', target: { type: 'datacenter', origin: { x, y }, rotation: 180 }, stage: 'objection', stageDay: 0, filedDay: 0,
  wallet: 'funds', reserved: 650, exception: false, objections: [], opposition: 0, mods: {},
});
const assess = [];
for (let i = 0; i < 6; i += 1) {
  const s = performance.now();
  oppositionOf(w, terrain, dcApp(40 + i * 3, 40), POLITICS_RULES);
  assess.push(performance.now() - s);
}
const maxAssess = Math.max(...assess.slice(1));
console.log(`申請の見込み（反対の計算 1 件）: 最大 ${maxAssess.toFixed(1)}ms（目安 ${LIMITS.assessMs}ms 以下）`);
const ok = meanDay <= LIMITS.dayMs && maxWeek <= LIMITS.weekMs && maxCivic <= LIMITS.weekMs && maxAssess <= LIMITS.assessMs;
console.log(ok ? '結果: 目安以内' : '結果: 目安を超えた');
process.exitCode = ok ? 0 : 1;
