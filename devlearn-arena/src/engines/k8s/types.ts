/** Kubernetes の資源。実物と同じく apiVersion/kind/metadata/spec/status を持つ */
export interface ObjectMeta {
  name: string;
  namespace: string;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  /** 楽観ロック用。更新のたびに増える */
  resourceVersion: number;
  /** 作成された tick */
  createdAt: number;
  ownerReferences: { kind: string; name: string }[];
}

export interface ResourceQuantity {
  cpu: number;
  memory: number;
}

export interface ContainerSpec {
  name: string;
  image: string;
  requests: ResourceQuantity;
  limits: ResourceQuantity | null;
  env: Record<string, string>;
  /** 起動してから Ready になるまでの tick 数 */
  readyAfter: number;
  /** 起動に失敗する設定（イメージが無い等） */
  failing: boolean;
  ports: number[];
}

export type PodPhase = 'Pending' | 'ContainerCreating' | 'Running' | 'Succeeded' | 'Failed';

export interface ContainerStatus {
  name: string;
  ready: boolean;
  restartCount: number;
  /** 待機理由。CrashLoopBackOff / ImagePullBackOff など */
  waitingReason: string | null;
  /** 次に再起動を試みる tick */
  restartAt: number | null;
}

export interface Pod {
  kind: 'Pod';
  metadata: ObjectMeta;
  spec: {
    containers: ContainerSpec[];
    nodeSelector: Record<string, string>;
    tolerations: { key: string; effect: string }[];
    restartPolicy: 'Always' | 'OnFailure' | 'Never';
    terminationGracePeriodSeconds: number;
  };
  status: {
    phase: PodPhase;
    nodeName: string | null;
    podIP: string | null;
    containerStatuses: ContainerStatus[];
    /** 配置できない理由 */
    message: string | null;
    startedAt: number | null;
  };
}

export interface Node {
  kind: 'Node';
  metadata: ObjectMeta;
  spec: {
    taints: { key: string; value: string; effect: string }[];
    unschedulable: boolean;
  };
  status: {
    allocatable: ResourceQuantity;
    ready: boolean;
  };
}

export interface Deployment {
  kind: 'Deployment';
  metadata: ObjectMeta;
  spec: {
    replicas: number;
    selector: Record<string, string>;
    template: {
      labels: Record<string, string>;
      containers: ContainerSpec[];
      nodeSelector: Record<string, string>;
    };
    strategy: { maxSurge: number; maxUnavailable: number };
  };
  status: {
    replicas: number;
    readyReplicas: number;
    updatedReplicas: number;
  };
}

export interface ReplicaSet {
  kind: 'ReplicaSet';
  metadata: ObjectMeta;
  spec: {
    replicas: number;
    selector: Record<string, string>;
    template: Deployment['spec']['template'];
  };
  status: { replicas: number; readyReplicas: number };
}

export interface Service {
  kind: 'Service';
  metadata: ObjectMeta;
  spec: {
    type: 'ClusterIP' | 'NodePort' | 'LoadBalancer';
    selector: Record<string, string>;
    ports: { port: number; targetPort: number; nodePort: number | null }[];
    clusterIP: string;
  };
  status: { endpoints: string[] };
}

export interface EventRecord {
  tick: number;
  type: 'Normal' | 'Warning';
  reason: string;
  object: string;
  message: string;
}

export type Resource = Pod | Node | Deployment | ReplicaSet | Service;

export interface ClusterState {
  /** tick 数。実時間は見ない */
  readonly tick: number;
  readonly nodes: ReadonlyMap<string, Node>;
  readonly pods: ReadonlyMap<string, Pod>;
  readonly deployments: ReadonlyMap<string, Deployment>;
  readonly replicaSets: ReadonlyMap<string, ReplicaSet>;
  readonly services: ReadonlyMap<string, Service>;
  readonly events: readonly EventRecord[];
  /** IP 払い出しの連番。乱数を使わない */
  readonly ipCounter: number;
  readonly nameCounter: number;
}

export function key(namespace: string, name: string): string {
  return `${namespace}/${name}`;
}
