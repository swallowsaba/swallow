import type { ClusterState, Node } from '@/engines/k8s/types';
import type { CommandResult } from '../registry';
import { fromLines } from './args';
import { notFound, type KubectlHandler } from './kubectlShared';

/** `key=value:Effect` / `key:Effect` / `key=value:Effect-` / `key-` を読む */
export interface TaintSpec {
  key: string;
  value: string;
  effect: string;
  remove: boolean;
}

export function parseTaint(raw: string): TaintSpec | null {
  const remove = raw.endsWith('-');
  const body = remove ? raw.slice(0, -1) : raw;
  const [left, effect = ''] = body.split(':');
  if (left === undefined || left === '') return null;
  const eq = left.indexOf('=');
  const key = eq === -1 ? left : left.slice(0, eq);
  const value = eq === -1 ? '' : left.slice(eq + 1);
  if (key === '') return null;
  // 削除のときだけ effect を省ける
  if (!remove && effect === '') return null;
  return { key, value, effect, remove };
}

function applyTaint(node: Node, spec: TaintSpec): { node: Node; changed: boolean } {
  const taints = node.spec.taints;
  if (spec.remove) {
    const kept = taints.filter(
      (t) => !(t.key === spec.key && (spec.effect === '' || t.effect === spec.effect)),
    );
    if (kept.length === taints.length) return { node, changed: false };
    return { node: { ...node, spec: { ...node.spec, taints: kept } }, changed: true };
  }
  if (taints.some((t) => t.key === spec.key && t.effect === spec.effect && t.value === spec.value)) {
    return { node, changed: false };
  }
  const kept = taints.filter((t) => !(t.key === spec.key && t.effect === spec.effect));
  return {
    node: {
      ...node,
      spec: { ...node.spec, taints: [...kept, { key: spec.key, value: spec.value, effect: spec.effect }] },
    },
    changed: true,
  };
}

function targets(cluster: ClusterState, names: readonly string[], all: boolean): Node[] | string {
  if (all) return [...cluster.nodes.values()];
  const found: Node[] = [];
  for (const name of names) {
    const node = cluster.nodes.get(name);
    if (!node) return name;
    found.push(node);
  }
  return found;
}

/**
 * ノードに taint を付け外しする。
 * kubeadm init 直後にコントロールプレーンへ付く NoSchedule を剥がす操作は、
 * 1台構成のクラスタを動かすうえで必ず通る道になる。
 */
export const taint: KubectlHandler = ({ cluster, operands, flags }): CommandResult => {
  if (operands[0] !== 'nodes' && operands[0] !== 'node' && operands[0] !== 'no') {
    return { stderr: 'usage: kubectl taint nodes <name|--all> key=value:Effect\n', code: 1 };
  }
  const all = flags.has('all');
  const rest = operands.slice(1);
  const specs: TaintSpec[] = [];
  const names: string[] = [];
  for (const token of rest) {
    const spec = parseTaint(token);
    if (spec === null) names.push(token);
    else specs.push(spec);
  }
  if (specs.length === 0) {
    return { stderr: 'error: at least one taint update is required\n', code: 1 };
  }
  const picked = targets(cluster, names, all);
  if (typeof picked === 'string') return notFound('nodes', picked);
  if (picked.length === 0) {
    return { stderr: 'error: 対象のノードを指定してください\n', code: 1 };
  }

  const nodes = new Map(cluster.nodes);
  const lines: string[] = [];
  for (const node of picked) {
    let current = node;
    let touched = false;
    for (const spec of specs) {
      const next = applyTaint(current, spec);
      current = next.node;
      touched = touched || next.changed;
    }
    if (!touched) {
      // 本物も「無いものは消せない」と言う
      const missing = specs.find((s) => s.remove);
      if (missing) {
        return {
          stderr: `error: taint "${missing.key}" not found\n`,
          code: 1,
        };
      }
      continue;
    }
    nodes.set(node.metadata.name, current);
    lines.push(`node/${node.metadata.name} ${specs.some((s) => s.remove) ? 'untainted' : 'tainted'}`);
  }
  return { stdout: fromLines(lines), patch: { cluster: { ...cluster, nodes } } };
};

/** ノードの kubelet を止める / 戻す。障害の再現に使う（実物の kubectl には無い） */
export const nodeCtl: KubectlHandler = ({ cluster, operands, sub }): CommandResult => {
  const name = operands[0];
  const node = name === undefined ? undefined : cluster.nodes.get(name);
  if (node === undefined || name === undefined) return notFound('nodes', name ?? '');
  const healthy = sub === 'node-up';
  const nodes = new Map(cluster.nodes);
  nodes.set(name, { ...node, status: { ...node.status, kubeletHealthy: healthy } });
  return {
    stdout: `node/${name} kubelet ${healthy ? 'started' : 'stopped'}\n`,
    patch: { cluster: { ...cluster, nodes } },
  };
};
