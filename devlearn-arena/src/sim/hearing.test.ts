import { describe, expect, it } from 'vitest';
import { POLITICS_RULES, REASONS } from '@/content/politics';
import { applyOp, type Op } from './commands';
import { closeHearing, handOptions, issuesOf, playHand, pushCost, PUSH_TRUST, WRONG_TRUST, type Hand, type SkillValues } from './hearing';
import { previewOf } from './week';
import { concernFactor, explainCut, PARTIAL_CUT, WRONG_RAISE } from './opposition';
import { PROVISIONAL_PASS, STAGE_DAYS } from './permits';
import { indexOf } from './space';
import type { Application, ObjectionReason, World } from './types';
import { stepDay } from './world';
import { grownVillage } from './__fixtures__/cities';

/**
 * 公聴会と譲歩（docs/game-design.md 17 章・docs/testing-strategy.md 10.2「公聴会」）。
 * G5 では、公聴会の後の反対率が 50% 未満なら可決、以上なら否決の仮の決まりで進める（議会の採決は G6）
 */

const GROWN = grownVillage();
const NEAR: Op = { kind: 'facility', type: 'datacenter', origin: { x: 46, y: 36 }, rotation: 0 };
const T = GROWN.terrain;

function days(world: World, n: number): World {
  let w = world;
  for (let i = 0; i < n; i += 1) w = stepDay(w, T, POLITICS_RULES);
  return w;
}
const op = (world: World, o: Op): World => applyOp(world, o, T, POLITICS_RULES);
const appOf = (w: World, id: string): Application => w.applications.find((a) => a.id === id) as Application;
const today = (w: World): number => Math.floor(w.city.day);
const reason = (id: string): ObjectionReason => REASONS.find((r) => r.id === id) as ObjectionReason;

/** 住宅のそばのデータセンターを出し、公聴会の段まで進める */
function inHearing(): { world: World; id: string } {
  let w = op(GROWN.world, NEAR);
  const id = (w.applications.at(-1) as Application).id;
  w = days(w, STAGE_DAYS.zoning + STAGE_DAYS.objection);
  expect(appOf(w, id).stage).toBe('hearing');
  return { world: w, id };
}
const HEARING = inHearing();

function hand(world: World, reasonId: string, h: Hand, skills: SkillValues = {}, id = HEARING.id): ReturnType<typeof playHand> {
  return playHand(world, T, POLITICS_RULES, id, reasonId, h, skills, today(world));
}

describe('論点と手の並び（17 章・docs/ui-design.md 10.3）', () => {
  it('論点は内訳で 5% 以上の理由。スキル 0 では説明が並ばず、譲歩と押し切るは必ず並ぶ', () => {
    const app = appOf(HEARING.world, HEARING.id);
    const issues = issuesOf(app).map((o) => o.reasonId);
    expect(issues).toEqual(app.objections.filter((o) => o.share >= 5).map((o) => o.reasonId));
    expect(issues.length).toBeGreaterThan(0);
    for (const r of issues) {
      const opt = handOptions(HEARING.world, app, r, {}, POLITICS_RULES);
      expect(opt?.explanations, r).toEqual([]);
      expect(opt?.concessions.filter((c) => !c.concession.requires).length, r).toBeGreaterThan(0);
      expect(opt?.push.cost, r).toBeGreaterThanOrEqual(2);
      expect(opt?.hidden.reduce((a, h) => a + h.count, 0), r).toBe(reason(r).explanations.length);
    }
  });

  it('段階を上げると説明の候補が増える（段階以上の物だけ）', () => {
    const app = appOf(HEARING.world, HEARING.id);
    const count = (skills: SkillValues): number => handOptions(HEARING.world, app, 'dc-power', skills, POLITICS_RULES)?.explanations.length ?? 0;
    const c0 = count({});
    const c1 = count({ db: 10, cloud: 10 });
    const c2 = count({ db: 30, cloud: 30 });
    const c3 = count({ db: 50, cloud: 50 });
    expect([c0, c1, c2, c3]).toEqual([0, 2, 3, 4]);
    // 伏せた候補は分野と段階ごとに数える（「データベース 中級で出せる説明が 1 つある」）
    expect(handOptions(HEARING.world, app, 'dc-power', { db: 30, cloud: 30 }, POLITICS_RULES)?.hidden).toEqual([{ domain: 'db', stage: 3, count: 1 }]);
  });

  it('押し切るの政治資本: 割合 10% ごとに 2（最小 2・最大 8）', () => {
    expect([1, 10, 10.1, 25, 40, 75].map(pushCost)).toEqual([2, 2, 4, 6, 8, 8]);
  });
});

