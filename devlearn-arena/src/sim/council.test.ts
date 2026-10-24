import { describe, expect, it } from 'vitest';
import { COUNCIL, POLITICS_RULES } from '@/content/politics';
import { APPEAL_BORDER, appealConcede, appealOf, appealSuppress, EXPIRE_TRUST, SUPPRESS } from './appeal';
import { applyOp, type Op } from './commands';
import { CONCERN_PER_SHARE, gainsOf, judge, judgeAll, PASS_VOTES, persuade, PERSUADE, PUSHED_CONCERN, voteOf, weightOf, type Gains } from './council';
import { closeHearing, handOptions, issuesOf, playHand, type Hand } from './hearing';
import { STAGE_DAYS } from './permits';
import type { Application, CouncilMember, IssueId, ObjectionState, World } from './types';
import { stepDay } from './world';
import { grownVillage } from './__fixtures__/cities';

/**
 * 議会 7 席の採決（docs/game-design.md 18 章）と異議申し立て（19 章）。docs/testing-strategy.md 10.2「議会・申し立て」。
 * 点の式を表で固定し、理由の 1 行・説得の上限・申し立ての条件と 28 日と取り下げ・決定性を確かめる
 */

const member = (id: string): CouncilMember => COUNCIL.find((m) => m.id === id) as CouncilMember;
const ZERO: Record<IssueId, number> = { afford: 0, environment: 0, jobs: 0, finance: 0, safety: 0, traffic: 0, tech: 0 };
const gains = (values: Partial<Record<IssueId, number>>): Gains => ({ values: { ...ZERO, ...values }, raw: { ...ZERO, ...values } });

const o = (reasonId: string, share: number, patch: Partial<ObjectionState> = {}): ObjectionState => ({
  reasonId, group: 'neighbors', district: 0, strength: 0.5, share, full: share, basis: { value: 0 }, issue: share >= 5, layers: [0], ...patch,
});
/** 公聴会を経た、データセンターの申請（雇用 20%・電力 10%・冷却水 6%） */
const app = (objections: ObjectionState[], patch: Partial<Application> = {}): Application => ({
  id: 'a1', kind: 'facility', target: { type: 'datacenter', origin: { x: 46, y: 36 }, rotation: 0 }, stage: 'council', stageDay: 20, filedDay: 0,
  wallet: 'funds', reserved: 650, exception: true, objections, opposition: objections.reduce((a, x) => a + x.share, 0), mods: {},
  hearing: { heldDay: 18, attended: true }, ...patch,
});
const BASE = [o('dc-jobs', 20), o('dc-power', 10), o('dc-cooling-water', 6)];

