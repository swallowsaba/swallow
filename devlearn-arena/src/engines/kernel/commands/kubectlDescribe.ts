import { nodeCondition } from '@/engines/k8s/bootstrap';
import { realNames, templateHash } from '@/engines/k8s/controllers';
import { REVISION_KEY } from '@/engines/k8s/rollout';
import { isReady } from '@/engines/k8s/kubelet';
import type {
  ClusterState, ContainerSpec, ContainerStatus, Deployment, Ingress, Node, PersistentVolume, PersistentVolumeClaim, Pod, PodVolume, Probe, ReplicaSet, Service,
} from '@/engines/k8s/types';
import { backendText, rulesByHost } from '@/engines/k8s/ingress';
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
  if (reason === 'Scheduled' || reason === 'FailedScheduling') return 'default-scheduler';
  if (reason === 'ScalingReplicaSet') return 'deployment-controller';
  if (reason === 'SuccessfulCreate' || reason === 'SuccessfulDelete') return 'replicaset-controller';
  if (reason === 'Sync') return 'nginx-ingress-controller';
  return 'kubelet';
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
  const target = probe.httpGet === undefined ? `:${String(spec.ports[0] ?? 80)}/` : `:${String(probe.httpGet.port)}${probe.httpGet.path}`;
  return `http-get http://${target} delay=${String(probe.initialDelaySeconds)}s timeout=1s period=${String(probe.periodSeconds)}s #success=1 #failure=${String(probe.failureThreshold)}`;
}

/** コンテナの今の状態（State と、その下の Reason・Exit Code） */
function stateOf(pod: Pod, status: ContainerStatus | undefined): [string, string][] {
  if (pod.status.phase === 'Succeeded') return [['State', 'Terminated'], ['  Reason', 'Completed'], ['  Exit Code', '0']];
  if (status?.waitingReason != null && status.waitingReason !== 'NotReady') return [['State', 'Waiting'], ['  Reason', status.waitingReason]];
  if (status?.started === true || status?.ready === true) return [['State', 'Running']];
  return [['State', 'Waiting'], ['  Reason', 'ContainerCreating']];
}

/** Volumes の欄の中身（種類ごとの本物の言い方） */
function volumeLines(volumes: readonly PodVolume[], indent: string): string[] {
  if (volumes.length === 0) return [`${indent}<none>`];
  return volumes.flatMap((v) => {
    const rows: [string, string][] = v.kind === 'configMap' ? [['Type', 'ConfigMap (a volume populated by a ConfigMap)'], ['Name', v.configMap]]
      : v.kind === 'secret' ? [['Type', 'Secret (a volume populated by a Secret)'], ['SecretName', v.secret]]
        : v.kind === 'persistentVolumeClaim' ? [['Type', 'PersistentVolumeClaim (a reference to a PersistentVolumeClaim in the same namespace)'], ['ClaimName', v.claimName], ['ReadOnly', 'false']]
          : [['Type', 'EmptyDir (a temporary directory that shares a pod\'s lifetime)'], ['Medium', '']];
    // 中の欄は、Pod でも雛形でも 4 字下げ（本物の形）
    return [`${indent}${v.name}:`, ...fields(rows, '    ')];
  });
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
    lines.push(`  ${spec.name}:`, ...fields(rows, '    '), ...envBlock(spec, '    '));
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
  lines.push('Volumes:', ...volumeLines(pod.spec.volumes, '  '));
  const qos = pod.spec.containers.every((c) => c.limits !== null && c.limits.cpu === c.requests.cpu && c.limits.memory === c.requests.memory) ? 'Guaranteed' : 'Burstable';
  lines.push(...multi('QoS Class', [qos], 29), ...multi('Node-Selectors', [], 29));
  lines.push(...multi('Tolerations', ['node.kubernetes.io/not-ready:NoExecute op=Exists for 300s', 'node.kubernetes.io/unreachable:NoExecute op=Exists for 300s'], 29));
  lines.push(...eventsOf(cluster, `pod/${pod.metadata.name}`, w));
  return `${lines.join('\n')}\n`;
}

