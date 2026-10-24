import type { Terrain } from '@/city/terrain';
import { mergeMods } from '@/city/rules';
import { concessionCost, reassess, stageOfSkill, type SkillValues } from './hearing';
import { TRUST_LIMIT } from './rules';
import type { Application, Difficulty, GroupId, ObjectionState, PoliticsRules, World } from './types';

/**
 * 異議申し立て（docs/game-design.md 19 章）。可決されても、反対側が申し立てることがある。**乱数でなく条件で決まる。**
 *
 *   条件: 可決した時の反対率が申し立ての境（27 章。ふつうで 35%）以上で、押し切った論点か、手を出さなかった論点がある
 *   立つと 28 日、着工が止まる
 *   取り下げさせる: 追加の譲歩（公聴会で譲歩しなかった論点に譲歩し、計算し直した反対率が境を下回る）/ 政治資本 4（申し立てた集団の層の信頼 −2）
 *   28 日が過ぎると退けられ、着工する（申し立てた集団の層の信頼 −1）
 */

export const APPEAL_BORDER: Record<Difficulty, number> = { gentle: 45, normal: 35, tough: 25 };
export const APPEAL_DAYS = 28;
export const SUPPRESS = { capital: 4, trust: -2 } as const;
export const EXPIRE_TRUST = -1;

/** 申し立ての元になる論点（押し切った・手を出さなかった論点） */
export function openIssues(app: Pick<Application, 'objections' | 'hearing'>): ObjectionState[] {
  return app.objections.filter((o) => (o.issue === true || (app.hearing !== undefined && !app.hearing.attended && o.share > 0)) && (o.hand?.kind === 'push' || !o.hand));
}

/** 申し立てが立つか。立つなら申し立てる集団（押し切った・答えなかった論点のうち、割合の一番大きい理由の集団） */
export function appealOf(app: Pick<Application, 'objections' | 'hearing' | 'opposition'>, difficulty: Difficulty): GroupId | null {
  if (app.opposition < APPEAL_BORDER[difficulty]) return null;
  let top: ObjectionState | undefined;
  for (const o of openIssues(app)) if (!top || o.share > top.share) top = o;
  return top ? top.group : null;
}

/** 申し立てた集団の層（その集団の理由に反対した層） */
export function appealLayers(app: Pick<Application, 'objections' | 'appeal'>): number[] {
  const group = app.appeal?.group;
  return [...new Set(app.objections.filter((o) => o.group === group).flatMap((o) => o.layers ?? []))].sort((a, b) => a - b);
}

/** 層の信頼を動かす（−15〜+15） */
export function moveTrust(trust: readonly number[], layers: readonly number[], delta: number): number[] {
  const next = [...trust];
  for (const l of layers) next[l] = Math.max(-TRUST_LIMIT, Math.min(TRUST_LIMIT, (next[l] ?? 0) + delta));
  return next;
}

export type AppealProblem = 'unknown' | 'stage' | 'issue' | 'requires' | 'funds' | 'capital';

const pending = (app: Application): boolean => app.stage === 'appeal' && app.appeal !== undefined && app.appeal.resolved === undefined;

/**
 * 追加の譲歩（19 章）: 公聴会で譲歩しなかった論点に譲歩する。可決した後なので、費用はすぐ取り分けに足す。
 * 反対率を計算し直し、境を下回れば申し立ては取り下げられる（次の日に着工）
 */
export function appealConcede(world: World, terrain: Terrain, rules: PoliticsRules, appId: string, reasonId: string, concessionId: string, skills: SkillValues, day: number): { world: World; problem?: AppealProblem; withdrawn?: boolean } {
  const app = world.applications.find((a) => a.id === appId);
  if (!app) return { world, problem: 'unknown' };
  if (!pending(app)) return { world, problem: 'stage' };
  const o = app.objections.find((x) => x.reasonId === reasonId);
  const reason = rules.reasons.find((r) => r.id === reasonId);
  if (!o || !reason || o.issue !== true || o.hand?.kind === 'concede') return { world, problem: 'issue' };
  const c = reason.concessions.find((x) => x.id === concessionId);
  if (!c) return { world, problem: 'unknown' };
  if (c.requires && stageOfSkill(skills[c.requires.domain] ?? 0) < c.requires.stage) return { world, problem: 'requires' };
  const cost = concessionCost(c, app);
  const wallet = app.wallet === 'funds' ? world.city.funds : world.budget.treasury;
  if (cost > 0 && wallet < cost) return { world, problem: 'funds' };
  let next: Application = {
    ...app,
    mods: mergeMods(app.mods, c.mods),
    reserved: app.reserved + cost,
    objections: app.objections.map((x) => (x === o ? { ...x, hand: { kind: 'concede', concessionId: c.id, day } } : x)),
  };
  const paid: World = app.wallet === 'funds'
    ? { ...world, city: { ...world.city, funds: world.city.funds - cost } }
    : { ...world, budget: { ...world.budget, treasury: world.budget.treasury - cost } };
  next = reassess(paid, terrain, next, rules, day);
  const withdrawn = next.opposition < APPEAL_BORDER[world.politics.difficulty];
  if (withdrawn) next = { ...next, appeal: { ...(next.appeal as NonNullable<Application['appeal']>), resolved: 'conceded' } };
  return { world: { ...paid, applications: paid.applications.map((a) => (a.id === appId ? next : a)) }, withdrawn };
}

/** 政治資本 4 を使って申し立てを抑える（19 章）。申し立てた集団の層の信頼 −2 */
export function appealSuppress(world: World, appId: string, day: number): { world: World; problem?: AppealProblem } {
  const app = world.applications.find((a) => a.id === appId);
  if (!app) return { world, problem: 'unknown' };
  if (!pending(app)) return { world, problem: 'stage' };
  if (world.politics.capital < SUPPRESS.capital) return { world, problem: 'capital' };
  return {
    world: {
      ...world,
      sim: { ...world.sim, trust: moveTrust(world.sim.trust, appealLayers(app), SUPPRESS.trust) },
      politics: {
        ...world.politics,
        capital: world.politics.capital - SUPPRESS.capital,
        capitalLog: [...world.politics.capitalLog, { day, amount: -SUPPRESS.capital, why: '申し立てを抑える' }],
      },
      applications: world.applications.map((a) => (a.id === appId ? { ...a, appeal: { ...(a.appeal as NonNullable<Application['appeal']>), resolved: 'capital' as const } } : a)),
    },
  };
}
