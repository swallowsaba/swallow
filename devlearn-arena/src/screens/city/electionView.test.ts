import { describe, expect, it } from 'vitest';
import { POLITICS_RULES } from '@/content/politics';
import { grownVillage } from '@/sim/__fixtures__/cities';
import { applyOp } from '@/sim/commands';
import { electionOf, TERM_DAYS } from '@/sim/election';
import type { World } from '@/sim/types';
import { stepDay } from '@/sim/world';
import { electionModel, goalText, pledgeOptions, termModel } from './electionView';

/**
 * 選挙の画面（docs/ui-design.md 10.6）・任期の終わりの一覧（10.7）・公約を選ぶ窓に出す中身。
 * 規則は src/sim/election.ts。ここでは、模擬の結果が表と文に正しく写ることを確かめる
 */

const GROWN = grownVillage(120);
const T = GROWN.terrain;
const today = (w: World): number => Math.floor(w.city.day);
const days = (world: World, n: number): World => {
  let w = world;
  for (let i = 0; i < n; i += 1) w = stepDay(w, T, POLITICS_RULES);
  return w;
};
const beforeElection = (w: World, n: number): World => ({ ...w, politics: { ...w.politics, term: { ...w.politics.term, startDay: today(w) + n - TERM_DAYS + 1 } } });
/** 層の支持を全て決めた世界（若い 6 層を low、残りを high） */
const supported = (w: World, low: number, high: number): World => ({
  ...w,
  sim: { ...w.sim, lastWeek: { ...w.sim.lastWeek, approval: (low + high) / 2 } },
  history: { ...w.history, breakdown: w.history.breakdown.map((b) => ({ ...b, layers: (b.layers ?? []).map((_, i) => (i < 6 ? low : high)) })) },
});

describe('公約の今の値と目標', () => {
  it('start の語は、選んだ時の値から目標を出す（掛ける・足す）。数の目標はそのまま', () => {
    expect(goalText({ goal: 'population >= start.population * 1.2' }, { population: 110 }, 100)).toBe('人口 110人（目標 120人以上）');
    expect(goalText({ goal: 'facilities.it >= start.facilities.it + 2' }, { 'facilities.it': 1 }, 1)).toBe('完成した IT 施設 1つ（目標 3つ以上）');
    expect(goalText({ goal: 'unemployment <= 5' }, { unemployment: 7.25 }, undefined)).toBe('失業率 7.3%（目標 5%以下）');
    // 財政は単位を付けず、桁を区切る
    expect(goalText({ goal: 'treasury >= start.treasury + 1000' }, { treasury: 800 }, 800)).toBe('財政 800（目標 1,800以上）');
  });

  it('公約の候補は全て、今の値と目標と重く見る層を添えて並ぶ（start の語は今の値を初めの値にする）', () => {
    const w = GROWN.world;
    const options = pledgeOptions(w);
    expect(options.map((o) => o.id)).toEqual(POLITICS_RULES.pledges?.map((p) => p.id));
    const pop = options.find((o) => o.id === 'pop-grow');
    const n = w.city.population;
    expect(pop?.text).toBe(`人口 ${n.toLocaleString('ja-JP')}人（目標 ${(Math.ceil(n * 1.2 * 10) / 10).toLocaleString('ja-JP')}人以上）`);
    // 層は名前で（4 つ以上は「ほか」）
    expect(options.find((o) => o.id === 'unemployment-low')?.layers).toBe('低い収入の若者・中くらいの収入の若者・低い収入の子育てほか');
    expect(options.find((o) => o.id === 'pop-grow')?.layers).toBe('低い収入の中年・中くらいの収入の中年・高い収入の中年');
  });
});

