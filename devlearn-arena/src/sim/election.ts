import { FACILITY_DEFS } from '@/city/facilities';
import type { DomainId } from '@/city/types';
import { moveTrust } from './appeal';
import { evalCondition, parseCondition, startWordOf } from './conditions';
import { adultsOf, ageOf, FACTOR_COUNT, FACTORS, incomeOf, LAYER_COUNT, LAYERS } from './layers';
import { isReviewing, withdraw } from './permits';
import { DAYS_PER_WEEK, INITIAL_CAPITAL, WEEKS_PER_TERM } from './rules';
import type { CauseKind, Difficulty, Politics, PoliticsRules, Term, TermSummary, World } from './types';

/**
 * 選挙・政治資本・任期・公約（docs/game-design.md 21 章）。純粋な計算。乱数を使わない。
 * 選挙の日は任期の最後の日。得票率は層の支持と投票率から決まり、落選すると敗因（層・要因・決定）を残して、選ぶまで都市は止まる
 */

/** 任期の日数（208 週） */
export const TERM_DAYS = WEEKS_PER_TERM * DAYS_PER_WEEK;
/** 「選挙が近い」と知らせる日（8 週前） */
export const WARN_DAYS = 8 * DAYS_PER_WEEK;
/** 政治資本の上限（21.5。褒賞の新しい市庁舎で上がるのは G11） */
export const CAPITAL_CAP = 30;
/** 政治資本を得る（21.5） */
export const GAIN = { pledge: 5, mission: 3, rise: 1, win: 5 } as const;
/** 支持率の上昇: 4 週ごとに、4 週前より 3 以上高ければ */
export const RISE = { weeks: 4, points: 3 } as const;
/** 公約を果たした・選挙の日に果たせていない時の、重く見る層の信頼（21.4） */
export const PLEDGE_TRUST = { done: 3, missed: -3 } as const;
/** 初めの政治資本（docs/game-design.md 27 章） */
export const START_CAPITAL: Record<Difficulty, number> = { gentle: 14, normal: INITIAL_CAPITAL, tough: 7 };

/** 投票率（21.1）: 年齢の帯の基本 + 収入の帯 + 0.2 × |支持 − 50| ÷ 50 */
const TURNOUT_AGE = [0.35, 0.5, 0.6, 0.7] as const;
const TURNOUT_INCOME = [-0.1, 0, 0.1] as const;
const TURNOUT_SWING = 0.2;
/** 敗因の決定に数える原因（市長が決めた物） */
const DECISION_KINDS: readonly CauseKind[] = ['facility', 'zone', 'road', 'decision'];

export const electionDayOf = (term: Pick<Term, 'startDay'>): number => term.startDay + TERM_DAYS - 1;

const round6 = (v: number): number => Math.round(v * 1e6) / 1e6;

export function turnoutOf(layer: number, support: number): number {
  const t = (TURNOUT_AGE[ageOf(layer)] as number) + (TURNOUT_INCOME[incomeOf(layer)] as number) + (TURNOUT_SWING * Math.abs(support - 50)) / 50;
  return Math.max(0, Math.min(1, t));
}

/** 層ごとの 18 歳以上の人数（区画の建物の世帯から） */
export function layerAdults(world: World): number[] {
  const out = new Array<number>(LAYER_COUNT).fill(0);
  for (const counts of Object.values(world.sim.households)) for (const l of LAYERS) out[l] = (out[l] as number) + (counts[l] ?? 0) * adultsOf(l);
  return out;
}

/** 層ごとの支持（最後の週の内訳。住む人がいない層は都市の支持率） */
export function layerSupport(world: World): number[] {
  const last = world.history.breakdown.at(-1)?.layers;
  return LAYERS.map((l) => {
    const v = last?.[l];
    return v === undefined || v < 0 ? world.sim.lastWeek.approval : v;
  });
}

export interface VoteShare {
  share: number;
  turnout: number[];
  /** 層ごとの得票率への効き（得票率 − 50 を層に分けた物。|効き| の大きい順） */
  effects: { layer: number; points: number }[];
}

/** 得票率 = Σ 人数 × 投票率 × 支持 ÷ Σ 人数 × 投票率 */
export function voteShareOf(people: readonly number[], support: readonly number[]): VoteShare {
  const turnout = LAYERS.map((l) => turnoutOf(l, support[l] as number));
  const weight = LAYERS.map((l) => (people[l] as number) * (turnout[l] as number));
  const total = weight.reduce((a, b) => a + b, 0);
  if (total <= 0) return { share: 50, turnout, effects: [] };
  const share = LAYERS.reduce((s, l) => s + (weight[l] as number) * (support[l] as number), 0) / total;
  const effects = LAYERS.filter((l) => (weight[l] as number) > 0)
    .map((l) => ({ layer: l, points: ((weight[l] as number) * ((support[l] as number) - 50)) / total }))
    .sort((a, b) => Math.abs(b.points) - Math.abs(a.points) || a.layer - b.layer);
  return { share, turnout, effects };
}

