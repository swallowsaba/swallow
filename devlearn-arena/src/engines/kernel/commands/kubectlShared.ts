import type { ClusterState, Pod, Resource } from '@/engines/k8s/types';
import { key } from '@/engines/k8s/types';
import type { CommandResult, ShellState } from '../registry';
import { fromLines } from './args';

export const NO_CLUSTER =
  'The connection to the server localhost:8080 was refused - did you specify the right host or port?\n';

/** 短縮名 → 正式な複数形 */
export const KINDS: Record<string, string> = {
  po: 'pods', pod: 'pods', pods: 'pods',
  no: 'nodes', node: 'nodes', nodes: 'nodes',
  machine: 'machines', machines: 'machines',
  deploy: 'deployments', deployment: 'deployments', deployments: 'deployments',
  rs: 'replicasets', replicaset: 'replicasets', replicasets: 'replicasets',
  svc: 'services', service: 'services', services: 'services',
  ev: 'events', event: 'events', events: 'events',
  cm: 'configmaps', configmap: 'configmaps', configmaps: 'configmaps',
  secret: 'secrets', secrets: 'secrets',
  sts: 'statefulsets', statefulset: 'statefulsets', statefulsets: 'statefulsets',
  ds: 'daemonsets', daemonset: 'daemonsets', daemonsets: 'daemonsets',
  job: 'jobs', jobs: 'jobs',
  cj: 'cronjobs', cronjob: 'cronjobs', cronjobs: 'cronjobs',
  pv: 'persistentvolumes', persistentvolume: 'persistentvolumes', persistentvolumes: 'persistentvolumes',
  pvc: 'persistentvolumeclaims', persistentvolumeclaim: 'persistentvolumeclaims',
  persistentvolumeclaims: 'persistentvolumeclaims',
  sc: 'storageclasses', storageclass: 'storageclasses', storageclasses: 'storageclasses',
  ing: 'ingresses', ingress: 'ingresses', ingresses: 'ingresses',
  netpol: 'networkpolicies', networkpolicy: 'networkpolicies', networkpolicies: 'networkpolicies',
  sa: 'serviceaccounts', serviceaccount: 'serviceaccounts', serviceaccounts: 'serviceaccounts',
  role: 'roles', roles: 'roles',
  rolebinding: 'rolebindings', rolebindings: 'rolebindings',
  hpa: 'horizontalpodautoscalers', horizontalpodautoscaler: 'horizontalpodautoscalers',
  horizontalpodautoscalers: 'horizontalpodautoscalers',
};

export interface KubectlContext {
  cluster: ClusterState;
  shell: ShellState;
  sub: string;
  rest: readonly string[];
  namespace: string;
  output: string;
  flags: ReadonlySet<string>;
  values: ReadonlyMap<string, string>;
  operands: readonly string[];
}

export type KubectlHandler = (ctx: KubectlContext) => CommandResult;

export function age(tick: number, createdAt: number): string {
  const seconds = Math.max(0, tick - createdAt);
  if (seconds < 60) return `${String(seconds)}s`;
  return `${String(Math.floor(seconds / 60))}m`;
}

export function table(rows: string[][]): string {
  if (rows.length === 0) return '';
  const widths = (rows[0] ?? []).map((_, i) => Math.max(...rows.map((r) => (r[i] ?? '').length)));
  return fromLines(
    rows.map((row) => row.map((cell, i) => cell.padEnd(widths[i] ?? 0)).join('   ').trimEnd()),
  );
}

export function podReady(pod: Pod): string {
  const ready = pod.status.containerStatuses.filter((c) => c.ready).length;
  return `${String(ready)}/${String(pod.status.containerStatuses.length)}`;
}

export function podStatus(pod: Pod): string {
  const waiting = pod.status.containerStatuses.find((c) => c.waitingReason !== null);
  if (waiting?.waitingReason != null) return waiting.waitingReason;
  return pod.status.phase;
}

export function restarts(pod: Pod): number {
  return pod.status.containerStatuses.reduce((n, c) => n + c.restartCount, 0);
}

export function notFound(kind: string, name: string): CommandResult {
  return { stderr: `Error from server (NotFound): ${kind} "${name}" not found\n`, code: 1 };
}

/** 名前空間つきの資源を、種別名から引く */
export function collectionOf(cluster: ClusterState, kind: string): ReadonlyMap<string, Resource> | null {
  switch (kind) {
    case 'pods': return cluster.pods;
    case 'nodes': return cluster.nodes;
    case 'deployments': return cluster.deployments;
    case 'replicasets': return cluster.replicaSets;
    case 'services': return cluster.services;
    case 'configmaps': return cluster.configMaps;
    case 'secrets': return cluster.secrets;
    case 'statefulsets': return cluster.statefulSets;
    case 'daemonsets': return cluster.daemonSets;
    case 'jobs': return cluster.jobs;
    case 'cronjobs': return cluster.cronJobs;
    case 'persistentvolumes': return cluster.persistentVolumes;
    case 'persistentvolumeclaims': return cluster.persistentVolumeClaims;
    case 'storageclasses': return cluster.storageClasses;
    case 'ingresses': return cluster.ingresses;
    case 'networkpolicies': return cluster.networkPolicies;
    case 'serviceaccounts': return cluster.serviceAccounts;
    case 'roles': return cluster.roles;
    case 'rolebindings': return cluster.roleBindings;
    case 'horizontalpodautoscalers': return cluster.autoscalers;
    default: return null;
  }
}

/** 種別ごとの、その資源が入っている ClusterState のフィールド名 */
export const FIELD_OF: Record<string, keyof ClusterState> = {
  pods: 'pods',
  nodes: 'nodes',
  deployments: 'deployments',
  replicasets: 'replicaSets',
  services: 'services',
  configmaps: 'configMaps',
  secrets: 'secrets',
  statefulsets: 'statefulSets',
  daemonsets: 'daemonSets',
  jobs: 'jobs',
  cronjobs: 'cronJobs',
  persistentvolumes: 'persistentVolumes',
  persistentvolumeclaims: 'persistentVolumeClaims',
  storageclasses: 'storageClasses',
  ingresses: 'ingresses',
  networkpolicies: 'networkPolicies',
  serviceaccounts: 'serviceAccounts',
  roles: 'roles',
  rolebindings: 'roleBindings',
  horizontalpodautoscalers: 'autoscalers',
};

/** 名前空間を持たない資源（保存時の鍵が名前だけになる） */
export const CLUSTER_SCOPED = new Set([
  'nodes', 'persistentvolumes', 'storageclasses',
]);

export function idFor(kind: string, namespace: string, name: string): string {
  return CLUSTER_SCOPED.has(kind) ? name : key(namespace, name);
}

/** その種別の資源のうち、名前空間に属するものを名前順で返す */
export function listOf(cluster: ClusterState, kind: string, namespace: string): Resource[] {
  const collection = collectionOf(cluster, kind);
  if (collection === null) return [];
  return [...collection.values()]
    .filter((r) => CLUSTER_SCOPED.has(kind) || r.metadata.namespace === namespace)
    .sort((a, b) => (a.metadata.name < b.metadata.name ? -1 : 1));
}
