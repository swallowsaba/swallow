import type { ClusterState, Deployment, EventRecord, Node, Pod, ReplicaSet, Service } from './types';

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
    events: snapshot.events,
    ipCounter: snapshot.ipCounter,
    nameCounter: snapshot.nameCounter,
  };
}