describe('譲歩する（17.1）', () => {
  it('夜の重い処理を止める譲歩で、夜間の騒音の強さが 0 になり、反対率が計算し直されて下がる', () => {
    const before = appOf(HEARING.world, HEARING.id);
    const noise = before.objections.find((o) => o.reasonId === 'dc-night-noise');
    expect(noise?.strength).toBeGreaterThan(0);
    const { world, problem } = hand(HEARING.world, 'dc-power', { kind: 'concede', concessionId: 'dc-power-trim' });
    expect(problem).toBeUndefined();
    const after = appOf(world, HEARING.id);
    expect(after.mods).toEqual({ power: 0.6, tech: 0.85 });
    const p0 = before.objections.find((o) => o.reasonId === 'dc-power');
    const p1 = after.objections.find((o) => o.reasonId === 'dc-power');
    expect(p1?.strength).toBeCloseTo((p0?.strength ?? 0) * 0.6, 3);
    expect(after.opposition).toBeLessThan(before.opposition);
    expect(after.objections.reduce((a, o) => a + o.share, 0)).toBeCloseTo(after.opposition, 9);
    expect(p1?.hand).toMatchObject({ kind: 'concede', concessionId: 'dc-power-trim' });
  });

  it('1 つの論点に手は 1 つ。論点でない理由（5% 未満）には出せない', () => {
    const once = hand(HEARING.world, 'dc-power', { kind: 'push' }).world;
    expect(hand(once, 'dc-power', { kind: 'concede', concessionId: 'dc-power-trim' }).problem).toBe('used');
    const small = appOf(HEARING.world, HEARING.id).objections.find((o) => o.share < 5);
    if (small) expect(hand(HEARING.world, small.reasonId, { kind: 'push' }).problem).toBe('issue');
  });

  it('費用のかかる譲歩は、可決した時に取り分けに足す（否決なら取らない）', () => {
    const wall = hand(HEARING.world, 'dc-jobs', { kind: 'concede', concessionId: 'dc-jobs-local' }).world;
    const app = appOf(wall, HEARING.id);
    // 建てた費用 650 の 15%
    expect(app.pendingCost).toBe(98);
    expect(wall.city.funds).toBe(HEARING.world.city.funds);
  });

  it('反対の受付の間に、先回りして譲歩できる（説明と押し切るはできない）', () => {
    let w = op(GROWN.world, NEAR);
    const id = (w.applications.at(-1) as Application).id;
    w = days(w, STAGE_DAYS.zoning + 3);
    expect(appOf(w, id).stage).toBe('objection');
    expect(hand(w, 'dc-power', { kind: 'push' }, {}, id).problem).toBe('stage');
    const pre = hand(w, 'dc-power', { kind: 'concede', concessionId: 'dc-power-trim' }, {}, id).world;
    expect(appOf(pre, id).objections.find((o) => o.reasonId === 'dc-power')?.hand?.kind).toBe('concede');
    // 受付の間の割合は、受付の終わりの割合 × 今日までの上がり方のまま
    const a = appOf(pre, id);
    for (const o of a.objections) expect(o.share).toBeCloseTo(o.full * (3 / STAGE_DAYS.objection), 6);
  });
});

