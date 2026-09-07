import type {
  ClusterState, ContainerSpec, Deployment, Node, ObjectMeta, Pod, PodVolume, Probe,
  ResourceQuantity, Service,
} from './types';

export function meta(
  name: string,
  options: Partial<ObjectMeta> = {},
): ObjectMeta {
  return {
    name,
    namespace: options.namespace ?? 'default',
    labels: options.labels ?? {},
    annotations: options.annotations ?? {},
    resourceVersion: options.resourceVersion ?? 1,
    createdAt: options.createdAt ?? 0,
    ownerReferences: options.ownerReferences ?? [],
  };
}

export function quantity(cpu: number, memory: number): ResourceQuantity {
  return { cpu, memory };
}

export function container(name: string, image: string, options: Partial<ContainerSpec> = {}): ContainerSpec {
  return {
    name,
    image,
    requests: options.requests ?? quantity(100, 128),
    limits: options.limits ?? null,
    env: options.env ?? {},
    envFrom: options.envFrom ?? [],
    readyAfter: options.readyAfter ?? 2,
    // 存在しないイメージ名は取得に失敗する、という約束にする
    failing: options.failing ?? image.includes('does-not-exist'),
    // 名前に crash を含むイメージは起動後に落ち続ける、という約束にする
    crashing: options.crashing ?? image.includes('crash'),
    ports: options.ports ?? [80],
    livenessProbe: options.livenessProbe ?? null,
    readinessProbe: options.readinessProbe ?? null,
    startupProbe: options.startupProbe ?? null,
    volumeMounts: options.volumeMounts ?? [],
  };
}

/** プローブのひな型。succeedsAfter が null なら通らない設定 */
export function probe(options: Partial<Probe> = {}): Probe {
  return {
    initialDelaySeconds: options.initialDelaySeconds ?? 0,
    periodSeconds: options.periodSeconds ?? 1,
    failureThreshold: options.failureThreshold ?? 3,
    succeedsAfter: options.succeedsAfter === undefined ? 1 : options.succeedsAfter,
  };
}

export function node(name: string, cpu: number, memory: number, labels: Record<string, string> = {}): Node {
  return {
    kind: 'Node',
    metadata: meta(name, { namespace: '', labels: { 'kubernetes.io/hostname': name, ...labels } }),
    spec: { taints: [], unschedulable: false },
    status: { allocatable: quantity(cpu, memory), ready: true },
  };
}

export function pod(name: string, containers: ContainerSpec[], options: {
  namespace?: string;
  labels?: Record<string, string>;
  nodeSelector?: Record<string, string>;
  owner?: { kind: string; name: string };
  createdAt?: number;
  volumes?: PodVolume[];
  serviceAccountName?: string;
  tolerations?: { key: string; effect: string }[];
} = {}): Pod {
  return {
    kind: 'Pod',
    metadata: meta(name, {
      namespace: options.namespace ?? 'default',
      labels: options.labels ?? {},
      ownerReferences: options.owner ? [options.owner] : [],
      createdAt: options.createdAt ?? 0,
    }),
    spec: {
      containers,
      nodeSelector: options.nodeSelector ?? {},
      tolerations: options.tolerations ?? [],
      restartPolicy: 'Always',
      terminationGracePeriodSeconds: 30,
      volumes: options.volumes ?? [],
      serviceAccountName: options.serviceAccountName ?? 'default',
    },
    status: {
      phase: 'Pending',
      nodeName: null,
      podIP: null,
      containerStatuses: containers.map((c) => ({
        name: c.name,
        ready: false,
        restartCount: 0,
        waitingReason: null,
        restartAt: null,
        started: false,
      })),
      message: null,
      startedAt: null,
    },
  };
}

export function deployment(
  name: string,
  replicas: number,
  containers: ContainerSpec[],
  options: { namespace?: string; labels?: Record<string, string>; maxSurge?: number; maxUnavailable?: number } = {},
): Deployment {
  const labels = options.labels ?? { app: name };
  return {
    kind: 'Deployment',
    metadata: meta(name, { namespace: options.namespace ?? 'default', labels }),
    spec: {
      replicas,
      selector: labels,
      template: { labels, containers, nodeSelector: {} },
      strategy: { maxSurge: options.maxSurge ?? 1, maxUnavailable: options.maxUnavailable ?? 1 },
    },
    status: { replicas: 0, readyReplicas: 0, updatedReplicas: 0 },
  };
}

export function service(
  name: string,
  selector: Record<string, string>,
  options: { namespace?: string; port?: number; targetPort?: number; type?: Service['spec']['type'] } = {},
): Service {
  return {
    kind: 'Service',
    metadata: meta(name, { namespace: options.namespace ?? 'default' }),
    spec: {
      type: options.type ?? 'ClusterIP',
      selector,
      ports: [{ port: options.port ?? 80, targetPort: options.targetPort ?? 80, nodePort: null }],
      clusterIP: '10.96.0.1',
    },
    status: { endpoints: [] },
  };
}

export function emptyCluster(nodes: Node[] = []): ClusterState {
  return {
    tick: 0,
    nodes: new Map(nodes.map((n) => [n.metadata.name, n])),
    pods: new Map(),
    deployments: new Map(),
    replicaSets: new Map(),
    services: new Map(),
    configMaps: new Map(),
    secrets: new Map(),
    storageClasses: new Map(),
    persistentVolumes: new Map(),
    persistentVolumeClaims: new Map(),
    statefulSets: new Map(),
    daemonSets: new Map(),
    jobs: new Map(),
    cronJobs: new Map(),
    ingresses: new Map(),
    networkPolicies: new Map(),
    serviceAccounts: new Map(),
    roles: new Map(),
    roleBindings: new Map(),
    autoscalers: new Map(),
    load: new Map(),
    currentUser: { kind: 'User', name: 'learner', namespace: 'default' },
    events: [],
    ipCounter: 0,
    nameCounter: 0,
  };
}
