import { FACILITY_DEFS, FACILITY_TYPES } from '@/city/facilities';
import type { City, FacilityType } from '@/city/types';

/**
 * 褒賞の建物の効き（docs/game-design.md 25 章）。建った（完成した）物だけが効く。
 * 地価（市民記念館）は src/sim/land.ts、商業の需要は src/sim/demand.ts、緑地の行き届き（中央公園）は content/facilities.json の coverage。
 * 節目の判定と、市民ホールの信頼は src/sim/rewards.ts
 */

/** 褒賞の建物（データの順。褒賞の一覧の並び） */
export const AWARD_TYPES: readonly FacilityType[] = FACILITY_TYPES.filter((t) => FACILITY_DEFS[t].group === 'award');

/** 新しい市庁舎: 政治資本の上限 +5。議員の説得が 2 で済む */
export const CITY_HALL = { capital: 5, persuade: 2 } as const;
/** 市民ホール: 全ての層の信頼 +2（建った時に 1 回） */
export const CIVIC_HALL_TRUST = 2;
/** 市民ホールの節目の支持率（この値以上を 8 週続ける。highApprovalWeeks で数える） */
export const HIGH_APPROVAL = 65;

/** その褒賞の建物が、都市に建っているか（完成した物） */
export function awardActive(city: Pick<City, 'facilities'>, type: FacilityType): boolean {
  return city.facilities.some((f) => f.type === type && f.state === 'active');
}

/** 政治資本の上限（docs/game-design.md 21.5 の 30。新しい市庁舎が建つと +5） */
export const CAPITAL_CAP = 30;
export function capitalCapOf(city: Pick<City, 'facilities'>): number {
  return CAPITAL_CAP + (awardActive(city, 'city-hall') ? CITY_HALL.capital : 0);
}

/** 議員を説得する政治資本（docs/game-design.md 18.2 の 3。新しい市庁舎が建つと 2） */
export const PERSUADE_CAPITAL = 3;
export function persuadeCostOf(city: Pick<City, 'facilities'>): number {
  return awardActive(city, 'city-hall') ? CITY_HALL.persuade : PERSUADE_CAPITAL;
}
