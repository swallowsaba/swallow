import { CNI_NAMES } from '@/engines/k8s/bootstrap';
import { advanceCluster, matches } from '@/engines/k8s/controllers';
import { isReady, tickPods } from '@/engines/k8s/kubelet';
import { isParseError, parseManifests } from '@/engines/k8s/manifest';
import { canI } from '@/engines/k8s/policy';
import { revisionsOf, rolloutStatus, rolloutUndo } from '@/engines/k8s/rollout';
import { resolveEnv } from '@/engines/k8s/storage';
import type { ClusterState, Deployment, Resource } from '@/engines/k8s/types';
import { key } from '@/engines/k8s/types';
import { resolve } from '../path';
import { stat } from '../vfs';
import { fromLines } from './args';
import {
  FIELD_OF, KINDS, idFor, listOf, notFound, table, type KubectlHandler,
} from './kubectlShared';

/** 資源を、その種別のコレクションに書き込んだ新しいクラスタを返す */
function upsert(cluster: ClusterState, kind: string, resource: Resource): ClusterState {
  const field = FIELD_OF[kind];
  if (field === undefined) return cluster;
  const existing = cluster[field];
  if (!(existing instanceof Map)) return cluster;
  const next = new Map(existing as Map<string, Resource>);
  next.set(idFor(kind, resource.metadata.namespace, resource.metadata.name), resource);
  return { ...cluster, [field]: next };
}

const KIND_TO_PLURAL: Record<string, string> = {
  Pod: 'pods', Node: 'nodes', Deployment: 'deployments', ReplicaSet: 'replicasets',
  Service: 'services', ConfigMap: 'configmaps', Secret: 'secrets',
  StatefulSet: 'statefulsets', DaemonSet: 'daemonsets', Job: 'jobs', CronJob: 'cronjobs',
  PersistentVolume: 'persistentvolumes', PersistentVolumeClaim: 'persistentvolumeclaims',
  StorageClass: 'storageclasses', Ingress: 'ingresses', NetworkPolicy: 'networkpolicies',
  ServiceAccount: 'serviceaccounts', Role: 'roles', ClusterRole: 'roles',
  RoleBinding: 'rolebindings', ClusterRoleBinding: 'rolebindings',
  HorizontalPodAutoscaler: 'horizontalpodautoscalers',
};

