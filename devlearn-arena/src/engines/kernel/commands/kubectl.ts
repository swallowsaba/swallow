import { advanceCluster, matches } from '@/engines/k8s/controllers';
import { isReady, tickPods } from '@/engines/k8s/kubelet';
import type { ClusterState, Pod } from '@/engines/k8s/types';
import { key } from '@/engines/k8s/types';
import type { CommandResult, CommandSpec, ShellState } from '../registry';
import { fromLines, parseArgs } from './args';

const NO_CLUSTER =
  'The connection to the server localhost:8080 was refused - did you specify the right host or port?\n';

const KINDS: Record<string, string> = {
  po: 'pods', pod: 'pods', pods: 'pods',
  no: 'nodes', node: 'nodes', nodes: 'nodes',
  deploy: 'deployments', deployment: 'deployments', deployments: 'deployments',
  rs: 'replicasets', replicaset: 'replicasets', replicasets: 'replicasets',
  svc: 'services', service: 'services', services: 'services',
  ev: 'events', event: 'events', events: 'events',
};

function age(tick: number, createdAt: number): string {
  const seconds = Math.max(0, tick - createdAt);
  if (seconds < 60) return `${String(seconds)}s`;
  return `${String(Math.floor(seconds / 60))}m`;
}

function table(rows: string[][]): string {
  if (rows.length === 0) return '';
  const widths = (rows[0] ?? []).map((_, i) =>
    Math.max(...rows.map((r) => (r[i] ?? '').length)),
  );
  return fromLines(
    rows.map((row) => row.map((cell, i) => cell.padEnd(widths[i] ?? 0)).join('   ').trimEnd()),
  );
}

function podReady(pod: Pod): string {
  const ready = pod.status.containerStatuses.filter((c) => c.ready).length;
  return `${String(ready)}/${String(pod.status.containerStatuses.length)}`;
}

function podStatus(pod: Pod): string {
  const waiting = pod.status.containerStatuses.find((c) => c.waitingReason !== null);
  if (waiting?.waitingReason !== undefined && waiting.waitingReason !== null) return waiting.waitingReason;
  return pod.status.phase;
}

function restarts(pod: Pod): number {
  return pod.status.containerStatuses.reduce((n, c) => n + c.restartCount, 0);
}

function listPods(cluster: ClusterState, namespace: string, wide: boolean): string {
  const pods = [...cluster.pods.values()]
    .filter((p) => p.metadata.namespace === namespace)
    .sort((a, b) => (a.metadata.name < b.metadata.name ? -1 : 1));
  if (pods.length === 0) return `No resources found in ${namespace} namespace.\n`;

  const header = ['NAME', 'READY', 'STATUS', 'RESTARTS', 'AGE'];
  if (wide) header.push('IP', 'NODE');
  const rows = [header];
  for (const pod of pods) {
    const row = [
      pod.metadata.name,
      podReady(pod),
      podStatus(pod),
      String(restarts(pod)),
      age(cluster.tick, pod.metadata.createdAt),
    ];
    if (wide) row.push(pod.status.podIP ?? '<none>', pod.status.nodeName ?? '<none>');
    rows.push(row);
  }
  return table(rows);
}

function describePod(cluster: ClusterState, pod: Pod): string {
  const lines = [
    `Name:         ${pod.metadata.name}`,
    `Namespace:    ${pod.metadata.namespace}`,
    `Node:         ${pod.status.nodeName ?? '<none>'}`,
    `Status:       ${podStatus(pod)}`,
    `IP:           ${pod.status.podIP ?? '<none>'}`,
    `Labels:       ${
      Object.entries(pod.metadata.labels).map(([k, v]) => `${k}=${v}`).join(',') || '<none>'
    }`,
    'Containers:',
  ];
  for (const spec of pod.spec.containers) {
    const status = pod.status.containerStatuses.find((c) => c.name === spec.name);
    lines.push(`  ${spec.name}:`);
    lines.push(`    Image:      ${spec.image}`);
    lines.push(`    Ready:      ${status?.ready === true ? 'True' : 'False'}`);
    lines.push(`    Restarts:   ${String(status?.restartCount ?? 0)}`);
    lines.push(`    Requests:   cpu=${String(spec.requests.cpu)}m memory=${String(spec.requests.memory)}Mi`);
  }
  if (pod.status.message !== null) {
    lines.push('', `Message:      ${pod.status.message}`);
  }

  const events = cluster.events.filter((e) => e.object === `pod/${pod.metadata.name}`).slice(-10);
  lines.push('', 'Events:');
  if (events.length === 0) lines.push('  <none>');
  else {
    lines.push('  TYPE      REASON              AGE   MESSAGE');
    for (const e of events) {
      lines.push(
        `  ${e.type.padEnd(9)} ${e.reason.padEnd(19)} ${age(cluster.tick, e.tick).padEnd(5)} ${e.message}`,
      );
    }
  }
  return `${lines.join('\n')}\n`;
}

