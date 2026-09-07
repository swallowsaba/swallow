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

/**
 * プローブ。
 * 「いつ成功するようになるか」を tick で持たせ、そこから状態を導く。
 * succeedsAfter が null なら永遠に失敗する（設定ミスの再現）。
 */
export interface Probe {
  initialDelaySeconds: number;
  periodSeconds: number;
  failureThreshold: number;
  /** コンテナ起動から何 tick 後に成功するようになるか。null なら失敗し続ける */
  succeedsAfter: number | null;
}

export interface EnvFromRef {
  kind: 'ConfigMap' | 'Secret';
  name: string;
  /** 特定のキーだけを取り込む場合 */
  key?: string;
  /** key を指定したときの環境変数名 */
  as?: string;
}

export interface VolumeMount {
  name: string;
  mountPath: string;
}

export interface ContainerSpec {
  name: string;
  image: string;
  requests: ResourceQuantity;
  limits: ResourceQuantity | null;
  env: Record<string, string>;
  /** ConfigMap / Secret から環境変数を取り込む指定 */
  envFrom: EnvFromRef[];
  /** 起動してから Ready になるまでの tick 数 */
  readyAfter: number;
  /** 起動に失敗する設定（イメージが無い等） */
  failing: boolean;
  /** 起動はするがすぐ落ちる。CrashLoopBackOff の再現 */
  crashing: boolean;
  ports: number[];
  livenessProbe: Probe | null;
  readinessProbe: Probe | null;
  startupProbe: Probe | null;
  volumeMounts: VolumeMount[];
}

/** Pod が要求するボリューム。今は ConfigMap / Secret / PVC の3種 */
export type PodVolume =
  | { name: string; kind: 'configMap'; configMap: string }
  | { name: string; kind: 'secret'; secret: string }
  | { name: string; kind: 'persistentVolumeClaim'; claimName: string }
  | { name: string; kind: 'emptyDir' };

export type PodPhase = 'Pending' | 'ContainerCreating' | 'Running' | 'Succeeded' | 'Failed';

