import { matches } from './controllers';
import { isReady } from './kubelet';
import { key, type ClusterState } from './types';

/**
 * 実戦の達成条件 `{ kind: 'k8s', expr }`（docs/content-spec.md 2.4）を、クラスタの状態で判定する。純粋な関数。
 *
 * expr は `<種類>/<名前>` の後に、空白で区切った `<欄><比べ方><数>` を並べる（全てを満たせば達成。欄が無ければ、あるかどうか）:
 *   deployment/web replicas>=3 readyReplicas>=3 made>=4
 *   service/web endpoints>=3
 *   pod/web ready=1 status=Running
 * 比べ方は >= <= =（status は = で語を比べる）。名前空間は default
 */

type Kind = 'deployment' | 'service' | 'pod';

const KINDS: readonly Kind[] = ['deployment', 'service', 'pod'];

function exists(cluster: ClusterState, kind: Kind, name: string): boolean {
  const id = key('default', name);
  return kind === 'deployment' ? cluster.deployments.has(id) : kind === 'service' ? cluster.services.has(id) : cluster.pods.has(id);
}

function fieldOf(cluster: ClusterState, kind: Kind, name: string, field: string): number | string | undefined {
  const id = key('default', name);
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
    if (field === 'made') {
      const sets = new Set([...cluster.replicaSets.values()].filter((rs) => rs.metadata.namespace === 'default' && rs.metadata.ownerReferences.some((o) => o.kind === 'Deployment' && o.name === name)).map((rs) => `replicaset/${rs.metadata.name}`));
      return cluster.events.filter((e) => e.reason === 'SuccessfulCreate' && sets.has(e.object)).length;
    }
  } else {
    const s = cluster.services.get(id);
    if (!s) return undefined;
    // 宛先は、札（selector）の合う Ready の Pod（kubectl endpoints と同じ数え方。次の時間を待たずに数える）
    if (field === 'endpoints') return [...cluster.pods.values()].filter((p) => p.metadata.namespace === 'default' && matches(p.metadata.labels, s.spec.selector) && isReady(p)).length;
    if (field === 'port') return s.spec.ports[0]?.port;
  }
  throw new Error(`k8s の条件の欄「${kind}.${field}」は知らない形`);
}

export function clusterHolds(cluster: ClusterState | null, expr: string): boolean {
  if (!cluster) return false;
  const [target = '', ...conds] = expr.trim().split(/\s+/);
  const [kind, name] = target.split('/');
  const k = KINDS.find((x) => x === kind);
  if (k === undefined || !name) throw new Error(`k8s の条件「${target}」は知らない形`);
  if (!exists(cluster, k, name)) return false;
  for (const c of conds) {
    const m = /^([a-zA-Z]+)(>=|<=|=)(\d+|[A-Za-z]+)$/.exec(c);
    if (!m?.[1] || !m[2] || !m[3]) throw new Error(`k8s の条件「${c}」は知らない形`);
    const v = fieldOf(cluster, k, name, m[1]);
    if (v === undefined) return false;
    if (typeof v === 'string' || !/^\d+$/.test(m[3])) {
      if (m[2] !== '=' || String(v) !== m[3]) return false;
      continue;
    }
    const want = Number(m[3]);
    if (m[2] === '>=' ? v < want : m[2] === '<=' ? v > want : v !== want) return false;
  }
  return true;
}
