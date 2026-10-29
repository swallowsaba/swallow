import { FACILITY_DEFS } from '@/city/facilities';
import type { FacilityType } from '@/city/types';
import { moveTrust } from './appeal';
import { AWARD_TYPES, CIVIC_HALL_TRUST, HIGH_APPROVAL } from './awards';
import { evalCondition, parseCondition, type Clause } from './conditions';
import { conditionValues } from './election';
import { LAYERS } from './layers';
import { awardTaken } from './permits';
import { DAYS_PER_WEEK } from './rules';
import type { World } from './types';

/**
 * 褒賞（docs/game-design.md 25 章）。人口や支持率の節目で、建てられる物が増える。**学習にはロックを掛けない**（建物だけが対象）。
 *
 * - 節目は週の終わりに確かめる（人口と支持率は週の終わりの値）。条件は content/facilities.json の unlock（docs/content-spec.md 7.7 の式）
 * - 届いた日を残し、届いた後に人口や支持率が下がっても、建てられるままにする
 * - 建った（完成した）褒賞の建物を残す。市民ホールは、初めて建った時に 1 回だけ全ての層の信頼 +2
 */

/** 節目の条件の値（7.7 の語と、支持率 65% 以上が続いた週） */
export function rewardValues(world: World): Record<string, number> {
  return { ...conditionValues(world), highApprovalWeeks: world.rewards.highApprovalWeeks };
}

const clausesOf = (type: FacilityType): Clause[] => parseCondition(FACILITY_DEFS[type].unlock ?? '') ?? [];

/** 節目に届いているか（今の値で） */
export function milestoneMet(world: World, type: FacilityType): boolean {
  const clauses = clausesOf(type);
  return clauses.length > 0 && evalCondition(clauses, rewardValues(world));
}

/** 1 日の終わりの褒賞（週の終わりに節目を確かめ、毎日、完成した褒賞の建物を残す） */
export function stepRewards(world: World, day: number): World {
  let rewards = world.rewards;
  let trust = world.sim.trust;
  if (day % DAYS_PER_WEEK === 0) {
    const highApprovalWeeks = world.sim.lastWeek.approval >= HIGH_APPROVAL ? rewards.highApprovalWeeks + 1 : 0;
    if (highApprovalWeeks !== rewards.highApprovalWeeks) rewards = { ...rewards, highApprovalWeeks };
    const counted = { ...world, rewards };
    for (const type of AWARD_TYPES) {
      if (rewards.unlocked[type] !== undefined || !milestoneMet(counted, type)) continue;
      rewards = { ...rewards, unlocked: { ...rewards.unlocked, [type]: day } };
    }
  }
  for (const type of AWARD_TYPES) {
    if (rewards.built[type] !== undefined) continue;
    const f = world.city.facilities.find((x) => x.type === type && x.state === 'active');
    if (!f) continue;
    rewards = { ...rewards, built: { ...rewards.built, [type]: f.id } };
    if (type === 'civic-hall') trust = moveTrust(trust, LAYERS, CIVIC_HALL_TRUST);
  }
  if (rewards === world.rewards) return world;
  return { ...world, rewards, sim: trust === world.sim.trust ? world.sim : { ...world.sim, trust } };
}

/** 褒賞の建物の今（節目に届いていない・建てられる・申請中か工事中・建っている） */
export type AwardStatus = 'locked' | 'open' | 'pending' | 'built';

export function awardStatus(world: World, type: FacilityType): AwardStatus {
  if (world.city.facilities.some((f) => f.type === type && f.state === 'active')) return 'built';
  if (awardTaken(world, type)) return 'pending';
  return world.rewards.unlocked[type] !== undefined ? 'open' : 'locked';
}

/** 節目の条件の 1 つ（「人口 3,420 / 5,000」） */
export interface MilestonePart {
  word: string;
  value: number;
  target: number;
  met: boolean;
}

/** 節目の条件ごとの、今の値と目標（褒賞の一覧。docs/ui-design.md 10.11） */
export function milestoneParts(world: World, type: FacilityType): MilestonePart[] {
  const values = rewardValues(world);
  return clausesOf(type).flatMap((c) => {
    if (!('value' in c)) return [];
    const value = values[c.word] ?? 0;
    return [{ word: c.word, value, target: c.value, met: evalCondition([c], values) }];
  });
}