function runSub(sub: string, argv: readonly string[], shell: ShellState): CommandResult {
  const cluster = shell.cluster;
  if (cluster === null) return { stderr: NO_CLUSTER, code: 1 };
  const rest = argv.slice(2);
  const { flags, values, operands } = parseArgs([sub, ...rest], { withValue: ['o', 'n', 'l'] });
  const namespace = values.get('n') ?? 'default';
  const output = values.get('o') ?? '';

  switch (sub) {
    case 'get': {
      const kind = KINDS[operands[0] ?? ''] ?? '';
      const wide = output === 'wide';
      if (kind === 'pods') return { stdout: listPods(cluster, namespace, wide) };
      if (kind === 'nodes') {
        const rows = [['NAME', 'STATUS', 'CPU', 'MEMORY']];
        for (const node of [...cluster.nodes.values()].sort((a, b) => (a.metadata.name < b.metadata.name ? -1 : 1))) {
          rows.push([
            node.metadata.name,
            node.spec.unschedulable ? 'Ready,SchedulingDisabled' : node.status.ready ? 'Ready' : 'NotReady',
            `${String(node.status.allocatable.cpu)}m`,
            `${String(node.status.allocatable.memory)}Mi`,
          ]);
        }
        return { stdout: table(rows) };
      }
      if (kind === 'deployments') {
        const items = [...cluster.deployments.values()].filter((d) => d.metadata.namespace === namespace);
        if (items.length === 0) return { stdout: `No resources found in ${namespace} namespace.\n` };
        const rows = [['NAME', 'READY', 'UP-TO-DATE', 'AVAILABLE', 'AGE']];
        for (const d of items) {
          rows.push([
            d.metadata.name,
            `${String(d.status.readyReplicas)}/${String(d.spec.replicas)}`,
            String(d.status.updatedReplicas),
            String(d.status.readyReplicas),
            age(cluster.tick, d.metadata.createdAt),
          ]);
        }
        return { stdout: table(rows) };
      }
      if (kind === 'replicasets') {
        const items = [...cluster.replicaSets.values()].filter((r) => r.metadata.namespace === namespace);
        const rows = [['NAME', 'DESIRED', 'CURRENT', 'READY', 'AGE']];
        for (const r of items) {
          rows.push([
            r.metadata.name,
            String(r.spec.replicas),
            String(r.status.replicas),
            String(r.status.readyReplicas),
            age(cluster.tick, r.metadata.createdAt),
          ]);
        }
        return { stdout: table(rows) };
      }
      if (kind === 'services') {
        const items = [...cluster.services.values()].filter((s) => s.metadata.namespace === namespace);
        if (items.length === 0) return { stdout: `No resources found in ${namespace} namespace.\n` };
        const rows = [['NAME', 'TYPE', 'CLUSTER-IP', 'PORT(S)', 'ENDPOINTS']];
        for (const s of items) {
          rows.push([
            s.metadata.name,
            s.spec.type,
            s.spec.clusterIP,
            s.spec.ports.map((p) => `${String(p.port)}/TCP`).join(','),
            s.status.endpoints.length === 0 ? '<none>' : s.status.endpoints.join(','),
          ]);
        }
        return { stdout: table(rows) };
      }
      if (kind === 'events') {
        const rows = [['AGE', 'TYPE', 'REASON', 'OBJECT', 'MESSAGE']];
        for (const e of cluster.events.slice(-20)) {
          rows.push([age(cluster.tick, e.tick), e.type, e.reason, e.object, e.message]);
        }
        return { stdout: table(rows) };
      }
      return {
        stderr: `error: the server doesn't have a resource type "${operands[0] ?? ''}"\n`,
        code: 1,
      };
    }

    case 'describe': {
      const kind = KINDS[operands[0] ?? ''] ?? '';
      const name = operands[1];
      if (kind !== 'pods' || name === undefined) {
        return { stderr: 'usage: kubectl describe pod <name>\n', code: 1 };
      }
      const pod = cluster.pods.get(key(namespace, name));
      if (!pod) {
        return { stderr: `Error from server (NotFound): pods "${name}" not found\n`, code: 1 };
      }
      return { stdout: describePod(cluster, pod) };
    }

    case 'delete': {
      const kind = KINDS[operands[0] ?? ''] ?? '';
      const name = operands[1];
      if (name === undefined) return { stderr: 'error: 名前を指定してください\n', code: 1 };
      if (kind === 'pods') {
        const id = key(namespace, name);
        if (!cluster.pods.has(id)) {
          return { stderr: `Error from server (NotFound): pods "${name}" not found\n`, code: 1 };
        }
        const pods = new Map(cluster.pods);
        pods.delete(id);
        return { stdout: `pod "${name}" deleted\n`, patch: { cluster: { ...cluster, pods } } };
      }
      if (kind === 'deployments') {
        const id = key(namespace, name);
        if (!cluster.deployments.has(id)) {
          return { stderr: `Error from server (NotFound): deployments.apps "${name}" not found\n`, code: 1 };
        }
        const deployments = new Map(cluster.deployments);
        deployments.delete(id);
        const replicaSets = new Map(
          [...cluster.replicaSets].filter(
            ([, rs]) => !rs.metadata.ownerReferences.some((o) => o.name === name),
          ),
        );
        const pods = new Map(
          [...cluster.pods].filter(
            ([, p]) => !p.metadata.name.startsWith(`${name}-`),
          ),
        );
        return {
          stdout: `deployment.apps "${name}" deleted\n`,
          patch: { cluster: { ...cluster, deployments, replicaSets, pods } },
        };
      }
      return { stderr: `error: 未対応の種別です\n`, code: 1 };
    }

    case 'scale': {
      const name = operands[1] ?? operands[0]?.split('/')[1] ?? '';
      const replicas = Number(values.get('replicas') ?? rest.find((a) => a.startsWith('--replicas='))?.split('=')[1] ?? NaN);
      const target = cluster.deployments.get(key(namespace, name));
      if (!target) {
        return { stderr: `Error from server (NotFound): deployments.apps "${name}" not found\n`, code: 1 };
      }
      if (!Number.isFinite(replicas)) {
        return { stderr: 'error: --replicas=<数> を指定してください\n', code: 1 };
      }
      const deployments = new Map(cluster.deployments);
      deployments.set(key(namespace, name), {
        ...target,
        spec: { ...target.spec, replicas },
        metadata: { ...target.metadata, resourceVersion: target.metadata.resourceVersion + 1 },
      });
      return {
        stdout: `deployment.apps/${name} scaled\n`,
        patch: { cluster: { ...cluster, deployments } },
      };
    }

    case 'set': {
      // kubectl set selector <type> <name> key=value
      if (operands[0] !== 'selector') {
        return { stderr: 'usage: kubectl set selector <type> <name> <key>=<value>\n', code: 1 };
      }
      const kind = KINDS[operands[1] ?? ''] ?? '';
      const name = operands[2];
      const pairs = operands.slice(3).filter((o) => o.includes('='));
      if (kind !== 'services' || name === undefined || pairs.length === 0) {
        return { stderr: 'usage: kubectl set selector svc <name> <key>=<value>\n', code: 1 };
      }
      const svc = cluster.services.get(key(namespace, name));
      if (!svc) {
        return { stderr: `Error from server (NotFound): services "${name}" not found\n`, code: 1 };
      }
      const selector: Record<string, string> = {};
      for (const pair of pairs) {
        const [k, v] = pair.split('=');
        if (k !== undefined && v !== undefined) selector[k] = v;
      }
      const services = new Map(cluster.services);
      services.set(key(namespace, name), {
        ...svc,
        spec: { ...svc.spec, selector },
        metadata: { ...svc.metadata, resourceVersion: svc.metadata.resourceVersion + 1 },
      });
      return {
        stdout: `service/${name} selector updated\n`,
        patch: { cluster: { ...cluster, services } },
      };
    }

    case 'label': {
      const kind = KINDS[operands[0] ?? ''] ?? '';
      const name = operands[1];
      const pairs = operands.slice(2).filter((o) => o.includes('='));
      if (kind !== 'pods' || name === undefined || pairs.length === 0) {
        return { stderr: 'usage: kubectl label pod <name> <key>=<value>\n', code: 1 };
      }
      const pod = cluster.pods.get(key(namespace, name));
      if (!pod) {
        return { stderr: `Error from server (NotFound): pods "${name}" not found\n`, code: 1 };
      }
      const labels = { ...pod.metadata.labels };
      for (const pair of pairs) {
        const [k, v] = pair.split('=');
        if (k !== undefined && v !== undefined) labels[k] = v;
      }
      const pods = new Map(cluster.pods);
      pods.set(key(namespace, name), { ...pod, metadata: { ...pod.metadata, labels } });
      return { stdout: `pod/${name} labeled\n`, patch: { cluster: { ...cluster, pods } } };
    }

    case 'cordon':
    case 'uncordon': {
      const name = operands[0];
      const node = name === undefined ? undefined : cluster.nodes.get(name);
      if (!node || name === undefined) {
        return { stderr: `Error from server (NotFound): nodes "${name ?? ''}" not found\n`, code: 1 };
      }
      const nodes = new Map(cluster.nodes);
      nodes.set(name, { ...node, spec: { ...node.spec, unschedulable: sub === 'cordon' } });
      return { stdout: `node/${name} ${sub}ed\n`, patch: { cluster: { ...cluster, nodes } } };
    }

    case 'wait': {
      // 学習用。指定 tick ぶん時間を進める
      const count = Number(values.get('for') ?? operands[0] ?? 5);
      let next = cluster;
      for (let i = 0; i < (Number.isFinite(count) ? count : 5); i += 1) {
        next = advanceCluster(next, tickPods);
      }
      return { stdout: `${String(next.tick - cluster.tick)} tick 進めました\n`, patch: { cluster: next } };
    }

    case 'endpoints': {
      const name = operands[0];
      const svc = name === undefined ? undefined : cluster.services.get(key(namespace, name));
      if (!svc) return { stderr: `Error from server (NotFound): services "${name ?? ''}" not found\n`, code: 1 };
      const selected = [...cluster.pods.values()].filter(
        (p) => p.metadata.namespace === namespace && matches(p.metadata.labels, svc.spec.selector),
      );
      const rows = [['POD', 'LABELS', 'READY', 'IN ENDPOINTS']];
      for (const p of selected) {
        rows.push([
          p.metadata.name,
          Object.entries(p.metadata.labels).map(([k, v]) => `${k}=${v}`).join(','),
          isReady(p) ? 'True' : 'False',
          isReady(p) ? 'yes' : 'no',
        ]);
      }
      if (selected.length === 0) rows.push(['<selector に一致する Pod がありません>', '', '', '']);
      return { stdout: table(rows) };
    }

    default:
      void flags;
      return { stderr: `error: unknown command "${sub}" for "kubectl"\n`, code: 1 };
  }
}

export const kubectlCommands: CommandSpec[] = [
  {
    name: 'kubectl',
    summary: 'Kubernetes を操作する（get/describe/delete/scale/cordon/wait ほか）',
    complete: ({ prefix }) =>
      ['get', 'describe', 'delete', 'scale', 'set', 'label', 'cordon', 'uncordon', 'wait', 'endpoints'].filter((s) =>
        s.startsWith(prefix),
      ),
    handler: ({ argv, shell }) => {
      const sub = argv[1];
      if (sub === undefined) {
        return {
          stdout:
            'usage: kubectl <command>\n' +
            '  get describe delete scale set label cordon uncordon wait endpoints\n',
        };
      }
      return runSub(sub, argv, shell);
    },
  },
];