export interface ContainerStatus {
  name: string;
  ready: boolean;
  restartCount: number;
  /** 待機理由。CrashLoopBackOff / ImagePullBackOff など */
  waitingReason: string | null;
  /** 次に再起動を試みる tick */
  restartAt: number | null;
  /** startupProbe が通ったか。通るまで liveness / readiness は評価しない */
  started: boolean;
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
    volumes: PodVolume[];
    serviceAccountName: string;
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


/* ---- 設定と機密 ---- */

export interface ConfigMap {
  kind: 'ConfigMap';
  metadata: ObjectMeta;
  data: Record<string, string>;
  immutable: boolean;
}

export interface Secret {
  kind: 'Secret';
  metadata: ObjectMeta;
  /** 値は base64。暗号化ではなく符号化にすぎないことを見せるため、そのまま持つ */
  data: Record<string, string>;
  type: string;
}

/* ---- ストレージ ---- */

export type ReclaimPolicy = 'Retain' | 'Delete' | 'Recycle';
export type AccessMode = 'ReadWriteOnce' | 'ReadOnlyMany' | 'ReadWriteMany';

export interface StorageClass {
  kind: 'StorageClass';
  metadata: ObjectMeta;
  provisioner: string;
  reclaimPolicy: ReclaimPolicy;
  /** 即時に作るか、Pod が要求するまで待つか */
  volumeBindingMode: 'Immediate' | 'WaitForFirstConsumer';
  /** この StorageClass から自動で作れるか。false なら手で PV を用意する必要がある */
  dynamic: boolean;
}

export interface PersistentVolume {
  kind: 'PersistentVolume';
  metadata: ObjectMeta;
  spec: {
    capacityGi: number;
    accessModes: AccessMode[];
    storageClassName: string;
    reclaimPolicy: ReclaimPolicy;
    /** ノードに固定されている場合（hostPath など） */
    nodeName: string | null;
  };
  status: {
    phase: 'Available' | 'Bound' | 'Released' | 'Failed';
    /** 束ねられている PVC の id（namespace/name） */
    claim: string | null;
  };
}

export interface PersistentVolumeClaim {
  kind: 'PersistentVolumeClaim';
  metadata: ObjectMeta;
  spec: {
    requestGi: number;
    accessModes: AccessMode[];
    storageClassName: string;
  };
  status: {
    phase: 'Pending' | 'Bound' | 'Lost';
    volumeName: string | null;
    /** 束ねられない理由 */
    message: string | null;
  };
}

/* ---- ワークロード ---- */

export type PodTemplate = Deployment['spec']['template'];

export interface StatefulSet {
  kind: 'StatefulSet';
  metadata: ObjectMeta;
  spec: {
    replicas: number;
    selector: Record<string, string>;
    serviceName: string;
    template: PodTemplate;
    /** 各 Pod に付ける PVC のひな型 */
    volumeClaimTemplates: { name: string; requestGi: number; storageClassName: string }[];
  };
  status: { replicas: number; readyReplicas: number };
}

export interface DaemonSet {
  kind: 'DaemonSet';
  metadata: ObjectMeta;
  spec: {
    selector: Record<string, string>;
    template: PodTemplate;
    /** どのノードに置くか。空なら全ノード */
    nodeSelector: Record<string, string>;
  };
  status: { desiredNumberScheduled: number; numberReady: number };
}

export interface Job {
  kind: 'Job';
  metadata: ObjectMeta;
  spec: {
    completions: number;
    parallelism: number;
    backoffLimit: number;
    template: PodTemplate;
  };
  status: {
    active: number;
    succeeded: number;
    failed: number;
    /** 何 tick で終わるか。Pod の readyAfter から決まる */
    completed: boolean;
  };
}

export interface CronJob {
  kind: 'CronJob';
  metadata: ObjectMeta;
  spec: {
    /** 何 tick ごとに走らせるか。cron 式の代わりに周期で持つ */
    everyTicks: number;
    suspend: boolean;
    jobTemplate: Job['spec'];
    concurrencyPolicy: 'Allow' | 'Forbid' | 'Replace';
  };
  status: { lastScheduleTick: number | null; createdCount: number };
}

/* ---- ネットワークと権限 ---- */

export interface Ingress {
  kind: 'Ingress';
  metadata: ObjectMeta;
  spec: {
    className: string;
    rules: { host: string; path: string; serviceName: string; servicePort: number }[];
  };
  status: { address: string | null };
}

export interface NetworkPolicy {
  kind: 'NetworkPolicy';
  metadata: ObjectMeta;
  spec: {
    /** このポリシーが掛かる Pod */
    podSelector: Record<string, string>;
    policyTypes: ('Ingress' | 'Egress')[];
    /** 許可する送信元。ラベルで指定する */
    ingressFrom: { podSelector: Record<string, string>; ports: number[] }[];
    egressTo: { podSelector: Record<string, string>; ports: number[] }[];
  };
}

export interface ServiceAccount {
  kind: 'ServiceAccount';
  metadata: ObjectMeta;
}

export interface PolicyRule {
  apiGroups: string[];
  resources: string[];
  verbs: string[];
}

export interface Role {
  kind: 'Role' | 'ClusterRole';
  metadata: ObjectMeta;
  rules: PolicyRule[];
}

export interface RoleBinding {
  kind: 'RoleBinding' | 'ClusterRoleBinding';
  metadata: ObjectMeta;
  roleRef: { kind: 'Role' | 'ClusterRole'; name: string };
  subjects: { kind: 'ServiceAccount' | 'User' | 'Group'; name: string; namespace: string }[];
}

/* ---- オートスケール ---- */

export interface HorizontalPodAutoscaler {
  kind: 'HorizontalPodAutoscaler';
  metadata: ObjectMeta;
  spec: {
    targetKind: 'Deployment';
    targetName: string;
    minReplicas: number;
    maxReplicas: number;
    targetCpuPercent: number;
  };
  status: {
    /** 観測した平均 CPU 使用率(%)。負荷は load コマンドで与える */
    currentCpuPercent: number;
    desiredReplicas: number;
  };
}

export type Resource =
  | Pod | Node | Deployment | ReplicaSet | Service
  | ConfigMap | Secret | StorageClass | PersistentVolume | PersistentVolumeClaim
  | StatefulSet | DaemonSet | Job | CronJob
  | Ingress | NetworkPolicy | ServiceAccount | Role | RoleBinding
  | HorizontalPodAutoscaler;

export interface ClusterState {
  /** tick 数。実時間は見ない */
  readonly tick: number;
  readonly nodes: ReadonlyMap<string, Node>;
  readonly pods: ReadonlyMap<string, Pod>;
  readonly deployments: ReadonlyMap<string, Deployment>;
  readonly replicaSets: ReadonlyMap<string, ReplicaSet>;
  readonly services: ReadonlyMap<string, Service>;
  readonly configMaps: ReadonlyMap<string, ConfigMap>;
  readonly secrets: ReadonlyMap<string, Secret>;
  readonly storageClasses: ReadonlyMap<string, StorageClass>;
  readonly persistentVolumes: ReadonlyMap<string, PersistentVolume>;
  readonly persistentVolumeClaims: ReadonlyMap<string, PersistentVolumeClaim>;
  readonly statefulSets: ReadonlyMap<string, StatefulSet>;
  readonly daemonSets: ReadonlyMap<string, DaemonSet>;
  readonly jobs: ReadonlyMap<string, Job>;
  readonly cronJobs: ReadonlyMap<string, CronJob>;
  readonly ingresses: ReadonlyMap<string, Ingress>;
  readonly networkPolicies: ReadonlyMap<string, NetworkPolicy>;
  readonly serviceAccounts: ReadonlyMap<string, ServiceAccount>;
  readonly roles: ReadonlyMap<string, Role>;
  readonly roleBindings: ReadonlyMap<string, RoleBinding>;
  readonly autoscalers: ReadonlyMap<string, HorizontalPodAutoscaler>;
  /** Deployment ごとの負荷(%)。HPA の入力。load コマンドで与える */
  readonly load: ReadonlyMap<string, number>;
  /** いま操作している主体。kubectl auth can-i の判定に使う */
  readonly currentUser: { kind: 'ServiceAccount' | 'User'; name: string; namespace: string };
  readonly events: readonly EventRecord[];
  /** IP 払い出しの連番。乱数を使わない */
  readonly ipCounter: number;
  readonly nameCounter: number;
}

export function key(namespace: string, name: string): string {
  return `${namespace}/${name}`;
}
