import { container, deployment, pod, service } from '@/engines/k8s/factory';
import type { ClusterState, ConfigMap, Secret, ServiceAccount } from '@/engines/k8s/types';
import { key } from '@/engines/k8s/types';
import type { CommandResult } from '../registry';
import type { KubectlHandler } from './kubectlShared';

function meta(name: string, namespace: string, tick: number) {
  return {
    name,
    namespace,
    labels: {},
    annotations: {},
    resourceVersion: 1,
    createdAt: tick,
    ownerReferences: [],
  };
}

function exists(cluster: ClusterState, plural: keyof ClusterState, id: string): boolean {
  const collection = cluster[plural];
  return collection instanceof Map && collection.has(id);
}

function alreadyThere(kind: string, name: string): CommandResult {
  return {
    stderr: `Error from server (AlreadyExists): ${kind} "${name}" already exists\n`,
    code: 1,
  };
}

/** `--from-literal=k=v` を並べて読む */
function literals(rest: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const arg of rest) {
    const match = /^--from-literal=([^=]+)=(.*)$/.exec(arg);
    if (match?.[1] !== undefined) out[match[1]] = match[2] ?? '';
  }
  return out;
}

function createDeployment(ctx: Parameters<KubectlHandler>[0]): CommandResult {
  const { cluster, namespace, operands, values } = ctx;
  const name = operands[1];
  const image = values.get('image');
  if (name === undefined || image === undefined) {
    return { stderr: 'error: required flag(s) "image" not set\n', code: 1 };
  }
  const id = key(namespace, name);
  if (exists(cluster, 'deployments', id)) return alreadyThere('deployments.apps', name);
  const replicas = Number(values.get('replicas') ?? '1');
  if (!Number.isInteger(replicas) || replicas < 0) {
    return { stderr: `error: invalid replicas: ${values.get('replicas') ?? ''}\n`, code: 1 };
  }
  const made = deployment(name, replicas, [container(name, image)], { namespace });
  return {
    stdout: `deployment.apps/${name} created\n`,
    patch: {
      cluster: {
        ...cluster,
        deployments: new Map([...cluster.deployments, [id, { ...made, metadata: { ...made.metadata, createdAt: cluster.tick } }]]),
      },
    },
  };
}

function createService(ctx: Parameters<KubectlHandler>[0]): CommandResult {
  const { cluster, namespace, operands, values } = ctx;
  // `create service nodeport <名前>` のように、種類が挟まることがある
  const type = operands.length >= 3 ? (operands[1] ?? '') : '';
  const name = operands.length >= 3 ? operands[2] : operands[1];
  if (name === undefined) return { stderr: 'error: 名前が要ります\n', code: 1 };
  const id = key(namespace, name);
  if (exists(cluster, 'services', id)) return alreadyThere('services', name);
  const port = Number(values.get('tcp')?.split(':')[0] ?? '80');
  const kind =
    type === 'nodeport' ? 'NodePort' : type === 'loadbalancer' ? 'LoadBalancer' : 'ClusterIP';
  const made = service(name, { app: name }, { namespace, port, type: kind });
  return {
    stdout: `service/${name} created\n`,
    patch: { cluster: { ...cluster, services: new Map([...cluster.services, [id, made]]) } },
  };
}

function createConfigMap(ctx: Parameters<KubectlHandler>[0]): CommandResult {
  const { cluster, namespace, operands, rest } = ctx;
  const name = operands[1];
  if (name === undefined) return { stderr: 'error: 名前が要ります\n', code: 1 };
  const id = key(namespace, name);
  if (exists(cluster, 'configMaps', id)) return alreadyThere('configmaps', name);
  const made: ConfigMap = {
    kind: 'ConfigMap',
    metadata: meta(name, namespace, cluster.tick),
    data: literals(rest),
    immutable: false,
  };
  return {
    stdout: `configmap/${name} created\n`,
    patch: { cluster: { ...cluster, configMaps: new Map([...cluster.configMaps, [id, made]]) } },
  };
}

function createSecret(ctx: Parameters<KubectlHandler>[0]): CommandResult {
  const { cluster, namespace, operands, rest } = ctx;
  const name = operands[1];
  if (name === undefined) return { stderr: 'error: 名前が要ります\n', code: 1 };
  const id = key(namespace, name);
  if (exists(cluster, 'secrets', id)) return alreadyThere('secrets', name);
  // Secret は base64 で持つ。暗号化ではないことを、値の見え方で示す
  const data = Object.fromEntries(
    Object.entries(literals(rest)).map(([k, v]) => [k, btoa(v)]),
  );
  const made: Secret = {
    kind: 'Secret',
    metadata: meta(name, namespace, cluster.tick),
    type: 'Opaque',
    data,
  };
  return {
    stdout: `secret/${name} created\n`,
    patch: { cluster: { ...cluster, secrets: new Map([...cluster.secrets, [id, made]]) } },
  };
}

function createServiceAccount(ctx: Parameters<KubectlHandler>[0]): CommandResult {
  const { cluster, namespace, operands } = ctx;
  const name = operands[1];
  if (name === undefined) return { stderr: 'error: 名前が要ります\n', code: 1 };
  const id = key(namespace, name);
  if (exists(cluster, 'serviceAccounts', id)) return alreadyThere('serviceaccounts', name);
  const made: ServiceAccount = { kind: 'ServiceAccount', metadata: meta(name, namespace, cluster.tick) };
  return {
    stdout: `serviceaccount/${name} created\n`,
    patch: {
      cluster: { ...cluster, serviceAccounts: new Map([...cluster.serviceAccounts, [id, made]]) },
    },
  };
}