describe('説明する（17.2）', () => {
  it('質ごとの効き: 確かは誤解の分を段階に応じて（段階 1: 40% … 段階 5: 100%）、一部は 15%、誤りは懸念が 10% 増える', () => {
    const r = reason('dc-cooling-water');
    expect(explainCut(1)).toBeCloseTo(0.4, 9);
    expect(explainCut(5)).toBe(1);
    expect(concernFactor(r, { kind: 'explain', explanationId: 'dc-water-loop', quality: 'sound', day: 0 })).toBeCloseTo(1 - 0.6 * 0.55, 9);
    expect(concernFactor(r, { kind: 'explain', explanationId: 'dc-water-tap', quality: 'partial', day: 0 })).toBeCloseTo(1 - 0.6 * PARTIAL_CUT, 9);
    expect(concernFactor(r, { kind: 'explain', explanationId: 'dc-water-cloud', quality: 'wrong', day: 0 })).toBeCloseTo(1 + WRONG_RAISE, 9);
    expect(concernFactor(r, { kind: 'push', capital: 2, day: 0 })).toBe(1);
  });

  it('誤解の分を超えて懸念が下がらない（段階 5 の確かな説明でも 1 − 誤解の割合が残る）', () => {
    const r: ObjectionReason = { ...reason('dc-cooling-water'), explanations: [{ ...reason('dc-cooling-water').explanations[0] as ObjectionReason['explanations'][number], stage: 5 }] };
    const id = r.explanations[0]?.id ?? '';
    expect(concernFactor(r, { kind: 'explain', explanationId: id, quality: 'sound', day: 0 })).toBeCloseTo(1 - r.misconception, 9);
  });

  it('確かな説明で、その理由の割合が下がる。スキルが足りない説明は出せない', () => {
    expect(hand(HEARING.world, 'dc-jobs', { kind: 'explain', explanationId: 'dc-jobs-number' }, { db: 30 }).problem).toBe('skill');
    const { world } = hand(HEARING.world, 'dc-jobs', { kind: 'explain', explanationId: 'dc-jobs-number' }, { db: 50 });
    const before = appOf(HEARING.world, HEARING.id).objections.find((o) => o.reasonId === 'dc-jobs');
    const after = appOf(world, HEARING.id).objections.find((o) => o.reasonId === 'dc-jobs');
    expect(after?.share).toBeLessThan(before?.share ?? 0);
    expect(after?.strength).toBe(before?.strength);
    expect(after?.hand).toMatchObject({ kind: 'explain', quality: 'sound' });
  });

  it('誤った説明は、懸念が増え、反対した層の信頼が 2 下がる', () => {
    const { world } = hand(HEARING.world, 'dc-power', { kind: 'explain', explanationId: 'dc-power-cloud' }, { cloud: 10 });
    const o = appOf(world, HEARING.id).objections.find((x) => x.reasonId === 'dc-power');
    const before = appOf(HEARING.world, HEARING.id).objections.find((x) => x.reasonId === 'dc-power');
    expect(o?.share).toBeGreaterThanOrEqual(before?.share ?? 0);
    expect(o?.layers?.length).toBeGreaterThan(0);
    for (const l of o?.layers ?? []) expect(world.sim.trust[l]).toBeCloseTo((HEARING.world.sim.trust[l] ?? 0) + WRONG_TRUST, 9);
    expect(world.politics.wrongExplanations).toBe(HEARING.world.politics.wrongExplanations + 1);
  });
});

describe('押し切る（17.3）', () => {
  it('政治資本を使い、反対率は下がらず、押し切られた集団の層の信頼が 3 下がる。足りなければ出せない', () => {
    const o = appOf(HEARING.world, HEARING.id).objections.find((x) => x.reasonId === 'dc-jobs');
    const cost = pushCost(o?.share ?? 0);
    const { world } = hand(HEARING.world, 'dc-jobs', { kind: 'push' });
    expect(world.politics.capital).toBe(HEARING.world.politics.capital - cost);
    expect(world.politics.pushesThisTerm).toBe(HEARING.world.politics.pushesThisTerm + 1);
    expect(appOf(world, HEARING.id).opposition).toBe(appOf(HEARING.world, HEARING.id).opposition);
    for (const l of o?.layers ?? []) expect(world.sim.trust[l]).toBeCloseTo((HEARING.world.sim.trust[l] ?? 0) + PUSH_TRUST, 9);
    const poor = { ...HEARING.world, politics: { ...HEARING.world.politics, capital: cost - 1 } };
    expect(hand(poor, 'dc-jobs', { kind: 'push' }).problem).toBe('capital');
  });
});

