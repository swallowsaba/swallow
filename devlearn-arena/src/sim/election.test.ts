import { describe, expect, it } from 'vitest';
import { NAME_PARTS, POLITICS_RULES } from '@/content/politics';
import { applyOp } from './commands';
import {
  CAPITAL_CAP, causesOf, choosePledges, conditionValues, creditMission, electionDayOf, electionOf, GAIN, layerAdults, pledgeMet, rerun, TERM_DAYS, turnoutOf, voteShareOf, WARN_DAYS,
} from './election';
import { LAYER_COUNT } from './layers';
import type { Application, Pledge, PoliticsRules, World } from './types';
import { SimRunner } from './runner';
import { newWorld, stepDay } from './world';
import { grownVillage } from './__fixtures__/cities';

/**
 * 選挙・政治資本・任期・公約（docs/game-design.md 21 章）。投票率と得票率の式を表で固定し、
 * 敗因の組み立て・公約の判定・政治資本の得る・使う・上限・落選の後の道を確かめる
 */

const GROWN = grownVillage(120);
const T = GROWN.terrain;
const days = (world: World, n: number, rules: PoliticsRules = POLITICS_RULES): World => {
  let w = world;
  for (let i = 0; i < n; i += 1) w = stepDay(w, T, rules);
  return w;
};
const today = (w: World): number => Math.floor(w.city.day);
/** 選挙の日まで残り n 日になるよう、任期の初めをずらした世界 */
const beforeElection = (w: World, n: number): World => ({ ...w, politics: { ...w.politics, term: { ...w.politics.term, startDay: today(w) + n - TERM_DAYS + 1 } } });
const PLEDGES: Pledge[] = [
  { id: 'p-pop', title: '人口を増やす', goal: 'population >= start.population + 1', layers: [0, 1] },
  { id: 'p-unemp', title: '失業率を下げる', goal: 'unemployment <= 0', layers: [6] },
  { id: 'p-never', title: '届かない', goal: 'population >= start.population * 100', layers: [9, 10] },
];
const RULES: PoliticsRules = { ...POLITICS_RULES, pledges: PLEDGES };

