import { CNI_NAMES } from '@/engines/k8s/bootstrap';
import { advanceCluster, matches } from '@/engines/k8s/controllers';
import { isReady, tickPods } from '@/engines/k8s/kubelet';
import { isParseError, parseManifests } from '@/engines/k8s/manifest';
import { canI } from '@/engines/k8s/policy';
import { revisionsOf, rolloutStatus, rolloutUndo } from '@/engines/k8s/rollout';
import { psql, TABLES_FILE } from '@/engines/container/pg';
import { appLog } from '@/engines/k8s/apps';
import { ingressError } from '@/engines/k8s/ingress';
import { pgOf, pgTables, writeAt } from '@/engines/k8s/volumes';
import { resolveEnv } from '@/engines/k8s/storage';
import type { ClusterState, Deployment, PersistentVolumeClaim, Pod, Resource } from '@/engines/k8s/types';
import { key } from '@/engines/k8s/types';
import type { CommandResult } from '../registry';
import { resolve } from '../path';
import { stat } from '../vfs';
import { fromLines } from './args';
import { missingNamespace } from './kubectlNamespace';
import {
  CLUSTER_SCOPED, FIELD_OF, KINDS, idFor, listOf, matchesSelector, notFound, podFor, table, type KubectlHandler,
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
  // PV の中に書かれた物は、書いた形ではない
  if (resource.kind === 'PersistentVolume') delete body['data'];
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
  if (existing.kind === 'PersistentVolume' && next.kind === 'PersistentVolume' && existing.data !== undefined) return { ...next, data: existing.data };
  if (existing.kind === 'Service' && next.kind === 'Service') return { ...next, spec: { ...next.spec, clusterIP: existing.spec.clusterIP } };
  return next;
}

/** base64 として読めない時の、読めなくなった位置（Go の base64 と同じ数え方）。読めれば null */
function base64Error(value: string): number | null {
  const at = value.search(/[^A-Za-z0-9+/=]/);
  if (at !== -1) return at;
  const pad = value.indexOf('=');
  if (pad !== -1 && !/^=*$/.test(value.slice(pad))) return pad;
  return value.length % 4 === 0 ? null : value.length - (value.length % 4);
}

/** 大きさ（Gi）の、go-cmp の差分の中の書き方 */
const quantity = (gi: number): string => `{i: resource.int64Amount{value: ${String(gi * 1024 ** 3)}}, s: "${String(gi)}Gi", Format: "BinarySI"}`;

/**
 * PVC の中身は、作った後に変えられない（結ばれた PVC の大きさを増やすことだけ、領域が広げられる種類なら許される）。
 * 変えようとした時の、本物の API サーバの断り方（変えられなければ null）
 */
function claimUpdateError(old: PersistentVolumeClaim, next: PersistentVolumeClaim): string | null {
  const modes = (c: PersistentVolumeClaim): string => `{${c.spec.accessModes.map((m) => `"${m}"`).join(', ')}}`;
  const cls = (c: PersistentVolumeClaim): string => (c.spec.storageClassName === '' ? 'nil' : `&"${c.spec.storageClassName}"`);
  const bound = old.status.phase === 'Bound';
  const sameButSize = modes(old) === modes(next) && cls(old) === cls(next);
  if (sameButSize && old.spec.requestGi === next.spec.requestGi) return null;
  const head = `The PersistentVolumeClaim "${old.metadata.name}" is invalid: `;
  if (bound && sameButSize) {
    if (next.spec.requestGi < old.spec.requestGi) return `${head}spec.resources.requests.storage: Forbidden: field can not be less than previous value`;
    return `Error from server (Forbidden): error when applying patch: persistentvolumeclaims "${old.metadata.name}" is forbidden: only dynamically provisioned pvc can be resized and the storageclass that provisions the pvc must support resize`;
  }
  const line = (same: boolean, indent: string, label: string, a: string, b: string): string[] =>
    same ? [`  ${indent}${label}${a},`] : [`- ${indent}${label}${a},`, `+ ${indent}${label}${b},`];
  return [
    `${head}spec: Forbidden: spec is immutable after creation except resources.requests and volumeAttributesClassName for bound claims`,
    '  core.PersistentVolumeClaimSpec{',
    ...line(modes(old) === modes(next), '\t', 'AccessModes: ', modes(old), modes(next)),
    '  \tSelector:    nil,',
    '  \tResources: core.VolumeResourceRequirements{',
    '  \t\tLimits: nil,',
    ...line(bound || old.spec.requestGi === next.spec.requestGi, '\t\t', 'Requests: ', `core.ResourceList{s"storage": ${quantity(old.spec.requestGi)}}`, `core.ResourceList{s"storage": ${quantity(next.spec.requestGi)}}`),
    '  \t},',
    `  \tVolumeName:       "${old.status.volumeName ?? ''}",`,
    ...line(cls(old) === cls(next), '\t', 'StorageClassName: ', cls(old), cls(next)),
    '  \t... // 4 identical fields',
    '  }',
  ].join('\n');
}

