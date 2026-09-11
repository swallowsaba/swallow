import { isReady } from '@/engines/k8s/kubelet';
import type { ClusterState, Pod } from '@/engines/k8s/types';

/**
 * クラスタの図に出すものを、状態から組み立てる。
 * 描画から切り離しておき、何が光るか・何と何が線で結ばれるかをテストで確かめられるようにする。
 */

/* ---------------- Pod の状態 ---------------- */

export type PodLook = 'Pending' | 'Creating' | 'Running' | 'BackOff' | 'Completed' | 'Failed';

/** Pod の見え方。色だけに頼らず、必ず文字でも出す */
export function podLook(pod: Pod): { look: PodLook; detail: string } {
  if (pod.status.phase === 'Succeeded') return { look: 'Completed', detail: 'Succeeded' };
  if (pod.status.phase === 'Failed') return { look: 'Failed', detail: 'Failed' };
  if (pod.status.nodeName === null) return { look: 'Pending', detail: pod.status.message ?? 'Pending' };
  const waiting = pod.status.containerStatuses.find((c) => c.waitingReason !== null)?.waitingReason;
  if (waiting != null && /BackOff$/.test(waiting)) return { look: 'BackOff', detail: waiting };
  if (isReady(pod)) return { look: 'Running', detail: 'Running' };
  return { look: 'Creating', detail: waiting ?? 'ContainerCreating' };
}

export const LOOK_COLOR: Record<PodLook, string> = {
  Pending: 'var(--cream-dark)',
  Creating: 'var(--warn)',
  Running: 'var(--ok)',
  BackOff: 'var(--bad)',
  Completed: 'var(--sky, #9cc9e6)',
  Failed: 'var(--bad)',
};

/* ---------------- コントロールプレーンのどの部品が動いたか ---------------- */

export type Component = 'apiserver' | 'scheduler' | 'controller' | 'etcd';

export const COMPONENTS: readonly Component[] = ['apiserver', 'scheduler', 'controller', 'etcd'];

/** 資源の「あるべき姿」の部分だけを並べた指紋。status の変化（現場の報告）とは分けて見る */
function desired(cluster: ClusterState): string {
  const specs = (map: ReadonlyMap<string, { metadata: { name: string; labels: Record<string, string> }; spec?: unknown }>) =>
    [...map.entries()].map(([id, r]) => `${id}:${JSON.stringify(r.metadata.labels)}:${JSON.stringify(r.spec ?? null)}`);
  return [
    ...specs(cluster.deployments),
    ...specs(cluster.services),
    ...specs(cluster.statefulSets),
    ...specs(cluster.daemonSets),
    ...specs(cluster.jobs),
    ...specs(cluster.cronJobs),
    ...specs(cluster.autoscalers),
    ...[...cluster.nodes.values()].map((n) => `${n.metadata.name}:${String(n.spec.unschedulable)}`),
    ...[...cluster.configMaps.keys()],
    ...[...cluster.secrets.keys()],
  ].join('|');
}

/** 誰かの持ち物として作られた・消された Pod があるか（見張り係の仕事） */
function ownedPodsChanged(prev: ClusterState, next: ClusterState): boolean {
  const owned = (c: ClusterState) =>
    new Set([...c.pods.values()].filter((p) => p.metadata.ownerReferences.length > 0).map((p) => p.metadata.name));
  const a = owned(prev);
  const b = owned(next);
  if (a.size !== b.size) return true;
  for (const name of a) if (!b.has(name)) return true;
  return prev.replicaSets.size !== next.replicaSets.size;
}

/**
 * 1つ前の状態からいまの状態までに、コントロールプレーンのどの部品が働いたか。
 * - 受付（apiserver）: 何かが書き換わったら必ず通る
 * - 記録帳（etcd）: あるべき姿や Pod の一覧が書き換わった
 * - 配置係（scheduler）: 置き場所の決まっていなかった Pod に、ノードが決まった
 * - 見張り係（controller）: 持ち主のいる Pod が増えた・減った（数を合わせた）
 */
export function activeComponents(prev: ClusterState | null | undefined, next: ClusterState | null): Set<Component> {
  const out = new Set<Component>();
  if (prev == null || next === null || prev === next) return out;
  const podsChanged =
    prev.pods.size !== next.pods.size || [...next.pods.keys()].some((id) => !prev.pods.has(id));
  if (desired(prev) !== desired(next) || podsChanged) out.add('etcd');
  const scheduled = [...next.pods.values()].some((p) => {
    const before = prev.pods.get(`${p.metadata.namespace}/${p.metadata.name}`);
    return p.status.nodeName !== null && (before === undefined || before.status.nodeName === null);
  });
  if (scheduled) out.add('scheduler');
  if (ownedPodsChanged(prev, next)) out.add('controller');
  if (out.size > 0) out.add('apiserver');
  return out;
}

/* ---------------- 持ち主の系図（Deployment → ReplicaSet → Pod）と Service ---------------- */

export interface GraphNode {
  id: string;
  kind: string;
  name: string;
  x: number;
  y: number;
  /** Pod のときだけ。色と文字で状態を出す */
  look?: PodLook;
}

