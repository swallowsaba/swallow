import { key, type ClusterState } from './types';

/**
 * 実戦の達成条件 `{ kind: 'k8s', expr }`（docs/content-spec.md 2.4）を、クラスタの状態で判定する。純粋な関数。
 *
 * expr は `<種類>/<名前>` の後に、空白で区切った `<欄><比べ方><数>` を並べる（全てを満たせば達成。欄が無ければ、あるかどうか）:
 *   deployment/web replicas>=3 readyReplicas>=3
 *   service/web endpoints>=3
 * 比べ方は >= <= =。名前空間は default
 */

type Kind = 'deployment' | 'service';

function fieldOf(cluster: ClusterState, kind: Kind, name: string, field: string): number | undefined {
  const id = key('default', name);
  if (kind === 'deployment') {
    const d = cluster.deployments.get(id);
    if (!d) return undefined;
    if (field === 'replicas') return d.spec.replicas;
    if (field === 'readyReplicas') return d.status.readyReplicas;
    if (field === 'updatedReplicas') return d.status.updatedReplicas;
  } else {
    const s = cluster.services.get(id);
    if (!s) return undefined;
    if (field === 'endpoints') return s.status.endpoints.length;
    if (field === 'port') return s.spec.ports[0]?.port;
  }
  throw new Error(`k8s の条件の欄「${kind}.${field}」は知らない形`);
}

export function clusterHolds(cluster: ClusterState | null, expr: string): boolean {
  if (!cluster) return false;
  const [target = '', ...conds] = expr.trim().split(/\s+/);
  const [kind, name] = target.split('/');
  if ((kind !== 'deployment' && kind !== 'service') || !name) throw new Error(`k8s の条件「${target}」は知らない形`);
  const there = kind === 'deployment' ? cluster.deployments.has(key('default', name)) : cluster.services.has(key('default', name));
  if (!there) return false;
  for (const c of conds) {
    const m = /^([a-zA-Z]+)(>=|<=|=)(\d+)$/.exec(c);
    if (!m?.[1] || !m[2]) throw new Error(`k8s の条件「${c}」は知らない形`);
    const v = fieldOf(cluster, kind, name, m[1]);
    const want = Number(m[3]);
    if (v === undefined) return false;
    if (m[2] === '>=' ? v < want : m[2] === '<=' ? v > want : v !== want) return false;
  }
  return true;
}
