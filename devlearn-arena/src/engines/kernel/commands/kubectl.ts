import type { ClusterState, Resource } from '@/engines/k8s/types';
import { key } from '@/engines/k8s/types';
import type { CommandResult, CommandSpec, ShellState } from '../registry';
import { parseArgs } from './args';
import { describePod, describeResource, renderTable } from './kubectlGet';
import { create } from './kubectlCreate';
import { nodeCtl, taint } from './kubectlNodes';
import { opsSubcommands } from './kubectlOps';
import { parseOutput, renderResources } from './kubectlOutput';
import {
  CLUSTER_SCOPED, FIELD_OF, KINDS, NO_CLUSTER, idFor, listOf, notFound,
  type KubectlContext, type KubectlHandler,
} from './kubectlShared';

/** 名前で1つ引く。無ければ null */
function findOne(
  cluster: ClusterState,
  kind: string,
  namespace: string,
  name: string,
): Resource | null {
  const items = listOf(cluster, kind, namespace);
  return items.find((r) => r.metadata.name === name) ?? null;
}

const coreSubcommands: Record<string, KubectlHandler> = {
  get: ({ cluster, namespace, operands, output, values }) => {
    const raw = operands[0] ?? '';
    const kind = KINDS[raw] ?? '';
    if (kind === '') {
      return { stderr: `error: the server doesn't have a resource type "${raw}"\n`, code: 1 };
    }
    const format = parseOutput(output);

    // events と machines は Resource の形をしていないので、表の側で組み立てる
    const synthetic = kind === 'events' || kind === 'machines';
    let items = synthetic ? [] : listOf(cluster, kind, namespace);
    const name = operands[1];
    if (name !== undefined) {
      const one = findOne(cluster, kind, namespace, name);
      if (one === null) return notFound(kind, name);
      items = [one];
    }

    const selector = values.get('l');
    if (selector !== undefined) {
      const wanted = Object.fromEntries(
        selector.split(',').map((pair) => pair.split('=')).filter((p) => p.length === 2) as [string, string][],
      );
      items = items.filter((r) => Object.entries(wanted).every(([k, v]) => r.metadata.labels[k] === v));
    }

    if (format.kind !== 'table') return { stdout: renderResources(items, format) };
    if (items.length === 0 && !synthetic) {
      return { stdout: `No resources found in ${namespace} namespace.\n` };
    }
    return { stdout: renderTable(cluster, kind, items, format.wide) };
  },

  describe: ({ cluster, namespace, operands }) => {
    const kind = KINDS[operands[0] ?? ''] ?? '';
    const name = operands[1];
    if (kind === '' || name === undefined) {
      return { stderr: 'usage: kubectl describe <type> <name>\n', code: 1 };
    }
    if (kind === 'pods') {
      const pod = cluster.pods.get(key(namespace, name));
      if (pod === undefined) return notFound('pods', name);
      return { stdout: describePod(cluster, pod) };
    }
    const one = findOne(cluster, kind, namespace, name);
    if (one === null) return notFound(kind, name);
    return { stdout: describeResource(cluster, kind, one) };
  },

  delete: ({ cluster, namespace, operands }) => {
    const kind = KINDS[operands[0] ?? ''] ?? '';
    const name = operands[1];
    if (kind === '' || name === undefined) {
      return { stderr: 'error: 種別と名前を指定してください\n', code: 1 };
    }
    const field = FIELD_OF[kind];
    if (field === undefined) return { stderr: 'error: 未対応の種別です\n', code: 1 };
    const collection = cluster[field];
    if (!(collection instanceof Map)) return { stderr: 'error: 未対応の種別です\n', code: 1 };

    const id = idFor(kind, namespace, name);
    if (!collection.has(id)) return notFound(kind, name);
    const next = new Map(collection as Map<string, Resource>);
    next.delete(id);
    let cluster2: ClusterState = { ...cluster, [field]: next };

    // 所有関係のある資源は、下位もまとめて片付ける
    if (kind === 'deployments') {
      cluster2 = {
        ...cluster2,
        replicaSets: new Map(
          [...cluster.replicaSets].filter(
            ([, rs]) => !rs.metadata.ownerReferences.some((o) => o.name === name),
          ),
        ),
        pods: new Map([...cluster.pods].filter(([, p]) => !p.metadata.name.startsWith(`${name}-`))),
      };
    }
    if (kind === 'statefulsets' || kind === 'daemonsets' || kind === 'jobs') {
      const ownerKind = kind === 'statefulsets' ? 'StatefulSet' : kind === 'daemonsets' ? 'DaemonSet' : 'Job';
      cluster2 = {
        ...cluster2,
        pods: new Map(
          [...cluster.pods].filter(
            ([, p]) => !p.metadata.ownerReferences.some((o) => o.kind === ownerKind && o.name === name),
          ),
        ),
      };
    }

    const label = CLUSTER_SCOPED.has(kind) ? kind.replace(/s$/, '') : kind.replace(/s$/, '');
    return { stdout: `${label} "${name}" deleted\n`, patch: { cluster: cluster2 } };
  },

  scale: ({ cluster, namespace, operands, values, rest }) => {
    const name = operands[1] ?? operands[0]?.split('/')[1] ?? '';
    const replicas = Number(
      values.get('replicas') ?? rest.find((a) => a.startsWith('--replicas='))?.split('=')[1] ?? NaN,
    );
    if (!Number.isFinite(replicas)) {
      return { stderr: 'error: --replicas=<数> を指定してください\n', code: 1 };
    }
    const id = key(namespace, name);

    const deployment = cluster.deployments.get(id);
    if (deployment !== undefined) {
      const deployments = new Map(cluster.deployments);
      deployments.set(id, {
        ...deployment,
        spec: { ...deployment.spec, replicas },
        metadata: { ...deployment.metadata, resourceVersion: deployment.metadata.resourceVersion + 1 },
      });
      return {
        stdout: `deployment.apps/${name} scaled\n`,
        patch: { cluster: { ...cluster, deployments } },
      };
    }

    const statefulSet = cluster.statefulSets.get(id);
    if (statefulSet !== undefined) {
      const statefulSets = new Map(cluster.statefulSets);
      statefulSets.set(id, { ...statefulSet, spec: { ...statefulSet.spec, replicas } });
      return {
        stdout: `statefulset.apps/${name} scaled\n`,
        patch: { cluster: { ...cluster, statefulSets } },
      };
    }
    return notFound('deployments.apps', name);
  },

  set: ({ cluster, namespace, operands }) => {
    if (operands[0] === 'selector') {
      const kind = KINDS[operands[1] ?? ''] ?? '';
      const name = operands[2];
      const pairs = operands.slice(3).filter((o) => o.includes('='));
      if (kind !== 'services' || name === undefined || pairs.length === 0) {
        return { stderr: 'usage: kubectl set selector svc <name> <key>=<value>\n', code: 1 };
      }
      const svc = cluster.services.get(key(namespace, name));
      if (svc === undefined) return notFound('services', name);
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
      return { stdout: `service/${name} selector updated\n`, patch: { cluster: { ...cluster, services } } };
    }

    if (operands[0] === 'image') {
      const kind = KINDS[operands[1] ?? ''] ?? operands[1]?.split('/')[0] ?? '';
      const name = operands[2] ?? operands[1]?.split('/')[1] ?? '';
      const pair = operands[3] ?? '';
      const [containerName, image] = pair.split('=');
      if (kind !== 'deployments' || containerName === undefined || image === undefined) {
        return { stderr: 'usage: kubectl set image deployment <name> <container>=<image>\n', code: 1 };
      }
      const deployment = cluster.deployments.get(key(namespace, name));
      if (deployment === undefined) return notFound('deployments.apps', name);
      const containers = deployment.spec.template.containers.map((c) =>
        c.name === containerName ? { ...c, image, failing: image.includes('does-not-exist'), crashing: image.includes('crash') } : c,
      );
      const deployments = new Map(cluster.deployments);
      deployments.set(key(namespace, name), {
        ...deployment,
        spec: { ...deployment.spec, template: { ...deployment.spec.template, containers } },
        metadata: {
          ...deployment.metadata,
          annotations: { ...deployment.metadata.annotations, 'kubernetes.io/change-cause': `image ${image}` },
          resourceVersion: deployment.metadata.resourceVersion + 1,
        },
      });
      return {
        stdout: `deployment.apps/${name} image updated\n`,
        patch: { cluster: { ...cluster, deployments } },
      };
    }

    return { stderr: 'usage: kubectl set <selector|image> ...\n', code: 1 };
  },

  label: ({ cluster, namespace, operands }) => {
    const kind = KINDS[operands[0] ?? ''] ?? '';
    const name = operands[1];
    const pairs = operands.slice(2).filter((o) => o.includes('='));
    if (kind !== 'pods' || name === undefined || pairs.length === 0) {
      return { stderr: 'usage: kubectl label pod <name> <key>=<value>\n', code: 1 };
    }
    const pod = cluster.pods.get(key(namespace, name));
    if (pod === undefined) return notFound('pods', name);
    const labels = { ...pod.metadata.labels };
    for (const pair of pairs) {
      const [k, v] = pair.split('=');
      if (k !== undefined && v !== undefined) labels[k] = v;
    }
    const pods = new Map(cluster.pods);
    pods.set(key(namespace, name), { ...pod, metadata: { ...pod.metadata, labels } });
    return { stdout: `pod/${name} labeled\n`, patch: { cluster: { ...cluster, pods } } };
  },

  cordon: ({ cluster, sub, operands }) => {
    const name = operands[0];
    const node = name === undefined ? undefined : cluster.nodes.get(name);
    if (node === undefined || name === undefined) return notFound('nodes', name ?? '');
    const nodes = new Map(cluster.nodes);
    nodes.set(name, { ...node, spec: { ...node.spec, unschedulable: sub === 'cordon' } });
    return { stdout: `node/${name} ${sub}ed\n`, patch: { cluster: { ...cluster, nodes } } };
  },
};
coreSubcommands['uncordon'] = coreSubcommands['cordon'] as KubectlHandler;
coreSubcommands['create'] = create;
coreSubcommands['taint'] = taint;
coreSubcommands['node-down'] = nodeCtl;
coreSubcommands['node-up'] = nodeCtl;

