import type { Building, BuildingKind, City, Occupant } from '@/city/model';
import type { ClusterState } from '@/engines/k8s/types';

/**
 * 建物 1 棟ぶんの中身。街の状態から導く純粋関数。
 *
 * 右の情報パネルはこれを受け取って描くだけで、自分では何も数えない。
 * 同じ状態からは必ず同じ中身になる。
 */

/** Kubernetes が 1 ノードに置ける Pod の既定の上限 */
export const PODS_PER_NODE = 110;

/** 使用量の棒 1 本 */
export interface InfoUsage {
  key: 'cpu' | 'memory' | 'residents';
  used: number;
  total: number;
  /** 棒の右に出す文字（単位つき） */
  text: string;
  /** 0..1 */
  ratio: number;
}

export interface InfoResident {
  id: string;
  label: string;
  state: Occupant['state'];
}

/** 記録の 1 行。いまの状態から読み取れる出来事だけを並べる */
export interface InfoLog {
  id: string;
  label: string;
  /** 分かるときだけ、入居した時刻（tick を mm:ss にしたもの） */
  at: string;
  event: 'arrived' | 'running' | 'moving' | 'ailing';
}

/** 操作ボタン 1 つ。押すと command が端末に入力されて実行される */
export interface InfoAction {
  command: string;
  label: string;
  /** 最初の 1 つは目立たせる */
  primary: boolean;
}

export interface BuildingInfo {
  id: string;
  label: string;
  kind: BuildingKind;
  level: number;
  usage: InfoUsage[];
  residents: InfoResident[];
  log: InfoLog[];
  actions: InfoAction[];
}

function pad(n: number): string {
  return n < 10 ? `0${String(n)}` : String(n);
}

/** tick を mm:ss にする */
export function tickText(tick: number): string {
  const safe = Math.max(0, Math.floor(tick));
  return `${String(Math.floor(safe / 60))}:${pad(safe % 60)}`;
}

function bar(key: InfoUsage['key'], used: number, total: number, text: string): InfoUsage {
  return { key, used, total, text, ratio: total <= 0 ? 0 : Math.min(1, used / total) };
}

/** この建物がノードなら、クラスタでの実際の使用量を出す */
function nodeUsage(building: Building, cluster: ClusterState | null): InfoUsage[] {
  const node = cluster?.nodes.get(building.id);
  if (cluster === undefined || cluster === null || node === undefined) return [];
  let cpu = 0;
  let memory = 0;
  for (const pod of cluster.pods.values()) {
    if (pod.status.nodeName !== node.metadata.name) continue;
    for (const container of pod.spec.containers) {
      cpu += container.requests.cpu;
      memory += container.requests.memory;
    }
  }
  const able = node.status.allocatable;
  return [
    bar('cpu', cpu, able.cpu, `${String(cpu)}m / ${String(able.cpu)}m`),
    bar('memory', memory, able.memory, `${String(memory)}Mi / ${String(able.memory)}Mi`),
  ];
}

/** 出て行った人を除いた住人 */
function living(building: Building): Occupant[] {
  return building.occupants.filter((o) => o.state !== 'gone');
}

/** 入居できる人数。ノードは Kubernetes の上限、ほかは規模から決める */
function capacityOf(building: Building, cluster: ClusterState | null): number {
  if (cluster?.nodes.has(building.id) === true) return PODS_PER_NODE;
  return Math.max(living(building).length, building.level * 4);
}

function eventOf(occupant: Occupant): InfoLog['event'] {
  switch (occupant.state) {
    case 'settled':
      return 'running';
    case 'moving':
      return 'moving';
    case 'sick':
      return 'ailing';
    case 'gone':
      return 'arrived';
  }
}

/**
 * 建物を 1 棟引く。見つからなければ null。
 * cluster があれば、ノードの CPU とメモリの使用量も出す。
 */
export function buildingInfo(city: City, cluster: ClusterState | null, id: string): BuildingInfo | null {
  const building = city.buildings.find((b) => b.id === id);
  if (building === undefined) return null;
  const people = living(building);
  const capacity = capacityOf(building, cluster);

  const actions: InfoAction[] = [];
  if (building.command !== undefined && building.command !== '') {
    actions.push({ command: building.command, label: building.why ?? building.command, primary: true });
  }
  for (const action of building.actions ?? []) {
    actions.push({ command: action.command, label: action.why, primary: actions.length === 0 });
  }

  return {
    id: building.id,
    label: building.label,
    kind: building.kind,
    level: building.level,
    usage: [
      ...nodeUsage(building, cluster),
      bar('residents', people.length, capacity, `${String(people.length)} / ${String(capacity)}`),
    ],
    residents: people.map((o) => ({ id: o.id, label: o.label, state: o.state })),
    log: people.map((o) => {
      const pod = cluster?.pods.get(o.id);
      const started = pod?.status.startedAt ?? null;
      return {
        id: o.id,
        label: o.label,
        at: started === null ? '' : tickText(started),
        event: eventOf(o),
      };
    }),
    actions,
  };
}