describe('投票率と得票率（21.1）を表で固定する', () => {
  it('投票率 = 年齢の帯の基本 + 収入の帯 + 0.2 × |支持 − 50| ÷ 50', () => {
    // 層 = 年齢 × 3 + 収入（若者・低 = 0、子育て・中 = 4、高齢・高 = 11）
    expect(turnoutOf(0, 50)).toBeCloseTo(0.25);
    expect(turnoutOf(4, 0)).toBeCloseTo(0.7);
    expect(turnoutOf(11, 100)).toBeCloseTo(1.0);
    expect(turnoutOf(7, 75)).toBeCloseTo(0.7);
  });

  it('得票率 = Σ 人数 × 投票率 × 支持 ÷ Σ 人数 × 投票率。投票に行く層は人数以上に効く', () => {
    const people = new Array<number>(LAYER_COUNT).fill(0);
    const support = new Array<number>(LAYER_COUNT).fill(50);
    // 若者・低 100 人が 30（投票率 0.25 + 0.08 = 0.33）、高齢・高 100 人が 70（0.8 + 0.08 = 0.88）
    people[0] = 100;
    support[0] = 30;
    people[11] = 100;
    support[11] = 70;
    const r = voteShareOf(people, support);
    expect(r.share).toBeCloseTo((100 * 0.33 * 30 + 100 * 0.88 * 70) / (100 * 0.33 + 100 * 0.88), 6);
    // 人数は同じだが、投票に行く高齢の層が勝つ
    expect(r.share).toBeGreaterThan(50);
    // 層ごとの効き（得票率 − 50 に足し合わせると一致）
    expect(r.effects.reduce((s, e) => s + e.points, 0)).toBeCloseTo(r.share - 50, 6);
    expect(r.effects[0]?.layer).toBe(11);
  });

  it('模擬の世界から: 層の 18 歳以上の人数と、層の支持（週の内訳）で決まる。同じ世界からは同じ結果', () => {
    const w = GROWN.world;
    const adults = layerAdults(w);
    expect(adults.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    const a = electionOf(w);
    expect(a).toEqual(electionOf(w));
    expect(a.byLayer).toHaveLength(LAYER_COUNT);
    expect(a.voteShare).toBeGreaterThan(0);
    expect(a.won).toBe(a.voteShare >= 50);
  });
});

describe('任期と選挙の日（21.1）', () => {
  it('任期は 208 週。選挙は任期の最後の日。8 週前に知らせる日', () => {
    expect(TERM_DAYS).toBe(208 * 7);
    expect(electionDayOf({ startDay: 10 })).toBe(10 + 1455);
    expect(WARN_DAYS).toBe(56);
  });

  it('当選: 任期の一覧を残し、政治資本 +5（上限 30）、次の任期が始まる（公約は選び直す）', () => {
    const w0 = beforeElection(GROWN.world, 1);
    const won = { ...w0, sim: { ...w0.sim, lastWeek: { ...w0.sim.lastWeek, approval: 90 } }, history: { ...w0.history, breakdown: w0.history.breakdown.map((b) => ({ ...b, layers: (b.layers ?? []).map(() => 90) })) } };
    const after = days(won, 1, RULES);
    const last = after.politics.pastTerms.at(-1);
    expect(last?.won).toBe(true);
    expect(last?.no).toBe(1);
    expect(last?.endDay).toBe(today(after));
    expect(after.politics.term.no).toBe(2);
    expect(after.politics.term.startDay).toBe(today(after) + 1);
    expect(after.politics.term.pledges).toEqual([]);
    expect(after.politics.capital).toBe(Math.min(CAPITAL_CAP, w0.politics.capital + GAIN.win));
    expect(after.politics.defeated).toBeUndefined();
  });

  it('落選: 敗因（得票を下げた層を大きい順に 3 つ・要因・原因の決定）を残し、選ぶまで都市は止まる', () => {
    const w0 = beforeElection(GROWN.world, 1);
    const lost = { ...w0, history: { ...w0.history, breakdown: w0.history.breakdown.map((b) => ({ ...b, layers: (b.layers ?? []).map((_, i) => (i < 6 ? 20 : 45)) })) } };
    const after = days(lost, 1, RULES);
    const last = after.politics.pastTerms.at(-1);
    expect(last?.won).toBe(false);
    expect(after.politics.defeated).toBe(true);
    expect(last?.causes?.length).toBe(3);
    // 大きい順（得票を最も下げた層が先）
    const r = electionOf(lost);
    const worst = [...r.effects].sort((a, b) => a.points - b.points).slice(0, 3).map((e) => e.layer);
    expect(last?.causes?.map((c) => c.layer)).toEqual(worst);
    // 選ぶまで、日は進まない
    expect(days(after, 5, RULES)).toBe(after);
    // Worker の模擬も、進めてと言われても止まったまま返る（日が進まないので、待ち続けない）
    const runner = new SimRunner(after);
    runner.load(after, 0, RULES);
    runner.advance(today(after) + 5);
    expect(runner.current).toBe(after);
    // 再び立つと、また進む
    runner.apply({ seq: 1, day: today(after), op: { kind: 'rerun' } });
    runner.advance(today(after) + 2);
    expect(today(runner.current)).toBe(today(after) + 2);
  });

  it('敗因の要因は、その層の点を下げた要因（内訳の [要因][層]）を大きい順。決定は、その要因を下げた原因の ID', () => {
    const w = GROWN.world;
    const r = electionOf(w);
    const causes = causesOf(w, r);
    expect(causes.length).toBeLessThanOrEqual(3);
    for (const c of causes) {
      const pts = c.factors.map((f) => f.points);
      expect([...pts].sort((a, b) => a - b)).toEqual(pts);
      for (const p of pts) expect(p).toBeLessThan(0);
      for (const d of c.decisions) expect(d).toMatch(/^(facility|zone|road|decision):/);
    }
  });
});

describe('公約（21.4）', () => {
  it('2 つ選ぶ。初めの値を覚える。知らない ID・同じ物・2 つでない時は選べない', () => {
    // 失業のある町（失業率 0% の町では「失業率を下げる」は選ぶ時に果たしている）
    const w = { ...GROWN.world, sim: { ...GROWN.world.sim, lastWeek: { ...GROWN.world.sim.lastWeek, unemployment: 0.2 } } };
    const ok = choosePledges(w, ['p-pop', 'p-unemp'], RULES);
    expect(ok.problem).toBeUndefined();
    expect(ok.world.politics.term.pledges).toEqual([{ pledgeId: 'p-pop', startValue: w.city.population }, { pledgeId: 'p-unemp', startValue: 0 }]);
    for (const bad of [['p-pop'], ['p-pop', 'p-pop'], ['p-pop', 'nope'], ['p-pop', 'p-unemp', 'p-never']]) expect(choosePledges(w, bad, RULES).problem, bad.join()).toBeDefined();
    // 選んだ後は選び直せない（任期の初めだけ）
    expect(choosePledges(ok.world, ['p-pop', 'p-never'], RULES).problem).toBe('chosen');
  });

  it('選ぶ時にすでに果たしている公約は選べない（人が住む前の「人口を 2 割増やす」は 0 ≥ 0。何もせずに政治資本を得ない）', () => {
    const empty = newWorld(T, NAME_PARTS);
    expect(empty.city.population).toBe(0);
    const rules: PoliticsRules = { ...RULES, pledges: [...PLEDGES, { id: 'p-grow', title: '2 割増やす', goal: 'population >= start.population * 1.2', layers: [0] }, { id: 'p-low', title: '失業率を 5% 以下', goal: 'unemployment <= 5', layers: [0] }] };
    expect(choosePledges(empty, ['p-grow', 'p-never'], rules).problem).toBe('met');
    expect(choosePledges(empty, ['p-low', 'p-never'], rules).problem).toBe('met');
    // 人が住んで失業率が 5% を超える町なら、同じ公約を選べる
    const w = { ...GROWN.world, sim: { ...GROWN.world.sim, lastWeek: { ...GROWN.world.sim.lastWeek, unemployment: 0.3 } } };
    expect(choosePledges(w, ['p-grow', 'p-low'], rules).problem).toBeUndefined();
  });

  it('果たすと政治資本 +5・重く見る層の信頼 +3（週の終わりに確かめる）。選挙の日に果たせていない公約は −3', () => {
    const w0 = choosePledges({ ...GROWN.world, politics: { ...GROWN.world.politics, capital: 10 } }, ['p-pop', 'p-never'], RULES).world;
    const grown = { ...w0, politics: { ...w0.politics, term: { ...w0.politics.term, pledges: w0.politics.term.pledges.map((p) => (p.pledgeId === 'p-pop' ? { ...p, startValue: 0 } : p)) } } };
    const w1 = days(grown, 7, RULES);
    const pop = w1.politics.term.pledges.find((p) => p.pledgeId === 'p-pop');
    expect(pop?.doneDay).toBeDefined();
    expect(w1.politics.capital).toBe(10 + GAIN.pledge + w1.politics.capitalLog.filter((x) => x.day > today(grown) && x.why === '支持率の上昇').length);
    expect(w1.politics.capitalLog.some((x) => x.why === '公約を果たした（人口を増やす）')).toBe(true);
    expect(w1.sim.trust[0]).toBe(grown.sim.trust[0] as number + 3);
    expect(w1.politics.term.pledges.find((p) => p.pledgeId === 'p-never')?.doneDay).toBeUndefined();
    // 選挙の日に果たせていない公約の層は −3。公約を果たせずに選挙を迎えたことが新聞の不祥事になり、同じ層がさらに −1（22.3）
    const e = days(beforeElection(w1, 1), 1, RULES);
    expect(e.sim.trust[9]).toBe((w1.sim.trust[9] as number) - 3 - 1);
    expect(e.history.news.some((a) => a.kind === 'scandal' && a.headline === '公約 1 つ、果たせぬまま選挙へ')).toBe(true);
    expect(e.politics.pastTerms.at(-1)?.pledgesDone).toEqual(['p-pop']);
  });

  it('公約の条件の値（7.7）: 人口・雇用・失業率・支持率・財政・税率・完成した IT 施設・達成したミッション', () => {
    const v = conditionValues(GROWN.world);
    expect(v.population).toBe(GROWN.world.city.population);
    expect(v.unemployment).toBeCloseTo(GROWN.world.sim.lastWeek.unemployment * 100);
    expect(v['facilities.it']).toBe(GROWN.world.city.facilities.filter((f) => f.type === 'server' && f.state === 'active').length);
    expect(v.missionsDone).toBe(0);
  });
});

describe('政治資本の得る側と上限（21.5）', () => {
  it('ミッションの達成で +3。同じミッションは 1 度だけ', () => {
    const w = { ...GROWN.world, politics: { ...GROWN.world.politics, capital: 10 } };
    const a = creditMission(w, 'incident', today(w));
    expect(a.politics.capital).toBe(13);
    expect(a.politics.missions).toEqual(['incident']);
    expect(creditMission(a, 'incident', today(w))).toBe(a);
    expect(conditionValues(a).missionsDone).toBe(1);
  });

  it('上限 30 を超えない', () => {
    const w = { ...GROWN.world, politics: { ...GROWN.world.politics, capital: 29 } };
    expect(creditMission(w, 'incident', today(w)).politics.capital).toBe(CAPITAL_CAP);
  });

  it('支持率の上昇: 4 週ごとに、4 週前より 3 以上高ければ +1', () => {
    const w = GROWN.world;
    // 次の 4 の倍数の週の終わりの前の日まで進め、4 週前の支持率を低く書き換える
    let near = w;
    while ((Math.floor(near.city.day) + 1) % 7 !== 0 || ((Math.floor(near.city.day) + 1) / 7) % 4 !== 0) near = days(near, 1);
    const at4 = (today(near) + 1) / 7;
    const low = { ...near, history: { ...near.history, breakdown: near.history.breakdown.map((b) => (b.week === at4 - 4 ? { ...b, approval: near.sim.lastWeek.approval - 10 } : b)) } };
    expect(low.history.breakdown.some((b) => b.week === at4 - 4)).toBe(true);
    const after = days(low, 1, RULES);
    expect(after.politics.capitalLog.at(-1)?.why).toBe('支持率の上昇');
    expect(after.politics.capital).toBe(low.politics.capital + GAIN.rise);
    // 4 週前と同じなら得ない
    const same = { ...near, history: { ...near.history, breakdown: near.history.breakdown.map((b) => (b.week === at4 - 4 ? { ...b, approval: 100 } : b)) } };
    expect(days(same, 1, RULES).politics.capital).toBe(near.politics.capital);
  });
});

describe('落選の後の道（21.2）', () => {
  it('同じ都市で再び立つ: 都市はそのまま。政治資本は初めの値・審議中の申請は取り下げ（費用は戻る）・次の任期で公約を選び直す', () => {
    const w0 = applyOp(GROWN.world, { kind: 'facility', type: 'datacenter', origin: { x: 46, y: 36 }, rotation: 0 }, T, POLITICS_RULES);
    const app = w0.applications.at(-1) as Application;
    expect(app.stage).not.toBe('withdrawn');
    const lost: World = { ...w0, politics: { ...w0.politics, capital: 2, defeated: true, pastTerms: [...w0.politics.pastTerms] } };
    const r = rerun(lost, today(lost));
    expect(r.politics.defeated).toBeUndefined();
    expect(r.politics.capital).toBe(10);
    expect(r.politics.term.no).toBe(lost.politics.term.no + 1);
    expect(r.politics.term.pledges).toEqual([]);
    expect(r.applications.find((a) => a.id === app.id)?.stage).toBe('withdrawn');
    expect(r.city.funds).toBe(lost.city.funds + app.reserved);
    expect(r.city.buildings).toBe(lost.city.buildings);
    // 落選していなければ何もしない
    expect(rerun(w0, today(w0))).toBe(w0);
  });
});

describe('公共サービスの公約（7.7 の coverage.<種類>。G10）', () => {
  it('住民の行き届きの平均（週の終わりの値）で果たしたかを決める。完成した公共サービスの数を facilities.civic で数える', () => {
    const w = GROWN.world;
    expect(pledgeMet(w, 'coverage.school >= 60')).toBe(false);
    const covered = { ...w, sim: { ...w.sim, lastWeek: { ...w.sim.lastWeek, coverage: { police: 55, fire: 0, school: 64, clinic: 51, park: 0 } } } };
    expect(pledgeMet(covered, 'coverage.school >= 60')).toBe(true);
    expect(pledgeMet(covered, 'coverage.police >= 50 && coverage.clinic >= 50')).toBe(true);
    const civic = { ...w, city: { ...w.city, facilities: [...w.city.facilities, { id: 'cv', type: 'police' as const, origin: { x: 53, y: 48 }, rotation: 0 as const, level: 1 as const, state: 'active' as const, builtDay: 0 }] } };
    expect(conditionValues(civic)['facilities.civic']).toBe(1);
    expect(conditionValues(civic)['facilities.it']).toBe(conditionValues(w)['facilities.it']);
  });
});
