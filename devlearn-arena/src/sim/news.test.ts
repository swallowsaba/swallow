import { describe, expect, it } from 'vitest';
import { checkFacility } from '@/city/place';
import { NEWS, POLITICS_RULES, validateNews } from '@/content/politics';
import { applyOp } from './commands';
import { fill, SCANDAL, withNews } from './news';
import type { Application, Article, World } from './types';
import { stepDay } from './world';
import { grownVillage, village } from './__fixtures__/cities';

/**
 * 市内新聞（docs/game-design.md 22.3）: 出来事を型の文に名前と数字を入れて記事にする・不祥事は市長の決定の数が境を越えた時だけ・
 * 記事が出ると関係する層の信頼 −1・1 任期より前は見出しだけ
 */

const T = village().terrain;
const BASE = grownVillage(120).world;
const R = POLITICS_RULES;
const last = (w: World): Article | undefined => w.history.news.at(-1);
const kinds = (w: World): string[] => w.history.news.map((a) => a.kind);
/** Web 開発会社を置ける場所（道路に面し、重ならない。見本の都市の中で最初に見つかる所） */
function webSite(world: World): { x: number; y: number } {
  for (let y = 30; y < 66; y += 1) for (let x = 30; x < 66; x += 1) if (checkFacility({ ...world.city, funds: 1e9 }, T, 'web', { x, y }, 0).ok) return { x, y };
  throw new Error('置ける場所が無い');
}
const WEB = webSite(BASE);
const days = (world: World, n: number): World => {
  let w = world;
  for (let i = 0; i < n; i += 1) w = stepDay(w, T, R);
  return w;
};

describe('型の文', () => {
  it('検証を通る（全ての種類に文がある・差し込み名・使い回し・2〜3 文）', () => {
    expect(validateNews(NEWS)).toEqual([]);
    expect(NEWS.title).toBe('市民新報');
  });

  it('入らない差し込み名・文の無い種類・使い回しを落とす', () => {
    const bad = { title: 'x', templates: [{ kind: 'tax' as const, variant: 'up', headline: '{facility} の税', body: 'a。b。' }, { kind: 'tax' as const, variant: 'down', headline: '{facility} の税', body: 'c。d。' }] };
    const problems = validateNews(bad);
    expect(problems).toContain('tax:up: {facility} はこの種類に入らない差し込み名');
    expect(problems.some((p) => p.startsWith('tax:down: 文を使い回している'))).toBe(true);
    expect(problems).toContain('start: 型の文が無い');
  });

  it('数字は四捨五入した整数を 3 桁で区切って入れる。入れない名前はそのまま残す', () => {
    expect(fill('人口 {value} 人、{rate}%、{other}', { value: 12345.6, rate: 49.5 })).toBe('人口 12,346 人、50%、{other}');
  });
});

