import type { LessonDefinition } from '../types';
import { finalizeLesson } from '../authoring/solution';
import { gitBranching, gitConflictDrill, gitFirstCommit } from './git';
import { gitAmend, gitInteractiveRebase, gitRecovery, gitThreeTrees } from './git2';
import {
  gitDivergedBoss, gitFindRegression, gitParallelWork, gitRelease, gitRepoSize, gitSubmodule,
} from './git3';
import { ghPullRequest } from './github';
import { ghClone, ghCodeowners, ghIssuePlanning, ghNeedsDag, ghPrCreate } from './github2';
import {
  ghActionsPractice, ghForkFlow, ghMatrix, ghRelease, ghReusable,
} from './github3';
import { k8sFirstPod, k8sServiceBoss } from './k8s';
import { k8sFirstYaml } from './k8sFirst';
import {
  k8sApply, k8sConfig, k8sJobs, k8sPvcPending, k8sStatefulSet, k8sStuckPending, k8sUnschedulable,
} from './k8s2';
import { k8sCrashLoop, k8sDrain, k8sHpa, k8sNoLimits, k8sRbacDenied } from './k8s3';
import { diskFullBoss, shellWarmup } from './kernel';
import { netFirstHop, netUnreachableBoss } from './net';
import {
  netArp, netDhcp, netDns, netIpv6, netLayers, netNat, netSubnetting, netSwitching, netTcp,
} from './net2';
import { netDropVsReject, netHealthCheck, netTls, netVpcDesign } from './net3';

/**
 * 遊べる任務の一覧。
 * 目次（src/content）の status は、ここに載っている id から刻まれる。
 * 最後のヒントは、どの手順でも模範解答（そのまま打てば通るコマンド）にそろえる。
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
  k8sFirstYaml,
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
  ghRelease,
  ghForkFlow,
  diskFullBoss,
].map(finalizeLesson);

export { gitBranching, gitConflictDrill, gitFirstCommit } from './git';
export { gitAmend, gitInteractiveRebase, gitRecovery, gitThreeTrees } from './git2';
export {
  gitDivergedBoss, gitFindRegression, gitParallelWork, gitRelease, gitRepoSize, gitSubmodule,
} from './git3';
export { ghPullRequest } from './github';
export { ghClone, ghCodeowners, ghIssuePlanning, ghNeedsDag, ghPrCreate } from './github2';
export { ghActionsPractice, ghForkFlow, ghMatrix, ghRelease, ghReusable } from './github3';
export { k8sFirstPod, k8sServiceBoss } from './k8s';
export { k8sFirstYaml } from './k8sFirst';
export {
  k8sApply, k8sConfig, k8sJobs, k8sPvcPending, k8sStatefulSet, k8sStuckPending, k8sUnschedulable,
} from './k8s2';
export { k8sCrashLoop, k8sDrain, k8sHpa, k8sNoLimits, k8sRbacDenied } from './k8s3';
export { diskFullBoss, shellWarmup } from './kernel';
export { netFirstHop, netUnreachableBoss } from './net';
export {
  netArp, netDhcp, netDns, netIpv6, netLayers, netNat, netSubnetting, netSwitching, netTcp,
} from './net2';
export { netDropVsReject, netHealthCheck, netTls, netVpcDesign } from './net3';

export function findMission(id: string): LessonDefinition | undefined {
  return missions.find((m) => m.id === id || m.id.endsWith(`/${id}`));
}
