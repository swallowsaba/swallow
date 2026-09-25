import type { ClusterState } from '@/engines/k8s/types';
import type { Topology } from '@/engines/net/types';

/**
 * 壊して直す（REWORK 4）。
 *
 * 障害は、学習者が打つのと同じコマンドで起こす。裏で状態を書き換えたりしない。
 * だから何をしたから壊れたのかが端末に残り、直し方も同じ言葉で考えられる。
 *
 * ここは React にも three にも触れない純粋な計算。
 * いまの模型から「起こせる障害」と「いま起きている障害」を導く。
 */

export type FaultId = 'node-down' | 'bad-image' | 'wrong-selector' | 'link-down';

export interface Fault {
  id: FaultId;
  /** 何を起こすか。平易な一言 */
  title: string;
  /** 起こすと街に何が起きるか */
  lead: string;
  /** 起こすコマンド。端末で実際に走る */
  command: string;
  /** 直すコマンド。学習者が自分で打つまで見せない */
  fix: string;
  /** いま起きているか */
  broken: boolean;
  /** 起きているとき、どこが原因か。建物の id */
  where: string | null;
  /** いま起こせないときの理由。起こせるなら null */
  blocked: string | null;
}

/** 壊れた荷物を配るときに使う住人の名。存在しないイメージを指す */
export const BROKEN_POD = 'broken';

/** 名前の順で最初のもの。同じ模型からは必ず同じものを選ぶ */
function first<T>(items: Iterable<[string, T]>): [string, T] | undefined {
  return [...items].sort(([a], [b]) => (a < b ? -1 : 1))[0];
}

/** リンクの端（`host1:eth0`）から機器名と口の名を取る */
function ends(link: { a: string; b: string }): { device: string; port: string } {
  const [device = '', port = ''] = link.a.split(':');
  return { device, port };
}

/** ビルを停電させる。kubelet が止まり、そのビルの住人が動かなくなる */
function nodeDown(cluster: ClusterState | null): Fault {
  const node = cluster === null ? undefined : first(cluster.nodes);
  const name = node?.[0] ?? '';
  return {
    id: 'node-down',
    title: 'ビルを停電させる',
    lead: 'ビルの管理人（kubelet）が止まる。窓の灯りが消え、そこの住人は動かなくなる',
    command: `kubectl node-down ${name}`,
    fix: `kubectl node-up ${name}`,
    broken: node?.[1].status.kubeletHealthy === false,
    where: node === undefined ? null : `node:${name}`,
    blocked: node === undefined ? 'ビル（ノード）がまだ 1 棟も建っていない' : null,
  };
}

/** 壊れた荷物を配る。取れないイメージを指した住人を 1 人入れる */
function badImage(cluster: ClusterState | null): Fault {
  const here = cluster?.pods.get(`default/${BROKEN_POD}`);
  return {
    id: 'bad-image',
    title: '壊れた荷物を配る',
    lead: '中身の無い荷物（取れないイメージ）を持った住人が来る。何度やり直しても入居できない',
    command: `kubectl run ${BROKEN_POD} --image=does-not-exist`,
    fix: `kubectl delete pod ${BROKEN_POD}`,
    broken: here !== undefined,
    where: here?.status.nodeName == null ? 'cp:scheduler' : `node:${here.status.nodeName}`,
    blocked: cluster === null ? 'この街には Kubernetes がまだ無い' : null,
  };
}

/** バス停の行き先を間違える。セレクタを、どの住人にも当たらない値にする */
function wrongSelector(cluster: ClusterState | null): Fault {
  const found = cluster === null ? undefined : first(cluster.services);
  const key = found === undefined ? '' : found[0];
  const service = found?.[1];
  const name = service?.metadata.name ?? '';
  // いま住人が付けている札。直すときはここへ戻す
  const label = [...(cluster?.pods.values() ?? [])]
    .map((pod) => Object.entries(pod.metadata.labels)[0])
    .find((pair): pair is [string, string] => pair !== undefined);
  const [tag, value] = label ?? ['app', name];
  return {
    id: 'wrong-selector',
    title: 'バス停の行き先を間違える',
    lead: 'バス停が、どの住人にも当たらない札を探し始める。路線が伸びる先が無くなる',
    command: `kubectl set selector svc ${name} ${tag}=nowhere`,
    fix: `kubectl set selector svc ${name} ${tag}=${value}`,
    broken: service !== undefined && service.status.endpoints.length === 0,
    where: service === undefined ? null : `svc:${key}`,
    blocked: service === undefined ? 'バス停（Service）がまだ立っていない' : null,
  };
}

/** 道路を塞ぐ。機器の口を 1 つ落とす */
function linkDown(net: Topology | null): Fault {
  const links = net?.links ?? [];
  const down = links.find((link) => !link.up);
  const target = down ?? links[0];
  const { device, port } = target === undefined ? { device: '', port: '' } : ends(target);
  return {
    id: 'link-down',
    title: '道路を塞ぐ',
    lead: 'ケーブルを 1 本抜く。その道は通れなくなり、向こう側へ荷物が届かなくなる',
    command: `ip link set ${port} down`,
    fix: `ip link set ${port} up`,
    broken: down !== undefined,
    where: device === '' ? null : `dev:${device}`,
    blocked: target === undefined ? 'この街にはまだ道（リンク）が無い' : null,
  };
}

/**
 * いまの模型から、起こせる障害と、いま起きている障害を導く。
 * 並びは常に同じ。起こせないものも、理由を添えて残す（何が足りないかが分かるように）。
 */
export function faultsOf(world: { cluster?: ClusterState | null; net?: Topology | null }): Fault[] {
  const cluster = world.cluster ?? null;
  const net = world.net ?? null;
  return [nodeDown(cluster), badImage(cluster), wrongSelector(cluster), linkDown(net)];
}

/** いま起きている障害だけ */
export function troubles(faults: readonly Fault[]): Fault[] {
  return faults.filter((fault) => fault.broken);
}
