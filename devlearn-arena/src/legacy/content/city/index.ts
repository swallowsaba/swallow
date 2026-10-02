import type { MissionTrack } from '@/engines/lesson/types';
import { gitCity } from './git';
import { githubCity } from './github';
import { k8sCity } from './k8s';
import { kernelCity } from './kernel';
import { netCity } from './net';
import type { CityPlan, Facility } from './types';

export type { BuildingKind, CityPlan, Facility, FacilityQuiz } from './types';

export const CITY_TRACKS: readonly MissionTrack[] = ['kernel', 'git', 'github', 'k8s', 'net'];

export const CITIES: Readonly<Record<MissionTrack, CityPlan>> = {
  kernel: kernelCity,
  git: gitCity,
  github: githubCity,
  k8s: k8sCity,
  net: netCity,
};

/** 施設を id（章の id）から引く */
export function facilityById(id: string): Facility | undefined {
  for (const plan of Object.values(CITIES)) {
    const found = plan.facilities.find((f) => f.id === id);
    if (found) return found;
  }
  return undefined;
}

/* ---------------- 街の状態 ---------------- */

/**
 * locked    = 先に建てる施設が残っていて、まだ建てられない（見られる・学べる）
 * available = 学べば建てられる
 * built     = 建てたが、まだ任務で動かしていない
 * operating = 任務をこなして動き始めている
 * complete  = その施設の任務をすべてこなした（フル稼働）
 */
export type FacilityState = 'locked' | 'available' | 'built' | 'operating' | 'complete';

export interface FacilityStatus {
  facility: Facility;
  state: FacilityState;
  missionsCleared: number;
  missionsTotal: number;
  /** 稼働率 0..1 */
  ratio: number;
}

export const CITY_RANKS = ['wilderness', 'settlement', 'town', 'city', 'bigCity', 'metropolis'] as const;
export type CityRank = (typeof CITY_RANKS)[number];

export interface CityState {
  plan: CityPlan;
  facilities: FacilityStatus[];
  built: number;
  complete: number;
  residents: number;
  /**
   * 住民の満足度（0〜100）。市長としての成績。
   * 建てた施設が稼働するほど上がり、建てられるのに建てていない施設（放置した困りごと）があると下がる。
   */
  comfort: number;
  rank: CityRank;
  /** 次に取り組むとよい施設。建てられる施設が先、無ければ稼働しきっていない施設 */
  nextFacilityId: string | null;
}

/** 満足度の計算。何も無い街の満足度と、建てたばかりの施設の貢献 */
export const COMFORT = { base: 30, built: 0.4 } as const;

/** 住民の増え方。建てると住み始め、稼働するほど増える */
export const RESIDENTS = { perBuilt: 20, perOperation: 30, perComplete: 10 } as const;

export function rankOf(built: number, complete: number, total: number): CityRank {
  if (total > 0 && complete === total) return 'metropolis';
  if (built === 0) return 'wilderness';
  const ratio = built / Math.max(1, total);
  if (ratio >= 0.75) return 'bigCity';
  if (ratio >= 0.5) return 'city';
  if (ratio >= 0.25) return 'town';
  return 'settlement';
}

/**
 * 街の状態を、建てた施設とクリアした任務から組み立てる。保存しない。
 * missions は { id, chapterId } の一覧（任務は章 = 施設に属する）。
 */
export function cityOf(
  plan: CityPlan,
  built: ReadonlySet<string>,
  missions: readonly { id: string; chapterId: string }[],
  cleared: ReadonlySet<string>,
): CityState {
  const facilities = plan.facilities.map((facility): FacilityStatus => {
    const mine = missions.filter((m) => m.chapterId === facility.id);
    const missionsCleared = mine.filter((m) => cleared.has(m.id)).length;
    const missionsTotal = mine.length;
    const ratio = missionsTotal === 0 ? 1 : missionsCleared / missionsTotal;
    let state: FacilityState;
    if (!built.has(facility.id)) {
      state = facility.needs.every((n) => built.has(n)) ? 'available' : 'locked';
    } else if (ratio >= 1) {
      state = 'complete';
    } else {
      state = missionsCleared > 0 ? 'operating' : 'built';
    }
    return { facility, state, missionsCleared, missionsTotal, ratio };
  });
  const builtCount = facilities.filter((f) => f.state !== 'locked' && f.state !== 'available').length;
  const complete = facilities.filter((f) => f.state === 'complete').length;
  const residents = facilities.reduce((sum, f) => {
    if (f.state === 'locked' || f.state === 'available') return sum;
    return sum + RESIDENTS.perBuilt + Math.round(f.ratio * RESIDENTS.perOperation) + (f.state === 'complete' ? RESIDENTS.perComplete : 0);
  }, 0);
  // 満足度：建てた施設は稼働率に応じて 0.4〜1.0、建てられるのに放置している施設は 0 として平均し、30〜100% に写す
  const counted = facilities.filter((f) => f.state !== 'locked');
  const score = counted.reduce((sum, f) => sum + (f.state === 'available' ? 0 : COMFORT.built + (1 - COMFORT.built) * f.ratio), 0);
  const comfort = counted.length === 0 ? COMFORT.base : Math.round(COMFORT.base + (100 - COMFORT.base) * (score / counted.length));
  const next =
    facilities.find((f) => f.state === 'available') ??
    facilities.find((f) => f.state === 'built' || f.state === 'operating') ??
    null;
  return {
    plan,
    facilities,
    built: builtCount,
    complete,
    residents,
    comfort,
    rank: rankOf(builtCount, complete, facilities.length),
    nextFacilityId: next?.facility.id ?? null,
  };
}
