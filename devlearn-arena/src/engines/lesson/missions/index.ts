import type { LessonDefinition } from '../types';
import { gitBranching, gitConflictDrill, gitFirstCommit } from './git';
import {
  gitAmend, gitDivergedBoss, gitFindRegression, gitInteractiveRebase, gitParallelWork,
  gitRecovery, gitRelease, gitRepoSize, gitSubmodule, gitThreeTrees,
} from './git2';
import { ghPullRequest } from './github';
import {
  ghActionsPractice, ghClone, ghCodeowners, ghForkFlow, ghIssuePlanning, ghMatrix, ghNeedsDag,
  ghPrCreate, ghReusable,
} from './github2';
import { k8sFirstPod, k8sServiceBoss } from './k8s';
import {
  k8sApply, k8sConfig, k8sCrashLoop, k8sDrain, k8sHpa, k8sJobs, k8sNoLimits, k8sPvcPending,
  k8sRbacDenied, k8sStatefulSet, k8sStuckPending, k8sUnschedulable,
} from './k8s2';
import { diskFullBoss, shellWarmup } from './kernel';
import { netFirstHop, netUnreachableBoss } from './net';
import {
  netArp, netDhcp, netDns, netDropVsReject, netHealthCheck, netIpv6, netLayers, netNat,
  netSubnetting, netSwitching, netTcp, netTls, netVpcDesign,
} from './net2';

/**
 * 遊べる任務の一覧。
 * 目次（src/content）の status は、ここに載っている id から刻まれる。
 */
export const missions: readonly LessonDefinition[] = [
  shellWarmup,
  gitFirstCommit,
  gitRelease,
  gitThreeTrees,
  gitAmend,
  gitBranching,
  gitConflictDrill,
  gitInteractiveRebase,
  gitRecovery,
  gitParallelWork,
  gitSubmodule,
  gitDivergedBoss,
  gitFindRegression,
  gitRepoSize,
  k8sFirstPod,
  k8sStuckPending,
  k8sApply,
  k8sJobs,
  k8sStatefulSet,
  k8sConfig,
  k8sPvcPending,
  k8sServiceBoss,
  k8sUnschedulable,
  k8sCrashLoop,
  k8sRbacDenied,
  k8sHpa,
  k8sDrain,
  k8sNoLimits,
  netLayers,
  netArp,
  netSwitching,
  netSubnetting,
  netIpv6,
  netFirstHop,
  netNat,
  netTcp,
  netDns,
  netDhcp,
  netTls,
  netHealthCheck,
  netDropVsReject,
  netVpcDesign,
  netUnreachableBoss,
  ghClone,
  ghPrCreate,
  ghCodeowners,
  ghPullRequest,
  ghIssuePlanning,
  ghNeedsDag,
  ghMatrix,
  ghActionsPractice,
  ghReusable,
  ghForkFlow,
  diskFullBoss,
];

export { gitBranching, gitConflictDrill, gitFirstCommit } from './git';
export {
  gitAmend, gitDivergedBoss, gitFindRegression, gitInteractiveRebase, gitParallelWork,
  gitRecovery, gitRelease, gitRepoSize, gitSubmodule, gitThreeTrees,
} from './git2';
export { ghPullRequest } from './github';
export {
  ghActionsPractice, ghClone, ghCodeowners, ghForkFlow, ghIssuePlanning, ghMatrix, ghNeedsDag,
  ghPrCreate, ghReusable,
} from './github2';
export { k8sFirstPod, k8sServiceBoss } from './k8s';
export {
  k8sApply, k8sConfig, k8sCrashLoop, k8sDrain, k8sHpa, k8sJobs, k8sNoLimits, k8sPvcPending,
  k8sRbacDenied, k8sStatefulSet, k8sStuckPending, k8sUnschedulable,
} from './k8s2';
export { diskFullBoss, shellWarmup } from './kernel';
export { netFirstHop, netUnreachableBoss } from './net';
export {
  netArp, netDhcp, netDns, netDropVsReject, netHealthCheck, netIpv6, netLayers, netNat,
  netSubnetting, netSwitching, netTcp, netTls, netVpcDesign,
} from './net2';

export function findMission(id: string): LessonDefinition | undefined {
  return missions.find((m) => m.id === id || m.id.endsWith(`/${id}`));
}