/** コンテナの volumeMounts の name が、Pod の volumes に無い時の、本物の API サーバの断り方（揃っていれば null） */
function mountError(resource: Resource): string | null {
  const [containers, volumes, path] = resource.kind === 'Pod' ? [resource.spec.containers, resource.spec.volumes, 'spec']
    : resource.kind === 'Deployment' ? [resource.spec.template.containers, resource.spec.template.volumes ?? [], 'spec.template.spec']
      : [[], [], ''];
  for (const [i, c] of containers.entries()) {
    for (const [j, m] of c.volumeMounts.entries()) {
      if (!volumes.some((v) => v.name === m.name)) {
        return `The ${resource.kind} "${resource.metadata.name}" is invalid: ${path}.containers[${String(i)}].volumeMounts[${String(j)}].name: Not found: "${m.name}"`;
      }
    }
  }
  return null;
}

/**
 * マニフェスト（YAML。--- で複数）をクラスタに書き込む。kubectl apply と、実戦の setup の cluster.manifests が使う。
 * 本物と同じく、無ければ created、書いた形が変われば configured、同じなら unchanged。
 * 断られた物（failures）があっても、本物と同じく残りは書き込む
 */
export function applyManifestText(cluster: ClusterState, text: string, source = '-'): { cluster: ClusterState; lines: string[]; failures: string[] } | { error: string } {
  const parsed = parseManifests(text);
  const errors = parsed.filter(isParseError);
  if (errors.length > 0) return { error: errors.map((e) => e.error).join('\n') };
  let next = cluster;
  const lines: string[] = [];
  const failures: string[] = [];
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
    // Secret の data: は base64 にした値を書く決まり（そのままの値は stringData:）。読めなければ本物と同じく断る
    if (resource.kind === 'Secret') {
      const bad = Object.values(resource.data).map(base64Error).find((n) => n !== null);
      if (bad !== undefined) {
        return { error: `Error from server (BadRequest): error when creating "${source}": Secret in version "v1" cannot be handled as a Secret: illegal base64 data at input byte ${String(bad)}` };
      }
    }
    const group = GROUP_OF[resource.kind];
    const label = `${resource.kind.toLowerCase()}${group === undefined ? '' : `.${group}`}/${resource.metadata.name}`;
    if (existing !== undefined && desired(existing) === desired(resource)) {
      lines.push(`${label} unchanged`);
      continue;
    }
    const badMount = mountError(resource) ?? (resource.kind === 'Ingress' ? ingressError(resource) : null);
    if (badMount !== null) {
      failures.push(badMount);
      continue;
    }
    if (existing?.kind === 'PersistentVolumeClaim' && resource.kind === 'PersistentVolumeClaim') {
      const refused = claimUpdateError(existing, resource);
      if (refused !== null) {
        failures.push(refused);
        continue;
      }
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
  return { cluster: next, lines, failures };
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

/** 1 つの Pod のログ（行）か、まだ動いたことが無いと断る文 */
function podLogs(cluster: ClusterState, pod: Pod): { lines: string[] } | { stderr: string } {
  // 置き場を持つクラスタ: 本物と同じく、まだ動いたことの無いコンテナはログが無いと断り、動いたコンテナはアプリのログを出す
  if (cluster.images !== undefined) {
    const spec = pod.spec.containers[0];
    const status = pod.status.containerStatuses[0];
    if (spec === undefined) return { lines: [] };
    const reason = pod.status.phase === 'ContainerCreating' || pod.status.nodeName === null ? 'ContainerCreating' : status?.waitingReason;
    const waiting = reason === 'ContainerCreating' || reason === 'CreateContainerConfigError' ? reason
      : reason === 'ImagePullBackOff' ? 'trying and failing to pull image'
        : reason === 'ErrImagePull' ? "image can't be pulled" : null;
    if (waiting !== null) {
      return { stderr: `Error from server (BadRequest): container "${spec.name}" in pod "${pod.metadata.name}" is waiting to start: ${waiting}\n` };
    }
    const log = appLog(cluster, spec, resolveEnv(cluster, pod, spec.name), status?.fresh);
    if (log !== null) return { lines: log };
  }

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
  return { lines };
}

/**
 * DB の Pod の中の psql（-U 利用者・-d DB・-c 文）。表は、データを書く場所（PVC で付けた PV か、コンテナの書き込みの層）に読み書きする。
 * 中のコマンドが失敗すると、本物の kubectl と同じく command terminated with exit code を足す
 */
function psqlIn(cluster: ClusterState, pod: Pod, args: readonly string[]): CommandResult {
  const spec = pod.spec.containers[0];
  const pg = spec === undefined ? undefined : pgOf(cluster, spec);
  if (pg === undefined) {
    return { stderr: 'error: Internal error occurred: OCI runtime exec failed: exec failed: unable to start container process: exec: "psql": executable file not found in $PATH: unknown\ncommand terminated with exit code 126\n', code: 126 };
  }
  let db = 'postgres';
  let user = 'postgres';
  let sql: string | null = null;
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i] ?? '';
    const value = (long: string): string => (a.startsWith(`${long}=`) ? a.slice(long.length + 1) : (args[(i += 1)] ?? ''));
    if (a === '-U' || a.startsWith('--username')) user = value('--username');
    else if (a === '-d' || a.startsWith('--dbname')) db = value('--dbname');
    else if (a === '-c' || a.startsWith('--command')) sql = value('--command');
  }
  const failed = (text: string, code: number): CommandResult => ({ stderr: `${text}command terminated with exit code ${String(code)}\n`, code });
  const fatal = (why: string): CommandResult => failed(`psql: error: connection to server on socket "/var/run/postgresql/.s.PGSQL.5432" failed: FATAL:  ${why}\n`, 2);
  if (user !== 'postgres') return fatal(`role "${user}" does not exist`);
  if (db !== pg.db) return fatal(`database "${db}" does not exist`);
  if (sql === null) return { stderr: 'この練習の端末では、psql の対話の画面は開けない。-c "文" の形で、1 つずつ打つ\n', code: 1 };
  const r = psql(pgTables(cluster, pod) ?? {}, sql);
  if (r.err !== undefined) return failed(r.err, 1);
  if (!r.tables) return { stdout: r.out ?? '' };
  const written = writeAt(cluster, pod, 0, { [`${pg.dataDir}/${TABLES_FILE}`]: `${JSON.stringify(r.tables)}\n` });
  const pods = new Map(cluster.pods);
  pods.set(key(pod.metadata.namespace, pod.metadata.name), written.pod);
  return { stdout: r.out ?? '', patch: { cluster: { ...cluster, pods, persistentVolumes: written.volumes } } };
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
      // 本物と同じく、どのファイルを読めなかったかを頭に付ける
      return { stderr: `${errors.map((e) => e.error.replace(/^error: error converting/, `error: error parsing ${file}: error converting`)).join('\n')}\n`, code: 1 };
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

    const applied = applyManifestText(cluster, node.content, file);
    if ('error' in applied) return { stderr: `${applied.error}\n`, code: 1 };
    const stdout = fromLines(applied.lines);
    const patch = { cluster: applied.cluster };
    if (applied.failures.length > 0) return { stdout, stderr: fromLines(applied.failures), code: 1, patch };
    return { stdout, patch };
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

  logs: ({ cluster, namespace, operands, values, flags }) => {
    const selector = values.get('l');
    const target = operands[0];
    // -l: 札の合う Pod のログを、名前の順に全て並べる。--prefix で行の頭に [pod/名前/コンテナ] を付ける（本物と同じ）
    if (target === undefined && selector !== undefined) {
      const pods = (listOf(cluster, 'pods', namespace) as Pod[])
        .filter((p) => matchesSelector(p.metadata.labels, selector))
        .sort((a, b) => (a.metadata.name < b.metadata.name ? -1 : 1));
      if (pods.length === 0) return { stdout: `No resources found in ${namespace} namespace.\n` };
      let stdout = '';
      let stderr = '';
      for (const pod of pods) {
        const got = podLogs(cluster, pod);
        if ('stderr' in got) {
          stderr += got.stderr;
          continue;
        }
        const head = flags.has('prefix') ? `[pod/${pod.metadata.name}/${pod.spec.containers[0]?.name ?? ''}] ` : '';
        stdout += fromLines(got.lines.map((l) => `${head}${l}`));
      }
      return stderr === '' ? { stdout } : { stdout, stderr, code: 1 };
    }
    const pod = target === undefined ? undefined : podFor(cluster, namespace, target);
    if (pod === undefined || target === undefined) return notFound('pods', target ?? '');
    const got = podLogs(cluster, pod);
    return 'stderr' in got ? { stderr: got.stderr, code: 1 } : { stdout: fromLines(got.lines) };
  },

  exec: ({ cluster, namespace, operands, rest }) => {
    const target = operands[0];
    const pod = target === undefined ? undefined : podFor(cluster, namespace, target);
    if (pod === undefined || target === undefined) return notFound('pods', target ?? '');
    const name = pod.metadata.name;
    // 本物の断り方: 置き場所（Node）が決まっていない・終わった・コンテナがまだ動いていない
    if (pod.status.nodeName === null) return { stderr: `Error from server (BadRequest): pod ${name} does not have a host assigned\n`, code: 1 };
    if (pod.status.phase === 'Succeeded' || pod.status.phase === 'Failed') {
      return { stderr: `error: cannot exec into a container in a completed pod; current phase is ${pod.status.phase}\n`, code: 1 };
    }
    const first = pod.status.containerStatuses[0];
    // 動いていて受け付けの確かめ（readiness）だけが通らない（NotReady）コンテナには、本物と同じく入れる
    if (first?.started !== true || (first.waitingReason !== null && first.waitingReason !== 'NotReady')) {
      return { stderr: `error: unable to upgrade connection: container not found ("${pod.spec.containers[0]?.name ?? ''}")\n`, code: 1 };
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
        const out = fromLines(found.map((n) => env[n] ?? ''));
        return found.length === names.length ? { stdout: out } : { stdout: out, stderr: 'command terminated with exit code 1\n', code: 1 };
      }
      return { stdout: fromLines(Object.entries(env).map(([k, v]) => `${k}=${v}`)) };
    }
    if (command[0] === 'psql' && spec !== undefined) return psqlIn(cluster, pod, command.slice(1));
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
