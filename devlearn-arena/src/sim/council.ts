import { FACILITY_DEFS } from '@/city/facilities';
import { CAPACITY, facilityJobs, facilityTech } from '@/city/rules';
import type { City } from '@/city/types';
import { MONTHLY_INCOME } from './layers';
import { completedCity } from './opposition';
import { siteCells } from './permits';
import { PEOPLE_PER_UNIT, TAX_BUSINESS, TAX_RESIDENT } from './rules';
import type { Application, CouncilMember, IssueId, MemberLineKey, PoliticsRules, VoteRecord, World } from './types';

/**
 * 議会 7 席の採決（docs/game-design.md 18 章）。7 人が、それぞれ重く見る論点で賛否を出す。**乱数で決めない。**
 *
 *   議員の点 = 姿勢 + Σ 論点の重み × (得 − 懸念) + 説明の効き + 支持率の効き + 説得
 *     重み: 主な論点 3・次の論点 1.5・ほか 0.5
 *     懸念 = その論点の理由の割合（%）× 0.3。押し切った理由は × 0.3
 *     説明の効き: 確か +2 / 誤り −3（その論点の重みが 1.5 以上の議員）
 *     支持率の効き: 60% 以上 +2・40% 以下 −2
 *     説得: +4（政治資本 3。1 件の申請で 1 人まで）
 *   賛成 = 点が 0 以上。賛成 4 以上で可決
 *
 * 各議員の 1 行は、点に最も効いた項（賛成なら一番大きな正の項、反対なら一番大きな負の項）を言い表す。
 */

export const WEIGHT = { main: 3, second: 1.5, other: 0.5 } as const;
export const CONCERN_PER_SHARE = 0.3;
export const PUSHED_CONCERN = 0.3;
export const EXPLAIN_POINTS = { sound: 2, wrong: -3 } as const;
export const APPROVAL_POINTS = { high: 60, low: 40, points: 2 } as const;
export const PERSUADE = { points: 4, capital: 3 } as const;
export const PASS_VOTES = 4;

/**
 * 得（0〜10）に直す倍率（18.1 の「申請の得」。仕様は 0〜10 の幅だけを決める。決めた値は docs/progress/phase-g6.md）。
 *   雇用: 10 人で 1（60 人で 6）/ 技術力: 1 で 2.5 / 財政: 週の税収 1 で 2 / 手頃さ: 5 戸で 1 / 環境: 緑地 1 マスで 2
 *   安全（公共サービスの行き届き・電力の余裕）は G10、交通は得を持たない
 */
export const GAIN_SCALE: Record<IssueId, number> = { jobs: 0.1, tech: 2.5, finance: 2, afford: 0.2, environment: 2, safety: 0, traffic: 0 };
export const ISSUE_IDS: readonly IssueId[] = ['afford', 'environment', 'jobs', 'finance', 'safety', 'traffic', 'tech'];

export function weightOf(m: Pick<CouncilMember, 'main' | 'second'>, issue: IssueId): number {
  return m.main === issue ? WEIGHT.main : m.second === issue ? WEIGHT.second : WEIGHT.other;
}

/** 区画の建物と完成した IT 施設の、雇う人・住める戸数・技術力・緑地 */
function capacityOf(city: City): { jobs: number; units: number; tech: number } {
  const zones = new Map(city.zones.map((z) => [z.id, z]));
  let jobs = 0;
  let units = 0;
  for (const b of city.buildings) {
    const z = zones.get(b.zoneId);
    if (!z) continue;
    const cap = CAPACITY[z.kind][b.level - 1] ?? 0;
    if (z.kind === 'residential') units += (cap / PEOPLE_PER_UNIT) * (z.mods?.units ?? 1);
    else jobs += cap * (z.mods?.jobs ?? 1);
  }
  let tech = 0;
  for (const f of city.facilities) {
    if (f.state !== 'active' || FACILITY_DEFS[f.type].group !== 'facility') continue;
    jobs += facilityJobs(f);
    tech += facilityTech(f);
  }
  return { jobs, units, tech };
}

export interface Gains {
  /** 論点ごとの得（0〜10） */
  values: Record<IssueId, number>;
  /** 得の元の値（「雇用が 15 人分増える」の 15） */
  raw: Record<IssueId, number>;
}

/** 申請の得（18.1）。申請が完成した形を入れた都市と、今の都市を比べる（16.2 と同じ） */
export function gainsOf(world: World, app: Application): Gains {
  const before = capacityOf(world.city);
  const after = capacityOf(completedCity(world.city, app));
  const jobs = Math.max(0, after.jobs - before.jobs);
  const units = Math.max(0, after.units - before.units);
  const tech = Math.max(0, after.tech - before.tech);
  const rate = world.budget.taxRate;
  // 週の税収の増え方（22.2）: 新しい住まいは中の収入の帯で数える
  const finance = jobs * TAX_BUSINESS * (rate / 10) + units * (MONTHLY_INCOME[1] as number) * (rate / 100) * TAX_RESIDENT;
  const green = Math.round((app.mods.green ?? 0) * siteCells(app, world.city).length);
  const raw: Record<IssueId, number> = { jobs, tech, finance, afford: units, environment: green, safety: 0, traffic: 0 };
  const values = Object.fromEntries(ISSUE_IDS.map((i) => [i, Math.min(10, raw[i] * GAIN_SCALE[i])])) as Record<IssueId, number>;
  return { values, raw };
}

