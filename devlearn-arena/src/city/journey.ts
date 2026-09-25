import type { ClusterState, Pod } from '@/engines/k8s/types';
import type { GitState } from '@/engines/git/types';
import type { Topology } from '@/engines/net/types';
import type { Repo } from '@/engines/github/types';
import type { VfsState } from '@/engines/kernel/vfs';
import type { Building, BuildingKind, City } from './model';

/**
 * コマンドが街を旅する道のり。
 *
 * **台本ではない。** 打つ前と打った後の模型を見比べ、実際に変わった所だけを停留所にする。
 * だから「そのコマンドで何がどう動いたのか」を、街の動きが嘘なく表す。
 * 何も変わらなかった問い合わせは、窓口と台帳を読んで帰るだけの短い旅になる。
 *
 * ここは React にも three にも触れない。同じ状態の組からは必ず同じ道のりになる。
 */

/** 光の粒の姿。停留所を過ぎるたびにこれが変わる */
export type CargoShape = 'sheet' | 'crate' | 'stone' | 'seal' | 'bundle';

export const CARGO_SHAPES: readonly CargoShape[] = ['sheet', 'crate', 'stone', 'seal', 'bundle'];

export interface JourneyStop {
  /** 停留所になる建物の id */
  building: string;
  /** そこで何が起きたのか。1 行で書く */
  label: string;
  /** そこを出るときの粒の姿 */
  cargo: CargoShape;
  /** 粒の呼び名 */
  cargoLabel: string;
}

/**
 * 帯に並べる枠。
 * その仕組みで通りうる施設をすべて並べ、今回通らなかった所には取り消し線を引く。
 * カメラは一度に一か所しか映せないので、旅の全体はここで見せる。
 */
export interface JourneyLane {
  /** 並びの中での場所。0 から */
  index: number;
  /** 施設の呼び名 */
  title: string;
  /** 通ったなら、その停留所が `stops` の何番目か。通らなかったら null */
  stop: number | null;
}

export interface Journey {
  /** 何回目の旅か。同じコマンドを続けて打っても、別の旅として数える */
  id: string;
  /** 旅の元になったコマンド */
  command: string;
  stops: readonly JourneyStop[];
  lanes: readonly JourneyLane[];
  /**
   * 台帳が「これについて答えた」建物の id。
   *
   * 問い合わせ（`kubectl get nodes`）は窓口と台帳までしか行かない。実際そこから先へは
   * 誰も出向かないので、粒をビルまで走らせるのは嘘になる。代わりに、答えの中身に
   * あたる建物をその場で光らせる。「いま読み上げたのはこれのこと」を示すため。
   */
  highlight: readonly string[];
  /** 光らせた建物に添える札（「これがノード。アプリを動かす建物」）。無ければ null */
  answer: Answer | null;
}

/** 旅を導く元になる、街の裏側の状態。コマンドの前と後で見比べる */
export interface WorldState {
  vfs?: VfsState | null;
  git?: GitState | null;
  cluster?: ClusterState | null;
  net?: Topology | null;
  repo?: Repo | null;
}

/** 見比べて分かった、1 か所ぶんの出来事 */
interface Happening {
  /** 起きた場所。建物の id か、種類での指定 */
  building?: string;
  kinds?: readonly BuildingKind[];
  label: string;
  cargo: CargoShape;
  cargoLabel: string;
}

/** 帯に並べる、その仕組みで通りうる施設 */
interface LaneSpec {
  kind: BuildingKind;
  title: string;
}

/** Kubernetes の街で、頼みごとが通りうる順 */
const K8S_LANES: readonly LaneSpec[] = [
  { kind: 'desk', title: '窓口' },
  { kind: 'ledger', title: '台帳' },
  { kind: 'office', title: '事務所' },
  { kind: 'watch', title: '監督' },
  { kind: 'dispatch', title: '配置係' },
  { kind: 'tower', title: 'ビル' },
  { kind: 'stop', title: 'バス停' },
];