describe('選挙の見込み（上の帯の任期の残りから。10.6 と同じ表）', () => {
  it('得票率は模擬の選挙と同じ。12 層を 4×3（行が年齢の帯、列が収入の帯）に並べ、支持と投票率を % で', () => {
    const w = GROWN.world;
    const m = electionModel(w, 'preview');
    const r = electionOf(w);
    expect(m?.mode).toBe('preview');
    expect(m?.voteShare).toBe(Math.round(r.voteShare * 10) / 10);
    expect(m?.rows.map((row) => row.age)).toEqual(['若者', '子育て', '中年', '高齢']);
    expect(m?.rows.every((row) => row.cells.length === 3)).toBe(true);
    // 子育て・高い収入 = 層 5
    const cell = m?.rows[1]?.cells[2];
    expect(cell?.layer).toBe(5);
    expect(cell?.name).toBe('高い収入の子育て');
    expect(cell?.turnout).toBe(Math.round((r.byLayer[5]?.turnout ?? 0) * 100));
    expect(cell?.support).toBe(Math.round(r.byLayer[5]?.support ?? 0));
    // 得票に効いた層は 3 つまで、|効き| の大きい順
    expect(m?.top.length).toBeLessThanOrEqual(3);
    const pts = m?.top.map((t) => Math.abs(t.points)) ?? [];
    expect([...pts].sort((a, b) => b - a)).toEqual(pts);
  });

  it('選挙までの週と、選んだ公約の今の値（果たした物は「果たした」）', () => {
    const w0 = beforeElection(GROWN.world, 7 * 38);
    const chosen = applyOp(w0, { kind: 'pledges', ids: ['pop-grow', 'unemployment-low'] }, T, POLITICS_RULES);
    const m = electionModel(chosen, 'preview');
    expect(m?.weeksLeft).toBe(38);
    expect(m?.pledges.map((p) => p.title)).toEqual(['人口を 2 割増やす', '失業率を 5% 以下にする']);
    expect(m?.pledges[0]?.done).toBe(false);
    expect(m?.pledges[0]?.text).toMatch(/^人口 [\d,]+人（目標 [\d,.]+人以上）$/);
    const done = { ...chosen, politics: { ...chosen.politics, term: { ...chosen.politics.term, pledges: chosen.politics.term.pledges.map((p, i) => (i === 0 ? { ...p, doneDay: 3 } : p)) } } };
    expect(electionModel(done, 'preview')?.pledges[0]).toMatchObject({ done: true, text: '果たした' });
  });
});

describe('選挙の結果（選挙の日に開く）', () => {
  it('選挙の前は結果が無い', () => {
    expect(electionModel(GROWN.world, 'result')).toBeNull();
    expect(termModel(GROWN.world)).toBeNull();
  });

  it('当選: 最後の任期の得票率と表。敗因は無く、落選の道も出さない', () => {
    const after = days(supported(beforeElection(GROWN.world, 1), 90, 90), 1);
    const m = electionModel(after, 'result');
    expect(m?.title).toBe('1 期目の選挙の結果');
    expect(m?.won).toBe(true);
    expect(m?.voteShare).toBe(Math.round((after.politics.pastTerms.at(-1)?.voteShare ?? 0) * 10) / 10);
    expect(m?.causes).toEqual([]);
    expect(m?.defeated).toBe(false);
  });

  it('落選: 敗因の層を 3 つ（要因の名前と点・原因になった決定）。選ぶまで defeated', () => {
    const after = days(supported(beforeElection(GROWN.world, 1), 20, 45), 1);
    const m = electionModel(after, 'result');
    const past = after.politics.pastTerms.at(-1);
    expect(m?.won).toBe(false);
    expect(m?.defeated).toBe(true);
    expect(m?.causes.map((c) => c.layer)).toEqual(past?.causes?.map((c) => c.layer));
    expect(m?.causes.length).toBe(3);
    for (const c of m?.causes ?? []) {
      expect(c.name).toMatch(/の(若者|子育て|中年|高齢)$/);
      // 「家賃 −4.2」の形（要因の名前と、その層の点）
      for (const f of c.factors) expect(f).toMatch(/^\S+ -[\d.]+$/);
      for (const d of c.decisions) expect(d.text.length).toBeGreaterThan(0);
    }
  });
});

describe('任期の終わりの一覧（10.7）', () => {
  it('その任期の数字の始めと終わり・可決と否決の数・支持率の線・果たした公約・修了したレッスンと上がったスキル', () => {
    let w = applyOp(beforeElection(GROWN.world, 1), { kind: 'learning', lessonsDone: 2, stages: { linux: 1 } }, T, POLITICS_RULES);
    w = applyOp(w, { kind: 'pledges', ids: ['pop-grow', 'it-two'] }, T, POLITICS_RULES);
    w = applyOp(w, { kind: 'learning', lessonsDone: 5, stages: { linux: 2, git: 1 } }, T, POLITICS_RULES);
    const after = days(supported(w, 90, 90), 1);
    const t = termModel(after);
    const past = after.politics.pastTerms.at(-1);
    expect(t?.no).toBe(1);
    expect(t?.won).toBe(true);
    expect(t?.numbers.map((n) => n.name)).toEqual(['人口', '働き口', '財政', '支持率']);
    expect(t?.numbers[0]?.to).toBe(`${(past?.population[1] ?? 0).toLocaleString('ja-JP')} 人`);
    expect(t?.approved).toBe(past?.approved);
    expect(t?.rejected).toBe(past?.rejected);
    // 学習の進み（任期の初めの値からの差。市政の条件には使わない）
    expect(t?.lessonsDone).toBe(3);
    expect(t?.skillsUp).toEqual(['Linux / CLI', 'Git']);
    // 支持率の線は、その任期の週の値
    expect(t?.approvalLine.length).toBeGreaterThan(0);
  });
});