export interface GraphEdge {
  from: string;
  to: string;
  /** own=持ち主、serve=Service が繋いでいる */
  type: 'own' | 'serve';
}

export const GRAPH = { colW: 170, rowH: 34, nodeW: 150, nodeH: 26, pad: 8 } as const;

const WORKLOADS = ['Deployment', 'StatefulSet', 'DaemonSet', 'CronJob', 'Job', 'ReplicaSet'] as const;

function workloadsOf(cluster: ClusterState): { kind: string; name: string; owners: { kind: string; name: string }[] }[] {
  const all = [
    ...[...cluster.deployments.values()],
    ...[...cluster.statefulSets.values()],
    ...[...cluster.daemonSets.values()],
    ...[...cluster.cronJobs.values()],
    ...[...cluster.jobs.values()],
    ...[...cluster.replicaSets.values()],
  ];
  return all.map((r) => ({ kind: r.kind, name: r.metadata.name, owners: r.metadata.ownerReferences }));
}

const idOf = (kind: string, name: string) => `${kind}/${name}`;

/**
 * 持ち主の系図を、左から右へ（持ち主 → 持ち物）並べる。
 * 列は Deployment → ReplicaSet → Pod の深さ、Service は右端の列に置き、Endpoints に載っている Pod にだけ線を引く。
 * 位置はここで決め切るので、画面の大きさを測らずに線が引ける。
 */
export function ownershipGraph(cluster: ClusterState): { nodes: GraphNode[]; edges: GraphEdge[]; width: number; height: number } {
  const workloads = workloadsOf(cluster);
  const pods = [...cluster.pods.values()].sort((a, b) => (a.metadata.name < b.metadata.name ? -1 : 1));
  const children = new Map<string, string[]>();
  const hasOwner = new Set<string>();
  const known = new Set(workloads.map((w) => idOf(w.kind, w.name)));
  const link = (owner: { kind: string; name: string }, child: string) => {
    const parent = idOf(owner.kind, owner.name);
    if (!known.has(parent)) return;
    children.set(parent, [...(children.get(parent) ?? []), child]);
    hasOwner.add(child);
  };
  for (const w of workloads) for (const o of w.owners) link(o, idOf(w.kind, w.name));
  for (const p of pods) for (const o of p.metadata.ownerReferences) link(o, idOf('Pod', p.metadata.name));

  const kindOrder = (id: string) => WORKLOADS.indexOf(id.split('/')[0] as (typeof WORKLOADS)[number]);
  const roots = [
    ...workloads.map((w) => idOf(w.kind, w.name)).filter((id) => !hasOwner.has(id)).sort((a, b) => kindOrder(a) - kindOrder(b) || (a < b ? -1 : 1)),
    ...pods.map((p) => idOf('Pod', p.metadata.name)).filter((id) => !hasOwner.has(id)),
  ];

  const podById = new Map(pods.map((p) => [idOf('Pod', p.metadata.name), p]));
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  let row = 0;
  let maxDepth = 0;
  const place = (id: string, depth: number): void => {
    const [kind = '', ...rest] = id.split('/');
    const pod = podById.get(id);
    // Pod は常に一番右の持ち物の列に揃える
    nodes.push({
      id,
      kind,
      name: rest.join('/'),
      x: depth,
      y: row,
      ...(pod ? { look: podLook(pod).look } : {}),
    });
    maxDepth = Math.max(maxDepth, depth);
    const kids = children.get(id) ?? [];
    if (kids.length === 0) row += 1;
    for (const child of kids) {
      edges.push({ from: id, to: child, type: 'own' });
      place(child, depth + 1);
    }
  };
  for (const root of roots) place(root, 0);

  // Pod を同じ列（一番深い列）に寄せる
  const podColumn = Math.max(maxDepth, 0);
  for (const node of nodes) if (node.kind === 'Pod') node.x = podColumn;

  // Service は右端の列。Endpoints に載っている Pod にだけ線を引く
  const serviceColumn = podColumn + 1;
  const byIp = new Map(pods.filter((p) => p.status.podIP !== null).map((p) => [p.status.podIP, idOf('Pod', p.metadata.name)]));
  const services = [...cluster.services.values()].sort((a, b) => (a.metadata.name < b.metadata.name ? -1 : 1));
  services.forEach((svc, i) => {
    const id = idOf('Service', svc.metadata.name);
    nodes.push({ id, kind: 'Service', name: svc.metadata.name, x: serviceColumn, y: i });
    for (const ip of svc.status.endpoints) {
      const target = byIp.get(ip);
      if (target !== undefined) edges.push({ from: id, to: target, type: 'serve' });
    }
  });

  const rows = Math.max(row, services.length, 1);
  const columns = services.length > 0 ? serviceColumn + 1 : podColumn + 1;
  const placed = nodes.map((n) => ({
    ...n,
    x: GRAPH.pad + n.x * GRAPH.colW,
    y: GRAPH.pad + n.y * GRAPH.rowH,
  }));
  return {
    nodes: placed,
    edges,
    width: GRAPH.pad * 2 + (columns - 1) * GRAPH.colW + GRAPH.nodeW,
    height: GRAPH.pad * 2 + (rows - 1) * GRAPH.rowH + GRAPH.nodeH,
  };
}