const subcommands: Record<string, KubectlHandler> = { ...coreSubcommands, ...opsSubcommands };

/** `kubectl api-resources` を `api` に寄せる（引数の形が特殊なため） */
const ALIASES: Record<string, string> = { 'api-resources': 'api' };

const NAMES = [...new Set([...Object.keys(subcommands), ...Object.keys(ALIASES)])].sort();

function runSub(sub: string, argv: readonly string[], shell: ShellState): CommandResult {
  const cluster = shell.cluster;
  if (cluster === null) return { stderr: NO_CLUSTER, code: 1 };
  const rest = argv.slice(2);
  const { flags, values, operands } = parseArgs([sub, ...rest], {
    withValue: ['o', 'n', 'l', 'f', 'as', 'image', 'replicas', 'tcp'],
  });

  const handler = subcommands[ALIASES[sub] ?? sub];
  if (handler === undefined) {
    return { stderr: `error: unknown command "${sub}" for "kubectl"\n`, code: 1 };
  }

  const ctx: KubectlContext = {
    cluster,
    shell,
    sub,
    rest,
    namespace: values.get('n') ?? 'default',
    output: values.get('o') ?? '',
    flags,
    values,
    operands,
  };
  return handler(ctx);
}

export const kubectlCommands: CommandSpec[] = [
  {
    name: 'kubectl',
    summary: 'Kubernetes を操作する（get/describe/apply/rollout/drain/auth ほか）',
    complete: ({ argv, prefix }) =>
      (argv.length <= 2
        ? NAMES
        : [...new Set(Object.values(KINDS))].sort()
      ).filter((s) => s.startsWith(prefix)),
    handler: ({ argv, shell }) => {
      const sub = argv[1];
      if (sub === undefined) {
        return {
          stdout:
            'usage: kubectl <command>\n' +
            `  ${NAMES.join(' ')}\n`,
        };
      }
      return runSub(sub, argv, shell);
    },
  },
];
