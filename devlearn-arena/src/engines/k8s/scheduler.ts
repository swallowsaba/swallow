import type { ClusterState, Node, Pod, ResourceQuantity } from './types';

/** そのノードに既に載っている Pod の要求量の合計 */
export function usedOn(state: ClusterState, nodeName: string): ResourceQuantity {
  let cpu = 0;
  let memory = 0;
  for (const pod of state.pods.values()) {
    if (pod.status.nodeName !== nodeName) continue;
    if (pod.status.phase === 'Succeeded' || pod.status.phase === 'Failed') continue;
    for (const c of pod.spec.containers) {
      cpu += c.requests.cpu;
      memory += c.requests.memory;
    }
  }
  return { cpu, memory };
}

export function requestOf(pod: Pod): ResourceQuantity {
  return pod.spec.containers.reduce(
    (sum, c) => ({ cpu: sum.cpu + c.requests.cpu, memory: sum.memory + c.requests.memory }),
    { cpu: 0, memory: 0 },
  );
}

export interface Fit {
  node: Node;
  /** 空き容量。大きいほど優先 */
  free: number;
}

export interface ScheduleResult {
  nodeName: string | null;
  reason: string | null;
}

/**
 * 配置先を決める。
 * 実際に requests と allocatable を比べ、入らなければ理由を返す。
 * 結果は決定論的（同点ならノード名の昇順）。
 */
export function schedule(state: ClusterState, pod: Pod): ScheduleResult {
  const request = requestOf(pod);
  const reasons: string[] = [];
  const fits: Fit[] = [];

  for (const node of [...state.nodes.values()].sort((a, b) =>
    a.metadata.name < b.metadata.name ? -1 : 1,
  )) {
    if (node.spec.unschedulable) {
      reasons.push(`node(s) were unschedulable`);
      continue;
    }
    if (!node.status.ready) {
      reasons.push('node(s) were not ready');
      continue;
    }

    const selectorOk = Object.entries(pod.spec.nodeSelector).every(
      ([k, v]) => node.metadata.labels[k] === v,
    );
    if (!selectorOk) {
      reasons.push("node(s) didn't match Pod's node affinity/selector");
      continue;
    }

    const blocking = node.spec.taints.filter(
      (taint) =>
        taint.effect === 'NoSchedule' &&
        !pod.spec.tolerations.some((t) => t.key === taint.key && t.effect === taint.effect),
    );
    if (blocking.length > 0) {
      reasons.push(`node(s) had untolerated taint {${blocking[0]?.key ?? ''}}`);
      continue;
    }

    const used = usedOn(state, node.metadata.name);
    const freeCpu = node.status.allocatable.cpu - used.cpu - request.cpu;
    const freeMemory = node.status.allocatable.memory - used.memory - request.memory;
    if (freeCpu < 0) {
      reasons.push('Insufficient cpu');
      continue;
    }
    if (freeMemory < 0) {
      reasons.push('Insufficient memory');
      continue;
    }
    fits.push({ node, free: freeCpu + freeMemory });
  }

  if (fits.length === 0) {
    const counted = new Map<string, number>();
    for (const reason of reasons) counted.set(reason, (counted.get(reason) ?? 0) + 1);
    const detail = [...counted.entries()]
      .map(([reason, n]) => `${String(n)} ${reason}`)
      .join(', ');
    return {
      nodeName: null,
      reason:
        state.nodes.size === 0
          ? 'no nodes available to schedule pods'
          : `0/${String(state.nodes.size)} nodes are available: ${detail}.`,
    };
  }

  // 空きが多い順、同点は名前順（決定論のため）
  fits.sort((a, b) =>
    b.free !== a.free ? b.free - a.free : a.node.metadata.name < b.node.metadata.name ? -1 : 1,
  );
  return { nodeName: fits[0]?.node.metadata.name ?? null, reason: null };
}
