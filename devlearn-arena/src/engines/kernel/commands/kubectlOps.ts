import { CNI_NAMES } from '@/engines/k8s/bootstrap';
import { advanceCluster, matches } from '@/engines/k8s/controllers';
import { isReady, tickPods } from '@/engines/k8s/kubelet';
import { isParseError, parseManifests } from '@/engines/k8s/manifest';
import { canI } from '@/engines/k8s/policy';
import { revisionsOf, rolloutStatus, rolloutUndo } from '@/engines/k8s/rollout';
import { resolveEnv } from '@/engines/k8s/storage';
import type { ClusterState, Deployment, Resource } from '@/engines/k8s/types';
import { key } from '@/engines/k8s/types';
import type { CommandResult } from '../registry';
import { resolve } from '../path';
import { stat } from '../vfs';
import { fromLines } from './args';
import { missingNamespace } from './kubectlNamespace';
import {
  CLUSTER_SCOPED, FIELD_OF, KINDS, idFor, listOf, notFound, podFor, table, type KubectlHandler,
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

/** apply の出力に付ける API の組（本物と同じく、core の物は付けない。deployment.apps/web の形） */
const GROUP_OF: Record<string, string> = {
  Deployment: 'apps', ReplicaSet: 'apps', StatefulSet: 'apps', DaemonSet: 'apps',
  Job: 'batch', CronJob: 'batch',
  Ingress: 'networking.k8s.io', NetworkPolicy: 'networking.k8s.io',
  StorageClass: 'storage.k8s.io', HorizontalPodAutoscaler: 'autoscaling',
  Role: 'rbac.authorization.k8s.io', ClusterRole: 'rbac.authorization.k8s.io',
  RoleBinding: 'rbac.authorization.k8s.io', ClusterRoleBinding: 'rbac.authorization.k8s.io',
};

/** 書いた形（望む状態）だけを比べるための文字列。作った時刻・版・状態・配った住所は比べない */
function desired(resource: Resource): string {
  const { name, namespace, labels } = resource.metadata;
  const body: Record<string, unknown> = { ...resource, metadata: { name, namespace, labels } };
  delete body['status'];
  if (resource.kind === 'Service') body['spec'] = { ...resource.spec, clusterIP: '' };
  return JSON.stringify(body);
}

/** 前から在る物に書き重ねる。作った時刻・状態・配った住所は前のまま */
function merged(existing: Resource, resource: Resource): Resource {
  const metadata = {
    ...resource.metadata,
    createdAt: existing.metadata.createdAt,
    resourceVersion: existing.metadata.resourceVersion + 1,
    annotations: { ...existing.metadata.annotations, ...resource.metadata.annotations },
  };
  const next = { ...resource, metadata };
  if ('status' in existing && 'status' in next) (next as { status: unknown }).status = existing.status;
  if (existing.kind === 'Service' && next.kind === 'Service') return { ...next, spec: { ...next.spec, clusterIP: existing.spec.clusterIP } };
  return next;
}

/**
 * マニフェスト（YAML。--- で複数）をクラスタに書き込む。kubectl apply と、実戦の setup の cluster.manifests が使う。
 * 本物と同じく、無ければ created、書いた形が変われば configured、同じなら unchanged
 */
export function applyManifestText(cluster: ClusterState, text: string): { cluster: ClusterState; lines: string[] } | { error: string } {
  const parsed = parseManifests(text);
  const errors = parsed.filter(isParseError);
  if (errors.length > 0) return { error: errors.map((e) => e.error).join('\n') };
  let next = cluster;
  const lines: string[] = [];
  for (const resource of parsed) {
    if (isParseError(resource)) continue;
    const plural = KIND_TO_PLURAL[resource.kind];
    if (plural === undefined) return { error: `error: 未対応の kind です: ${resource.kind}` };
    const id = idFor(plural, resource.metadata.namespace, resource.metadata.name);
    const collection = next[FIELD_OF[plural] ?? 'pods'];
    const existing = collection instanceof Map ? (collection.get(id) as Resource | undefined) : undefined;
    // 区画の一覧を持つクラスタでは、無い区画には作れない（本物と同じ断り方）
    if (!CLUSTER_SCOPED.has(plural) && missingNamespace(next, resource.metadata.namespace)) {
      return { error: `Error from server (NotFound): error when creating: namespaces "${resource.metadata.namespace}" not found` };
    }
    const group = GROUP_OF[resource.kind];
    const label = `${resource.kind.toLowerCase()}${group === undefined ? '' : `.${group}`}/${resource.metadata.name}`;
    if (existing !== undefined && desired(existing) === desired(resource)) {
      lines.push(`${label} unchanged`);
      continue;
    }
    const born = { ...resource, metadata: { ...resource.metadata, createdAt: next.tick } };
    next = upsert(next, plural, existing === undefined ? born : merged(existing, resource));
    // CNI の DaemonSet を入れると、ノードに Pod 網の設定が書かれる。
    // 実物でも設定が書かれた時点でノードが Ready になる。
    if (resource.kind === 'DaemonSet' && CNI_NAMES.has(resource.metadata.name)) {
      next = { ...next, controlPlane: { ...next.controlPlane, cni: resource.metadata.name } };
    }
    lines.push(`${label} ${existing === undefined ? 'created' : 'configured'}`);
  }
  return { cluster: next, lines };
}

/** 入れ替えの期限（本物の progressDeadlineSeconds の既定。秒 = tick） */
const PROGRESS_DEADLINE = 600;

/**
 * rollout status（クラスタを操作する機械）: 本物と同じく、入れ替えが終わるまで時間を進めて待ち、進みが変わるたびに 1 行足す。
 * 期限までに終わらなければ、期限を過ぎたと言って 1 で終わる
 */
function waitRollout(cluster: ClusterState, id: string): CommandResult {
  const lines: string[] = [];
  let next = cluster;
  for (let i = 0; i <= PROGRESS_DEADLINE; i += 1) {
    const deployment = next.deployments.get(id);
    if (deployment === undefined) break;
    const status = rolloutStatus(next, deployment);
    if (lines[lines.length - 1] !== status.message) lines.push(status.message);
    // 終わった時は、Deployment の数の記録（READY の欄）も揃えてから返す（本物はその記録を見て終わりを知る）
    if (status.done) return { stdout: fromLines(lines), patch: { cluster: advanceCluster(next, tickPods) } };
    next = advanceCluster(next, tickPods);
  }
  const name = id.slice(id.indexOf('/') + 1);
  return { stdout: fromLines(lines), stderr: `error: deployment "${name}" exceeded its progress deadline\n`, code: 1, patch: { cluster: next } };
}

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

    const applied = applyManifestText(cluster, node.content);
    if ('error' in applied) return { stderr: `${applied.error}\n`, code: 1 };
    return { stdout: fromLines(applied.lines), patch: { cluster: applied.cluster } };
  },

  rollout: ({ cluster, rest, namespace, operands }) => {
    const action = operands[0] ?? '';
    const target = operands[2] ?? operands[1]?.split('/')[1] ?? '';
    const deployment = cluster.deployments.get(key(namespace, target));
    if (deployment === undefined) return notFound('deployments.apps', target);

    if (action === 'status') {
      const status = rolloutStatus(cluster, deployment);
      if (cluster.server === undefined) return { stdout: `${status.message}\n`, code: status.done ? 0 : 1 };
      return waitRollout(cluster, key(namespace, target));
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
    const target = operands[0];
    const pod = target === undefined ? undefined : podFor(cluster, namespace, target);
    if (pod === undefined || target === undefined) return notFound('pods', target ?? '');

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
    const target = operands[0];
    const pod = target === undefined ? undefined : podFor(cluster, namespace, target);
    if (pod === undefined || target === undefined) return notFound('pods', target ?? '');
    const name = pod.metadata.name;
    if (!isReady(pod)) {
      return { stderr: `error: pod ${name} is not running\n`, code: 1 };
    }
    const dashdash = rest.indexOf('--');
    const command = dashdash === -1 ? [] : rest.slice(dashdash + 1);
    const spec = pod.spec.containers[0];
    if ((command[0] === 'env' || command[0] === 'printenv') && spec !== undefined) {
      // 本物と同じく、決まった変数（PATH・HOSTNAME・窓口の Service の場所・HOME）の間に、書いた変数が入る
      const env: Record<string, string> = {
        PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
        HOSTNAME: name,
        ...resolveEnv(cluster, pod, spec.name),
        KUBERNETES_SERVICE_HOST: '10.96.0.1',
        KUBERNETES_SERVICE_PORT: '443',
        HOME: '/root',
      };
      // printenv 名前: その値だけ。無い名前は何も出さずに 1 で終わる（本物と同じ）
      const names = command[0] === 'printenv' ? command.slice(1) : [];
      if (names.length > 0) {
        const found = names.filter((n) => env[n] !== undefined);
        return { stdout: fromLines(found.map((n) => env[n] ?? '')), code: found.length === names.length ? 0 : 1 };
      }
      return { stdout: fromLines(Object.entries(env).map(([k, v]) => `${k}=${v}`)) };
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

  wait: ({ cluster, values, operands, namespace }) => {
    // 本物の形: kubectl wait --for=condition=available deployment/web（揃うまで時間を進める。揃わなければ打ち切る）
    const cond = /^condition=available$/i.exec(values.get('for') ?? '');
    const target = operands[0]?.replace(/^(deployment|deployments|deploy)(\.apps)?\//, '');
    if (cond && target !== undefined) {
      const id = key(namespace, target);
      if (!cluster.deployments.has(id)) return notFound('deployments.apps', target);
      let next = cluster;
      const ready = (c: typeof cluster): boolean => {
        const d = c.deployments.get(id);
        return d !== undefined && d.status.readyReplicas >= d.spec.replicas && d.spec.replicas > 0;
      };
      for (let i = 0; i < 30 && !ready(next); i += 1) next = advanceCluster(next, tickPods);
      if (!ready(next)) return { stderr: `error: timed out waiting for the condition on deployments/${target}\n`, code: 1, patch: { cluster: next } };
      return { stdout: `deployment.apps/${target} condition met\n`, patch: { cluster: next } };
    }
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