describe('議員の点（18.2）を表で固定する', () => {
  it('重み: 主な論点 3・次の論点 1.5・ほか 0.5', () => {
    const m = member('kajiya');
    expect([weightOf(m, 'jobs'), weightOf(m, 'finance'), weightOf(m, 'tech')]).toEqual([3, 1.5, 0.5]);
  });

  it('姿勢 + Σ 重み × (得 − 懸念) + 支持率。懸念 = 割合 × 0.3（論点ごと）', () => {
    const g = gains({ jobs: 1.5, finance: 1.5, tech: 2.5 });
    const a = app(BASE);
    // 鍛冶谷（雇用 3・財政 1.5・姿勢 +1）: 1 + 3×(1.5 − 6) + 1.5×1.5 + 0.5×2.5 − 0.5×3（電力: 安全）− 0.5×1.8（冷却水: 環境）
    const k = judge(member('kajiya'), a, g, 50, POLITICS_RULES);
    expect(k.score).toBeCloseTo(1 + 3 * (1.5 - 20 * CONCERN_PER_SHARE) + 1.5 * 1.5 + 0.5 * 2.5 - 0.5 * 3 - 0.5 * 1.8, 6);
    expect(k.yes).toBe(false);
    // 新庄（技術 3・財政 1.5・姿勢 +2）
    const s = judge(member('shinjo'), a, g, 50, POLITICS_RULES);
    expect(s.score).toBeCloseTo(2 + 3 * 2.5 + 1.5 * 1.5 + 0.5 * 1.5 - 0.5 * 6 - 0.5 * 3 - 0.5 * 1.8, 6);
    expect(s.yes).toBe(true);
    // 支持率 60% 以上で +2、40% 以下で −2
    expect(judge(member('kajiya'), a, g, 60, POLITICS_RULES).score - k.score).toBeCloseTo(2, 9);
    expect(judge(member('kajiya'), a, g, 40, POLITICS_RULES).score - k.score).toBeCloseTo(-2, 9);
    expect(judge(member('kajiya'), a, g, 59, POLITICS_RULES).score).toBeCloseTo(k.score, 9);
  });

  it('押し切った理由の懸念は 3 割。説明の効きは確か +2・誤り −3（その論点の重みが 1.5 以上の議員だけ）。説得は +4', () => {
    const g = gains({});
    const plain = judge(member('kajiya'), app(BASE), g, 50, POLITICS_RULES).score;
    const pushed = judge(member('kajiya'), app([o('dc-jobs', 20, { hand: { kind: 'push', capital: 4, day: 18 } }), ...BASE.slice(1)]), g, 50, POLITICS_RULES).score;
    expect(pushed - plain).toBeCloseTo(3 * 20 * CONCERN_PER_SHARE * (1 - PUSHED_CONCERN), 6);
    const sound = app([o('dc-jobs', 20, { hand: { kind: 'explain', explanationId: 'dc-jobs-number', quality: 'sound', day: 18 } }), ...BASE.slice(1)]);
    expect(judge(member('kajiya'), sound, g, 50, POLITICS_RULES).score - plain).toBeCloseTo(2, 9);
    // 雇用の重みが 0.5 の汐見には効かない
    expect(judge(member('shiomi'), sound, g, 50, POLITICS_RULES).score).toBeCloseTo(judge(member('shiomi'), app(BASE), g, 50, POLITICS_RULES).score, 9);
    const wrong = app([o('dc-jobs', 20, { hand: { kind: 'explain', explanationId: 'dc-jobs-auto', quality: 'wrong', day: 18 } }), ...BASE.slice(1)]);
    expect(judge(member('kajiya'), wrong, g, 50, POLITICS_RULES).score - plain).toBeCloseTo(-3, 9);
    expect(judge(member('kajiya'), app(BASE, { persuaded: 'kajiya' }), g, 50, POLITICS_RULES).score - plain).toBeCloseTo(PERSUADE.points, 9);
    expect(judge(member('shiomi'), app(BASE, { persuaded: 'kajiya' }), g, 50, POLITICS_RULES).persuaded).toBe(false);
  });

  it('賛成は点が 0 以上。賛成 4 以上で可決、3 以下で否決', () => {
    expect(PASS_VOTES).toBe(4);
    const g = gains({ jobs: 6, tech: 5, finance: 4 });
    const w = grownVillage().world;
    const light = { ...w, sim: { ...w.sim, lastWeek: { ...w.sim.lastWeek, approval: 50 } } };
    const v = voteOf(light, app([o('dc-jobs', 6), o('dc-power', 4)]), POLITICS_RULES, 28);
    expect(v.members).toHaveLength(7);
    expect(v.passed).toBe(v.members.filter((m) => m.yes).length >= 4);
    for (const m of v.members) expect(m.yes).toBe(m.score >= 0);
    // 表: 小さな反対なら多くが賛成、大きな反対なら多くが反対
    const many = judgeAll(light, app([o('dc-jobs', 60), o('dc-power', 25), o('dc-cooling-water', 8)]), POLITICS_RULES).filter((j) => j.yes).length;
    const few = judgeAll(light, app([o('dc-jobs', 6), o('dc-power', 4)]), POLITICS_RULES).filter((j) => j.yes).length;
    expect(few).toBeGreaterThan(many);
    expect(g.values.jobs).toBe(6);
  });
});

