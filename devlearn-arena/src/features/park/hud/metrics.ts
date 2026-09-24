import type { City } from '@/city/model';
import type { CityPlan } from '@/content/city';
import type { TownGrowth } from '@/features/citymap/cityStore';

/**
 * 上の帯に出す指標。すべて状態から導く。持ち回らない。
 *
 * 住人＝落ち着いて住んでいる人（稼働している Pod）。
 * 健全度＝住人のうち、落ち着いている人の割合。
 * 建築権＝学習で得た分から、街に置いた分を引いた残り。
 *
 * ここは React にも three にも触れない純粋関数。同じ状態からは必ず同じ数になる。
 */

export interface CityMetrics {
  /** 稼働している住人の数 */
  residents: number;
  xp: number;
  /** 0..100 */
  health: number;
  /** 使える建築権 */
  rights: number;
}

/** 落ち着いて住んでいる人。引っ越し中と不調の人は数えない */
export function residentsOf(city: City): number {
  let settled = 0;
  for (const building of city.buildings) {
    for (const occupant of building.occupants) {
      if (occupant.state === 'settled') settled += 1;
    }
  }
  return settled;
}

/**
 * 健全度。住人のうち落ち着いている割合を百分率で返す。
 * 壊れている建物は 1 棟につき住人 1 人ぶんの重さで引く。
 * まだ誰も住んでいない街は 100 とする（減点する材料が無い）。
 */
export function healthOf(city: City): number {
  let settled = 0;
  let counted = 0;
  for (const building of city.buildings) {
    for (const occupant of building.occupants) {
      if (occupant.state === 'gone') continue;
      counted += 1;
      if (occupant.state === 'settled') settled += 1;
    }
    if (building.state === 'broken') counted += 1;
  }
  if (counted === 0) return 100;
  return Math.round((settled / counted) * 100);
}

/**
 * 学習で得た建築権。
 * コマンドの手順を 1 つ通すごとに 1、理解度の問題に 1 問正解するごとに 1。
 * 街の育ちと同じ数から導くので、別に数え直す必要が無い。
 */
export function earnedRights(growth: TownGrowth): number {
  return growth.floors + growth.houses;
}

/** いま使える建築権。得た分から、すでに置いた分を引く */
export function buildRights(growth: TownGrowth, placed: number): number {
  return Math.max(0, earnedRights(growth) - placed);
}

export function cityMetrics(input: {
  city: City;
  xp: number;
  growth: TownGrowth;
  placed: number;
}): CityMetrics {
  return {
    residents: residentsOf(input.city),
    xp: input.xp,
    health: healthOf(input.city),
    rights: buildRights(input.growth, input.placed),
  };
}

/** 街の段。施設 1 つが 1 段で、名前はその施設の名前 */
export interface Milestone {
  /** 何段目か（1 始まり） */
  n: number;
  name: string;
  /** その段の進み具合 0..1 */
  ratio: number;
  /** 全部で何段あるか */
  total: number;
}

/**
 * いま取り組んでいる段。
 * まだ任務を残している最初の施設がその段になる。全部終えていれば最後の段。
 */
export function milestoneOf(
  plan: CityPlan,
  missions: readonly { id: string; chapterId: string }[],
  cleared: ReadonlySet<string>,
): Milestone {
  const total = plan.facilities.length;
  const steps = plan.facilities.map((facility) => {
    const mine = missions.filter((m) => m.chapterId === facility.id);
    const done = mine.filter((m) => cleared.has(m.id)).length;
    return { name: facility.name, ratio: mine.length === 0 ? 1 : done / mine.length };
  });
  const index = steps.findIndex((s) => s.ratio < 1);
  const at = index < 0 ? total - 1 : index;
  const step = steps[at];
  if (step === undefined) return { n: 1, name: plan.name, ratio: 0, total: Math.max(1, total) };
  return { n: at + 1, name: step.name, ratio: step.ratio, total };
}

/** 街の進み方。止める・そのまま・早送りの 3 段 */
export type Speed = 'pause' | 'normal' | 'fast';

export const SPEEDS: readonly Speed[] = ['pause', 'normal', 'fast'];

/** その段で街が何倍の速さで進むか */
export const SPEED_RATE: Readonly<Record<Speed, number>> = { pause: 0, normal: 1, fast: 3 };

function pad(n: number): string {
  return n < 10 ? `0${String(n)}` : String(n);
}

/**
 * 街の時計。コマンドを 1 つ打つごとに 1 tick 進む。
 * 日は、学習者が取り組んだ日の数。まだ 1 日も記録が無ければ 1 日目とする。
 */
export function clockOf(activeDays: number, ticks: number): { day: number; tick: string } {
  const safe = Math.max(0, Math.floor(ticks));
  return {
    day: Math.max(1, activeDays),
    tick: `${pad(Math.floor(safe / 60) % 100)}:${pad(safe % 60)}`,
  };
}
