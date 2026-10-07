import { nodeCondition } from '@/engines/k8s/bootstrap';
import { isReady } from '@/engines/k8s/kubelet';
import { resolveEnv } from '@/engines/k8s/storage';
import type { ClusterState, ContainerSpec, ContainerStatus, Node, Pod, Probe } from '@/engines/k8s/types';
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
  const width = Math.max(...rows.map(([k]) => k.length)) + 3;
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

/** 知らせ（Event）を出した物。本物の describe の From の欄 */
function sourceOf(reason: string): string {
  return reason === 'Scheduled' || reason === 'FailedScheduling' ? 'default-scheduler' : 'kubelet';
}

/** describe の一番下の Events。本物と同じ欄（Type・Reason・Age・From・Message） */
export function eventsOf(cluster: ClusterState, object: string, w: number): string[] {
  // 本物と同じく、同じ知らせの繰り返しは 1 行にまとめ、最後の時刻と回数（x3 over 22s）を出す
  const groups: { type: string; reason: string; message: string; first: number; last: number; count: number }[] = [];
  for (const e of cluster.events.filter((x) => x.object === object)) {
    const same = groups.find((g) => g.type === e.type && g.reason === e.reason && g.message === e.message);
    if (same) {
      same.last = e.tick;
      same.count += 1;
    } else groups.push({ type: e.type, reason: e.reason, message: e.message, first: e.tick, last: e.tick, count: 1 });
  }
  const shown = groups.sort((a, b) => a.last - b.last).slice(-12);
  if (shown.length === 0) return [`${'Events:'.padEnd(w)}<none>`];
  const when = (g: (typeof shown)[number]): string => (g.count === 1 ? age(cluster.tick, g.last) : `${age(cluster.tick, g.last)} (x${String(g.count)} over ${age(cluster.tick, g.first)})`);
  return ['Events:', ...grid(['Type', 'Reason', 'Age', 'From', 'Message'], shown.map((g) => [g.type, g.reason, when(g), sourceOf(g.reason), g.message]))];
}

/** 確かめ（プローブ）の 1 行。本物の describe の Liveness・Readiness・Startup の形 */
function probeLine(probe: Probe, spec: ContainerSpec): string {
  return `http-get http://:${String(spec.ports[0] ?? 80)}/ delay=${String(probe.initialDelaySeconds)}s timeout=1s period=${String(probe.periodSeconds)}s #success=1 #failure=${String(probe.failureThreshold)}`;
}

/** コンテナの今の状態（State と、その下の Reason・Exit Code） */
function stateOf(pod: Pod, status: ContainerStatus | undefined): [string, string][] {
  if (pod.status.phase === 'Succeeded') return [['State', 'Terminated'], ['  Reason', 'Completed'], ['  Exit Code', '0']];
  if (status?.waitingReason != null && status.waitingReason !== 'NotReady') return [['State', 'Waiting'], ['  Reason', status.waitingReason]];
  if (status?.started === true || status?.ready === true) return [['State', 'Running']];
  return [['State', 'Waiting'], ['  Reason', 'ContainerCreating']];
}