/**
 * 環境変数の欄。本物の describe と同じく、書いた形で見せる（受け取る ConfigMap・Secret の名前と、直接書いた値）。
 * 中で引いた値を見るのは、コンテナの中の printenv
 */
function envBlock(c: ContainerSpec, indent: string): string[] {
  const from = c.envFrom.filter((r) => r.key === undefined).map((r) => `${indent}  ${r.name}  ${r.kind}  Optional: false`);
  const env = [
    ...Object.entries(c.env).map(([k, v]) => `${indent}  ${k}:  ${v}`),
    ...c.envFrom.filter((r) => r.key !== undefined).map((r) => `${indent}  ${r.as ?? r.key ?? ''}:  <set to the key '${r.key ?? ''}' ${r.kind === 'ConfigMap' ? 'of config map' : 'in secret'} '${r.name}'>  Optional: false`),
  ];
  return [
    ...(from.length === 0 ? [] : [`${indent}Environment Variables from:`, ...from]),
    ...(env.length === 0 ? [`${indent}Environment:  <none>`] : [`${indent}Environment:`, ...env]),
  ];
}

const labelText = (labels: Record<string, string>): string[] => Object.entries(labels).map(([k, v]) => `${k}=${v}`);

/** Pod の雛形（Deployment・ReplicaSet の Pod Template） */
function podTemplate(template: Deployment['spec']['template']): string[] {
  const lines = ['Pod Template:', ...multi('  Labels', labelText(template.labels), 11), '  Containers:'];
  for (const c of template.containers) {
    lines.push(`   ${c.name}:`, ...fields([
      ['Image', c.image],
      ['Port', c.ports.length === 0 ? '<none>' : c.ports.map((p) => `${String(p)}/TCP`).join(', ')],
      ['Host Port', c.ports.length === 0 ? '<none>' : c.ports.map(() => '0/TCP').join(', ')],
    ], '    '), ...envBlock(c, '    '), `    Mounts:  ${c.volumeMounts.length === 0 ? '<none>' : c.volumeMounts.map((m) => `${m.mountPath} from ${m.name}`).join(', ')}`);
  }
  const volumes = template.volumes ?? [];
  if (volumes.length === 0) lines.push('  Volumes:         <none>');
  else lines.push('  Volumes:', ...volumeLines(volumes, '   '));
  lines.push(...fields([['Node-Selectors', labelText(template.nodeSelector).join(',') || '<none>'], ['Tolerations', '<none>']], '  '));
  return lines;
}

/** その持ち主の ReplicaSet（新しい世代から） */
function replicaSetsOf(cluster: ClusterState, d: Deployment): ReplicaSet[] {
  return [...cluster.replicaSets.values()]
    .filter((rs) => rs.metadata.namespace === d.metadata.namespace && rs.metadata.ownerReferences.some((o) => o.kind === 'Deployment' && o.name === d.metadata.name))
    .sort((a, b) => Number(b.metadata.annotations[REVISION_KEY] ?? 0) - Number(a.metadata.annotations[REVISION_KEY] ?? 0));
}

/** ReplicaSet が持つ Pod */
function podsOf(cluster: ClusterState, rs: ReplicaSet): Pod[] {
  return [...cluster.pods.values()].filter((p) => p.metadata.namespace === rs.metadata.namespace && p.metadata.ownerReferences.some((o) => o.kind === 'ReplicaSet' && o.name === rs.metadata.name));
}

