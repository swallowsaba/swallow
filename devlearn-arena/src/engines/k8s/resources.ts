import type { Deployment, ObjectMeta } from './types';

/**
 * Pod / Node / Deployment 以外の資源。
 * どれも apiVersion/kind/metadata/spec/status という同じ形をしている。
 */
export type PodTemplate = Deployment['spec']['template'];

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