export function describePod(cluster: ClusterState, pod: Pod): string {
  const w = 18;
  const node = pod.status.nodeName === null ? undefined : cluster.nodes.get(pod.status.nodeName);
  const phase = pod.status.phase === 'ContainerCreating' ? 'Pending' : pod.status.phase;
  const labels = Object.entries(pod.metadata.labels).map(([k, v]) => `${k}=${v}`);
  const lines = [
    ...multi('Name', [pod.metadata.name], w),
    ...multi('Namespace', [pod.metadata.namespace], w),
    ...multi('Priority', ['0'], w),
    ...multi('Service Account', [pod.spec.serviceAccountName], w),
    ...multi('Node', [node ? `${node.metadata.name}/${nodeAddress(node)}` : '<none>'], w),
    ...multi('Labels', labels, w),
    ...multi('Annotations', [], w),
    ...multi('Status', [phase], w),
    ...multi('IP', [pod.status.podIP ?? ''], w),
    'Containers:',
  ];
  for (const spec of pod.spec.containers) {
    const status = pod.status.containerStatuses.find((c) => c.name === spec.name);
    const env = Object.entries(resolveEnv(cluster, pod, spec.name));
    const rows: [string, string][] = [
      ['Image', spec.image],
      ['Port', spec.ports.length === 0 ? '<none>' : spec.ports.map((p) => `${String(p)}/TCP`).join(', ')],
      ['Host Port', spec.ports.length === 0 ? '<none>' : spec.ports.map(() => '0/TCP').join(', ')],
      ...stateOf(pod, status),
      ['Ready', status?.ready === true ? 'True' : 'False'],
      ['Restart Count', String(status?.restartCount ?? 0)],
    ];
    if (spec.limits) rows.push(['Limits', ''], ['  cpu', `${String(spec.limits.cpu)}m`], ['  memory', `${String(spec.limits.memory)}Mi`]);
    rows.push(['Requests', ''], ['  cpu', `${String(spec.requests.cpu)}m`], ['  memory', `${String(spec.requests.memory)}Mi`]);
    if (spec.livenessProbe) rows.push(['Liveness', probeLine(spec.livenessProbe, spec)]);
    if (spec.readinessProbe) rows.push(['Readiness', probeLine(spec.readinessProbe, spec)]);
    if (spec.startupProbe) rows.push(['Startup', probeLine(spec.startupProbe, spec)]);
    rows.push(['Environment', env.length === 0 ? '<none>' : '']);
    lines.push(`  ${spec.name}:`, ...fields(rows, '    '));
    for (const [k, v] of env) lines.push(`      ${k}:  ${v}`);
    lines.push('    Mounts:');
    for (const m of spec.volumeMounts) lines.push(`      ${m.mountPath} from ${m.name}`);
    if (spec.volumeMounts.length === 0) lines.push('      <none>');
  }
  const scheduled = pod.status.nodeName !== null;
  const ready = isReady(pod);
  lines.push('Conditions:', ...grid(['Type', 'Status'], [
    ['PodReadyToStartContainers', scheduled && pod.status.phase !== 'ContainerCreating' ? 'True' : 'False'],
    ['Initialized', 'True'],
    ['Ready', ready ? 'True' : 'False'],
    ['ContainersReady', ready ? 'True' : 'False'],
    ['PodScheduled', scheduled ? 'True' : 'False'],
  ]));
  lines.push('Volumes:');
  for (const v of pod.spec.volumes) {
    const [type, detail] = v.kind === 'configMap' ? ['ConfigMap (a volume populated by a ConfigMap)', ['Name', v.configMap]]
      : v.kind === 'secret' ? ['Secret (a volume populated by a Secret)', ['SecretName', v.secret]]
        : v.kind === 'persistentVolumeClaim' ? ['PersistentVolumeClaim (a reference to a PersistentVolumeClaim in the same namespace)', ['ClaimName', v.claimName]]
          : ['EmptyDir (a temporary directory that shares a pod\'s lifetime)', ['Medium', '']];
    lines.push(`  ${v.name}:`, ...fields([['Type', type], detail as [string, string]], '    '));
  }
  if (pod.spec.volumes.length === 0) lines.push('  <none>');
  const qos = pod.spec.containers.every((c) => c.limits !== null && c.limits.cpu === c.requests.cpu && c.limits.memory === c.requests.memory) ? 'Guaranteed' : 'Burstable';
  lines.push(...multi('QoS Class', [qos], 29), ...multi('Node-Selectors', [], 29));
  lines.push(...multi('Tolerations', ['node.kubernetes.io/not-ready:NoExecute op=Exists for 300s', 'node.kubernetes.io/unreachable:NoExecute op=Exists for 300s'], 29));
  lines.push(...eventsOf(cluster, `pod/${pod.metadata.name}`, w));
  return `${lines.join('\n')}\n`;
}