describe('公聴会の終わり（17.4）と、G5 の仮の決まり', () => {
  it('公聴会を終えると議会の段へ。反対率が 50% 以上なら否決され、費用は全て戻る', () => {
    // 反対率だけを 50% にした申請（議会の決まりを確かめる）
    const high = { ...HEARING.world, applications: HEARING.world.applications.map((a) => (a.id === HEARING.id ? { ...a, opposition: PROVISIONAL_PASS } : a)) };
    let w = closeHearing(high, HEARING.id, today(high));
    expect(appOf(w, HEARING.id)).toMatchObject({ stage: 'council', hearing: { attended: true } });
    const funds = w.city.funds;
    w = days(w, 15);
    expect(appOf(w, HEARING.id).stage).toBe('rejected');
    expect(w.city.funds).toBe(funds + 650);
  });

  it('スキル 0 のまま、譲歩と押し切るだけで反対率を 50% 未満にして可決させ、譲歩の費用が取り分けに足される', () => {
    let w = HEARING.world;
    const app = appOf(w, HEARING.id);
    // 全ての論点に、requires の無い譲歩を出す
    for (const o of issuesOf(app)) {
      const opt = handOptions(w, appOf(w, HEARING.id), o.reasonId, {}, POLITICS_RULES);
      const c = opt?.concessions.find((x) => x.ok);
      if (c) w = hand(w, o.reasonId, { kind: 'concede', concessionId: c.concession.id }).world;
    }
    const conceded = appOf(w, HEARING.id);
    expect(conceded.opposition).toBeLessThan(PROVISIONAL_PASS);
    const pending = conceded.pendingCost ?? 0;
    w = closeHearing(w, HEARING.id, today(w));
    const funds = w.city.funds;
    w = days(w, 15);
    const done = appOf(w, HEARING.id);
    expect(done.stage).toBe('construction');
    expect(done.reserved).toBe(650 + pending);
    expect(w.city.funds).toBe(funds - pending);
  });

  it('開かずに 14 日が過ぎると、市長抜きで開かれ、答えなかったことになる', () => {
    const w = days(HEARING.world, STAGE_DAYS.hearing);
    expect(appOf(w, HEARING.id)).toMatchObject({ stage: 'council', hearing: { attended: false } });
  });
});

describe('譲歩した申請が完成すると、その性質が模擬の値に現れる（G5 の完成条件）', () => {
  it('住宅の隣に工業を塗る申請で、受付の間に「軽い工業に限る」と譲歩すると、建った工場の騒音が半分になる（騒音のヒートマップの値）', () => {
    const finish = (concede: boolean): World => {
      let w = op(GROWN.world, { kind: 'zone', zone: 'industrial', a: { x: 50, y: 46 }, b: { x: 53, y: 46 } });
      const id = (w.applications.at(-1) as Application).id;
      expect(appOf(w, id).kind).toBe('rezone');
      w = days(w, STAGE_DAYS.zoning + 1);
      if (concede) {
        const r = playHand(w, T, POLITICS_RULES, id, 'rz-ind-noise', { kind: 'concede', concessionId: 'rz-ind-light' }, {}, today(w));
        expect(r.problem).toBeUndefined();
        w = r.world;
      }
      w = days(w, 80);
      expect(appOf(w, id).stage).toBe('done');
      return w;
    };
    const plain = finish(false);
    const light = finish(true);
    expect(light.city.zones.at(-1)?.mods).toEqual({ noise: 0.5, jobs: 0.8 });
    // 隣の住宅のマス（49, 48）の騒音
    const noise = (w: World): number => previewOf(w, T).field.noise[indexOf(49, 48)] as number;
    expect(noise(plain)).toBeGreaterThan(0);
    expect(noise(light)).toBeCloseTo(noise(plain) / 2, 4);
  });
});