const GIT_LANES: readonly LaneSpec[] = [
  { kind: 'hut', title: '小屋' },
  { kind: 'depot', title: '倉庫' },
  { kind: 'monument', title: '記念碑' },
  { kind: 'flag', title: '旗' },
];

const NET_LANES: readonly LaneSpec[] = [
  { kind: 'house', title: '家' },
  { kind: 'gate', title: '関所' },
  { kind: 'relay', title: '中継塔' },
];

const GITHUB_LANES: readonly LaneSpec[] = [
  { kind: 'monument', title: '記念碑' },
  { kind: 'window', title: '審査窓口' },
  { kind: 'line', title: '検査ライン' },
];

/* ---------------- 見比べる ---------------- */

/** 追加された鍵・消えた鍵・中身が変わった鍵 */
function diffKeys<T>(
  before: ReadonlyMap<string, T>,
  after: ReadonlyMap<string, T>,
): { added: string[]; removed: string[]; kept: string[] } {
  const added = [...after.keys()].filter((k) => !before.has(k)).sort();
  const removed = [...before.keys()].filter((k) => !after.has(k)).sort();
  const kept = [...after.keys()].filter((k) => before.has(k)).sort();
  return { added, removed, kept };
}

/** 台帳に載っている記録の数 */
function records(cluster: ClusterState): number {
  return (
    cluster.nodes.size + cluster.pods.size + cluster.deployments.size + cluster.replicaSets.size +
    cluster.services.size + cluster.configMaps.size + cluster.secrets.size
  );
}

/** その Pod がどのビルにいるか。まだ決まっていなければ null */
function homeOf(pod: Pod | undefined): string | null {
  return pod?.status.nodeName ?? null;
}

/**
 * Kubernetes の街で起きたことを拾う。
 *
 * 願いは必ず窓口を通り、台帳に残る。そこから先は、実際に変わったものだけを辿る。
 * 何も変わっていなければ、窓口と台帳を読んで帰る（`kubectl get` はこの旅になる）。
 *
 * `addressed` は、その行が Kubernetes に宛てたものかどうか。
 * クラスタを一切動かさない `echo` のような行で、窓口まで歩かせないため。
 */
