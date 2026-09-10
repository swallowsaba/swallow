import { container, deployment, service } from '@/engines/k8s/factory';
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
    return { stderr: 'error: --image が要ります\n', code: 1 };
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