export interface ElectionResult {
  voteShare: number;
  won: boolean;
  byLayer: { support: number; turnout: number }[];
  effects: { layer: number; points: number }[];
}

/** 今の世界で選挙をしたら（選挙の日の結果と、上の帯の任期の残りから開く見込み。docs/ui-design.md 10.6） */
export function electionOf(world: World): ElectionResult {
  const support = layerSupport(world);
  const r = voteShareOf(layerAdults(world), support);
  const voteShare = round6(r.share);
  return {
    voteShare,
    won: voteShare >= 50,
    byLayer: LAYERS.map((l) => ({ support: round6(support[l] as number), turnout: round6(r.turnout[l] as number) })),
    effects: r.effects.map((e) => ({ layer: e.layer, points: round6(e.points) })),
  };
}

/**
 * 敗因（21.2）: 得票を 50% から下げた層を大きい順に 3 つ。それぞれの満足の要因（13.8 の内訳。その層の点に直す）のうち下げた物を大きい順に 3 つと、
 * その要因を下げた原因のうち市長が決めた物（施設・区画・道路・決定）を 2 つまで
 */
export function causesOf(world: World, result: ElectionResult): NonNullable<TermSummary['causes']> {
  const b = world.history.breakdown.at(-1);
  if (!b) return [];
  const adults = layerAdults(world);
  const total = adults.reduce((a, x) => a + x, 0);
  return [...result.effects].filter((e) => e.points < 0).sort((a, x) => a.points - x.points || a.layer - x.layer).slice(0, 3).map((e) => {
    const share = total > 0 ? (adults[e.layer] as number) / total : 0;
    const factors = Array.from({ length: FACTOR_COUNT }, (_, f) => ({ factor: FACTORS[f] as (typeof FACTORS)[number], points: share > 0 ? round6(((b.factors[f] as number[])[e.layer] as number) / share) : 0 }))
      .filter((f) => f.points < 0)
      .sort((a, x) => a.points - x.points)
      .slice(0, 3);
    const keys = new Set(factors.map((f) => f.factor));
    const decisions: string[] = [];
    for (const c of [...b.causes].sort((a, x) => a.points - x.points)) {
      if (c.points >= 0 || !keys.has(c.factor) || !DECISION_KINDS.includes(c.source.kind)) continue;
      const key = `${c.source.kind}:${c.source.id}`;
      if (!decisions.includes(key)) decisions.push(key);
      if (decisions.length >= 2) break;
    }
    return { layer: e.layer, factors, decisions };
  });
}

/** 今の模擬が数えている条件の語（conditionValues の鍵。公約の検証に使う） */
export const COUNTED_WORDS = ['population', 'jobs', 'unemployment', 'approval', 'treasury', 'taxRate', 'outageDays', 'facilities.it', 'facilities.civic', 'missionsDone'] as const;

/** 公約の条件の値（docs/content-spec.md 7.7。今ある模擬の値だけ。行き届き・家賃の負担・騒音の語は、それを数える Phase で足す） */
export function conditionValues(world: World): Record<(typeof COUNTED_WORDS)[number], number> {
  const it = world.city.facilities.filter((f) => FACILITY_DEFS[f.type].group === 'facility' && f.state === 'active').length;
  return {
    population: world.city.population,
    jobs: world.sim.lastWeek.jobs,
    unemployment: round6(world.sim.lastWeek.unemployment * 100),
    approval: world.sim.lastWeek.approval,
    treasury: world.budget.treasury,
    taxRate: world.budget.taxRate,
    outageDays: Math.max(0, ...world.sim.power.outageDays),
    'facilities.it': it,
    'facilities.civic': 0,
    missionsDone: world.politics.missions?.length ?? 0,
  };
}

/** 政治資本を足す（上限 30）。この任期の得と使いに残す */
function addCapital(politics: Politics, amount: number, why: string, day: number): Politics {
  const capital = Math.min(CAPITAL_CAP, politics.capital + amount);
  const delta = capital - politics.capital;
  return delta === 0 ? politics : { ...politics, capital, capitalLog: [...politics.capitalLog, { day, amount: delta, why }] };
}