export function describeDeployment(cluster: ClusterState, d: Deployment): string {
  const w = 24;
  const sets = replicaSetsOf(cluster, d);
  const hash = templateHash(d.spec.template, realNames(cluster));
  const current = sets.find((rs) => rs.metadata.labels['pod-template-hash'] === hash);
  const all = sets.flatMap((rs) => podsOf(cluster, rs));
  const available = all.filter(isReady).length;
  const updated = current ? podsOf(cluster, current).length : 0;
  const created = (rs: ReplicaSet): string => `${rs.metadata.name} (${String(podsOf(cluster, rs).length)}/${String(rs.spec.replicas)} replicas created)`;
  const olds = sets.filter((rs) => rs !== current && rs.spec.replicas > 0);
  const annotations = Object.entries(d.metadata.annotations).map(([k, v]) => `${k}: ${v}`);
  const revision = current?.metadata.annotations[REVISION_KEY];
  const lines = [
    ...multi('Name', [d.metadata.name], w),
    ...multi('Namespace', [d.metadata.namespace], w),
    ...multi('Labels', labelText(d.metadata.labels), w),
    ...multi('Annotations', revision === undefined ? annotations : [`${REVISION_KEY}: ${revision}`, ...annotations], w),
    ...multi('Selector', [labelText(d.spec.selector).join(',')], w),
    ...multi('Replicas', [`${String(d.spec.replicas)} desired | ${String(updated)} updated | ${String(all.length)} total | ${String(available)} available | ${String(Math.max(0, all.length - available))} unavailable`], w),
    ...multi('StrategyType', ['RollingUpdate'], w),
    ...multi('MinReadySeconds', ['0'], w),
    ...multi('RollingUpdateStrategy', [`${String(d.spec.strategy.maxUnavailable)} max unavailable, ${String(d.spec.strategy.maxSurge)} max surge`], w),
    ...podTemplate(d.spec.template),
    'Conditions:',
    ...grid(['Type', 'Status', 'Reason'], [
      ['Available', available >= d.spec.replicas - d.spec.strategy.maxUnavailable ? 'True' : 'False', available >= d.spec.replicas - d.spec.strategy.maxUnavailable ? 'MinimumReplicasAvailable' : 'MinimumReplicasUnavailable'],
      ['Progressing', 'True', updated >= d.spec.replicas && olds.length === 0 ? 'NewReplicaSetAvailable' : 'ReplicaSetUpdated'],
    ]),
    ...multi('OldReplicaSets', olds.map(created), 17),
    ...multi('NewReplicaSet', current ? [created(current)] : [], 17),
    ...eventsOf(cluster, `deployment/${d.metadata.name}`, w),
  ];
  return `${lines.join('\n')}\n`;
}

export function describeReplicaSet(cluster: ClusterState, rs: ReplicaSet): string {
  const w = 16;
  const pods = podsOf(cluster, rs);
  const count = (phase: string): number => pods.filter((p) => (phase === 'Running' ? p.status.phase === 'Running' : phase === 'Waiting' ? p.status.phase !== 'Running' && p.status.phase !== 'Succeeded' && p.status.phase !== 'Failed' : p.status.phase === phase)).length;
  const owner = rs.metadata.ownerReferences[0];
  const lines = [
    ...multi('Name', [rs.metadata.name], w),
    ...multi('Namespace', [rs.metadata.namespace], w),
    ...multi('Selector', [labelText(rs.spec.selector).join(',')], w),
    ...multi('Labels', labelText(rs.metadata.labels), w),
    ...multi('Annotations', Object.entries(rs.metadata.annotations).map(([k, v]) => `${k}: ${v}`), w),
    ...multi('Controlled By', [owner ? `${owner.kind}/${owner.name}` : '<none>'], w),
    ...multi('Replicas', [`${String(pods.length)} current / ${String(rs.spec.replicas)} desired`], w),
    ...multi('Pods Status', [`${String(count('Running'))} Running / ${String(count('Waiting'))} Waiting / ${String(count('Succeeded'))} Succeeded / ${String(count('Failed'))} Failed`], w),
    ...podTemplate(rs.spec.template),
    ...eventsOf(cluster, `replicaset/${rs.metadata.name}`, w),
  ];
  return `${lines.join('\n')}\n`;
}

