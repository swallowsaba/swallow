import { matches } from './controllers';
import { isReady } from './kubelet';
import { resolveEnv } from './storage';
import { key, type ClusterState, type Deployment, type Pod } from './types';

/**
 * 実戦の達成条件 `{ kind: 'k8s', expr }`（docs/content-spec.md 2.4）を、クラスタの状態で判定する。純粋な関数。
 *
 * expr は `<種類>/<名前>[@区画]` の後に、空白で区切った `<欄><比べ方><値>` を並べる（全てを満たせば達成。欄が無ければ、あるかどうか）:
 *   deployment/web replicas>=3 readyReplicas>=3 made>=4
 *   service/web endpoints>=3
 *   pod/web ready=1 status=Running
 *   deployment/web@dev readyReplicas=1
 *   deployment/web env.DB_HOST=db-staging-2 from.DB_HOST
 *   namespace/dev
 * 比べ方は >= <= =（status・env・from は = で語を比べる）。比べ方を書かない欄は、値があるかどうか。区画を省けば default。` && ` で別の資源の条件をつなぐ
 */

/** その Deployment の、Ready の Pod（持ち主の ReplicaSet をたどる） */
function readyPodsOf(cluster: ClusterState, d: Deployment): Pod[] {
  const sets = new Set([...cluster.replicaSets.values()]
    .filter((rs) => rs.metadata.namespace === d.metadata.namespace && rs.metadata.ownerReferences.some((o) => o.kind === 'Deployment' && o.name === d.metadata.name))
    .map((rs) => rs.metadata.name));
  return [...cluster.pods.values()].filter((p) => p.metadata.namespace === d.metadata.namespace && p.metadata.ownerReferences.some((o) => o.kind === 'ReplicaSet' && sets.has(o.name)) && isReady(p));
}

type Kind = 'deployment' | 'service' | 'pod' | 'namespace';

const KINDS: readonly Kind[] = ['deployment', 'service', 'pod', 'namespace'];

function exists(cluster: ClusterState, kind: Kind, ns: string, name: string): boolean {
  const id = key(ns, name);
  if (kind === 'namespace') return cluster.namespaces?.some((n) => n.name === name) ?? false;
  return kind === 'deployment' ? cluster.deployments.has(id) : kind === 'service' ? cluster.services.has(id) : cluster.pods.has(id);
}

function fieldOf(cluster: ClusterState, kind: Kind, ns: string, name: string, field: string): number | string | undefined {
  const id = key(ns, name);
  if (kind === 'pod') {
    const p = cluster.pods.get(id);
    if (!p) return undefined;
    // ready: Ready のコンテナの数（get pods の READY の左）。status: get pods の STATUS の欄と同じ語
    if (field === 'ready') return isReady(p) ? p.status.containerStatuses.length : p.status.containerStatuses.filter((c) => c.ready).length;
    if (field === 'restarts') return p.status.containerStatuses.reduce((n, c) => n + c.restartCount, 0);
    if (field === 'status') return p.status.containerStatuses.find((c) => c.waitingReason !== null)?.waitingReason ?? p.status.phase;
  } else if (kind === 'deployment') {
    const d = cluster.deployments.get(id);
    if (!d) return undefined;
    if (field === 'replicas') return d.spec.replicas;
    if (field === 'readyReplicas') return d.status.readyReplicas;
    if (field === 'updatedReplicas') return d.status.updatedReplicas;
    // made: その Deployment の ReplicaSet が作った Pod の数（消された Pod を作り直したことを確かめる）
    // env.名前: Ready の Pod の全てが持つ、その環境変数の値（動かした時に引いた値。Pod ごとに違えば <mixed>）
    if (field.startsWith('env.')) {
      const values = new Set(readyPodsOf(cluster, d).map((p) => resolveEnv(cluster, p, p.spec.containers[0]?.name ?? '')[field.slice(4)] ?? '<none>'));
      return values.size === 1 ? [...values][0] : values.size === 0 ? undefined : '<mixed>';
    }
    // from.名前: その環境変数を、設計図（template）の最初のコンテナが受け取る ConfigMap の名前（直接書いた env が勝つ時は無い）
    if (field.startsWith('from.')) {
      const name = field.slice(5);
      const c = d.spec.template.containers[0];
      if (c === undefined || c.env[name] !== undefined) return undefined;
      const ref = [...c.envFrom].reverse().find((r) => r.kind === 'ConfigMap' && (r.key === undefined ? cluster.configMaps.get(key(ns, r.name))?.data[name] !== undefined : (r.as ?? r.key) === name));
      return ref?.name;
    }
    if (field === 'made') {
      const sets = new Set([...cluster.replicaSets.values()].filter((rs) => rs.metadata.namespace === ns && rs.metadata.ownerReferences.some((o) => o.kind === 'Deployment' && o.name === name)).map((rs) => `replicaset/${rs.metadata.name}`));
      return cluster.events.filter((e) => e.reason === 'SuccessfulCreate' && sets.has(e.object)).length;
    }
  } else if (kind === 'service') {
    const s = cluster.services.get(id);
    if (!s) return undefined;
    // 宛先は、札（selector）の合う Ready の Pod（get endpoints と同じ数え方。次の時間を待たずに数える）
    if (field === 'endpoints') return [...cluster.pods.values()].filter((p) => p.metadata.namespace === ns && matches(p.metadata.labels, s.spec.selector) && isReady(p)).length;
    if (field === 'port') return s.spec.ports[0]?.port;
  }
  throw new Error(`k8s の条件の欄「${kind}.${field}」は知らない形`);
}

export function clusterHolds(cluster: ClusterState | null, expr: string): boolean {
  if (!cluster) return false;
  // ` && ` でつないだ式は、全てを満たせば達成（別の資源の条件を並べる）
  if (expr.includes(' && ')) return expr.split(' && ').every((part) => clusterHolds(cluster, part));
  const [target = '', ...conds] = expr.trim().split(/\s+/);
  const m = /^([a-z]+)\/([a-z0-9.-]+)(?:@([a-z0-9-]+))?$/.exec(target);
  const k = KINDS.find((x) => x === m?.[1]);
  const name = m?.[2];
  if (k === undefined || name === undefined) throw new Error(`k8s の条件「${target}」は知らない形`);
  const ns = m?.[3] ?? 'default';
  if (!exists(cluster, k, ns, name)) return false;
  for (const c of conds) {
    const f = /^([a-zA-Z]+(?:\.[A-Za-z_][A-Za-z0-9_]*)?)(?:(>=|<=|=)([A-Za-z0-9._:/-]+))?$/.exec(c);
    if (!f?.[1]) throw new Error(`k8s の条件「${c}」は知らない形`);
    const v = fieldOf(cluster, k, ns, name, f[1]);
    if (v === undefined) return false;
    // 比べ方を書かない欄は、値があるかどうか
    if (!f[2] || !f[3]) continue;
    if (typeof v === 'string' || !/^\d+$/.test(f[3])) {
      if (f[2] !== '=' || String(v) !== f[3]) return false;
      continue;
    }
    const want = Number(f[3]);
    if (f[2] === '>=' ? v < want : f[2] === '<=' ? v > want : v !== want) return false;
  }
  return true;
}