const MAKERS: Record<string, (ctx: Parameters<KubectlHandler>[0]) => CommandResult> = {
  deployment: createDeployment,
  deploy: createDeployment,
  service: createService,
  svc: createService,
  configmap: createConfigMap,
  cm: createConfigMap,
  secret: createSecret,
  serviceaccount: createServiceAccount,
  sa: createServiceAccount,
};

/**
 * 命令的に資源を作る。
 * apply（宣言的）との違いを体で覚えるために、両方を使えるようにしておく。
 */
export const create: KubectlHandler = (ctx) => {
  const what = ctx.operands[0] ?? '';
  // `create -f manifest.yaml` は apply と同じ扱いにする
  if (ctx.values.has('f')) {
    return { stderr: 'error: create -f は未対応です。apply -f を使ってください\n', code: 1 };
  }
  const maker = MAKERS[what];
  if (maker === undefined) {
    return { stderr: `error: unknown resource type "${what}" for "kubectl create"\n`, code: 1 };
  }
  return maker(ctx);
};

/** `--labels=a=b,c=d` を読む */
function labelsOf(text: string | undefined): Record<string, string> | null {
  if (text === undefined || text === '') return null;
  const out: Record<string, string> = {};
  for (const pair of text.split(',')) {
    const [k, v] = pair.split('=');
    if (k === undefined || k === '' || v === undefined) return null;
    out[k] = v;
  }
  return out;
}

/**
 * `kubectl run <名前> --image=<イメージ>`。Pod を1つだけ、持ち主なしで作る。
 * 持ち主（Deployment）がいないので、消せばそれっきりで作り直されない。
 */
export const run: KubectlHandler = (ctx) => {
  const { cluster, namespace, operands, values } = ctx;
  const name = operands[0];
  const image = values.get('image');
  if (name === undefined || image === undefined) {
    return { stderr: 'error: required flag(s) "image" not set\nusage: kubectl run <名前> --image=<イメージ>\n', code: 1 };
  }
  const id = key(namespace, name);
  if (cluster.pods.has(id)) return alreadyThere('pods', name);
  // 本物の kubectl run と同じく、run=<名前> のラベルを付ける
  const labels = labelsOf(values.get('labels')) ?? { run: name };
  const port = Number(values.get('port') ?? NaN);
  const made = pod(name, [container(name, image, Number.isFinite(port) ? { ports: [port] } : {})], {
    namespace,
    labels,
    createdAt: cluster.tick,
  });
  return {
    stdout: `pod/${name} created\n`,
    patch: { cluster: { ...cluster, pods: new Map([...cluster.pods, [id, made]]) } },
  };
};

/**
 * `kubectl expose deployment <名前> --port=80`。
 * 相手の Pod を選ぶセレクタを写して Service を作る。マニフェストを書かずに受付を立てられる。
 */
export const expose: KubectlHandler = (ctx) => {
  const { cluster, namespace, operands, values } = ctx;
  const first = operands[0] ?? '';
  const slash = first.indexOf('/');
  const kind = slash === -1 ? first : first.slice(0, slash);
  const target = slash === -1 ? operands[1] : first.slice(slash + 1);
  if (target === undefined || target === '') {
    return { stderr: 'usage: kubectl expose (deployment|pod) <名前> --port=<番号>\n', code: 1 };
  }
  let selector: Record<string, string> | null = null;
  if (['deployment', 'deployments', 'deploy'].includes(kind)) {
    const found = cluster.deployments.get(key(namespace, target));
    if (found === undefined) return { stderr: `Error from server (NotFound): deployments.apps "${target}" not found\n`, code: 1 };
    selector = { ...found.spec.selector };
  } else if (['pod', 'pods', 'po'].includes(kind)) {
    const found = cluster.pods.get(key(namespace, target));
    if (found === undefined) return { stderr: `Error from server (NotFound): pods "${target}" not found\n`, code: 1 };
    selector = { ...found.metadata.labels };
  } else {
    return { stderr: `error: cannot expose a ${kind}\n`, code: 1 };
  }
  if (Object.keys(selector).length === 0) {
    return { stderr: `error: couldn't retrieve selectors via --selector flag or introspection: ${kind} "${target}" has no labels\n`, code: 1 };
  }
  const port = Number(values.get('port') ?? NaN);
  if (!Number.isInteger(port) || port <= 0) {
    return { stderr: 'error: couldn\'t find port via --port flag or introspection\n', code: 1 };
  }
  const targetPort = Number(values.get('target-port') ?? port);
  const name = values.get('name') ?? target;
  const id = key(namespace, name);
  if (exists(cluster, 'services', id)) return alreadyThere('services', name);
  const typeFlag = (values.get('type') ?? 'ClusterIP').toLowerCase();
  const type = typeFlag === 'nodeport' ? 'NodePort' : typeFlag === 'loadbalancer' ? 'LoadBalancer' : 'ClusterIP';
  const made = service(name, selector, { namespace, port, targetPort, type });
  return {
    stdout: `service/${name} exposed\n`,
    patch: { cluster: { ...cluster, services: new Map([...cluster.services, [id, made]]) } },
  };
};
