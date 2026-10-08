import { realNames, templateHash } from './controllers';
import { isReady } from './kubelet';
import type { ClusterState, Deployment, Pod, ReplicaSet } from './types';
import { key } from './types';

export const REVISION_KEY = 'deployment.kubernetes.io/revision';
export const CHANGE_CAUSE_KEY = 'kubernetes.io/change-cause';
/** 使い直した ReplicaSet が前に持っていた世代の番号（本物の注釈） */
export const REVISION_HISTORY_KEY = 'deployment.kubernetes.io/revision-history';

/** 入れ替えの期限（本物の progressDeadlineSeconds の既定。秒 = tick） */
export const PROGRESS_DEADLINE = 600;

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
  /** 期限を過ぎた（本物の Progressing の条件が ProgressDeadlineExceeded） */
  failed: boolean;
  message: string;
}

/** その Deployment の今の設計図の Pod と、全ての Pod（持ち主の ReplicaSet をたどる） */
function podsOf(state: ClusterState, deployment: Deployment): { all: Pod[]; current: Pod[] } {
  const hash = templateHash(deployment.spec.template, realNames(state));
  const sets = new Set(revisionsOf(state, deployment).map((r) => r.replicaSet.metadata.name));
  const all = [...state.pods.values()].filter(
    (p) => p.metadata.namespace === deployment.metadata.namespace && p.metadata.ownerReferences.some((o) => o.kind === 'ReplicaSet' && sets.has(o.name)),
  );
  return { all, current: all.filter((p) => p.metadata.labels['pod-template-hash'] === hash) };
}

/** 入れ替えが終わったか（本物の DeploymentComplete: 今の設計図の Pod があるべき数だけ Ready で、古い Pod が無い） */
export function rolloutComplete(state: ClusterState, deployment: Deployment): boolean {
  const { all, current } = podsOf(state, deployment);
  const { replicas } = deployment.spec;
  return current.length === replicas && all.length === replicas && current.filter(isReady).length === replicas;
}

/** 入れ替えが期限（最後に進んでから 600 秒）を過ぎたか */
export function deadlineExceeded(state: ClusterState, deployment: Deployment): boolean {
  const progress = deployment.status.progress;
  return progress !== undefined && !rolloutComplete(state, deployment) && state.tick - progress.tick > PROGRESS_DEADLINE;
}

/**
 * rollout status。本物と同じ順で確かめる: 期限を過ぎた → 新しい世代の数が足りない → 古い Pod が残っている → 新しい Pod が Ready でない → 終わり。
 * 数は status に溜めた値ではなく、いまの Pod から数える（変更直後でも正しく見える）。
 */
export function rolloutStatus(state: ClusterState, deployment: Deployment): RolloutStatus {
  const { replicas } = deployment.spec;
  const name = deployment.metadata.name;
  const { all, current } = podsOf(state, deployment);
  const updated = current.length;
  const available = current.filter(isReady).length;
  const waiting = (message: string): RolloutStatus => ({ done: false, failed: false, message: `Waiting for deployment "${name}" rollout to finish: ${message}` });
  if (deadlineExceeded(state, deployment)) return { done: false, failed: true, message: `deployment "${name}" exceeded its progress deadline` };
  if (updated < replicas) return waiting(`${String(updated)} out of ${String(replicas)} new replicas have been updated...`);
  if (all.length > updated) return waiting(`${String(all.length - updated)} old replicas are pending termination...`);
  if (available < updated) return waiting(`${String(available)} of ${String(updated)} updated replicas are available...`);
  return { done: true, failed: false, message: `deployment "${name}" successfully rolled out` };
}

export interface UndoResult {
  deployments: Map<string, Deployment>;
  error?: string;
  message: string;
}

/**
 * rollout undo。本物の kubectl と同じく、指定の世代（省略時は 2 番目に新しい世代）の ReplicaSet の設計図を Deployment に書き戻す。
 * 履歴を消さずに前の内容で「進む」（その ReplicaSet が使い直され、番号が最大 + 1 になる）。今の設計図と同じなら何もしない（skipped rollback）
 */
export function rolloutUndo(
  state: ClusterState,
  deployment: Deployment,
  toRevision: number | null,
): UndoResult {
  const revisions = revisionsOf(state, deployment);
  const name = deployment.metadata.name;
  const target = toRevision === null
    ? (revisions.length <= 1 ? undefined : revisions[revisions.length - 2])
    : revisions.find((r) => r.revision === toRevision);

  if (target === undefined) {
    return {
      deployments: new Map(state.deployments),
      error:
        toRevision === null
          ? `error: no rollout history found for deployment "${name}"`
          : `error: unable to find specified revision ${String(toRevision)} in history`,
      message: '',
    };
  }

  // 設計図の札から、世代の印（pod-template-hash）を外す
  const labels = Object.fromEntries(Object.entries(target.replicaSet.spec.template.labels).filter(([k]) => k !== 'pod-template-hash'));
  const template = { ...target.replicaSet.spec.template, labels };
  const real = realNames(state);
  if (templateHash(template, real) === templateHash(deployment.spec.template, real)) {
    return {
      deployments: new Map(state.deployments),
      message: `deployment.apps/${name} skipped rollback (current template already matches revision ${String(target.revision)})`,
    };
  }
  // 本物と同じく、ReplicaSet の注釈（change-cause など）を Deployment に写す。世代の番号の注釈は写さない
  const copied = Object.fromEntries(Object.entries(target.replicaSet.metadata.annotations).filter(([k]) => k !== REVISION_KEY && k !== REVISION_HISTORY_KEY));
  const deployments = new Map(state.deployments);
  deployments.set(key(deployment.metadata.namespace, name), {
    ...deployment,
    spec: { ...deployment.spec, template },
    metadata: {
      ...deployment.metadata,
      resourceVersion: deployment.metadata.resourceVersion + 1,
      annotations: { ...deployment.metadata.annotations, ...copied },
    },
  });
  return { deployments, message: `deployment.apps/${name} rolled back` };
}
