import { missions } from './missions';
import { allMissions, missionById } from './registry';
import type { LessonDefinition, MissionTrack } from './types';

export const TRACK_LABEL: Record<MissionTrack, string> = {
  kernel: '序章の島',
  git: 'Git',
  k8s: 'Kubernetes',
  net: 'Network',
  github: 'GitHub',
};

const orderOf = (id: string): number => missionById(id)?.order ?? Number.MAX_SAFE_INTEGER;

/** その世界の「読んで手を動かす任務」。推奨順に並べる */
export function missionsOf(track: MissionTrack): LessonDefinition[] {
  return missions.filter((m) => m.track === track).sort((a, b) => orderOf(a.id) - orderOf(b.id));
}

export function playableTracks(): MissionTrack[] {
  return [...new Set(allMissions().map((m) => m.track))];
}

export function findMissionById(id: string): LessonDefinition | undefined {
  return missions.find((m) => m.id === id);
}

/** クリア済みの集合から、次に挑むべき任務を推奨順で選ぶ */
export function nextMission(
  cleared: ReadonlySet<string>,
  currentId?: string,
): LessonDefinition | null {
  return (
    [...missions]
      .sort((a, b) => orderOf(a.id) - orderOf(b.id))
      .find((m) => m.id !== currentId && !cleared.has(m.id)) ?? null
  );
}

export function progressOf(cleared: ReadonlySet<string>, track: MissionTrack): {
  done: number;
  total: number;
} {
  const list = missionsOf(track);
  return { done: list.filter((m) => cleared.has(m.id)).length, total: list.length };
}