describe('出来事を記事にする', () => {
  it('新聞が始まった日に創刊の記事。同じ都市と同じ操作からは同じ記事', () => {
    const w = days({ ...BASE, history: { ...BASE.history, news: [] } }, 1);
    expect(kinds(w)).toEqual(['start']);
    expect(last(w)?.headline).toBe(`${BASE.city.name}に市民新報、きょう創刊`);
    const again = days({ ...BASE, history: { ...BASE.history, news: [] } }, 1);
    expect(again.history.news).toEqual(w.history.news);
  });

  it('申請を出すと、施設と地区の名前の入った記事。押すと寄る場所を持つ', () => {
    const w = applyOp(BASE, { kind: 'facility', type: 'web', origin: WEB, rotation: 0 }, T, R);
    const app = w.applications.find((a) => !BASE.applications.some((b) => b.id === a.id));
    expect(app).toBeDefined();
    const a = last(w);
    expect(a?.kind).toBe('application');
    expect(a?.headline).toContain('Web');
    expect(a?.headline).not.toContain('{');
    expect(a?.body).not.toContain('{');
    expect(a?.at).toBeDefined();
    expect(BASE.sim.districtNames.some((n) => a?.headline.includes(n) || a?.body.includes(n))).toBe(true);
  });

  it('議会の可決・否決・完成を、賛否の数と最も多い反対の理由とともに記事にする', () => {
    const w = applyOp(BASE, { kind: 'facility', type: 'web', origin: WEB, rotation: 0 }, T, R);
    const app = w.applications.at(-1) as Application;
    const vote = { day: 1, consent: false, passed: true, members: Array.from({ length: 7 }, (_, i) => ({ memberId: `m${String(i)}`, score: 0, yes: i < 5, reasonKey: 'gain', persuaded: false })) };
    const at = (stage: Application['stage'], extra: Partial<Application> = {}): World => ({ ...w, applications: w.applications.map((a) => (a.id === app.id ? { ...a, stage, ...extra } : a)) });
    const council = at('council', { objections: [{ reasonId: R.reasons[0]?.id ?? '', group: 'neighbors', strength: 1, share: 30, full: 30, basis: { value: 1 } }] });
    const passed = withNews(council, at('construction', { vote }), R);
    expect(last(passed)?.kind).toBe('approved');
    expect(`${last(passed)?.headline ?? ''}${last(passed)?.body ?? ''}`).toMatch(/賛成 5.*反対 2|5 対 2/);
    const rejected = withNews(council, at('rejected', { vote: { ...vote, passed: false }, objections: council.applications.at(-1)?.objections ?? [] }), R);
    expect(last(rejected)?.kind).toBe('rejected');
    expect(`${last(rejected)?.headline ?? ''}${last(rejected)?.body ?? ''}`).toContain(R.reasons[0]?.title ?? '?');
    const done = withNews(at('construction', { vote }), at('done', { vote }), R);
    expect(last(done)?.kind).toBe('completed');
  });

  it('税率を変えると、新しい税率が効く週の終わりに記事（上げた・下げたで言い分ける）', () => {
    const w0 = days(BASE, 7 - (Math.floor(BASE.city.day) % 7));
    const set = applyOp(w0, { kind: 'taxRate', rate: 13 }, T, R);
    expect(kinds(set)).toEqual(kinds(w0));
    const w1 = days(set, 7);
    const tax = w1.history.news.filter((a) => a.kind === 'tax');
    expect(tax).toHaveLength(1);
    expect(tax[0]?.headline).toBe('税率 10% から 13% へ引き上げ');
  });

  it('請願を扱うと記事（受理・拒否）', () => {
    const entry = { id: 'rent-low@1', petitionId: 'rent-low', arrivedWeek: BASE.sim.week, district: 66, layer: 0, value: 40 };
    const w = { ...BASE, petitions: { inbox: [entry], handled: {}, effects: [] } };
    const rejected = applyOp(w, { kind: 'petition', inboxId: entry.id, choice: 'reject' }, T, R);
    expect(last(rejected)?.kind).toBe('petition');
    expect(last(rejected)?.headline).toContain('家賃が上がって、もう住み続けられない');
    expect(last(rejected)?.at).toBeDefined();
  });
});

