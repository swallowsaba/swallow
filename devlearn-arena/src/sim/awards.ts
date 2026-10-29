import { FACILITY_DEFS, FACILITY_TYPES } from '@/city/facilities';
import type { City, Facility, FacilityType } from '@/city/types';
import type { ActiveFacility, Space } from './space';

/**
 * 褒賞の建物の効き（docs/game-design.md 25 章）。建った（完成した）物だけが効く。
 * 地価（市民記念館）は src/sim/land.ts、商業の需要は src/sim/demand.ts、緑地の行き届き（中央公園）は content/facilities.json の coverage。
 * 競技場の催しと試合の日は src/sim/week.ts（騒音は land.ts、交通の流れは commute.ts に足す）。
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

/**
 * 競技場（25 章・docs/decisions.md U-13・U-14 の判断）:
 * - 催し: 若者と子育ての層の住宅が、完成した競技場の中心から直線で 15 マス以内なら +3（距離で薄めない。13.8 の 13 番目の要因）
 * - 試合の日: 完成した日から 14 日ごと。試合の日を含む週だけ、騒音 20（半径 5）と、
 *   面する道路から道路で 15 マス以内の道路のマスへ交通の流れ 2,000 × (1 − 距離 ÷ 15)
 */
export const STADIUM = {
  event: { points: 3, radius: 15, ages: [0, 1] as readonly number[] },
  every: 14,
  noise: { value: 20, radius: 5 },
  traffic: { value: 2000, reach: 15 },
} as const;

/** 試合の日を数え始める日（完成した日。申請を通らずに置いた物は置いた日） */
const firstDayOf = (f: Pick<Facility, 'builtDay' | 'completeDay'>): number => f.completeDay ?? f.builtDay;

/** その日が競技場の試合の日か（完成した日の 14 日後・28 日後 …） */
export function matchDay(f: Pick<Facility, 'builtDay' | 'completeDay'>, day: number): boolean {
  const s = Math.floor(day) - firstDayOf(f);
  return s > 0 && s % STADIUM.every === 0;
}

/** 週の終わりの日 weekEnd までの 7 日（weekEnd − 6 〜 weekEnd）に、試合の日があるか */
export function matchInWeek(f: Pick<Facility, 'builtDay' | 'completeDay'>, weekEnd: number): boolean {
  const s = Math.floor(weekEnd) - firstDayOf(f);
  return s >= STADIUM.every && s % STADIUM.every < 7;
}

/** マス（の中心）が、完成した競技場の中心から直線で 15 マス以内か。x・y はマスの左上 */
export function eventNear(space: Pick<Space, 'awards'>, x: number, y: number): boolean {
  return eventSourceAt(space, x, y) !== undefined;
}

/** マスに催しを届ける競技場（一番近い物） */
export function eventSourceAt(space: Pick<Space, 'awards'>, x: number, y: number): ActiveFacility | undefined {
  let best: ActiveFacility | undefined;
  let bestD = Infinity;
  for (const af of space.awards) {
    if (af.facility.type !== 'stadium') continue;
    const d = Math.hypot(x + 0.5 - af.center.x, y + 0.5 - af.center.y);
    if (d <= STADIUM.event.radius && d < bestD) {
      best = af;
      bestD = d;
    }
  }
  return best;
}

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