describe('理由の 1 行（18.2）: 点に最も効いた項を言い表す', () => {
  it('反対なら一番大きな負の項、賛成なら一番大きな正の項。答えなかった論点は unanswered、押し切った論点は pushed', () => {
    const g = gains({ jobs: 1.5, tech: 2.5 });
    expect(judge(member('kajiya'), app(BASE), g, 50, POLITICS_RULES).reasonKey).toBe('concern:dc-jobs'.replace('concern', 'unanswered'));
    expect(judge(member('iwakiri'), app(BASE), g, 50, POLITICS_RULES).reasonKey).toBe('unanswered:dc-power');
    expect(judge(member('shinjo'), app(BASE), g, 50, POLITICS_RULES).reasonKey).toBe('gain:tech:2.5');
    const pushed = app([o('dc-jobs', 20, { hand: { kind: 'push', capital: 4, day: 18 } }), o('dc-power', 10, { hand: { kind: 'concede', concessionId: 'dc-power-trim', day: 18 } })]);
    expect(judge(member('nadamoto'), pushed, g, 50, POLITICS_RULES).reasonKey).toBe('pushed:dc-jobs');
    expect(judge(member('iwakiri'), pushed, g, 50, POLITICS_RULES).reasonKey).toBe('concern:dc-power');
    expect(judge(member('kajiya'), app(BASE, { persuaded: 'kajiya' }), { values: { ...ZERO, jobs: 6 }, raw: { ...ZERO, jobs: 60 } }, 50, POLITICS_RULES).reasonKey).toBe('gain:jobs:60');
    // 支持率が一番効いた時は、その時の支持率を持つ
    expect(judge(member('chouba'), app([]), gains({}), 35, POLITICS_RULES).reasonKey).toBe('approval:35');
    // 姿勢だけが効いた時
    expect(judge(member('shinjo'), app([]), gains({}), 50, POLITICS_RULES).reasonKey).toBe('stance');
    // 市長抜きの公聴会は、全ての論点に答えなかった
    const absent = app(BASE, { hearing: { heldDay: 34, attended: false } });
    expect(judge(member('kajiya'), absent, g, 50, POLITICS_RULES).reasonKey).toBe('unanswered:dc-jobs');
  });
});

/* ---------- 申請の流れの上で ---------- */

const GROWN = grownVillage();
const T = GROWN.terrain;
const NEAR: Op = { kind: 'facility', type: 'datacenter', origin: { x: 46, y: 36 }, rotation: 0 };
const days = (world: World, n: number): World => {
  let w = world;
  for (let i = 0; i < n; i += 1) w = stepDay(w, T, POLITICS_RULES);
  return w;
};
const appOf = (w: World, id: string): Application => w.applications.find((a) => a.id === id) as Application;
const today = (w: World): number => Math.floor(w.city.day);

function inHearing(): { world: World; id: string } {
  let w = applyOp(GROWN.world, NEAR, T, POLITICS_RULES);
  const id = (w.applications.at(-1) as Application).id;
  w = days(w, STAGE_DAYS.zoning + STAGE_DAYS.objection);
  return { world: w, id };
}
const H = inHearing();

/** 答え方を決めて公聴会を終え、議会の日まで進める */
function answer(plan: (o: ObjectionState, rank: number) => Hand | null, skills: Record<string, number> = {}, persuadeId?: string): World {
  let w = H.world;
  const issues = [...issuesOf(appOf(w, H.id))].sort((a, b) => b.share - a.share);
  issues.forEach((x, i) => {
    const h = plan(x, i);
    if (h) w = playHand(w, T, POLITICS_RULES, H.id, x.reasonId, h, skills, today(w)).world;
  });
  w = closeHearing(w, H.id, today(w));
  if (persuadeId) w = persuade(w, POLITICS_RULES, H.id, persuadeId, today(w)).world;
  return days(w, 15);
}
const firstConcession = (w: World, reasonId: string): string =>
  handOptions(w, appOf(w, H.id), reasonId, {}, POLITICS_RULES)?.concessions.find((c) => !c.concession.requires)?.concession.id ?? '';

describe('同じ申請で、公聴会の答え方を変えると、賛否と 1 行が変わる（G6 の完成条件）', () => {
  it('答えない / 譲歩する / 押し切って説得する で、賛成の数と各人の理由が変わる', () => {
    const silent = appOf(answer(() => null), H.id);
    const conceded = appOf(answer((x) => ({ kind: 'concede', concessionId: firstConcession(H.world, x.reasonId) })), H.id);
    const pushed = appOf(answer((x, i) => (i === 0 ? { kind: 'push' } : { kind: 'concede', concessionId: firstConcession(H.world, x.reasonId) }), {}, 'michishita'), H.id);
    const yes = (a: Application): number => a.vote?.members.filter((m) => m.yes).length ?? -1;
    expect(yes(silent)).toBeLessThan(yes(conceded));
    expect(yes(conceded)).toBeLessThan(yes(pushed));
    expect(silent.stage).toBe('rejected');
    expect(yes(pushed)).toBeGreaterThanOrEqual(4);
    expect(['appeal', 'construction']).toContain(pushed.stage);
    const keys = (a: Application): string[] => a.vote?.members.map((m) => m.reasonKey) ?? [];
    expect(keys(silent)).not.toEqual(keys(conceded));
    expect(keys(silent).some((k) => k.startsWith('unanswered:'))).toBe(true);
    expect(keys(pushed)).toContain('persuaded');
  });

  it('決定性: 同じ答え方を 2 回流すと、採決が深く等しい', () => {
    const plan = (x: ObjectionState, i: number): Hand => (i === 0 ? { kind: 'push' } : { kind: 'concede', concessionId: firstConcession(H.world, x.reasonId) });
    expect(appOf(answer(plan), H.id).vote).toEqual(appOf(answer(plan), H.id).vote);
  });
});

