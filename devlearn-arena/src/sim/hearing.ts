import type { DomainId } from '@/city/types';
import { mergeMods } from '@/city/rules';
import type { Terrain } from '@/city/terrain';
import { oppositionOf } from './opposition';
import { STAGE_DAYS } from './permits';
import { TRUST_LIMIT } from './rules';
import type { Application, Concession, Explanation, ObjectionReason, ObjectionState, PoliticsRules, World } from './types';

/**
 * 公聴会と譲歩（docs/game-design.md 17 章）。反対に、譲歩する・説明する・押し切るで答える。**1 つの論点に、手を 1 つ。**
 *
 *   譲歩する: 申請の性質（mods）を変え、完成した建物に残る。理由の強さが模擬の上で実際に下がる。費用は可決した時に取り分けに足す
 *   説明する: 誤解から来る分の懸念が下がる（質で効きが違う）。その分野のスキル段階が、候補の段階以上の物だけが出せる
 *   押し切る: 政治資本を使う。反対率は下がらない。押し切られた集団の層の信頼が下がる
 *
 * 反対の受付の間は、先回りして譲歩だけができる（効きは同じ。公聴会でその論点の手を使ったことになる）。
 * 手を出すと、反対を同じ理由で計算し直す（新しい理由は立てない。強さが 0 になった理由も、手の記録のために残す）
 */

/** 論点に並ぶ理由の割合の下限（%） */
export const ISSUE_MIN_SHARE = 5;
/** 押し切る: 割合 10% ごとに政治資本 2（最小 2・最大 8） */
export function pushCost(share: number): number {
  return Math.max(2, Math.min(8, 2 * Math.ceil(share / 10)));
}
/** 信頼の動き（13.8）: 押し切る −3・誤った説明 −2 */
export const PUSH_TRUST = -3;
export const WRONG_TRUST = -2;

/** スキル段階（docs/game-design.md 4 章。スキルの値 → 0〜5） */
export function stageOfSkill(value: number): number {
  return value >= 90 ? 5 : value >= 70 ? 4 : value >= 50 ? 3 : value >= 30 ? 2 : value >= 10 ? 1 : 0;
}
export type SkillValues = Partial<Record<DomainId, number>>;

export type Hand =
  | { kind: 'concede'; concessionId: string }
  | { kind: 'explain'; explanationId: string }
  | { kind: 'push' };

const reasonOf = (rules: PoliticsRules, id: string): ObjectionReason | undefined => rules.reasons.find((r) => r.id === id);

/** 論点（公聴会に並ぶ理由）: 反対の受付の間は受付の終わりの割合、公聴会では今の割合で 5% 以上 */
export function issuesOf(app: Pick<Application, 'stage' | 'objections'>): ObjectionState[] {
  return app.objections.filter((o) => (app.stage === 'objection' ? o.full : o.share) >= ISSUE_MIN_SHARE || o.hand !== undefined);
}

/** 譲歩の費用（建てた費用に対する割合か、決まった額。負の値は下がる分） */
export function concessionCost(c: Pick<Concession, 'cost'>, app: Pick<Application, 'reserved'>): number {
  return Math.round((c.cost?.ratio ?? 0) * app.reserved + (c.cost?.fixed ?? 0));
}

const walletOf = (world: World, app: Pick<Application, 'wallet'>): number => (app.wallet === 'funds' ? world.city.funds : world.budget.treasury);

/** 論点に出せる手（画面に並べる物。docs/ui-design.md 10.3） */
export interface HandOptions {
  concessions: { concession: Concession; cost: number; ok: boolean; why?: 'requires' | 'funds' }[];
  /** 今のスキル段階で出せる説明（質は画面に出さない） */
  explanations: Explanation[];
  /** 出せない段階の説明の数（分野と段階ごと。「データベース 初級で出せる説明が 1 つある」） */
  hidden: { domain: DomainId; stage: number; count: number }[];
  push: { cost: number; ok: boolean };
}

export function handOptions(world: World, app: Application, reasonId: string, skills: SkillValues, rules: PoliticsRules): HandOptions | null {
  const reason = reasonOf(rules, reasonId);
  const o = app.objections.find((x) => x.reasonId === reasonId);
  if (!reason || !o) return null;
  const wallet = walletOf(world, app);
  const pending = app.pendingCost ?? 0;
  const concessions = reason.concessions.flatMap((c) => {
    // 技術の代案は、その分野のスキル段階が足りる時だけ出る（20 章）
    if (c.requires && stageOfSkill(skills[c.requires.domain] ?? 0) < c.requires.stage) return [];
    const cost = concessionCost(c, app);
    const ok = cost <= 0 || wallet - pending >= cost;
    return [{ concession: c, cost, ok, ...(ok ? {} : { why: 'funds' as const }) }];
  });
  const can = (e: Explanation): boolean => stageOfSkill(skills[e.domain] ?? 0) >= e.stage;
  const hiddenMap = new Map<string, { domain: DomainId; stage: number; count: number }>();
  for (const e of reason.explanations) {
    if (can(e)) continue;
    const key = `${e.domain}:${String(e.stage)}`;
    const h = hiddenMap.get(key) ?? { domain: e.domain, stage: e.stage, count: 0 };
    h.count += 1;
    hiddenMap.set(key, h);
  }
  const cost = pushCost(o.share);
  return {
    concessions,
    explanations: reason.explanations.filter(can),
    hidden: [...hiddenMap.values()].sort((a, b) => a.stage - b.stage || a.domain.localeCompare(b.domain)),
    push: { cost, ok: world.politics.capital >= cost },
  };
}

