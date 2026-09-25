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
  /** 台帳に残っている出来事を、そのまま出すとき。ここがあれば event より優先する */
  text?: string;
  /** 気を付ける出来事か。台帳が Warning と記したもの */
  warn?: boolean;
}

/** その建物の、いまの状態を表す数。すべて模型から読む */
export interface InfoFact {
  key: string;
  label: string;
  value: string;
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
  /** これは何か。用語を知らない人に向けた 1 行 */
  what: string;
  usage: InfoUsage[];
  /** いまの状態を表す数。建物の種類ごとに、意味のある数だけを出す */
  facts: InfoFact[];
  residents: InfoResident[];
  log: InfoLog[];
  actions: InfoAction[];
}

/**
 * 建物の種類ごとの「これは何か」。用語を 1 つも知らない人に向けて 1 行で書く。
 * 括弧の中に本当の用語を添えて、街の言葉と本物の言葉をつなぐ。
 */
const WHAT: Readonly<Record<BuildingKind, string>> = {
  tower: 'アプリを実際に動かすコンピュータ 1 台（ノード）。住人がこの中で暮らす',
  office: '「この住人を何人そろえる」という注文を預かる事務所（Deployment）',
  stop: 'いつも同じ場所にあって、いま動いている住人まで運んでくれるバス停（Service）',
  monument: '刻んだら書き換えない、変更の記録 1 件（コミット）',
  flag: 'いちばん新しい碑に立てておく目印（ブランチ）',
  depot: '次の記録に載せると決めた紙を預けておく倉庫（インデックス）',
  hut: '中身を書き留めておく入れ物 1 つ（ファイル）',
  house: 'ネットワークにつながっている機械 1 台。住所（IP アドレス）が付いている',
  relay: '町と町の間で荷物を回す塔。どの道へ送るかを決める（ルータ）',
  gate: '同じ町内の家どうしをつなぐ結び目（スイッチ）',
  window: '自分の変更を本通りに入れてよいか申し込む窓口（Pull Request）',
  line: '申し込みのたびに機械が組み立てと試験をする流れ作業の場（CI）',
  desk: '街への頼みごとが必ず通る窓口（API サーバ）。ここだけが台帳に書き込む',
  ledger: '街の「こうなっているはず」を書き留めた帳面（etcd）',
  watch: 'あるべき数といまの数を見比べ、足りなければ足す係（コントローラ）',
  dispatch: '新しい住人をどのビルに入れるかを決める係（スケジューラ）',
};

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

/** その建物がノードなら、クラスタでのノード名。違えば null */
function nodeName(building: Building, cluster: ClusterState | null): string | null {
  if (cluster === null) return null;
  // 街での id は `node:n1`。クラスタの鍵は `n1`
  const name = building.id.replace(/^node:/, '');
  return cluster.nodes.has(name) ? name : null;
}