describe('不祥事（市長の決定からだけ）', () => {
  it('市長が何も決めなければ、半年進めても不祥事の記事は出ない', () => {
    const w = days({ ...BASE, petitions: { inbox: [], handled: {}, effects: [] } }, 7 * 26);
    // 届いた請願を放置すると期限切れが数えられるので、5 通に届かない限り出ない
    if (w.politics.expiredPetitions < SCANDAL.expired) expect(kinds(w)).not.toContain('scandal');
  });

  it('1 任期に押し切りが 3 回目になった時だけ記事。押し切られた層の信頼 −1', () => {
    const pushed = { reasonId: 'x', group: 'neighbors' as const, strength: 1, share: 20, full: 20, basis: { value: 1 }, layers: [0, 3], hand: { kind: 'push' as const, capital: 4, day: BASE.politics.term.startDay + 1 } };
    const app = { ...(BASE.applications[0] ?? ({} as Application)), id: 'pp', objections: [pushed] } as Application;
    const before: World = { ...BASE, applications: [app], politics: { ...BASE.politics, pushesThisTerm: 2 } };
    const after: World = { ...before, politics: { ...before.politics, pushesThisTerm: 3 } };
    const w = withNews(before, after, R);
    expect(last(w)?.kind).toBe('scandal');
    expect(last(w)?.headline).toBe('反対の押し切り、この任期で 3 回目');
    expect(w.sim.trust[0]).toBeCloseTo((BASE.sim.trust[0] ?? 0) - 1, 6);
    expect(w.sim.trust[3]).toBeCloseTo((BASE.sim.trust[3] ?? 0) - 1, 6);
    expect(w.sim.trust[1]).toBe(BASE.sim.trust[1]);
    // 4 回目では出ない
    const again = withNews(after, { ...after, politics: { ...after.politics, pushesThisTerm: 4 } }, R);
    expect(kinds(again).filter((k) => k === 'scandal')).toHaveLength(0);
  });

  it('財政の赤字が 8 週続くと記事。全ての層の信頼 −1', () => {
    let w: World = { ...BASE, budget: { ...BASE.budget, treasury: -100000 } };
    w = days(w, 7 * 9);
    const s = w.history.news.filter((a) => a.kind === 'scandal');
    expect(s.map((a) => a.headline)).toEqual(['財政の赤字、8 週続く']);
    // 赤字でも開発資金は変わらない（学習にも開発資金にも効かない）
    expect(w.city.funds).toBe(BASE.city.funds);
  });

  it('期限切れの請願が 1 任期に 5 通・誤った説明が 3 回になった時も記事', () => {
    const e1 = withNews(BASE, { ...BASE, politics: { ...BASE.politics, expiredPetitions: BASE.politics.expiredPetitions + 5 } }, R);
    expect(last(e1)?.headline).toContain('請願の放置');
    const w2: World = { ...BASE, politics: { ...BASE.politics, wrongExplanations: 2 } };
    const e2 = withNews(w2, { ...w2, politics: { ...w2.politics, wrongExplanations: 3 } }, R);
    expect(last(e2)?.headline).toBe('公聴会の説明に誤り、3 回目');
  });
});

describe('過去の記事', () => {
  it('1 任期（208 週）より前の記事は、本文を空にして見出しだけ残す', () => {
    const old: Article = { id: 'n1', week: BASE.sim.week - 208, day: 0, kind: 'start', headline: 'むかし', body: '本文。本文。' };
    const recent: Article = { ...old, id: 'n2', week: BASE.sim.week - 10, headline: 'ちかごろ' };
    const w: World = { ...BASE, history: { ...BASE.history, news: [old, recent] } };
    const next = withNews(w, { ...w, budget: { ...w.budget, taxRate: 12 } }, R);
    expect(next.history.news[0]).toEqual({ ...old, body: '' });
    expect(next.history.news[1]).toEqual(recent);
    expect(next.history.news).toHaveLength(3);
  });

  it('続く同じ種類の記事は、型の文を変える', () => {
    let w = BASE;
    const heads: string[] = [];
    for (const rate of [11, 12]) {
      w = withNews(w, { ...w, budget: { ...w.budget, taxRate: rate } }, R);
      w = withNews(w, { ...w, sim: { ...w.sim, vacant: { ...w.sim.vacant, [`b${String(rate)}`]: w.sim.week } } }, R);
      heads.push(last(w)?.headline ?? '');
    }
    expect(heads[0]).not.toBe(heads[1]);
  });
});

describe('停電の記事（22.3・24.1）', () => {
  it('止まる地区が出た週に載り、地区の名前と数が入る。続く間は毎週は載せない', () => {
    const dark = { ...BASE, sim: { ...BASE.sim, power: { ...BASE.sim.power, externalCapMW: 0 } } };
    const w1 = days(dark, 7 - (Math.floor(dark.city.day) % 7));
    const article = w1.history.news.find((a) => a.kind === 'outage');
    expect(article).toBeDefined();
    const stopped = w1.sim.power.recent?.at(-1) ?? [];
    expect(article?.headline).toContain(String(stopped.length));
    expect(article?.headline + (article?.body ?? '')).toContain(w1.sim.districtNames[stopped[0] ?? 0] ?? '?');
    // 次の週も止まるが、止まる地区が増えなければ新しい記事は出ない
    const w2 = days(w1, 7);
    const count = (w: World): number => w.history.news.filter((a) => a.kind === 'outage').length;
    if ((w2.sim.power.recent?.at(-1)?.length ?? 0) <= stopped.length) expect(count(w2)).toBe(count(w1));
  });
});