export function describeService(cluster: ClusterState, s: Service): string {
  const w = 26;
  const port = s.spec.ports[0];
  const endpoints = s.status.endpoints.map((ip) => `${ip}:${String(port?.targetPort ?? 80)}`);
  const lines = [
    ...multi('Name', [s.metadata.name], w),
    ...multi('Namespace', [s.metadata.namespace], w),
    ...multi('Labels', labelText(s.metadata.labels), w),
    ...multi('Annotations', [], w),
    ...multi('Selector', [labelText(s.spec.selector).join(',') || '<none>'], w),
    ...multi('Type', [s.spec.type], w),
    ...multi('IP Family Policy', ['SingleStack'], w),
    ...multi('IP Families', ['IPv4'], w),
    ...multi('IP', [s.spec.clusterIP], w),
    ...multi('IPs', [s.spec.clusterIP], w),
    ...s.spec.ports.flatMap((p) => [
      ...multi('Port', [`<unset>  ${String(p.port)}/TCP`], w),
      ...multi('TargetPort', [`${String(p.targetPort)}/TCP`], w),
      ...(p.nodePort === null ? [] : multi('NodePort', [`<unset>  ${String(p.nodePort)}/TCP`], w)),
    ]),
    `${'Endpoints:'.padEnd(w)}${endpoints.join(',')}`.trimEnd(),
    ...multi('Session Affinity', ['None'], w),
    ...multi('Internal Traffic Policy', ['Cluster'], w),
    ...eventsOf(cluster, `service/${s.metadata.name}`, w),
  ];
  return `${lines.join('\n')}\n`;
}

const MODE_SHORT: Readonly<Record<string, string>> = { ReadWriteOnce: 'RWO', ReadOnlyMany: 'ROX', ReadWriteMany: 'RWX', ReadWriteOncePod: 'RWOP' };

/** PV の束ねの係（persistentvolume-controller）が、結べない PVC を見直す間隔（秒） */
const BIND_RESYNC = 15;

export function describeClaim(cluster: ClusterState, c: PersistentVolumeClaim): string {
  const w = 15;
  const pv = c.status.volumeName === null ? undefined : cluster.persistentVolumes.get(c.status.volumeName);
  const usedBy = [...cluster.pods.values()]
    .filter((p) => p.metadata.namespace === c.metadata.namespace && p.spec.volumes.some((v) => v.kind === 'persistentVolumeClaim' && v.claimName === c.metadata.name))
    .map((p) => p.metadata.name);
  const lines = [
    ...multi('Name', [c.metadata.name], w),
    ...multi('Namespace', [c.metadata.namespace], w),
    `${'StorageClass:'.padEnd(w)}${c.spec.storageClassName}`.trimEnd(),
    ...multi('Status', [c.status.phase], w),
    `${'Volume:'.padEnd(w)}${c.status.volumeName ?? ''}`.trimEnd(),
    ...multi('Labels', labelText(c.metadata.labels), w),
    ...multi('Annotations', pv === undefined ? [] : ['pv.kubernetes.io/bind-completed: yes', 'pv.kubernetes.io/bound-by-controller: yes'], w),
    ...multi('Finalizers', ['[kubernetes.io/pvc-protection]'], w),
    `${'Capacity:'.padEnd(w)}${pv === undefined ? '' : `${String(pv.spec.capacityGi)}Gi`}`.trimEnd(),
    `${'Access Modes:'.padEnd(w)}${pv === undefined ? '' : pv.spec.accessModes.map((m) => MODE_SHORT[m] ?? m).join(',')}`.trimEnd(),
    ...multi('VolumeMode', ['Filesystem'], w),
    ...multi('Used By', usedBy, w),
  ];
  // 結べない間は、係が見直すたびに理由を知らせる（同じ知らせは 1 行にまとめる）
  if (c.status.phase === 'Pending' && c.status.message !== null) {
    const since = c.metadata.createdAt;
    const count = Math.floor(Math.max(0, cluster.tick - since) / BIND_RESYNC) + 1;
    const last = since + (count - 1) * BIND_RESYNC;
    const [type, reason] = c.status.message.startsWith('storageclass') ? ['Warning', 'ProvisioningFailed'] : ['Normal', 'FailedBinding'];
    const when = count === 1 ? age(cluster.tick, last) : `${age(cluster.tick, last)} (x${String(count)} over ${age(cluster.tick, since)})`;
    lines.push('Events:', ...grid(['Type', 'Reason', 'Age', 'From', 'Message'], [[type, reason, when, 'persistentvolume-controller', c.status.message]]));
  } else lines.push(...eventsOf(cluster, `persistentvolumeclaim/${c.metadata.name}`, w));
  return `${lines.join('\n')}\n`;
}