/** この建物がノードなら、クラスタでの実際の使用量を出す */
function nodeUsage(building: Building, cluster: ClusterState | null): InfoUsage[] {
  const name = nodeName(building, cluster);
  const node = name === null ? undefined : cluster?.nodes.get(name);
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
  if (nodeName(building, cluster) !== null) return PODS_PER_NODE;
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

/** 台帳に載っている記録の数 */
function recordCount(cluster: ClusterState): number {
  return (
    cluster.nodes.size + cluster.pods.size + cluster.deployments.size + cluster.replicaSets.size +
    cluster.services.size + cluster.configMaps.size + cluster.secrets.size
  );
}

/** あるべき数と、いま揃っている数の開き */
function gapOf(cluster: ClusterState): number {
  return (
    [...cluster.deployments.values()].reduce((sum, d) => sum + Math.abs(d.spec.replicas - d.status.readyReplicas), 0) +
    [...cluster.replicaSets.values()].reduce((sum, r) => sum + Math.abs(r.spec.replicas - r.status.readyReplicas), 0)
  );
}

/**
 * その建物の、いまの状態を表す数。
 * 建物の種類ごとに、その施設にとって意味のある数だけを出す。すべて模型から読む。
 */
function factsOf(building: Building, cluster: ClusterState | null): InfoFact[] {
  if (cluster === null) return [];
  const pods = [...cluster.pods.values()];
  const waiting = pods.filter((p) => p.status.nodeName === null).length;
  switch (building.kind) {
    case 'desk':
      return [
        { key: 'events', label: '受け付けた願い', value: `${String(cluster.events.length)} 件` },
        { key: 'ready', label: '窓口', value: cluster.controlPlane.initialized ? '開いている' : 'まだ開いていない' },
      ];
    case 'ledger':
      return [
        { key: 'records', label: '記録', value: `${String(recordCount(cluster))} 件` },
        { key: 'nodes', label: 'うちビル（ノード）', value: `${String(cluster.nodes.size)} 件` },
        { key: 'pods', label: 'うち住人（Pod）', value: `${String(cluster.pods.size)} 件` },
      ];
    case 'watch':
      return [
        { key: 'gap', label: 'あるべき数との開き', value: `${String(gapOf(cluster))} 人` },
        { key: 'orders', label: '見ている注文（Deployment）', value: `${String(cluster.deployments.size)} 件` },
      ];
    case 'dispatch':
      return [
        { key: 'waiting', label: '待っている住人（Pending）', value: `${String(waiting)} 人` },
        { key: 'placed', label: '行き先の決まった住人', value: `${String(pods.length - waiting)} 人` },
      ];
    case 'office': {
      const deploy = cluster.deployments.get(building.id.replace(/^deploy:/, ''));
      if (deploy === undefined) return [];
      return [
        { key: 'replicas', label: '注文した人数', value: `${String(deploy.spec.replicas)} 人` },
        { key: 'ready', label: '揃った人数', value: `${String(deploy.status.readyReplicas)} 人` },
      ];
    }
    case 'stop': {
      const service = cluster.services.get(building.id.replace(/^svc:/, ''));
      if (service === undefined) return [];
      return [
        { key: 'endpoints', label: '路線の行き先', value: `${String(service.status.endpoints.length)} 軒` },
        { key: 'port', label: '受ける番号（ポート）', value: String(service.spec.ports[0]?.port ?? 0) },
      ];
    }
    case 'tower': {
      const here = building.id.replace(/^node:/, '');
      const mine = pods.filter((p) => p.status.nodeName === here);
      return [
        {
          key: 'running',
          label: '動いている住人（Running）',
          value: `${String(mine.filter((p) => p.status.phase === 'Running').length)} 人`,
        },
        {
          key: 'waiting',
          label: '入居を待つ住人（Pending）',
          value: `${String(mine.filter((p) => p.status.phase === 'Pending').length)} 人`,
        },
      ];
    }
    default:
      return [];
  }
}

/** その建物に関わる、台帳に残った直近の出来事 */
function eventsOf(building: Building, cluster: ClusterState | null): InfoLog[] {
  if (cluster === null) return [];
  // 建物の名前か、その中の住人の名前が出てくる記録だけを拾う
  const names = [building.label, ...building.occupants.map((o) => o.label)];
  const mine = cluster.events.filter((e) => names.some((name) => e.object.includes(name)));
  return mine.slice(-5).reverse().map((event, i) => ({
    id: `event:${String(i)}:${String(event.tick)}:${event.reason}`,
    label: event.object,
    at: tickText(event.tick),
    event: event.type === 'Warning' ? ('ailing' as const) : ('running' as const),
    text: `${event.reason}：${event.message}`,
    warn: event.type === 'Warning',
  }));
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

  const happened = eventsOf(building, cluster);

  return {
    id: building.id,
    label: building.label,
    kind: building.kind,
    level: building.level,
    what: WHAT[building.kind],
    facts: factsOf(building, cluster),
    // 住人を取らない施設に「0 / 0」の棒を出さない。数はいる所にだけ出す
    usage: [
      ...nodeUsage(building, cluster),
      ...(people.length > 0 || building.kind === 'tower'
        ? [bar('residents', people.length, capacity, `${String(people.length)} / ${String(capacity)}`)]
        : []),
    ],
    residents: people.map((o) => ({ id: o.id, label: o.label, state: o.state })),
    // 台帳に出来事が残っていれば、そちらを出す。無ければ住人の様子から読む
    log: happened.length > 0 ? happened : people.map((o) => {
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
