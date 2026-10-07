import { nodeCondition } from '@/engines/k8s/bootstrap';
import type { ClusterState, Node } from '@/engines/k8s/types';
import { age } from './kubectlShared';

/**
 * kubectl describe の、本物と同じ形の出力（種類ごと）。日時の欄（CreationTimestamp・LastHeartbeatTime など）は、
 * 練習の時計に日付が無いので出さない。経った時間は AGE と同じ形で出す
 */

/** Node の住所（制御の側は 10.0.0.10、node-N は 10.0.0.(10+N)） */
export function nodeAddress(node: Node): string {
  const n = /^node-(\d+)$/.exec(node.metadata.name);
  return `10.0.0.${String(10 + (n ? Number(n[1]) : 0))}`;
}

/** Node の中の、OS などの決まった情報（kubectl get nodes -o wide の右の欄と、describe の System Info） */
export const NODE_SYSTEM = { os: 'Ubuntu 24.04.1 LTS', kernel: '6.8.0-45-generic', runtime: 'containerd://1.7.22' } as const;

/** 見出しと値を、値の頭をそろえて並べる（本物の describe と同じく、一番長い見出しに合わせる） */
function fields(rows: readonly [string, string][], indent = ''): string[] {
  const width = Math.max(...rows.map(([k]) => k.length)) + 2;
  return rows.map(([k, v]) => `${indent}${`${k}:`.padEnd(width)}${v}`.trimEnd());
}

/** 表（欄の間は 3 字。見出しの下に - の線） */
function grid(head: readonly string[], rows: readonly (readonly string[])[], indent = '  '): string[] {
  const all = [head, head.map((h) => '-'.repeat(h.length)), ...rows];
  const widths = head.map((_, i) => Math.max(...all.map((r) => (r[i] ?? '').length)));
  return all.map((r) => `${indent}${r.map((c, i) => (i === r.length - 1 ? c : c.padEnd((widths[i] ?? 0) + 3))).join('')}`.trimEnd());
}

/** 値が複数行になる欄（Labels・Taints）。2 行目からは値の頭にそろえる */
function multi(label: string, values: readonly string[], width: number): string[] {
  const head = `${label}:`.padEnd(width);
  if (values.length === 0) return [`${head}<none>`];
  return values.map((v, i) => (i === 0 ? `${head}${v}` : `${' '.repeat(width)}${v}`));
}

export function describeNode(cluster: ClusterState, node: Node): string {
  const w = 20;
  const c = nodeCondition(cluster, node);
  const down = !node.status.kubeletHealthy;
  // kubelet が様子を知らせない Node は、本物と同じく全ての状態が Unknown になり、届かない印（unreachable）が付く
  const taints = [
    ...node.spec.taints.map((t) => `${t.key}${t.value === '' ? '' : `=${t.value}`}:${t.effect}`),
    ...(down ? ['node.kubernetes.io/unreachable:NoExecute', 'node.kubernetes.io/unreachable:NoSchedule'] : []),
  ];
  const conditions = down
    ? (['MemoryPressure', 'DiskPressure', 'PIDPressure', 'Ready'] as const).map((t) => [t, 'Unknown', 'NodeStatusUnknown', 'Kubelet stopped posting node status.'])
    : [
      ['MemoryPressure', 'False', 'KubeletHasSufficientMemory', 'kubelet has sufficient memory available'],
      ['DiskPressure', 'False', 'KubeletHasNoDiskPressure', 'kubelet has no disk pressure'],
      ['PIDPressure', 'False', 'KubeletHasSufficientPID', 'kubelet has sufficient PID available'],
      ['Ready', c.ready ? 'True' : 'False', c.reason, c.message],
    ];
  const pods = [...cluster.pods.values()].filter((p) => p.status.nodeName === node.metadata.name && p.status.phase !== 'Succeeded' && p.status.phase !== 'Failed');
  const { cpu, memory } = node.status.allocatable;
  const pct = (n: number, of: number): string => `${String(Math.round((n / of) * 100))}%`;
  const podRows = pods.map((p) => {
    const req = p.spec.containers.reduce((a, s) => ({ cpu: a.cpu + s.requests.cpu, memory: a.memory + s.requests.memory }), { cpu: 0, memory: 0 });
    const lim = p.spec.containers.reduce((a, s) => ({ cpu: a.cpu + (s.limits?.cpu ?? 0), memory: a.memory + (s.limits?.memory ?? 0) }), { cpu: 0, memory: 0 });
    return [
      p.metadata.namespace, p.metadata.name,
      `${String(req.cpu)}m (${pct(req.cpu, cpu)})`, lim.cpu === 0 ? '0 (0%)' : `${String(lim.cpu)}m (${pct(lim.cpu, cpu)})`,
      `${String(req.memory)}Mi (${pct(req.memory, memory)})`, lim.memory === 0 ? '0 (0%)' : `${String(lim.memory)}Mi (${pct(lim.memory, memory)})`,
      age(cluster.tick, p.metadata.createdAt),
    ];
  });
  const labels = Object.entries({ 'kubernetes.io/arch': 'amd64', 'kubernetes.io/os': 'linux', ...node.metadata.labels }).map(([k, v]) => `${k}=${v}`).sort();
  const lines = [
    ...multi('Name', [node.metadata.name], w),
    ...multi('Roles', [node.spec.role === 'control-plane' ? 'control-plane' : '<none>'], w),
    ...multi('Labels', labels, w),
    ...multi('Taints', taints, w),
    ...multi('Unschedulable', [String(node.spec.unschedulable)], w),
    'Conditions:',
    ...grid(['Type', 'Status', 'Reason', 'Message'], conditions),
    'Addresses:',
    ...fields([['InternalIP', nodeAddress(node)], ['Hostname', node.metadata.name]], '  '),
    'Capacity:',
    ...fields([['cpu', String(cpu / 1000)], ['memory', `${String(memory)}Mi`], ['pods', '110']], '  '),
    'System Info:',
    ...fields([['Kernel Version', NODE_SYSTEM.kernel], ['OS Image', NODE_SYSTEM.os], ['Container Runtime Version', NODE_SYSTEM.runtime], ['Kubelet Version', node.status.version]], '  '),
    `${'Non-terminated Pods:'.padEnd(w + 6)}(${String(pods.length)} in total)`,
    ...(pods.length > 0 ? grid(['Namespace', 'Name', 'CPU Requests', 'CPU Limits', 'Memory Requests', 'Memory Limits', 'Age'], podRows) : []),
    `${'Events:'.padEnd(w + 6)}<none>`,
  ];
  return `${lines.join('\n')}\n`;
}