export const opsSubcommands: Record<string, KubectlHandler> = {
  apply: ({ cluster, shell, values, flags }) => {
    const file = values.get('f');
    if (file === undefined) return { stderr: 'error: -f <ファイル> を指定してください\n', code: 1 };
    const node = stat(shell.vfs, resolve(shell.cwd, file));
    if (node?.kind !== 'file') {
      return { stderr: `error: the path "${file}" does not exist\n`, code: 1 };
    }

    const parsed = parseManifests(node.content);
    const errors = parsed.filter(isParseError);
    if (errors.length > 0) {
      return { stderr: `${errors.map((e) => e.error).join('\n')}\n`, code: 1 };
    }

    if (flags.has('dry-run')) {
      return {
        stdout: fromLines(
          parsed
            .filter((r): r is Resource => !isParseError(r))
            .map((r) => `${r.kind.toLowerCase()}/${r.metadata.name} created (dry run)`),
        ),
      };
    }

    let next = cluster;
    const lines: string[] = [];
    for (const resource of parsed) {
      if (isParseError(resource)) continue;
      const plural = KIND_TO_PLURAL[resource.kind];
      if (plural === undefined) {
        return { stderr: `error: 未対応の kind です: ${resource.kind}\n`, code: 1 };
      }
      const id = idFor(plural, resource.metadata.namespace, resource.metadata.name);
      const collection = next[FIELD_OF[plural] ?? 'pods'];
      const existed = collection instanceof Map && collection.has(id);
      next = upsert(next, plural, resource);
      // CNI の DaemonSet を入れると、ノードに Pod 網の設定が書かれる。
      // 実物でも設定が書かれた時点でノードが Ready になる。
      if (resource.kind === 'DaemonSet' && CNI_NAMES.has(resource.metadata.name)) {
        next = { ...next, controlPlane: { ...next.controlPlane, cni: resource.metadata.name } };
      }
      lines.push(`${resource.kind.toLowerCase()}/${resource.metadata.name} ${existed ? 'configured' : 'created'}`);
    }
    return { stdout: fromLines(lines), patch: { cluster: next } };
  },

  rollout: ({ cluster, rest, namespace, operands }) => {
    const action = operands[0] ?? '';
    const target = operands[2] ?? operands[1]?.split('/')[1] ?? '';
    const deployment = cluster.deployments.get(key(namespace, target));
    if (deployment === undefined) return notFound('deployments.apps', target);

    if (action === 'status') {
      const status = rolloutStatus(cluster, deployment);
      return { stdout: `${status.message}\n`, code: status.done ? 0 : 1 };
    }

    if (action === 'history') {
      const rows = [['REVISION', 'CHANGE-CAUSE', 'IMAGE']];
      for (const revision of revisionsOf(cluster, deployment)) {
        rows.push([String(revision.revision), revision.changeCause, revision.image]);
      }
      return { stdout: `deployment.apps/${target}\n${table(rows)}` };
    }

    if (action === 'undo') {
      const toRevision = rest
        .map((a) => /^--to-revision=(\d+)$/.exec(a)?.[1])
        .find((v) => v !== undefined);
      const result = rolloutUndo(cluster, deployment, toRevision === undefined ? null : Number(toRevision));
      if (result.error !== undefined) return { stderr: `${result.error}\n`, code: 1 };
      return {
        stdout: `${result.message}\n`,
        patch: { cluster: { ...cluster, deployments: result.deployments } },
      };
    }

    if (action === 'restart') {
      // 注釈を変えるとテンプレートの世代が変わり、置き換えが起きる
      const updated: Deployment = {
        ...deployment,
        spec: {
          ...deployment.spec,
          template: {
            ...deployment.spec.template,
            labels: { ...deployment.spec.template.labels, 'restarted-at': String(cluster.tick) },
          },
        },
      };
      const deployments = new Map(cluster.deployments);
      deployments.set(key(namespace, target), updated);
      return {
        stdout: `deployment.apps/${target} restarted\n`,
        patch: { cluster: { ...cluster, deployments } },
      };
    }

    return { stderr: 'usage: kubectl rollout <status|history|undo|restart> deployment/<name>\n', code: 1 };
  },

  drain: ({ cluster, operands }) => {
    const name = operands[0];
    const node = name === undefined ? undefined : cluster.nodes.get(name);
    if (node === undefined || name === undefined) return notFound('nodes', name ?? '');

    // cordon してから、そのノードの Pod を落とす。所有者がいる Pod は作り直される
    const nodes = new Map(cluster.nodes);
    nodes.set(name, { ...node, spec: { ...node.spec, unschedulable: true } });

    const pods = new Map(cluster.pods);
    const evicted: string[] = [];
    const kept: string[] = [];
    for (const [id, pod] of cluster.pods) {
      if (pod.status.nodeName !== name) continue;
      const owner = pod.metadata.ownerReferences[0];
      if (owner?.kind === 'DaemonSet') {
        kept.push(pod.metadata.name);
        continue;
      }
      if (owner === undefined) {
        // 所有者がいない Pod は作り直されない。本物も --force を求める
        kept.push(pod.metadata.name);
        continue;
      }
      pods.delete(id);
      evicted.push(pod.metadata.name);
    }

    const lines = [`node/${name} cordoned`];
    for (const pod of evicted) lines.push(`evicting pod default/${pod}`);
    for (const pod of kept) {
      lines.push(`warning: ignoring pod default/${pod}（DaemonSet 管理か、所有者のいない Pod）`);
    }
    lines.push(`node/${name} drained`);
    return { stdout: fromLines(lines), patch: { cluster: { ...cluster, nodes, pods } } };
  },

  auth: ({ cluster, rest, namespace, operands, values }) => {
    if (operands[0] !== 'can-i') {
      return { stderr: 'usage: kubectl auth can-i <verb> <resource> [--as=<subject>]\n', code: 1 };
    }
    const verb = operands[1];
    const resource = KINDS[operands[2] ?? ''] ?? operands[2];
    if (verb === undefined || resource === undefined) {
      return { stderr: 'usage: kubectl auth can-i <verb> <resource>\n', code: 1 };
    }

    const as = values.get('as') ?? rest.map((a) => /^--as=(.+)$/.exec(a)?.[1]).find((v) => v !== undefined);
    const subject = as === undefined
      ? cluster.currentUser
      : as.startsWith('system:serviceaccount:')
        ? {
            kind: 'ServiceAccount' as const,
            namespace: as.split(':')[2] ?? namespace,
            name: as.split(':')[3] ?? '',
          }
        : { kind: 'User' as const, name: as, namespace };

    const decision = canI(cluster, { verb, resource, namespace, subject });
    if (decision.allowed) {
      return { stdout: `yes（${decision.via ?? ''} による）\n` };
    }
    return { stdout: `no\n${decision.reason}\n`, code: 1 };
  },

  logs: ({ cluster, namespace, operands }) => {
    const name = operands[0];
    const pod = name === undefined ? undefined : cluster.pods.get(key(namespace, name));
    if (pod === undefined || name === undefined) return notFound('pods', name ?? '');

    const lines: string[] = [];
    for (const spec of pod.spec.containers) {
      const status = pod.status.containerStatuses.find((c) => c.name === spec.name);
      if (spec.failing) {
        lines.push(`Error: ImagePullBackOff（イメージ "${spec.image}" を取得できていません）`);
        continue;
      }
      if (spec.crashing) {
        lines.push(`starting ${spec.name}...`);
        lines.push('fatal: 起動直後に終了しました（再起動 ' + String(status?.restartCount ?? 0) + ' 回目）');
        continue;
      }
      if (pod.status.nodeName === null) {
        lines.push('（まだ配置されていないのでログはありません）');
        continue;
      }
      lines.push(`starting ${spec.name} (${spec.image})`);
      for (const [k, v] of Object.entries(resolveEnv(cluster, pod, spec.name))) {
        lines.push(`env ${k}=${v}`);
      }
      lines.push(status?.ready === true ? 'listening' : 'still warming up');
    }
    return { stdout: fromLines(lines) };
  },

  exec: ({ cluster, namespace, operands, rest }) => {
    const name = operands[0];
    const pod = name === undefined ? undefined : cluster.pods.get(key(namespace, name));
    if (pod === undefined || name === undefined) return notFound('pods', name ?? '');
    if (!isReady(pod)) {
      return { stderr: `error: pod ${name} is not running\n`, code: 1 };
    }
    const dashdash = rest.indexOf('--');
    const command = dashdash === -1 ? [] : rest.slice(dashdash + 1);
    const spec = pod.spec.containers[0];
    if (command[0] === 'env' && spec !== undefined) {
      return {
        stdout: fromLines(
          Object.entries(resolveEnv(cluster, pod, spec.name)).map(([k, v]) => `${k}=${v}`),
        ),
      };
    }
    if (command[0] === 'cat' && spec !== undefined) {
      const path = command[1] ?? '';
      const mount = spec.volumeMounts.find((m) => path.startsWith(`${m.mountPath}/`));
      const volume = pod.spec.volumes.find((v) => v.name === mount?.name);
      const file = path.slice((mount?.mountPath.length ?? 0) + 1);
      if (volume?.kind === 'configMap') {
        const source = cluster.configMaps.get(key(namespace, volume.configMap));
        const value = source?.data[file];
        if (value !== undefined) return { stdout: value.endsWith('\n') ? value : `${value}\n` };
      }
      if (volume?.kind === 'secret') {
        const source = cluster.secrets.get(key(namespace, volume.secret));
        const value = source?.data[file];
        // マウントされた Secret は復号された形で見える
        if (value !== undefined) return { stdout: `${atob(value)}\n` };
      }
      return { stderr: `cat: ${path}: No such file or directory\n`, code: 1 };
    }
    return { stdout: `（${command.join(' ') || 'sh'} を実行しました）\n` };
  },

  load: ({ cluster, namespace, operands }) => {
    // 学習用。HPA の入力になる CPU 使用率を与える
    const name = operands[0];
    const percent = Number(operands[1]);
    if (name === undefined || !Number.isFinite(percent)) {
      return { stderr: 'usage: kubectl load <deployment> <cpu 使用率(%)>\n', code: 1 };
    }
    const id = key(namespace, name);
    if (!cluster.deployments.has(id)) return notFound('deployments.apps', name);
    const load = new Map(cluster.load);
    load.set(id, percent);
    return { stdout: `${name} の負荷を ${String(percent)}% にしました\n`, patch: { cluster: { ...cluster, load } } };
  },

  wait: ({ cluster, values, operands }) => {
    const count = Number(values.get('for') ?? operands[0] ?? 5);
    let next = cluster;
    for (let i = 0; i < (Number.isFinite(count) ? count : 5); i += 1) {
      next = advanceCluster(next, tickPods);
    }
    return { stdout: `${String(next.tick - cluster.tick)} tick 進めました\n`, patch: { cluster: next } };
  },

  endpoints: ({ cluster, namespace, operands }) => {
    const name = operands[0];
    const svc = name === undefined ? undefined : cluster.services.get(key(namespace, name));
    if (svc === undefined) return notFound('services', name ?? '');
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
  },

  api: ({ cluster, namespace }) => {
    // kubectl api-resources 相当。何が扱えるかを状態から数えて出す
    const rows = [['NAME', 'NAMESPACED', 'COUNT']];
    for (const plural of [...new Set(Object.values(KINDS))].sort()) {
      if (plural === 'events') continue;
      const items = listOf(cluster, plural, namespace);
      rows.push([plural, plural === 'nodes' ? 'false' : 'true', String(items.length)]);
    }
    return { stdout: table(rows) };
  },
};