export function describeVolume(cluster: ClusterState, v: PersistentVolume): string {
  const w = 17;
  const lines = [
    ...multi('Name', [v.metadata.name], w),
    ...multi('Labels', labelText(v.metadata.labels), w),
    ...multi('Annotations', v.status.claim === null ? [] : ['pv.kubernetes.io/bound-by-controller: yes'], w),
    ...multi('Finalizers', ['[kubernetes.io/pv-protection]'], w),
    `${'StorageClass:'.padEnd(w)}${v.spec.storageClassName}`.trimEnd(),
    ...multi('Status', [v.status.phase], w),
    `${'Claim:'.padEnd(w)}${v.status.claim ?? ''}`.trimEnd(),
    ...multi('Reclaim Policy', [v.spec.reclaimPolicy], w),
    ...multi('Access Modes', [v.spec.accessModes.map((m) => MODE_SHORT[m] ?? m).join(',')], w),
    ...multi('VolumeMode', ['Filesystem'], w),
    ...multi('Capacity', [`${String(v.spec.capacityGi)}Gi`], w),
    ...multi('Node Affinity', [], w),
    'Message:',
    'Source:',
    ...(v.spec.hostPath === undefined ? [] : fields([['Type', 'HostPath (bare host directory volume)'], ['Path', v.spec.hostPath], ['HostPathType', '']], '    ')),
    ...eventsOf(cluster, `persistentvolume/${v.metadata.name}`, w),
  ];
  return `${lines.join('\n')}\n`;
}

export function describeIngress(cluster: ClusterState, ing: Ingress): string {
  const w = 18;
  const groups = rulesByHost(ing);
  const hostW = Math.max(4, ...groups.map((g) => (g.host || '*').length));
  const pathW = Math.max(4, ...ing.spec.rules.map((r) => r.path.length));
  const rows = groups.flatMap((g) => [
    `  ${(g.host || '*').padEnd(hostW)}  `,
    ...g.paths.map((r) => `  ${' '.repeat(hostW)}  ${r.path.padEnd(pathW)}  ${backendText(cluster, ing, r)}`),
  ]);
  const lines = [
    ...multi('Name', [ing.metadata.name], w),
    ...multi('Labels', labelText(ing.metadata.labels), w),
    ...multi('Namespace', [ing.metadata.namespace], w),
    `${'Address:'.padEnd(w)}${ing.status.address ?? ''}`.trimEnd(),
    ...multi('Ingress Class', [ing.spec.className === '' ? '<none>' : ing.spec.className], w),
    ...multi('Default backend', ['<default>'], w),
    'Rules:',
    `  ${'Host'.padEnd(hostW)}  ${'Path'.padEnd(pathW)}  Backends`,
    `  ${'----'.padEnd(hostW)}  ${'----'.padEnd(pathW)}  --------`,
    ...rows,
    ...multi('Annotations', Object.entries(ing.metadata.annotations).map(([k, v]) => `${k}: ${v}`), w),
    ...eventsOf(cluster, `ingress/${ing.metadata.name}`, w),
  ];
  return `${lines.join('\n')}\n`;
}