/** 点の項（議員の 1 行の元）。ref は理由の ID・論点と得の元の値（「jobs:15」）・支持率 */
export interface Term {
  key: MemberLineKey;
  ref?: string;
  value: number;
}

const round1 = (v: number): number => Math.round(v * 10) / 10;

export interface Judgement {
  memberId: string;
  score: number;
  yes: boolean;
  /** 点に最も効いた項（「unanswered:dc-jobs」「gain:jobs:15」「approval:62」）。後で 1 行を作れるよう、得の値と支持率も入れる */
  reasonKey: string;
  persuaded: boolean;
  terms: Term[];
}

/** 議員 1 人の点と項 */
export function judge(member: CouncilMember, app: Application, gains: Gains, approval: number, rules: PoliticsRules): Judgement {
  const terms: Term[] = [];
  if (member.stance !== 0) terms.push({ key: 'stance', value: member.stance });
  for (const issue of ISSUE_IDS) {
    const g = weightOf(member, issue) * gains.values[issue];
    if (g > 0) terms.push({ key: 'gain', ref: `${issue}:${String(round1(gains.raw[issue]))}`, value: g });
  }
  for (const o of app.objections) {
    const reason = rules.reasons.find((r) => r.id === o.reasonId);
    if (!reason || o.share <= 0) continue;
    const w = weightOf(member, reason.issue);
    const pushed = o.hand?.kind === 'push';
    const concern = o.share * CONCERN_PER_SHARE * (pushed ? PUSHED_CONCERN : 1);
    // 公聴会の論点で答えなかった理由（市長抜きの公聴会は、全ての論点に答えなかった）
    const unanswered = !o.hand && app.hearing !== undefined && (o.issue === true || !app.hearing.attended);
    terms.push({ key: pushed ? 'pushed' : unanswered ? 'unanswered' : 'concern', ref: o.reasonId, value: -w * concern });
    if (o.hand?.kind === 'explain' && w >= WEIGHT.second) {
      if (o.hand.quality === 'sound') terms.push({ key: 'explained', ref: o.reasonId, value: EXPLAIN_POINTS.sound });
      else if (o.hand.quality === 'wrong') terms.push({ key: 'wrong', ref: o.reasonId, value: EXPLAIN_POINTS.wrong });
    }
  }
  const rate = String(Math.round(approval));
  if (approval >= APPROVAL_POINTS.high) terms.push({ key: 'approval', ref: rate, value: APPROVAL_POINTS.points });
  else if (approval <= APPROVAL_POINTS.low) terms.push({ key: 'approval', ref: rate, value: -APPROVAL_POINTS.points });
  const persuaded = app.persuaded === member.id;
  if (persuaded) terms.push({ key: 'persuaded', value: PERSUADE.points });
  const score = Math.round(terms.reduce((a, t) => a + t.value, 0) * 1e6) / 1e6;
  const yes = score >= 0;
  // 賛成なら一番大きな正の項、反対なら一番大きな負の項（同じ大きさなら先に足した項）
  let top: Term | undefined;
  for (const t of terms) {
    if (yes ? t.value <= 0 : t.value >= 0) continue;
    if (!top || Math.abs(t.value) > Math.abs(top.value)) top = t;
  }
  const reasonKey = top ? (top.ref ? `${top.key}:${top.ref}` : top.key) : 'stance';
  return { memberId: member.id, score, yes, reasonKey, persuaded, terms };
}

/** 議会の見込み（採決の前に開いた時。docs/ui-design.md 10.4）と、採決そのもの */
export function judgeAll(world: World, app: Application, rules: PoliticsRules): Judgement[] {
  const gains = gainsOf(world, app);
  const approval = world.sim.lastWeek.approval;
  return rules.council.map((m) => judge(m, app, gains, approval, rules));
}

/** 採決する（18.2）。賛成 4 以上で可決 */
export function voteOf(world: World, app: Application, rules: PoliticsRules, day: number): VoteRecord {
  const members = judgeAll(world, app, rules).map(({ memberId, score, yes, reasonKey, persuaded }) => ({ memberId, score, yes, reasonKey, persuaded }));
  return { day, consent: false, members, passed: members.filter((m) => m.yes).length >= PASS_VOTES };
}

export type PersuadeProblem = 'unknown' | 'stage' | 'used' | 'capital' | 'member';

/** 議員を説得する（18.2）: 採決の前に、政治資本 3 で 1 人の点に +4。1 件の申請で 1 人まで */
export function persuade(world: World, rules: PoliticsRules, appId: string, memberId: string, day: number): { world: World; problem?: PersuadeProblem } {
  const app = world.applications.find((a) => a.id === appId);
  if (!app) return { world, problem: 'unknown' };
  if (app.stage !== 'council' || app.vote) return { world, problem: 'stage' };
  if (app.persuaded) return { world, problem: 'used' };
  const member = rules.council.find((m) => m.id === memberId);
  if (!member) return { world, problem: 'member' };
  if (world.politics.capital < PERSUADE.capital) return { world, problem: 'capital' };
  return {
    world: {
      ...world,
      politics: {
        ...world.politics,
        capital: world.politics.capital - PERSUADE.capital,
        capitalLog: [...world.politics.capitalLog, { day, amount: -PERSUADE.capital, why: `議員を説得する（${member.name}）` }],
      },
      applications: world.applications.map((a) => (a.id === appId ? { ...a, persuaded: memberId } : a)),
    },
  };
}
