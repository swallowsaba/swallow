import type { ClusterState, Pod, Resource } from '@/engines/k8s/types';
import { key } from '@/engines/k8s/types';
import type { CommandResult, CommandSpec, ShellState } from '../registry';
import { fromLines, parseArgs } from './args';
import { describePod, describeResource, renderTable } from './kubectlGet';
import { create, expose, run } from './kubectlCreate';
import { nodeCtl, taint } from './kubectlNodes';
import { setProbe, setResources } from './kubectlSet';
import { opsSubcommands } from './kubectlOps';
import { parseOutput, renderResources } from './kubectlOutput';
import {
  CLUSTER_SCOPED, FIELD_OF, KINDS, NO_CLUSTER, idFor, listOf, matchesSelector, notFound, parseTarget,
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

/** 表の右端に LABELS の列を足す（--show-labels） */
function withLabels(rendered: string, items: readonly Resource[]): string {
  const lines = rendered.replace(/\n$/, '').split('\n');
  if (lines.length !== items.length + 1) return rendered;
  const width = Math.max(...lines.map((l) => l.length));
  const labels = items.map((r) => {
    const text = Object.entries(r.metadata.labels).map(([k, v]) => `${k}=${v}`).join(',');
    return text === '' ? '<none>' : text;
  });
  const out = lines.map((l, i) => `${l.padEnd(width)}   ${i === 0 ? 'LABELS' : (labels[i - 1] ?? '')}`);
  return `${out.join('\n')}\n`;
}

/** 名前で1つ消す。持ち主のいる下位の資源もまとめて片付ける */
function deleteOne(cluster: ClusterState, kind: string, namespace: string, name: string): CommandResult {
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
}

const coreSubcommands: Record<string, KubectlHandler> = {
  get: ({ cluster, namespace, operands, output, values, flags }) => {
    const { kind, name, raw } = parseTarget(operands);
    if (kind === '') {
      return { stderr: `error: the server doesn't have a resource type "${raw}"\n`, code: 1 };
    }
    const format = parseOutput(output);

    // events と machines は Resource の形をしていないので、表の側で組み立てる
    const synthetic = kind === 'events' || kind === 'machines';
    let items = synthetic ? [] : listOf(cluster, kind, namespace);
    if (name !== undefined) {
      const one = findOne(cluster, kind, namespace, name);
      if (one === null) return notFound(kind, name);
      items = [one];
    }

    const selector = values.get('l');
    if (selector !== undefined) {
      items = items.filter((r) => matchesSelector(r.metadata.labels, selector));
    }

    if (format.kind !== 'table') return { stdout: renderResources(items, format) };
    if (items.length === 0 && !synthetic) {
      return { stdout: `No resources found in ${namespace} namespace.\n` };
    }
    const rendered = renderTable(cluster, kind, items, format.wide);
    return { stdout: flags.has('show-labels') ? withLabels(rendered, items) : rendered };
  },

  describe: ({ cluster, namespace, operands, values }) => {
    const { kind, name } = parseTarget(operands);
    if (kind === '') {
      return { stderr: 'usage: kubectl describe <type> [<name>]\n', code: 1 };
    }
    const one = (resource: Resource): string =>
      kind === 'pods' ? describePod(cluster, resource as Pod) : describeResource(cluster, kind, resource);
    if (name !== undefined) {
      const found = findOne(cluster, kind, namespace, name);
      if (found === null) return notFound(kind, name);
      return { stdout: one(found) };
    }
    // 名前を省くと、本物と同じくその種別を全部（-l があれば一致したものを）順に出す
    const selector = values.get('l');
    const items = listOf(cluster, kind, namespace).filter(
      (r) => selector === undefined || matchesSelector(r.metadata.labels, selector),
    );
    if (items.length === 0) return { stdout: `No resources found in ${namespace} namespace.\n` };
    return { stdout: items.map(one).join('\n\n') };
  },

  delete: (ctx) => {
    const { cluster, namespace, operands, values } = ctx;
    const { kind, name } = parseTarget(operands);
    const selector = values.get('l');
    // -l で選んだものを1つずつ消す。消し方は名前で指したときと同じ
    if (kind !== '' && name === undefined && selector !== undefined) {
      const targets = listOf(cluster, kind, namespace).filter((r) =>
        matchesSelector(r.metadata.labels, selector),
      );
      if (targets.length === 0) return { stdout: 'No resources found\n' };
      let current = cluster;
      const out: string[] = [];
      for (const target of targets) {
        const result = deleteOne(current, kind, namespace, target.metadata.name);
        if (result.patch?.cluster) current = result.patch.cluster;
        out.push(result.stdout ?? '');
      }
      return { stdout: out.join(''), patch: { cluster: current } };
    }
    if (kind === '' || name === undefined) {
      return { stderr: 'error: 種別と名前を指定してください\n', code: 1 };
    }
    return deleteOne(cluster, kind, namespace, name);
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

  set: (ctx) => {
    const { cluster, namespace, operands } = ctx;
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
      // `deploy/web` の形と `deployment web` の形の両方を受ける
      const head = operands[1] ?? '';
      const slash = head.includes('/');
      const kind = KINDS[slash ? (head.split('/')[0] ?? '') : head] ?? '';
      const name = slash ? (head.split('/')[1] ?? '') : (operands[2] ?? '');
      const pair = (slash ? operands[2] : operands[3]) ?? '';
      const [containerName, image] = pair.split('=');
      if (kind !== 'deployments' || containerName === undefined || image === undefined) {
        return { stderr: 'usage: kubectl set image deployment <name> <container>=<image>\n', code: 1 };
      }
      const deployment = cluster.deployments.get(key(namespace, name));
      if (deployment === undefined) return notFound('deployments.apps', name);
      // 本物と同じく、無いコンテナ名を指定したら何も変えずに失敗する
      if (!deployment.spec.template.containers.some((c) => c.name === containerName)) {
        return { stderr: `error: unable to find container named "${containerName}"\n`, code: 1 };
      }
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

    if (operands[0] === 'resources') return setResources(ctx);
    if (operands[0] === 'probe') return setProbe(ctx);

    return { stderr: 'usage: kubectl set <selector|image|resources|probe> ...\n', code: 1 };
  },

  label: ({ cluster, namespace, operands, values, flags }) => {
    const raw = operands[0] ?? '';
    const kind = KINDS[raw] ?? '';
    const selector = values.get('l');
    // `key-` は取り外し、`key=value` は付け直し
    const changes = operands.slice(1).filter((o) => o.includes('=') || o.endsWith('-'));
    const name = selector === undefined ? operands[1] : undefined;
    if (kind === '' || changes.length === 0 || (selector === undefined && name === undefined)) {
      return { stderr: 'usage: kubectl label <type> (<name>|-l <selector>) <key>=<value>\n', code: 1 };
    }
    const field = FIELD_OF[kind];
    const collection = field === undefined ? undefined : cluster[field];
    if (!(collection instanceof Map)) {
      return { stderr: `error: ${kind} にはラベルを付けられません\n`, code: 1 };
    }

    // 対象を決める。名前を指すか、セレクタで集合を指すか
    const targets: [string, Resource][] = [];
    if (selector === undefined) {
      const id = idFor(kind, namespace, name ?? '');
      const found = collection.get(id) as Resource | undefined;
      if (found === undefined) return notFound(kind, name ?? '');
      targets.push([id, found]);
    } else {
      const wanted = Object.fromEntries(
        selector.split(',').map((pair) => pair.split('=')).filter((p) => p.length === 2) as [string, string][],
      );
      for (const [id, resource] of collection as Map<string, Resource>) {
        if (!CLUSTER_SCOPED.has(kind) && resource.metadata.namespace !== namespace) continue;
        if (Object.entries(wanted).every(([k, v]) => resource.metadata.labels[k] === v)) {
          targets.push([id, resource]);
        }
      }
      if (targets.length === 0) {
        return { stdout: `No resources found in ${namespace} namespace.\n` };
      }
    }

    const next = new Map(collection as Map<string, Resource>);
    const lines: string[] = [];
    for (const [id, resource] of targets) {
      const labels = { ...resource.metadata.labels };
      for (const change of changes) {
        if (change.endsWith('-') && !change.includes('=')) {
          delete labels[change.slice(0, -1)];
          continue;
        }
        const [k, v] = change.split('=');
        if (k === undefined || v === undefined) continue;
        // 本物と同じく、既にある値を変えるには --overwrite が要る
        if (labels[k] !== undefined && labels[k] !== v && !flags.has('overwrite')) {
          return {
            stderr: `error: '${k}' already has a value (${labels[k]}), and --overwrite is false\n`,
            code: 1,
          };
        }
        labels[k] = v;
      }
      next.set(id, { ...resource, metadata: { ...resource.metadata, labels } });
      lines.push(`${raw}/${resource.metadata.name} labeled`);
    }
    return {
      stdout: fromLines(lines),
      patch: { cluster: { ...cluster, [field as string]: next } },
    };
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
coreSubcommands['run'] = run;
coreSubcommands['expose'] = expose;
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
    withValue: [
      'o', 'n', 'l', 'f', 'as', 'image', 'replicas', 'tcp', 'requests', 'limits', 'succeeds-after',
      'port', 'target-port', 'type', 'name', 'labels',
    ],
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
