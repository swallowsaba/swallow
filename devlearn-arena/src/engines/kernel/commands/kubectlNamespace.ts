import type { ClusterState } from '@/engines/k8s/types';
import type { CommandResult } from '../registry';
import { age, table, type KubectlHandler } from './kubectlShared';

/**
 * Namespace（区画）。本物の形の名前を使うクラスタ（クラスタを操作する機械）だけが区画の一覧を持ち、
 * 無い区画には作れない。一覧を持たないクラスタ（以前の模擬）は、どの区画名でもそのまま使える。
 */

/** 本物のクラスタに初めから在る区画 */
export const BUILTIN_NAMESPACES = ['default', 'kube-node-lease', 'kube-public', 'kube-system'] as const;

/** 区画の一覧を持つクラスタで、その区画が無いか */
export function missingNamespace(cluster: ClusterState, namespace: string): boolean {
  return cluster.namespaces !== undefined && !cluster.namespaces.some((n) => n.name === namespace);
}

export const createNamespace: KubectlHandler = ({ cluster, operands }) => {
  const name = operands[1];
  if (name === undefined) return { stderr: 'error: exactly one NAME is required, got 0\n', code: 1 };
  if (!/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(name)) {
    return { stderr: `The Namespace "${name}" is invalid: metadata.name: Invalid value: "${name}": a lowercase RFC 1123 label must consist of lower case alphanumeric characters or '-'\n`, code: 1 };
  }
  const list = cluster.namespaces ?? [];
  if (list.some((n) => n.name === name)) return { stderr: `Error from server (AlreadyExists): namespaces "${name}" already exists\n`, code: 1 };
  return { stdout: `namespace/${name} created\n`, patch: { cluster: { ...cluster, namespaces: [...list, { name, createdAt: cluster.tick }] } } };
};

/** kubectl get namespaces（NAME・STATUS・AGE） */
export function getNamespaces(cluster: ClusterState, name: string | undefined): CommandResult {
  const list = [...(cluster.namespaces ?? BUILTIN_NAMESPACES.map((n) => ({ name: n, createdAt: 0 })))].sort((a, b) => (a.name < b.name ? -1 : 1));
  const shown = name === undefined ? list : list.filter((n) => n.name === name);
  if (name !== undefined && shown.length === 0) return { stderr: `Error from server (NotFound): namespaces "${name}" not found\n`, code: 1 };
  return { stdout: table([['NAME', 'STATUS', 'AGE'], ...shown.map((n) => [n.name, 'Active', age(cluster.tick, n.createdAt)])]) };
}

/** 区画を消す。中の物も全て消える（本物と同じ） */
export function deleteNamespace(cluster: ClusterState, name: string): CommandResult {
  if (missingNamespace(cluster, name) || cluster.namespaces === undefined) return { stderr: `Error from server (NotFound): namespaces "${name}" not found\n`, code: 1 };
  if ((BUILTIN_NAMESPACES as readonly string[]).includes(name)) {
    return { stderr: `Error from server (Forbidden): namespaces "${name}" is forbidden: this namespace may not be deleted\n`, code: 1 };
  }
  const out: Record<string, unknown> = { ...cluster, namespaces: cluster.namespaces.filter((n) => n.name !== name) };
  for (const [k, v] of Object.entries(cluster)) {
    if (!(v instanceof Map)) continue;
    out[k] = new Map([...(v as Map<string, { metadata?: { namespace?: string } }>)].filter(([, r]) => r.metadata?.namespace !== name));
  }
  return { stdout: `namespace "${name}" deleted\n`, patch: { cluster: out as unknown as ClusterState } };
}
