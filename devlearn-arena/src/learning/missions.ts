import { domainsOfFacility } from '@/city/facilityInfo';
import type { Facility, FacilityType } from '@/city/types';
import { domainDef } from '@/content/catalog';
import { MISSIONS } from '@/content/missions';
import type { Mission } from '@/content/schema';
import type { MissionProgress, Progress } from '@/game/types';

/**
 * ミッションの見せ方（docs/game-design.md 5・8 章、docs/decisions.md D-14）。純粋な関数。
 *
 * - ミッションは全て最初から受けられる（前提は要らない）。ミッション一覧には常に全てを出す
 * - 施設の情報パネルには、その施設の分野を含むミッションを、施設の Lv の数まで並べる（Lv1 は 1 本）。
 *   先頭の分野（domains[0]）がその施設の分野の物から先に並べる
 * - 報酬の記念碑は、達成したミッションの数だけ受け取り、学習者が都市に置く（docs/city-design.md 4 章）
 */

export type MissionStatus = MissionProgress['status'];

export const MISSION_STATUS_NAMES: Record<MissionStatus, string> = { available: '受けられる', 'in-progress': '挑戦中', completed: '達成' };

/** その依頼を出した施設（先頭の分野の施設） */
export function missionFacility(m: Mission): FacilityType | undefined {
  const main = m.domains[0];
  return (main ? domainDef(main)?.facility : undefined) as FacilityType | undefined;
}

export function missionStatus(progress: Progress, id: string): MissionStatus {
  return progress.missions[id]?.status ?? 'available';
}

/** 施設の情報パネルに並べるミッション */
export function missionsForFacility(type: FacilityType, level: number, missions: readonly Mission[] = MISSIONS): Mission[] {
  const own = new Set<string>(domainsOfFacility(type).map((d) => d.id));
  if (own.size === 0) return [];
  const related = missions.filter((m) => m.domains.some((d) => own.has(d)));
  const first = related.filter((m) => own.has(m.domains[0] ?? ''));
  const rest = related.filter((m) => !own.has(m.domains[0] ?? ''));
  return [...first, ...rest].slice(0, Math.max(0, level));
}

/** 施設の分野を含むミッションの全部の数（パネルに「Lv が上がると増える」と添えるため） */
export function missionCountForFacility(type: FacilityType, missions: readonly Mission[] = MISSIONS): number {
  return missionsForFacility(type, Number.POSITIVE_INFINITY, missions).length;
}

/** 挑戦中のミッション（おすすめの欄に出す） */
export function activeMissions(progress: Progress, missions: readonly Mission[] = MISSIONS): Mission[] {
  return missions.filter((m) => missionStatus(progress, m.id) === 'in-progress');
}

/** 受け取った記念碑（達成した順） */
export function earnedLandmarks(progress: Progress, missions: readonly Mission[] = MISSIONS): string[] {
  return missions
    .filter((m) => missionStatus(progress, m.id) === 'completed' && m.rewards.landmark !== undefined)
    .sort((a, b) => (progress.missions[a.id]?.completedAt ?? '').localeCompare(progress.missions[b.id]?.completedAt ?? ''))
    .map((m) => m.rewards.landmark as string);
}

/** 受け取ったが、まだ都市に置いていない記念碑（取り壊すと、また置ける） */
export function unplacedLandmarks(progress: Progress, facilities: readonly Facility[], missions: readonly Mission[] = MISSIONS): string[] {
  const placed = new Set(facilities.filter((f) => f.type === 'monument' && f.landmark).map((f) => f.landmark));
  return earnedLandmarks(progress, missions).filter((l) => !placed.has(l));
}
