import { missions } from './missions';
import type { LessonDefinition, MissionTrack } from './types';

export const TRACK_LABEL: Record<MissionTrack, string> = {
  kernel: '序章の島',
  git: 'Git',
  k8s: 'Kubernetes',
  net: 'Network',
  github: 'GitHub',
};

export function missionsOf(track: MissionTrack): LessonDefinition[] {
  return missions.filter((m) => m.track === track);
}

export function playableTracks(): MissionTrack[] {
  return [...new Set(missions.map((m) => m.track))];
}

export function findMissionById(id: string): LessonDefinition | undefined {
  return missions.find((m) => m.id === id);
}

/** クリア済みの集合から、次に挑むべき任務を選ぶ */
export function nextMission(
  cleared: ReadonlySet<string>,
  currentId?: string,
): LessonDefinition | null {
  return missions.find((m) => m.id !== currentId && !cleared.has(m.id)) ?? null;
}

export function progressOf(cleared: ReadonlySet<string>, track: MissionTrack): {
  done: number;
  total: number;
} {
  const list = missionsOf(track);
  return { done: list.filter((m) => cleared.has(m.id)).length, total: list.length };
}
