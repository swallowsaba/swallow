import { matches, realNames, templateHash } from './controllers';
import { isReady } from './kubelet';
import { resolveEnv } from './storage';
import { pgTables } from './volumes';
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
 *   deployment/db rows.reservations=4 && pvc/db-data status=Bound
 *   deployment/guide readyUpdated=2 restarts>=1 early=0
 *   hpa/web min=2 max=10 target=50
 *   deployment/web image=city-shop:1.1 readyUpdated=4 tried=city-shop:1.2
 * 比べ方は >= <= =（status・env・from は = で語を比べる）。比べ方を書かない欄は、値があるかどうか。区画を省けば default。` && ` で別の資源の条件をつなぐ
 */

/** その Deployment の、Ready の Pod（持ち主の ReplicaSet をたどる） */
function readyPodsOf(cluster: ClusterState, d: Deployment): Pod[] {
  const sets = new Set([...cluster.replicaSets.values()]
    .filter((rs) => rs.metadata.namespace === d.metadata.namespace && rs.metadata.ownerReferences.some((o) => o.kind === 'Deployment' && o.name === d.metadata.name))
    .map((rs) => rs.metadata.name));
  return [...cluster.pods.values()].filter((p) => p.metadata.namespace === d.metadata.namespace && p.metadata.ownerReferences.some((o) => o.kind === 'ReplicaSet' && sets.has(o.name)) && isReady(p));
}

type Kind = 'deployment' | 'service' | 'pod' | 'namespace' | 'pvc' | 'hpa';

const KINDS: readonly Kind[] = ['deployment', 'service', 'pod', 'namespace', 'pvc', 'hpa'];

function exists(cluster: ClusterState, kind: Kind, ns: string, name: string): boolean {
  const id = key(ns, name);
  if (kind === 'namespace') return cluster.namespaces?.some((n) => n.name === name) ?? false;
  if (kind === 'pvc') return cluster.persistentVolumeClaims.has(id);
  if (kind === 'hpa') return cluster.autoscalers.has(id);
  return kind === 'deployment' ? cluster.deployments.has(id) : kind === 'service' ? cluster.services.has(id) : cluster.pods.has(id);
}

