import type { LessonDefinition } from '../types';
import { gitBranching, gitConflictDrill, gitFirstCommit } from './git';
import { ghPullRequest } from './github';
import { k8sFirstPod, k8sServiceBoss } from './k8s';
import { diskFullBoss, shellWarmup } from './kernel';
import { netFirstHop, netUnreachableBoss } from './net';

/**
 * 遊べる任務の一覧。
 * 目次（src/content）の status は、ここに載っている id から刻まれる。
 */
export const missions: readonly LessonDefinition[] = [
  shellWarmup,
  gitFirstCommit,
  gitBranching,
  gitConflictDrill,
  k8sFirstPod,
  k8sServiceBoss,
  netFirstHop,
  netUnreachableBoss,
  ghPullRequest,
  diskFullBoss,
];

export { gitBranching, gitConflictDrill, gitFirstCommit } from './git';
export { ghPullRequest } from './github';
export { k8sFirstPod, k8sServiceBoss } from './k8s';
export { diskFullBoss, shellWarmup } from './kernel';
export { netFirstHop, netUnreachableBoss } from './net';

export function findMission(id: string): LessonDefinition | undefined {
  return missions.find((m) => m.id === id || m.id.endsWith(`/${id}`));
}