/** 新しい任期（公約は空。選び直す） */
function newTerm(world: World, no: number, startDay: number): Term {
  const learning = world.politics.learning;
  return {
    no,
    startDay,
    pledges: [],
    startSnapshot: { population: world.city.population, jobs: world.sim.lastWeek.jobs, treasury: world.budget.treasury, approval: world.sim.lastWeek.approval, lessonsDone: learning?.lessonsDone ?? 0 },
    startStages: { ...(learning?.stages ?? {}) },
    missions: [],
  };
}

export type PledgeProblem = 'count' | 'unknown' | 'chosen' | 'met';

/** 公約の初めの値（goal の start の語の、今の値。start の語が無ければ 0） */
function startValueOf(goal: string, values: Partial<Record<string, number>>): number {
  const word = startWordOf(parseCondition(goal) ?? []);
  return word ? (values[word] ?? 0) : 0;
}

/**
 * 選ぶ時にすでに果たしている公約か（人が住む前の「人口を 2 割増やす」は 0 ≥ 0・失業者のいない町の「失業率を 5% 以下」）。
 * 公約は任期の間に果たす物なので、選べない（何もせずに政治資本 +5 を得ない）
 */
export function pledgeMet(world: World, goal: string): boolean {
  const clauses = parseCondition(goal);
  if (!clauses) return false;
  const values: Partial<Record<string, number>> = conditionValues(world);
  return evalCondition(clauses, values, startValueOf(goal, values));
}

/** 公約を 2 つ選ぶ（任期の初めに 1 度。21.4）。初めの値（start の語の値）を覚える。すでに果たしている公約は選べない */
export function choosePledges(world: World, ids: readonly string[], rules: PoliticsRules): { world: World; problem?: PledgeProblem } {
  if (world.politics.term.pledges.length > 0) return { world, problem: 'chosen' };
  if (ids.length !== 2 || new Set(ids).size !== 2) return { world, problem: 'count' };
  const all = rules.pledges ?? [];
  const chosen = ids.map((id) => all.find((p) => p.id === id));
  if (chosen.some((p) => !p)) return { world, problem: 'unknown' };
  if (chosen.some((p) => pledgeMet(world, p?.goal ?? ''))) return { world, problem: 'met' };
  const values: Partial<Record<string, number>> = conditionValues(world);
  const pledges = chosen.map((p) => ({ pledgeId: p?.id ?? '', startValue: startValueOf(p?.goal ?? '', values) }));
  return { world: { ...world, politics: { ...world.politics, term: { ...world.politics.term, pledges } } } };
}

/** 週の終わりに、公約を果たしたかを確かめる（果たすと政治資本 +5・重く見る層の信頼 +3） */
function checkPledges(world: World, day: number, rules: PoliticsRules): World {
  const term = world.politics.term;
  if (term.pledges.every((p) => p.doneDay !== undefined)) return world;
  const values = conditionValues(world);
  let politics = world.politics;
  let trust = world.sim.trust;
  const pledges = term.pledges.map((p) => {
    if (p.doneDay !== undefined) return p;
    const def = (rules.pledges ?? []).find((x) => x.id === p.pledgeId);
    const clauses = def ? parseCondition(def.goal) : null;
    if (!def || !clauses || !evalCondition(clauses, values, p.startValue)) return p;
    politics = addCapital(politics, GAIN.pledge, `公約を果たした（${def.title}）`, day);
    trust = moveTrust(trust, def.layers, PLEDGE_TRUST.done);
    return { ...p, doneDay: day };
  });
  return { ...world, sim: { ...world.sim, trust }, politics: { ...politics, term: { ...politics.term, pledges } } };
}

/** 支持率の上昇（4 週ごとに、4 週前より 3 以上高ければ +1） */
function approvalRise(world: World, day: number): World {
  const week = day / DAYS_PER_WEEK;
  if (week % RISE.weeks !== 0) return world;
  const before = world.history.breakdown.find((b) => b.week === week - RISE.weeks);
  if (!before || world.sim.lastWeek.approval - before.approval < RISE.points) return world;
  return { ...world, politics: addCapital(world.politics, GAIN.rise, '支持率の上昇', day) };
}

