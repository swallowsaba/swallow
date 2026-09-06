import type {
  ClusterState, ContainerSpec, Deployment, Node, ObjectMeta, Pod, ResourceQuantity, Service,
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
    readyAfter: options.readyAfter ?? 2,
    // 存在しないイメージ名は取得に失敗する、という約束にする
    failing: options.failing ?? image.includes('does-not-exist'),
    ports: options.ports ?? [80],
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
      tolerations: [],
      restartPolicy: 'Always',
      terminationGracePeriodSeconds: 30,
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
    events: [],
    ipCounter: 0,
    nameCounter: 0,
  };
}