/** 層の信頼を動かす（−15〜+15） */
function moveTrust(trust: readonly number[], layers: readonly number[] | undefined, delta: number): number[] {
  const next = [...trust];
  for (const l of layers ?? []) next[l] = Math.max(-TRUST_LIMIT, Math.min(TRUST_LIMIT, (next[l] ?? 0) + delta));
  return next;
}

/**
 * 反対を計算し直す（手を出した後。17 章・16.3「譲歩と説明で反対率が計算し直される」）。
 * 立っている理由だけを、今の都市と申請の性質と手で計算する。受付の間は、受付の終わりの割合と、今日までの上がり方
 */
export function reassess(world: World, terrain: Terrain, app: Application, rules: PoliticsRules, day: number): Application {
  const reasons = app.objections.flatMap((o) => {
    const r = reasonOf(rules, o.reasonId);
    return r ? [r] : [];
  });
  const result = oppositionOf(world, terrain, app, rules, reasons);
  const progress = app.stage === 'objection' ? Math.max(0, Math.min(1, (day - app.stageDay) / STAGE_DAYS.objection)) : 1;
  const objections = app.objections.map((o): ObjectionState => {
    const n = result.objections.find((x) => x.reasonId === o.reasonId);
    if (!n) return { ...o, strength: 0, full: 0, share: 0 };
    return { ...n, share: n.full * progress, ...(o.hand ? { hand: o.hand } : {}) };
  });
  return { ...app, objections, opposition: objections.reduce((a, o) => a + o.share, 0) };
}

/** 手を出せない理由（画面の確かめと、命令の受け口の両方で使う） */
export type HandProblem = 'stage' | 'issue' | 'used' | 'unknown' | 'requires' | 'skill' | 'funds' | 'capital';

/**
 * 手を出す。出せなければ世界をそのまま返す。
 * skills はスキルの値（説明と技術の代案の段階を確かめる。模擬は学習の記録を持たないので、命令が運ぶ）
 */
export function playHand(world: World, terrain: Terrain, rules: PoliticsRules, appId: string, reasonId: string, hand: Hand, skills: SkillValues, day: number): { world: World; problem?: HandProblem } {
  const app = world.applications.find((a) => a.id === appId);
  if (!app) return { world, problem: 'unknown' };
  const reason = reasonOf(rules, reasonId);
  const o = app.objections.find((x) => x.reasonId === reasonId);
  if (!reason || !o) return { world, problem: 'unknown' };
  // 受付の間は先回りの譲歩だけ。公聴会では 3 種類
  if (!(app.stage === 'hearing' || (app.stage === 'objection' && hand.kind === 'concede'))) return { world, problem: 'stage' };
  if (o.hand) return { world, problem: 'used' };
  if (!issuesOf(app).includes(o)) return { world, problem: 'issue' };
  let next: Application = app;
  let w: World = world;
  switch (hand.kind) {
    case 'concede': {
      const c = reason.concessions.find((x) => x.id === hand.concessionId);
      if (!c) return { world, problem: 'unknown' };
      if (c.requires && stageOfSkill(skills[c.requires.domain] ?? 0) < c.requires.stage) return { world, problem: 'requires' };
      const cost = concessionCost(c, app);
      if (cost > 0 && walletOf(world, app) - (app.pendingCost ?? 0) < cost) return { world, problem: 'funds' };
      next = {
        ...app,
        mods: mergeMods(app.mods, c.mods),
        ...(cost !== 0 || app.pendingCost ? { pendingCost: (app.pendingCost ?? 0) + cost } : {}),
        objections: app.objections.map((x) => (x === o ? { ...x, hand: { kind: 'concede', concessionId: c.id, day } } : x)),
      };
      break;
    }
    case 'explain': {
      const e = reason.explanations.find((x) => x.id === hand.explanationId);
      if (!e) return { world, problem: 'unknown' };
      if (stageOfSkill(skills[e.domain] ?? 0) < e.stage) return { world, problem: 'skill' };
      next = { ...app, objections: app.objections.map((x) => (x === o ? { ...x, hand: { kind: 'explain', explanationId: e.id, quality: e.quality, day } } : x)) };
      if (e.quality === 'wrong') {
        w = {
          ...w,
          sim: { ...w.sim, trust: moveTrust(w.sim.trust, o.layers, WRONG_TRUST) },
          politics: { ...w.politics, wrongExplanations: w.politics.wrongExplanations + 1 },
        };
      }
      break;
    }
    case 'push': {
      const cost = pushCost(o.share);
      if (world.politics.capital < cost) return { world, problem: 'capital' };
      next = { ...app, objections: app.objections.map((x) => (x === o ? { ...x, hand: { kind: 'push', capital: cost, day } } : x)) };
      w = {
        ...w,
        sim: { ...w.sim, trust: moveTrust(w.sim.trust, o.layers, PUSH_TRUST) },
        politics: {
          ...w.politics,
          capital: w.politics.capital - cost,
          capitalLog: [...w.politics.capitalLog, { day, amount: -cost, why: `押し切る（${reason.title}）` }],
          pushesThisTerm: w.politics.pushesThisTerm + 1,
        },
      };
      break;
    }
  }
  // 押し切るは反対率を下げない。譲歩と説明は計算し直す
  if (hand.kind !== 'push') next = reassess(w, terrain, next, rules, day);
  return { world: { ...w, applications: w.applications.map((a) => (a.id === appId ? next : a)) } };
}

/** 公聴会を終える（市長が開いて答えた）。議会の採決の段へ */
export function closeHearing(world: World, appId: string, day: number): World {
  const app = world.applications.find((a) => a.id === appId);
  if (!app || app.stage !== 'hearing') return world;
  return {
    ...world,
    applications: world.applications.map((a) => (a.id === appId ? { ...a, stage: 'council' as const, stageDay: day, hearing: { heldDay: day, attended: true } } : a)),
  };
}
