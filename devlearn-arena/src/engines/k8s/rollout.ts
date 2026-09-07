import { templateHash } from './controllers';
import { isReady } from './kubelet';
import type { ClusterState, Deployment, ReplicaSet } from './types';
import { key } from './types';

export const REVISION_KEY = 'deployment.kubernetes.io/revision';
export const CHANGE_CAUSE_KEY = 'kubernetes.io/change-cause';

export interface Revision {
  revision: number;
  replicaSet: ReplicaSet;
  changeCause: string;
  /** その世代のイメージ（読みやすさのため先頭のものを出す） */
  image: string;
}

/**
 * Deployment の世代。
 *
 * 本物と同じく ReplicaSet が世代の実体で、注釈に付いた revision 番号が順番を持つ。
 * 履歴を別に持たず、残っている ReplicaSet から導く。
 */
export function revisionsOf(state: ClusterState, deployment: Deployment): Revision[] {
  return [...state.replicaSets.values()]
    .filter(
      (rs) =>
        rs.metadata.namespace === deployment.metadata.namespace &&
        rs.metadata.ownerReferences.some(
          (o) => o.kind === 'Deployment' && o.name === deployment.metadata.name,
        ),
    )
    .map((rs) => ({
      revision: Number(rs.metadata.annotations[REVISION_KEY] ?? '0'),
      replicaSet: rs,
      changeCause: rs.metadata.annotations[CHANGE_CAUSE_KEY] ?? '<none>',
      image: rs.spec.template.containers[0]?.image ?? '',
    }))
    .sort((a, b) => a.revision - b.revision);
}

export interface RolloutStatus {
  done: boolean;
  message: string;
}

/**
 * rollout status。更新済みかつ Ready な数が揃うまでを待つ。
 * 数は status に溜めた値ではなく、いまの Pod から数える（変更直後でも正しく見える）。
 */
export function rolloutStatus(state: ClusterState, deployment: Deployment): RolloutStatus {
  const { replicas } = deployment.spec;
  const hash = templateHash(deployment.spec.template);
  const current = [...state.pods.values()].filter(
    (p) =>
      p.metadata.namespace === deployment.metadata.namespace &&
      p.metadata.labels['pod-template-hash'] === hash,
  );
  const updatedReplicas = current.length;
  const readyReplicas = current.filter(isReady).length;
  if (updatedReplicas < replicas) {
    return {
      done: false,
      message: `Waiting for deployment "${deployment.metadata.name}" rollout to finish: ${String(updatedReplicas)} out of ${String(replicas)} new replicas have been updated...`,
    };
  }
  if (readyReplicas < replicas) {
    return {
      done: false,
      message: `Waiting for deployment "${deployment.metadata.name}" rollout to finish: ${String(readyReplicas)} of ${String(replicas)} updated replicas are available...`,
    };
  }
  return { done: true, message: `deployment "${deployment.metadata.name}" successfully rolled out` };
}

export interface UndoResult {
  deployments: Map<string, Deployment>;
  error?: string;
  message: string;
}

/**
 * rollout undo。指定の世代（省略時は1つ前）のテンプレートに戻す。
 * 新しいコミットを積むのと同じで、履歴を消さずに前の内容で「進む」。
 */
export function rolloutUndo(
  state: ClusterState,
  deployment: Deployment,
  toRevision: number | null,
): UndoResult {
  const revisions = revisionsOf(state, deployment);
  const currentHash = templateHash(deployment.spec.template);
  const current = revisions.find((r) => r.replicaSet.metadata.labels['pod-template-hash'] === currentHash);

  const target =
    toRevision === null
      ? [...revisions].reverse().find((r) => r.revision !== (current?.revision ?? -1))
      : revisions.find((r) => r.revision === toRevision);

  if (target === undefined) {
    return {
      deployments: new Map(state.deployments),
      error:
        toRevision === null
          ? `error: no rollout history found for deployment "${deployment.metadata.name}"`
          : `error: unable to find specified revision ${String(toRevision)} in history`,
      message: '',
    };
  }

  const deployments = new Map(state.deployments);
  deployments.set(key(deployment.metadata.namespace, deployment.metadata.name), {
    ...deployment,
    spec: { ...deployment.spec, template: target.replicaSet.spec.template },
    metadata: {
      ...deployment.metadata,
      resourceVersion: deployment.metadata.resourceVersion + 1,
      annotations: {
        ...deployment.metadata.annotations,
        [CHANGE_CAUSE_KEY]: `rollback to revision ${String(target.revision)}`,
      },
    },
  });
  return {
    deployments,
    message: `deployment.apps/${deployment.metadata.name} rolled back`,
  };
}