/** 任期の一覧（21.3） */
export function termSummaryOf(world: World, result: ElectionResult, day: number, causes?: TermSummary['causes']): TermSummary {
  const { term, learning } = world.politics;
  const inTerm = (d: number | undefined): boolean => d !== undefined && d >= term.startDay && d <= day;
  const voted = world.applications.filter((a) => a.vote && inTerm(a.vote.day));
  const up = Object.entries(learning?.stages ?? {}).filter(([d, s]) => (s ?? 0) > (term.startStages?.[d as DomainId] ?? 0)).map(([d]) => d as DomainId);
  return {
    no: term.no,
    startDay: term.startDay,
    endDay: day,
    won: result.won,
    voteShare: result.voteShare,
    byLayer: result.byLayer,
    ...(causes ? { causes } : {}),
    built: world.applications.filter((a) => a.stage === 'done' && inTerm(a.stageDay)).map((a) => a.id),
    approved: voted.filter((a) => a.vote?.passed).length,
    rejected: voted.filter((a) => a.vote && !a.vote.passed).length,
    pledgesDone: term.pledges.filter((p) => p.doneDay !== undefined).map((p) => p.pledgeId),
    missionsDone: [...(term.missions ?? [])],
    lessonsDone: Math.max(0, (learning?.lessonsDone ?? 0) - term.startSnapshot.lessonsDone),
    skillsUp: up,
    population: [term.startSnapshot.population, world.city.population],
    jobs: [term.startSnapshot.jobs, world.sim.lastWeek.jobs],
    treasury: [term.startSnapshot.treasury, world.budget.treasury],
    approval: [term.startSnapshot.approval, world.sim.lastWeek.approval],
  };
}

/** 選挙の日（21.1）。果たせていない公約の層の信頼 −3。当選なら次の任期（政治資本 +5）、落選なら選ぶまで止まる */
function holdElection(world: World, day: number, rules: PoliticsRules): World {
  const result = electionOf(world);
  let trust = world.sim.trust;
  for (const p of world.politics.term.pledges) {
    if (p.doneDay !== undefined) continue;
    const def = (rules.pledges ?? []).find((x) => x.id === p.pledgeId);
    if (def) trust = moveTrust(trust, def.layers, PLEDGE_TRUST.missed);
  }
  const summary = termSummaryOf(world, result, day, result.won ? undefined : causesOf(world, result));
  const base: World = { ...world, sim: { ...world.sim, trust }, politics: { ...world.politics, pastTerms: [...world.politics.pastTerms, summary] } };
  if (!result.won) return { ...base, politics: { ...base.politics, defeated: true } };
  const politics: Politics = { ...base.politics, term: newTerm(base, world.politics.term.no + 1, day + 1), capitalLog: [], pushesThisTerm: 0, wrongExplanations: 0, expiredPetitions: 0 };
  return { ...base, politics: addCapital(politics, GAIN.win, '当選', day) };
}

/** 1 日の終わりの市政（週の終わりの公約と支持率の上昇・選挙の日） */
export function stepPolitics(world: World, day: number, rules: PoliticsRules): World {
  if (world.politics.defeated) return world;
  let w = world;
  if (day % DAYS_PER_WEEK === 0) w = approvalRise(checkPledges(w, day, rules), day);
  if (day === electionDayOf(w.politics.term)) w = holdElection(w, day, rules);
  return w;
}

/** ミッションの達成（政治資本 +3。同じミッションは 1 度だけ。21.5） */
export function creditMission(world: World, missionId: string, day: number): World {
  if (world.politics.missions?.includes(missionId)) return world;
  const term = world.politics.term;
  const politics = addCapital({ ...world.politics, missions: [...(world.politics.missions ?? []), missionId], term: { ...term, missions: [...(term.missions ?? []), missionId] } }, GAIN.mission, 'ミッションの達成', day);
  return { ...world, politics };
}

/** 学習の進み（画面が知らせる数。任期の終わりの一覧に使う） */
export function noteLearning(world: World, lessonsDone: number, stages: Partial<Record<DomainId, number>>): World {
  const prev = world.politics.learning;
  if (prev && prev.lessonsDone === lessonsDone && JSON.stringify(prev.stages) === JSON.stringify(stages)) return world;
  const first = !prev;
  const politics: Politics = { ...world.politics, learning: { lessonsDone, stages: { ...stages } } };
  // 初めて知らせた時は、今の任期の初めの値にもする（移行した都市・新しい都市の 1 期目）
  if (first) politics.term = { ...politics.term, startSnapshot: { ...politics.term.startSnapshot, lessonsDone }, startStages: { ...stages } };
  return { ...world, politics };
}

/**
 * 同じ都市で再び立つ（21.2）: 都市はそのまま。政治資本は初めの値・審議中の申請は取り下げ（費用は戻る）・次の任期（公約を選び直す）
 */
export function rerun(world: World, day: number): World {
  if (!world.politics.defeated) return world;
  let w = world;
  for (const a of world.applications) if (isReviewing(a)) w = withdraw(w, a.id, day);
  const politics: Politics = { ...w.politics, capital: START_CAPITAL[w.politics.difficulty], capitalLog: [], term: newTerm(w, w.politics.term.no + 1, day), pushesThisTerm: 0, wrongExplanations: 0, expiredPetitions: 0 };
  delete politics.defeated;
  return { ...w, politics };
}
