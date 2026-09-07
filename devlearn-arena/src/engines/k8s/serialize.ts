import type {
  ClusterState, ConfigMap, CronJob, DaemonSet, Deployment, EventRecord,
  HorizontalPodAutoscaler, Ingress, Job, NetworkPolicy, Node, PersistentVolume,
  PersistentVolumeClaim, Pod, ReplicaSet, Role, RoleBinding, Secret, Service, ServiceAccount,
  StatefulSet, StorageClass,
} from './types';

/**
 * クラスタの状態を、保存できる素のデータに落とす。
 * 中身は全て素のオブジェクトなので、Map を配列に開くだけでよい。
 */
export interface ClusterSnapshot {
  tick: number;
  nodes: [string, Node][];
  pods: [string, Pod][];
  deployments: [string, Deployment][];
  replicaSets: [string, ReplicaSet][];
  services: [string, Service][];
  configMaps: [string, ConfigMap][];
  secrets: [string, Secret][];
  storageClasses: [string, StorageClass][];
  persistentVolumes: [string, PersistentVolume][];
  persistentVolumeClaims: [string, PersistentVolumeClaim][];
  statefulSets: [string, StatefulSet][];
  daemonSets: [string, DaemonSet][];
  jobs: [string, Job][];
  cronJobs: [string, CronJob][];
  ingresses: [string, Ingress][];
  networkPolicies: [string, NetworkPolicy][];
  serviceAccounts: [string, ServiceAccount][];
  roles: [string, Role][];
  roleBindings: [string, RoleBinding][];
  autoscalers: [string, HorizontalPodAutoscaler][];
  load: [string, number][];
  currentUser: ClusterState['currentUser'];
  events: EventRecord[];
  ipCounter: number;
  nameCounter: number;
}

export function snapshotCluster(cluster: ClusterState): ClusterSnapshot {
  return {
    tick: cluster.tick,
    nodes: [...cluster.nodes.entries()],
    pods: [...cluster.pods.entries()],
    deployments: [...cluster.deployments.entries()],
    replicaSets: [...cluster.replicaSets.entries()],
    services: [...cluster.services.entries()],
    configMaps: [...cluster.configMaps.entries()],
    secrets: [...cluster.secrets.entries()],
    storageClasses: [...cluster.storageClasses.entries()],
    persistentVolumes: [...cluster.persistentVolumes.entries()],
    persistentVolumeClaims: [...cluster.persistentVolumeClaims.entries()],
    statefulSets: [...cluster.statefulSets.entries()],
    daemonSets: [...cluster.daemonSets.entries()],
    jobs: [...cluster.jobs.entries()],
    cronJobs: [...cluster.cronJobs.entries()],
    ingresses: [...cluster.ingresses.entries()],
    networkPolicies: [...cluster.networkPolicies.entries()],
    serviceAccounts: [...cluster.serviceAccounts.entries()],
    roles: [...cluster.roles.entries()],
    roleBindings: [...cluster.roleBindings.entries()],
    autoscalers: [...cluster.autoscalers.entries()],
    load: [...cluster.load.entries()],
    currentUser: cluster.currentUser,
    events: [...cluster.events],
    ipCounter: cluster.ipCounter,
    nameCounter: cluster.nameCounter,
  };
}

export function restoreCluster(snapshot: ClusterSnapshot): ClusterState {
  return {
    tick: snapshot.tick,
    nodes: new Map(snapshot.nodes),
    pods: new Map(snapshot.pods),
    deployments: new Map(snapshot.deployments),
    replicaSets: new Map(snapshot.replicaSets),
    services: new Map(snapshot.services),
    configMaps: new Map(snapshot.configMaps),
    secrets: new Map(snapshot.secrets),
    storageClasses: new Map(snapshot.storageClasses),
    persistentVolumes: new Map(snapshot.persistentVolumes),
    persistentVolumeClaims: new Map(snapshot.persistentVolumeClaims),
    statefulSets: new Map(snapshot.statefulSets),
    daemonSets: new Map(snapshot.daemonSets),
    jobs: new Map(snapshot.jobs),
    cronJobs: new Map(snapshot.cronJobs),
    ingresses: new Map(snapshot.ingresses),
    networkPolicies: new Map(snapshot.networkPolicies),
    serviceAccounts: new Map(snapshot.serviceAccounts),
    roles: new Map(snapshot.roles),
    roleBindings: new Map(snapshot.roleBindings),
    autoscalers: new Map(snapshot.autoscalers),
    load: new Map(snapshot.load),
    currentUser: snapshot.currentUser,
    events: snapshot.events,
    ipCounter: snapshot.ipCounter,
    nameCounter: snapshot.nameCounter,
  };
}