describe('議員を説得する（18.2）', () => {
  it('政治資本 3 で 1 人。1 件の申請で 1 人まで。採決の前（議会の段）だけ。足りなければ出せない', () => {
    expect(persuade(H.world, POLITICS_RULES, H.id, 'kajiya', today(H.world)).problem).toBe('stage');
    const w = closeHearing(H.world, H.id, today(H.world));
    const r = persuade(w, POLITICS_RULES, H.id, 'kajiya', today(w));
    expect(r.problem).toBeUndefined();
    expect(r.world.politics.capital).toBe(w.politics.capital - PERSUADE.capital);
    expect(appOf(r.world, H.id).persuaded).toBe('kajiya');
    expect(persuade(r.world, POLITICS_RULES, H.id, 'shiomi', today(w)).problem).toBe('used');
    const poor = { ...w, politics: { ...w.politics, capital: 2 } };
    expect(persuade(poor, POLITICS_RULES, H.id, 'kajiya', today(w)).problem).toBe('capital');
    const voted = days(r.world, 15);
    expect(persuade(voted, POLITICS_RULES, H.id, 'shiomi', today(voted)).problem).toBe('stage');
  });
});

describe('異議申し立て（19 章）', () => {
  it('条件: 可決した時の反対率が境以上で、押し切った論点か、手を出さなかった論点がある時だけ', () => {
    expect(APPEAL_BORDER).toEqual({ gentle: 45, normal: 35, tough: 25 });
    const pushed = app([o('dc-jobs', 30, { hand: { kind: 'push', capital: 6, day: 18 } }), o('dc-power', 10, { hand: { kind: 'concede', concessionId: 'dc-power-trim', day: 18 }, group: 'neighbors' })]);
    expect(appealOf(pushed, 'normal')).toBe('neighbors');
    // 境の下なら立たない
    expect(appealOf({ ...pushed, opposition: 34.9 }, 'normal')).toBeNull();
    expect(appealOf(pushed, 'gentle')).toBeNull();
    // 全ての論点に譲歩か説明で答えていれば立たない
    const answered = app([o('dc-jobs', 30, { hand: { kind: 'concede', concessionId: 'dc-jobs-local', day: 18 } }), o('dc-power', 10, { hand: { kind: 'explain', explanationId: 'dc-power-virt', quality: 'sound', day: 18 } })]);
    expect(appealOf(answered, 'tough')).toBeNull();
    // 手を出さなかった論点。割合の一番大きい理由の集団が申し立てる
    const silent = app([o('dc-jobs', 20, { group: 'neighbors' }), o('dc-cooling-water', 25, { group: 'environment' })]);
    expect(appealOf(silent, 'normal')).toBe('environment');
  });

  /** 押し切って説得し、可決したが申し立てが立った申請 */
  function appealed(): World {
    const w = answer((x, i) => (i === 0 ? { kind: 'push' } : { kind: 'concede', concessionId: firstConcession(H.world, x.reasonId) }), {}, 'michishita');
    const a = appOf(w, H.id);
    if (a.stage === 'appeal') return w;
    // 境の手前で可決した時は、採決の前に申し立ての境を手ごわい町（25%）にして立てる（反対率は公聴会の時のまま）
    let x = H.world;
    const issues = [...issuesOf(appOf(x, H.id))].sort((p, q) => q.share - p.share);
    issues.forEach((y, i) => {
      x = playHand(x, T, POLITICS_RULES, H.id, y.reasonId, i === 0 ? { kind: 'push' } : { kind: 'concede', concessionId: firstConcession(H.world, y.reasonId) }, {}, today(x)).world;
    });
    x = closeHearing(x, H.id, today(x));
    x = persuade(x, POLITICS_RULES, H.id, 'michishita', today(x)).world;
    x = { ...x, politics: { ...x.politics, difficulty: 'tough' } };
    return days(x, 15);
  }

  it('立つと 28 日、着工が止まる。28 日が過ぎると退けられ、着工する（申し立てた集団の層の信頼 −1）', () => {
    const w = appealed();
    const a = appOf(w, H.id);
    expect(a.stage).toBe('appeal');
    expect(typeof a.appeal?.group).toBe('string');
    expect(w.city.facilities.some((f) => f.type === 'datacenter')).toBe(false);
    // 申し立てが立った日から 27 日目まで止まる
    const d27 = days(w, 27 - (today(w) - a.stageDay));
    expect(appOf(d27, H.id).stage).toBe('appeal');
    const d28 = days(d27, 1);
    expect(appOf(d28, H.id)).toMatchObject({ stage: 'construction', appeal: { resolved: 'expired' } });
    const layers = [...new Set(a.objections.filter((x) => x.group === a.appeal?.group).flatMap((x) => x.layers ?? []))];
    expect(layers.length).toBeGreaterThan(0);
    // 同じ日を、申し立てが既に片付いていた形で進めた時と比べる（信頼は週ごとにも動くため）
    const settled = { ...d27, applications: d27.applications.map((x) => (x.id === H.id ? { ...x, appeal: { ...(x.appeal as NonNullable<Application['appeal']>), resolved: 'capital' as const } } : x)) };
    const other = days(settled, 1);
    for (const l of layers) expect((d28.sim.trust[l] ?? 0) - (other.sim.trust[l] ?? 0)).toBeCloseTo(EXPIRE_TRUST, 1);
  });

  it('政治資本 4 で抑えると、次の日に着工する（申し立てた集団の層の信頼 −2）。足りなければ出せない', () => {
    const w0 = appealed();
    const w = { ...w0, politics: { ...w0.politics, capital: 10 } };
    const r = appealSuppress(w, H.id, today(w));
    expect(r.problem).toBeUndefined();
    expect(r.world.politics.capital).toBe(10 - SUPPRESS.capital);
    const a = appOf(w, H.id);
    for (const l of new Set(a.objections.filter((x) => x.group === a.appeal?.group).flatMap((x) => x.layers ?? []))) {
      expect(r.world.sim.trust[l]).toBeCloseTo(Math.max(-15, (w.sim.trust[l] ?? 0) + SUPPRESS.trust), 9);
    }
    expect(appOf(days(r.world, 1), H.id)).toMatchObject({ stage: 'construction', appeal: { resolved: 'capital' } });
    expect(appealSuppress({ ...w, politics: { ...w.politics, capital: 3 } }, H.id, today(w)).problem).toBe('capital');
  });

  it('追加の譲歩: 公聴会で譲歩しなかった論点に譲歩し、反対率が境を下回れば取り下げられる。費用はすぐ取り分けに足す', () => {
    const w = appealed();
    const a = appOf(w, H.id);
    const open = a.objections.filter((x) => x.issue && x.hand?.kind !== 'concede');
    expect(open.length).toBeGreaterThan(0);
    // 公聴会で譲歩した論点には出せない
    const done = a.objections.find((x) => x.hand?.kind === 'concede');
    if (done) expect(appealConcede(w, T, POLITICS_RULES, H.id, done.reasonId, firstConcession(H.world, done.reasonId), {}, today(w)).problem).toBe('issue');
    const target = open[0] as ObjectionState;
    const r = appealConcede(w, T, POLITICS_RULES, H.id, target.reasonId, firstConcession(H.world, target.reasonId), {}, today(w));
    expect(r.problem).toBeUndefined();
    const after = appOf(r.world, H.id);
    expect(after.reserved).toBeGreaterThanOrEqual(a.reserved);
    expect(r.world.city.funds).toBe(w.city.funds - (after.reserved - a.reserved));
    // 譲歩した理由の強さが、模擬の上で下がる
    expect(after.objections.find((x) => x.reasonId === target.reasonId)?.strength).toBeLessThan(target.strength);
    expect(r.withdrawn).toBe(after.opposition < APPEAL_BORDER[w.politics.difficulty]);
    if (r.withdrawn) expect(appOf(days(r.world, 1), H.id)).toMatchObject({ stage: 'construction', appeal: { resolved: 'conceded' } });
    else expect(appOf(days(r.world, 1), H.id).stage).toBe('appeal');
  });

  it('得: データセンターは雇用 15 人分・技術力 1・税収が週に 0.75（倍率で 1.5・2.5・1.5）', () => {
    const g = gainsOf(H.world, appOf(H.world, H.id));
    expect(g.raw).toMatchObject({ jobs: 15, tech: 1 });
    expect(g.raw.finance).toBeCloseTo(0.75, 6);
    expect(g.values).toMatchObject({ jobs: 1.5, tech: 2.5, afford: 0, traffic: 0 });
    expect(g.values.finance).toBeCloseTo(1.5, 6);
  });
});
