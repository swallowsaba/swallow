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
  /** コンテナ起動から何 tick 後に成功するようになるか。null なら失敗し続ける（httpGet の確かめでは使わない） */
  succeedsAfter: number | null;
  /** 本物の確かめ（その道とポートに HTTP で頼み、200〜399 なら通る）。置き場のイメージのアプリの振る舞いで決まる（src/engines/k8s/probes.ts） */
  httpGet?: { path: string; port: number };
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
  /** イメージを取りに行って失敗した回数（本物と同じく、再起動の回数には数えない） */
  pulls?: number;
  /** コンテナを動かした時に引いた環境変数（後から ConfigMap を変えても、作り直すまで変わらない） */
  env?: Record<string, string>;
  /** コンテナの書き込みの層に書いた物（中の絶対パス → 中身）。Pod を作り直すと消える */
  files?: Record<string, string>;
  /** DB のイメージが、データを書く場所が空の状態で動き出した（最初の表を作った） */
  fresh?: boolean;
  /** 今のプロセスが動き出した tick（アプリが待ち受けるまでの時間を数える。src/engines/k8s/probes.ts） */
  runningSince?: number;
  /** 最後に作り直した tick（RESTARTS の「(5s ago)」） */
  lastRestartAt?: number;
  /** プロセスが止められている（kill -STOP 1）。頼みに答えない */
  frozen?: boolean;
  /** 続けて失敗した確かめの数（liveness・readiness） */
  liveFails?: number;
  readyFails?: number;
  /** アプリが待ち受ける前に Ready だった（頼みが送られた）tick の数 */
  early?: number;
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
    /** kubeadm init で立てたか、join で足したか */
    role: 'control-plane' | 'worker';
    taints: { key: string; value: string; effect: string }[];
    unschedulable: boolean;
  };
  status: {
    allocatable: ResourceQuantity;
    /**
     * kubelet が状態を報告できているか。
     * Ready かどうかはこれと CNI の有無から導く（`bootstrap.nodeCondition`）。
     * 保持するのは「機械が生きているか」だけにして、
     * 条件そのものは状態から毎回計算する。
     */
    kubeletHealthy: boolean;
    version: string;
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
      /** 作る Pod に付けるボリューム（PVC・ConfigMap など）。書かなければ無い */
      volumes?: PodVolume[];
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

import type { ControlPlane, Machine } from './bootstrap';
import type {
  ConfigMap, CronJob, DaemonSet, HorizontalPodAutoscaler, Ingress, Job, NetworkPolicy,
  PersistentVolume, PersistentVolumeClaim, Role, RoleBinding, Secret, ServiceAccount,
  StatefulSet, StorageClass,
} from './resources';

export type * from './resources';
export type { ControlPlane, Machine } from './bootstrap';

export type Resource =
  | Pod | Node | Deployment | ReplicaSet | Service
  | ConfigMap | Secret | StorageClass | PersistentVolume | PersistentVolumeClaim
  | StatefulSet | DaemonSet | Job | CronJob
  | Ingress | NetworkPolicy | ServiceAccount | Role | RoleBinding
  | HorizontalPodAutoscaler;

export interface ClusterState {
  /** tick 数。実時間は見ない */
  readonly tick: number;
  /** まだ Kubernetes が入っていない計算機。kubeadm で Node になる */
  readonly machines: ReadonlyMap<string, Machine>;
  readonly controlPlane: ControlPlane;
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
  /** 窓口（API サーバ）の住所。あれば kubectl は接続先の設定（kubeconfig）を読んで、ここへ頼む */
  readonly server?: string;
  /** 置き場から取れるイメージ（名前:タグ）。あれば、これに無いイメージは取れない（ErrImagePull） */
  readonly images?: readonly string[];
  /** 区画（Namespace）の一覧。あれば、無い区画には作れない */
  readonly namespaces?: readonly { name: string; createdAt: number }[];
  /** 入口の係（ingress-nginx）。受け持つ種類（IngressClass）と、外から届く住所 */
  readonly ingressController?: { className: string; address: string };
}

export function key(namespace: string, name: string): string {
  return `${namespace}/${name}`;
}