function fieldOf(cluster: ClusterState, kind: Kind, ns: string, name: string, field: string): number | string | readonly string[] | undefined {
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
    // image: 今の設計図の最初のコンテナのイメージ。tried: その Deployment の世代（残っている ReplicaSet）が使ったイメージの全て（= で、その中にあるか）
    if (field === 'image') return d.spec.template.containers[0]?.image;
    if (field === 'tried') {
      return [...cluster.replicaSets.values()]
        .filter((rs) => rs.metadata.namespace === ns && rs.metadata.ownerReferences.some((o) => o.kind === 'Deployment' && o.name === name))
        .flatMap((rs) => rs.spec.template.containers.map((c) => c.image));
    }
    // made: その Deployment の ReplicaSet が作った Pod の数（消された Pod を作り直したことを確かめる）
    // env.名前: Ready の Pod の全てが持つ、その環境変数の値（動かした時に引いた値。Pod ごとに違えば <mixed>）。
    // 今の設計図の Pod が 1 つも動いていなければ無い（入れ替えの途中で、古い Pod だけが同じ値を持っている時に満たさない）
    if (field.startsWith('env.')) {
      const ready = readyPodsOf(cluster, d);
      const hash = templateHash(d.spec.template, realNames(cluster));
      if (!ready.some((p) => p.metadata.labels['pod-template-hash'] === hash)) return undefined;
      const values = new Set(ready.map((p) => resolveEnv(cluster, p, p.spec.containers[0]?.name ?? '')[field.slice(4)] ?? '<none>'));
      return values.size === 1 ? [...values][0] : '<mixed>';
    }
    // from.名前: その環境変数を、設計図（template）の最初のコンテナが受け取る ConfigMap か Secret の名前（直接書いた env が勝つ時は無い）
    if (field.startsWith('from.')) {
      const name = field.slice(5);
      const c = d.spec.template.containers[0];
      if (c === undefined || c.env[name] !== undefined) return undefined;
      const dataOf = (r: (typeof c.envFrom)[number]) => (r.kind === 'ConfigMap' ? cluster.configMaps : cluster.secrets).get(key(ns, r.name))?.data;
      // キーを指す時は、そのキーが実在する時だけ（無いキーを指せば、コンテナは動けない）
      const ref = [...c.envFrom].reverse().find((r) => (r.key === undefined ? dataOf(r)?.[name] !== undefined : (r.as ?? r.key) === name && dataOf(r)?.[r.key] !== undefined));
      return ref?.name;
    }
    // rows.表: Ready の Pod の DB（PostgreSQL のイメージ）の、その表の行の数。DB でない・表が無い・動いていなければ無い
    if (field.startsWith('rows.')) {
      const pod = readyPodsOf(cluster, d)[0];
      return pod === undefined ? undefined : pgTables(cluster, pod)?.[field.slice(5)]?.rows.length;
    }
    // restarts: 今の設計図の Pod の、作り直した数の合計。early: 今の設計図の Pod が、アプリの待ち受ける前に Ready だった（頼みが送られた）秒数の合計
    // readyUpdated: 今の設計図の Pod のうち Ready の数（入れ替えが止まっている間、古い Pod の Ready は数えない）
    if (field === 'restarts' || field === 'early' || field === 'readyUpdated') {
      const hash = templateHash(d.spec.template, realNames(cluster));
      const current = [...cluster.pods.values()].filter((p) => p.metadata.namespace === ns && p.metadata.labels['pod-template-hash'] === hash && matches(p.metadata.labels, d.spec.selector));
      if (field === 'readyUpdated') return current.filter(isReady).length;
      return current.flatMap((p) => p.status.containerStatuses).reduce((n, c) => n + (field === 'restarts' ? c.restartCount : (c.early ?? 0)), 0);
    }
    if (field === 'made') {
      const sets = new Set([...cluster.replicaSets.values()].filter((rs) => rs.metadata.namespace === ns && rs.metadata.ownerReferences.some((o) => o.kind === 'Deployment' && o.name === name)).map((rs) => `replicaset/${rs.metadata.name}`));
      return cluster.events.filter((e) => e.reason === 'SuccessfulCreate' && sets.has(e.object)).length;
    }
  } else if (kind === 'pvc') {
    const c = cluster.persistentVolumeClaims.get(id);
    if (!c) return undefined;
    // status: get pvc の STATUS の欄（Bound・Pending）。volume: 結ばれた PV の名前
    if (field === 'status') return c.status.phase;
    if (field === 'volume') return c.status.volumeName ?? undefined;
  } else if (kind === 'hpa') {
    const h = cluster.autoscalers.get(id);
    if (!h) return undefined;
    // target・min・max: 書いた目標の使用率と数の範囲。cpu: 今の使用率（測れない間は無い）。replicas: 最後に見た数（get hpa の REPLICAS）
    if (field === 'target') return h.spec.targetCpuPercent;
    if (field === 'min') return h.spec.minReplicas;
    if (field === 'max') return h.spec.maxReplicas;
    if (field === 'cpu') return h.status.currentCpuPercent ?? undefined;
    if (field === 'replicas') return h.status.currentReplicas ?? h.status.desiredReplicas;
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
    const f = /^([a-zA-Z]+(?:\.[A-Za-z_][A-Za-z0-9_]*)?)(?:(>=|<=|=)([A-Za-z0-9._:/@-]+))?$/.exec(c);
    if (!f?.[1]) throw new Error(`k8s の条件「${c}」は知らない形`);
    const v = fieldOf(cluster, k, ns, name, f[1]);
    if (v === undefined) return false;
    // 比べ方を書かない欄は、値があるかどうか
    if (!f[2] || !f[3]) continue;
    if (typeof v === 'object') {
      if (f[2] !== '=' || !v.includes(f[3])) return false;
      continue;
    }
    if (typeof v === 'string' || !/^\d+$/.test(f[3])) {
      if (f[2] !== '=' || String(v) !== f[3]) return false;
      continue;
    }
    const want = Number(f[3]);
    if (f[2] === '>=' ? v < want : f[2] === '<=' ? v > want : v !== want) return false;
  }
  return true;
}