function k8sHappenings(before: ClusterState, after: ClusterState, addressed: boolean): Happening[] {
  const pods = diffKeys(before.pods, after.pods);
  const deploys = diffKeys(before.deployments, after.deployments);
  const services = diffKeys(before.services, after.services);
  const replicaSets = diffKeys(before.replicaSets, after.replicaSets);
  const nodes = diffKeys(before.nodes, after.nodes);

  /** 行き先が新しく決まった Pod */
  const placed = [...pods.added, ...pods.kept].filter(
    (k) => homeOf(before.pods.get(k)) === null && homeOf(after.pods.get(k)) !== null,
  );
  /** 動き始めた Pod */
  const started = [...pods.added, ...pods.kept].filter(
    (k) => before.pods.get(k)?.status.phase !== 'Running' && after.pods.get(k)?.status.phase === 'Running',
  );
  /** 出ていった住人が、どのビルにいたか */
  const left = pods.removed
    .map((k) => ({ key: k, node: homeOf(before.pods.get(k)) }))
    .filter((p): p is { key: string; node: string } => p.node !== null);
  const changedDeploys = deploys.kept.filter(
    (k) => before.deployments.get(k)?.spec.replicas !== after.deployments.get(k)?.spec.replicas,
  );
  const changedServices = services.kept.filter(
    (k) =>
      before.services.get(k)?.status.endpoints.join(',') !== after.services.get(k)?.status.endpoints.join(','),
  );
  /** 行き先がまだ決まらず、配置係の待合に並んだ住人 */
  const queued = pods.added.filter((k) => homeOf(after.pods.get(k)) === null);
  const changed =
    pods.added.length + pods.removed.length + deploys.added.length + deploys.removed.length +
    services.added.length + services.removed.length + nodes.added.length + nodes.removed.length +
    replicaSets.added.length + replicaSets.removed.length +
    placed.length + started.length + changedDeploys.length + changedServices.length > 0;
  if (!changed && !addressed) return [];

  const out: Happening[] = [
    {
      building: 'cp:api',
      label: changed ? '窓口が申し込みを受け取り、中身を確かめた' : '窓口が問い合わせを受け取った',
      cargo: 'sheet',
      cargoLabel: changed ? '申し込み' : '問い合わせ',
    },
    {
      building: 'cp:store',
      label: changed
        ? `台帳に書き取った。記録は ${String(records(after))} 件になった`
        : `台帳を読み上げた。記録は ${String(records(after))} 件`,
      cargo: 'seal',
      cargoLabel: '台帳の記録',
    },
  ];

  const name = (key: string): string => key.split('/').pop() ?? key;

  // 事務所。注文そのものが変わった所に寄る
  for (const key of deploys.added) {
    out.push({
      building: `deploy:${key}`,
      label: `事務所が「${name(key)} を ${String(after.deployments.get(key)?.spec.replicas ?? 0)} 人」の注文を預かった`,
      cargo: 'sheet',
      cargoLabel: '注文書',
    });
  }
  for (const key of changedDeploys) {
    const was = before.deployments.get(key)?.spec.replicas ?? 0;
    const now = after.deployments.get(key)?.spec.replicas ?? 0;
    out.push({
      building: `deploy:${key}`,
      label: `事務所の注文が ${String(was)} 人から ${String(now)} 人に変わった`,
      cargo: 'sheet',
      cargoLabel: '注文書',
    });
  }

  // 監督。あるべき数と揃った数の差を埋めに動いたときだけ寄る
  const gap = replicaSets.added.length + replicaSets.removed.length + changedDeploys.length +
    pods.added.filter((k) => (after.pods.get(k)?.metadata.ownerReferences.length ?? 0) > 0).length +
    pods.removed.filter((k) => (before.pods.get(k)?.metadata.ownerReferences.length ?? 0) > 0).length;
  if (gap > 0) {
    out.push({
      building: 'cp:controller',
      label: `監督があるべき数といまの数を見比べ、${String(gap)} か所の開きを埋めにかかった`,
      cargo: 'seal',
      cargoLabel: '足りない数',
    });
  }

  // 配置係。まだ行き先の決まらない住人は、ここの待合に並ぶ
  for (const key of queued) {
    out.push({
      building: 'cp:scheduler',
      label: `配置係の待合に ${name(key)} が並んだ。まだ行き先が決まっていない（Pending）`,
      cargo: 'crate',
      cargoLabel: '行き先待ちの荷',
    });
  }

  // 配置係。行き先が決まった住人がいたときだけ寄る
  for (const key of placed) {
    out.push({
      building: 'cp:scheduler',
      label: `配置係が ${name(key)} の行き先に ${String(homeOf(after.pods.get(key)))} を選んだ`,
      cargo: 'crate',
      cargoLabel: '行き先の決まった荷',
    });
  }

  // ビル。住人が入った・出た・動き始めた
  const towers = new Map<string, string[]>();
  const note = (node: string, text: string): void => {
    towers.set(node, [...(towers.get(node) ?? []), text]);
  };
  for (const key of placed) note(String(homeOf(after.pods.get(key))), `${name(key)} が入居した`);
  for (const key of started) {
    const node = homeOf(after.pods.get(key));
    if (node !== null) note(node, `${name(key)} が動き始めた（Running）。窓が灯る`);
  }
  for (const gone of left) note(gone.node, `${name(gone.key)} が出ていった`);
  for (const [node, lines] of [...towers.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    out.push({
      building: `node:${node}`,
      label: `${node}：${lines.join('、')}`,
      cargo: 'bundle',
      cargoLabel: '住人の荷物',
    });
  }

  // バス停。路線の伸び先が変わった所に寄る
  for (const key of [...services.added, ...changedServices]) {
    const count = after.services.get(key)?.status.endpoints.length ?? 0;
    out.push({
      building: `svc:${key}`,
      label: `バス停 ${name(key)} の行き先が ${String(count)} 軒になった`,
      cargo: 'seal',
      cargoLabel: '時刻表',
    });
  }

  return out;
}

/** Git の街で起きたこと。倉庫・記念碑・旗のどれが動いたかを見る */
function gitHappenings(before: GitState, after: GitState): Happening[] {
  const out: Happening[] = [];
  const index = diffKeys(before.index, after.index);
  const changedIndex = index.kept.filter(
    (k) => before.index.get(k)?.hash !== after.index.get(k)?.hash,
  );
  const moved = index.added.length + index.removed.length + changedIndex.length;
  // 倉庫に入った紙は、元の小屋から運ばれてくる。荷の出どころを旅の始まりにする
  for (const path of [...index.added, ...changedIndex].slice(0, 2)) {
    out.push({
      building: `file:${after.root}/${path}`,
      kinds: ['hut'],
      label: `${path} の小屋から紙を持ち出した`,
      cargo: 'sheet',
      cargoLabel: 'ファイル',
    });
  }
  if (moved > 0) {
    out.push({
      kinds: ['depot'],
      label: `倉庫に預けた紙が ${String(moved)} 枚 変わった`,
      cargo: 'crate',
      cargoLabel: '荷札の付いた紙',
    });
  }

  const commits = [...after.refs.values()].filter((sha) => ![...before.refs.values()].includes(sha));
  if (commits.length > 0) {
    out.push({
      kinds: ['monument'],
      label: '倉庫の中身を石に刻み、新しい碑が建った',
      cargo: 'stone',
      cargoLabel: '刻まれた石',
    });
  }

  const refs = diffKeys(before.refs, after.refs);
  const movedRefs = refs.added.length + refs.removed.length +
    refs.kept.filter((k) => before.refs.get(k) !== after.refs.get(k)).length;
  if (movedRefs > 0) {
    out.push({
      kinds: ['flag'],
      label: `旗が動いた。目印が ${String(movedRefs)} 本 掛け替わった`,
      cargo: 'seal',
      cargoLabel: '通りの印',
    });
  }
  return out;
}

/** ネットワークの街で起きたこと。道が開いたか閉じたか、荷物がどこを通ったか */
function netHappenings(before: Topology, after: Topology): Happening[] {
  const out: Happening[] = [];
  // リンクの端は 'host1:eth0' の形。機器の名前だけを取り出して道の名にする
  const side = (end: string): string => end.split(':')[0] ?? end;
  const key = (link: { a: string; b: string }): string => `${side(link.a)}-${side(link.b)}`;
  const was = new Map(before.links.map((l) => [key(l), l.up]));
  for (const link of after.links) {
    const older = was.get(key(link));
    if (older === undefined || older === link.up) continue;
    out.push({
      kinds: ['gate', 'relay', 'house'],
      label: link.up ? `${key(link)} の道が開いた` : `${key(link)} の道を閉じた`,
      cargo: 'seal',
      cargoLabel: '通行の札',
    });
  }
  // 荷物を送ったときは、通った機器を順に辿る
  const trace = after.trace;
  if (trace !== undefined && trace !== before.trace) {
    for (const hop of trace.hops) {
      out.push({
        building: `dev:${hop.device}`,
        kinds: ['house', 'gate', 'relay'],
        label: `${hop.device} を通った。残りの寿命（TTL）は ${String(hop.ttl)}`,
        cargo: 'crate',
        cargoLabel: '荷物',
      });
    }
  }
  return out;
}

/** GitHub の街で起きたこと。申し込みと検査 */
function githubHappenings(before: Repo, after: Repo): Happening[] {
  const out: Happening[] = [];
  if (after.pulls.length > before.pulls.length) {
    out.push({
      kinds: ['window'],
      label: '審査窓口に申し込みが 1 件 増えた',
      cargo: 'seal',
      cargoLabel: '封をした便り',
    });
  }
  const checks = (repo: Repo): number => repo.pulls.reduce((sum, pull) => sum + pull.checks.length, 0);
  if (checks(after) !== checks(before)) {
    out.push({
      kinds: ['line'],
      label: `検査ラインが動いた。検査は ${String(checks(after))} 件`,
      cargo: 'crate',
      cargoLabel: '検印の付いた荷',
    });
  }
  return out;
}

/** ファイルの街で起きたこと。小屋が建ったか、中身が変わったか */
function vfsHappenings(before: VfsState, after: VfsState): Happening[] {
  const out: Happening[] = [];
  const files = diffKeys(before.nodes, after.nodes);
  const rewritten = files.kept.filter((k) => before.nodes.get(k) !== after.nodes.get(k));
  for (const path of files.added.slice(0, 3)) {
    out.push({ kinds: ['hut'], building: `file:${path}`, label: `${path} の小屋が建った`, cargo: 'sheet', cargoLabel: 'ファイル' });
  }
  for (const path of rewritten.slice(0, 3)) {
    out.push({ kinds: ['hut'], building: `file:${path}`, label: `${path} の中身が書き換わった`, cargo: 'sheet', cargoLabel: 'ファイル' });
  }
  for (const path of files.removed.slice(0, 3)) {
    out.push({ kinds: ['hut'], label: `${path} の小屋を畳んだ`, cargo: 'sheet', cargoLabel: '畳んだ紙' });
  }
  return out;
}

/* ---------------- 道のりに組む ---------------- */

/** その出来事に当たる建物を 1 つ選ぶ。街に無ければ選べない */
function placeOf(
  happening: Happening,
  buildings: readonly Building[],
  used: ReadonlySet<string>,
): Building | undefined {
  if (happening.building !== undefined) {
    const exact = buildings.find((b) => b.id === happening.building);
    if (exact !== undefined) return exact;
  }
  for (const kind of happening.kinds ?? []) {
    const found = buildings.filter((b) => b.kind === kind && b.phase === 'done');
    const fresh = found.find((b) => !used.has(b.id));
    if (fresh !== undefined) return fresh;
    if (found[0] !== undefined) return found[0];
  }
  return undefined;
}

/** 問い合わせの答えにあたる建物に添える札。「これが何か」を平易な言葉で言う */
export interface Answer {
  /** 「これがノード」のような一言 */
  title: string;
  /** それが何のためにあるか */
  plain: string;
}

/**
 * 問い合わせが「何について」答えたのか。`kubectl get nodes` ならビル。
 * 街に建っている物のうち、答えの中身にあたる種類と、そこに添える札を返す。
 */
const ASKED_ABOUT: Readonly<Record<string, { kind: BuildingKind; answer: Answer; lived?: boolean }>> = (() => {
  const node = { kind: 'tower' as const, answer: { title: 'これがノード', plain: 'アプリを動かす建物' } };
  const pod = {
    kind: 'tower' as const,
    answer: { title: 'Pod はこの中にいる', plain: 'アプリを入れた住人が暮らす建物' },
    lived: true,
  };
  const deploy = { kind: 'office' as const, answer: { title: 'これが Deployment', plain: '「何人そろえるか」の注文を預かる事務所' } };
  const svc = { kind: 'stop' as const, answer: { title: 'これが Service', plain: '住人が入れ替わっても名前の変わらないバス停' } };
  return {
    node, nodes: node, no: node,
    pod, pods: pod, po: pod,
    deploy, deployment: deploy, deployments: deploy,
    svc, service: svc, services: svc,
  };
})();

/** 問い合わせなら、その答えの種類。問い合わせでなければ undefined */
function askedAbout(words: readonly string[]) {
  if (words[0] !== 'kubectl') return undefined;
  if (words[1] !== 'get' && words[1] !== 'describe') return undefined;
  return ASKED_ABOUT[(words[2] ?? '').toLowerCase()];
}

/**
 * 読み上げた答えにあたる建物。問い合わせでなければ空。
 * Pod を尋ねたときは、住人のいるビルだけ（空のビルを「ここにいる」と指さない）。
 */
export function highlightOf(words: readonly string[], buildings: readonly Building[]): string[] {
  const asked = askedAbout(words);
  if (asked === undefined) return [];
  return buildings
    .filter((b) => b.kind === asked.kind && b.phase === 'done')
    .filter((b) => asked.lived !== true || b.occupants.length > 0)
    .map((b) => b.id);
}

/** 読み上げた答えに添える札。光らせる建物が無ければ null */
export function answerOf(words: readonly string[], buildings: readonly Building[]): Answer | null {
  const asked = askedAbout(words);
  if (asked === undefined || highlightOf(words, buildings).length === 0) return null;
  return asked.answer;
}

/** その旅が、どの仕組みの帯に並ぶか。停留所になった建物の種類から決める */
function lanesFor(kinds: ReadonlySet<BuildingKind>): readonly LaneSpec[] {
  const has = (list: readonly LaneSpec[]): boolean => list.some((lane) => kinds.has(lane.kind));
  if (has(K8S_LANES.slice(0, 2)) || kinds.has('tower') || kinds.has('dispatch')) return K8S_LANES;
  if (kinds.has('window') || kinds.has('line')) return GITHUB_LANES;
  if (has(GIT_LANES)) return GIT_LANES;
  if (has(NET_LANES)) return NET_LANES;
  return [];
}

/** コマンドを語に割る。1 行目だけを見る（ヒアドキュメントの本文は旅に出さない） */
export function wordsOf(command: string): string[] {
  return (command.split('\n')[0] ?? '').trim().split(/\s+/).filter((word) => word !== '');
}

/**
 * 打つ前と打った後を見比べて、旅の道のりを導く。
 *
 * 停留所になる建物がまだ街に無ければ、その停留所は飛ばす。
 * 停留所が 2 つに満たないときは旅を出さない（同じ場所に留まる旅は見せない）。
 */
export function journeyOf(input: {
  command: string;
  before: WorldState;
  after: WorldState;
  city: Pick<City, 'buildings'>;
  /** 何本目の旅か。同じコマンドを続けて打っても別の旅として数える */
  serial?: number;
}): Journey | null {
  const words = wordsOf(input.command);
  if (words.length === 0) return null;

  const happenings: Happening[] = [];
  const { before, after } = input;
  if (before.cluster != null && after.cluster != null) {
    happenings.push(...k8sHappenings(before.cluster, after.cluster, words[0] === 'kubectl'));
  }
  if (before.git != null && after.git != null) happenings.push(...gitHappenings(before.git, after.git));
  if (before.repo != null && after.repo != null) happenings.push(...githubHappenings(before.repo, after.repo));
  if (before.net != null && after.net != null) happenings.push(...netHappenings(before.net, after.net));
  if (before.vfs != null && after.vfs != null) happenings.push(...vfsHappenings(before.vfs, after.vfs));

  const used = new Set<string>();
  const stops: JourneyStop[] = [];
  const kinds = new Set<BuildingKind>();
  for (const happening of happenings) {
    const found = placeOf(happening, input.city.buildings, used);
    if (found === undefined) continue;
    used.add(found.id);
    kinds.add(found.kind);
    // 同じ建物が続くときは、そこで起きたことを 1 つにまとめる。粒をその場で足踏みさせない
    const last = stops[stops.length - 1];
    if (last !== undefined && last.building === found.id) {
      last.label = `${last.label}／${happening.label}`;
      last.cargo = happening.cargo;
      last.cargoLabel = happening.cargoLabel;
      continue;
    }
    stops.push({
      building: found.id,
      label: happening.label,
      cargo: happening.cargo,
      cargoLabel: happening.cargoLabel,
    });
  }
  if (stops.length < 2) return null;

  const at = new Map<BuildingKind, number>();
  for (const [i, stop] of stops.entries()) {
    const kind = input.city.buildings.find((b) => b.id === stop.building)?.kind;
    if (kind !== undefined && !at.has(kind)) at.set(kind, i);
  }
  const lanes: JourneyLane[] = lanesFor(kinds).map((lane, index) => ({
    index,
    title: lane.title,
    stop: at.get(lane.kind) ?? null,
  }));

  const command = words.join(' ');
  return {
    id: `${String(input.serial ?? 0)}:${command}`,
    command,
    stops,
    lanes,
    highlight: highlightOf(words, input.city.buildings),
    answer: answerOf(words, input.city.buildings),
  };
}
