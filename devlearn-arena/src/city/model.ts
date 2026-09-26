import { nodeCondition } from '@/engines/k8s/bootstrap';
import { key, type ClusterState, type Pod } from '@/engines/k8s/types';
import { parseCommit } from '@/engines/git/objects';
import type { GitState } from '@/engines/git/types';
import type { Repo } from '@/engines/github/types';
import { linkUsable } from '@/engines/net/build';
import type { Topology } from '@/engines/net/types';
import { list, stat, type VfsState } from '@/engines/kernel/vfs';
import { CITY_HEIGHT, CITY_WIDTH, DISTRICTS, districtArea, type DistrictArea, type DistrictId } from './growth';

/**
 * 街のモデル。React には依存しない純粋なデータ。
 *
 * 学習の状態（ファイル・Git・クラスタ・ネットワーク・GitHub）から街の姿を導く。
 * 街は状態の写像であり、飾りではない。同じ状態からは必ず同じ街になる。
 * `Date` と `Math.random` は使わない。
 */

export interface CityTile {
  x: number;
  y: number;
  kind: 'grass' | 'road' | 'plot' | 'water';
}

/**
 * 建物の種類。学ぶ対象ごとに街での姿が決まっている。
 * tower=高層ビル（ノード） office=建設会社の事務所（Deployment） stop=バス停（Service）
 * monument=記念碑（コミット） flag=旗（ブランチ） depot=倉庫（index） hut=小屋（ファイル）
 * house=家（機器） relay=中継塔（ルータ） gate=関所（スイッチ）
 * window=審査窓口（PR） line=検査ライン（CI の job）
 * desk=窓口（API サーバ） ledger=台帳（etcd） watch=監督（コントローラ） dispatch=配置係（スケジューラ）
 */
export type BuildingKind =
  | 'tower' | 'office' | 'stop'
  | 'monument' | 'flag' | 'depot'
  | 'hut' | 'house' | 'relay' | 'gate'
  | 'window' | 'line'
  | 'desk' | 'ledger' | 'watch' | 'dispatch';

/**
 * 建物や住人に付く、押せる印。
 * stop=停止（通行止め） close=× plus=＋ minus=− send=運ぶ
 */
export interface CityAction {
  mark: 'stop' | 'close' | 'plus' | 'minus' | 'send';
  command: string;
  why: string;
}

export interface Occupant {
  id: string;
  label: string;
  state: 'moving' | 'settled' | 'sick' | 'gone';
  /** 引っ越し中なら移動元の建物 */
  from?: string;
  /** 押したときに端末へ送るコマンド */
  command?: string;
  why?: string;
  /** 住人に付く印（× で消すなど） */
  actions?: CityAction[];
}

export interface Building {
  /** 元になった資源の識別子（ノード名、ディレクトリのパス等） */
  id: string;
  kind: BuildingKind;
  /** 区画の左上（タイル座標） */
  x: number;
  y: number;
  /** 大きさ。規模が大きいほど広い／高い */
  w: number;
  h: number;
  /** 1..5。使われるほど育つ */
  level: number;
  label: string;
  /** 中にいる住人（Pod / ファイル / コミットなど） */
  occupants: Occupant[];
  state: 'building' | 'normal' | 'busy' | 'broken';
  /** 建ち上がりの段。基礎 → 骨組み → 完成 の 3 段階で建つ */
  phase: 'base' | 'frame' | 'done';
  /** どの区域に建っているか */
  district: DistrictId;
  /** 押したときに端末へ送るコマンド。無ければ押せない */
  command?: string;
  /** なぜそのコマンドなのか。押したときに一行で出す */
  why?: string;
  /** 建物に付く印（停止・増やす・減らすなど） */
  actions?: CityAction[];
  /**
   * 学習で積み上がった階。
   * コマンドの手順を通すたびに、どこかの建物が 1 階ぶん高くなる。
   */
  bonusFloors?: number;
}

/** 区画。ディレクトリ 1 つが 1 区画になる */
export interface CityPlot {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  district: DistrictId;
  command?: string;
  why?: string;
}

/** 道。建物どうしを結ぶ */
export interface CityRoad {
  from: string;
  to: string;
  active: boolean;
  /**
   * 塞がっているか。ケーブルが抜けた道のように、いま通れなくなっている所。
   * `active: false` は「今この道を何も通っていない」だけだが、こちらは「通れない」。
   */
  blocked?: boolean;
  /** 押したときに端末へ送るコマンド */
  command?: string;
  why?: string;
}

/** 荷車。パケット 1 つが 1 台。道を 1 ホップずつ走る */
export interface Cart {
  id: string;
  /** 通る建物の id。送り出した所から順に並ぶ */
  path: string[];
  /** 残り寿命（TTL）。減るほど荷が軽くなる */
  ttl: number;
  delivered: boolean;
}

export interface CityDistrict {
  track: DistrictId;
  unlocked: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * 学習者が建設メニューから選べる建物。
 * 街の姿は学習者が決める。ここが増えても、学習の状態から導いた建物は動かない。
 */
export type DesignKind = 'road' | 'zone' | 'house' | 'office' | 'monument' | 'depot' | 'hall' | 'relay';

/** 建てられる区画。更地でもここが光るので、何も無い島を見せずに済む */
export interface CitySite {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  district: DistrictId;
}

/** 学習者が置いた建物。どの区画に何を建てたか */
export interface Placement {
  /** 置いた区画（CitySite.id） */
  site: string;
  kind: DesignKind;
  /** 規模。1 が小さく、3 が大きい。建設メニューの引き出しで選ぶ */
  level?: number;
}

export interface City {
  width: number;
  height: number;
  tiles: CityTile[];
  buildings: Building[];
  roads: CityRoad[];
  /** 解放済みの区域。学習が進むと増える */
  districts: CityDistrict[];
  /** 区画（ディレクトリ） */
  plots: CityPlot[];
  /** 走っている荷車（パケット） */
  carts: Cart[];
  /** まだ空いている区画。ここを押すと建設メニューで選んだものが建つ */
  sites: CitySite[];
  /** 学習で積み上がった階のうち、最後の 1 階が載った建物。街が育った場所へカメラを寄せるのに使う */
  lastRaised?: string;
}

/** 住人がどの建物にいたか。引っ越しを見せるために、直前の街から取っておく */
export type Whereabouts = ReadonlyMap<string, string>;

/**
 * 学習で積み上がった街の育ち。
 * コマンドの手順を通すと階（floors）が、理解度の問題に正解すると家（houses）が増える。
 */
export interface CityGrowth {
  houses: number;
  floors: number;
}

export interface CityInput {
  /** 学習者の作業場所。ここより下にあるものだけが街になる */
  home?: string;
  vfs?: VfsState | null;
  git?: GitState | null;
  cluster?: ClusterState | null;
  net?: Topology | null;
  repo?: Repo | null;
  /** 解放済みの区域。省略すると中央だけ */
  unlocked?: readonly DistrictId[];
  /** 直前の街での住人の居場所 */
  before?: Whereabouts;
  /** 学習で積み上がった育ち。コマンドの成功とクイズの正解で増える */
  growth?: CityGrowth;
  /** 学習者が建設メニューから置いたもの */
  designed?: readonly Placement[];
}

/** 高層ビルが建ち上がるまでの tick 数。ノードが増えるとまず工事が始まる */
export const BUILD_TICKS = 3;

const DEFAULT_HOME = '/home/learner';

/** 住人がいまどの建物にいるかを覚える。次の街に渡すと引っ越しが見える */
export function whereabouts(city: City): Whereabouts {
  const map = new Map<string, string>();
  for (const b of city.buildings) {
    // 出ていった住人は覚えない。出ていく姿は 1 度見せれば足りる
    for (const o of b.occupants) if (o.state !== 'gone') map.set(o.id, b.id);
  }
  return map;
}

/** 区画を左上から順に配ってゆく割り付け。同じ入力からは必ず同じ並びになる */
class Lots {
  private index = 0;

  constructor(
    private readonly id: DistrictId,
    private readonly lotW: number,
    private readonly lotH: number,
  ) {}

  /** 次の区画の左上。区域から溢れたら、いちばん下の行に詰める */
  next(): { x: number; y: number; district: DistrictId } {
    const area = districtArea(this.id);
    const cols = Math.max(1, Math.floor((area.w - 1) / (this.lotW + 1)));
    const rows = Math.max(1, Math.floor((area.h - 1) / (this.lotH + 1)));
    const i = this.index;
    this.index += 1;
    const col = i % cols;
    const row = Math.min(rows - 1, Math.floor(i / cols));
    return {
      x: area.x + 1 + col * (this.lotW + 1),
      y: area.y + 1 + row * (this.lotH + 1),
      district: this.id,
    };
  }
}

/**
 * 区域の中を、北から南へ帯に分けて配る割り付け。
 *
 * 種類ごとに帯を分けるので、ビルと事務所とバス停が同じ所に重ならない。
 * `bottom` が次の帯の始まりになる。同じ入力からは必ず同じ並びになる。
 */
class Lane {
  private index = 0;

  constructor(
    private readonly area: DistrictArea,
    /** この帯の上端（タイル） */
    readonly top: number,
    private readonly w: number,
    private readonly h: number,
  ) {}

  private get cols(): number {
    return Math.max(1, Math.floor(this.area.w / this.w));
  }

  next(): { x: number; y: number; district: DistrictId } {
    const i = this.index;
    this.index += 1;
    return {
      x: this.area.x + (i % this.cols) * this.w,
      y: this.top + Math.floor(i / this.cols) * this.h,
      district: this.area.id,
    };
  }

  /** この帯を使い切った次の行。何も配らなかった帯は場所を取らない */
  get bottom(): number {
    if (this.index === 0) return this.top;
    return this.top + Math.ceil(this.index / this.cols) * this.h;
  }
}

/**
 * 建ち上がりの段。
 * 建て始めは基礎だけ、次に骨組みが立ち、BUILD_TICKS を過ぎると完成する。
 */
export function buildPhase(age: number): 'base' | 'frame' | 'done' {
  if (age >= BUILD_TICKS) return 'done';
  return age >= BUILD_TICKS / 2 ? 'frame' : 'base';
}

/** 使った量から 1..5 の育ちを出す */
function levelOf(amount: number): number {
  if (amount <= 0) return 1;
  return Math.min(5, 1 + Math.floor(Math.log2(amount + 1)));
}

/* ---------------- 地面 ---------------- */

function groundTiles(unlocked: ReadonlySet<DistrictId>): CityTile[] {
  const tiles: CityTile[] = [];
  for (let y = 0; y < CITY_HEIGHT; y += 1) {
    for (let x = 0; x < CITY_WIDTH; x += 1) {
      tiles.push({ x, y, kind: waterAt(x) ? 'water' : roadAt(x, y, unlocked) ? 'road' : 'grass' });
    }
  }
  return tiles;
}

/** 街の東の端を川が流れる */
function waterAt(x: number): boolean {
  return x >= CITY_WIDTH - 2;
}

/** 開いた区域の周りにだけ道を通す。開いていない所は原野のまま */
function roadAt(x: number, y: number, unlocked: ReadonlySet<DistrictId>): boolean {
  for (const area of DISTRICTS) {
    if (!unlocked.has(area.id)) continue;
    const inX = x >= area.x - 1 && x <= area.x + area.w;
    const inY = y >= area.y - 1 && y <= area.y + area.h;
    if (!inX || !inY) continue;
    // 区域のふちが通り
    if (x === area.x - 1 || x === area.x + area.w || y === area.y - 1 || y === area.y + area.h) return true;
  }
  // 中央から南北へ伸びる大通り
  return (x === 18 || x === 29) && y >= 1 && y < CITY_HEIGHT - 1;
}

function markPlots(tiles: CityTile[], plots: readonly CityPlot[]): void {
  for (const plot of plots) {
    for (let y = plot.y; y < plot.y + plot.h; y += 1) {
      for (let x = plot.x; x < plot.x + plot.w; x += 1) {
        const tile = tiles[y * CITY_WIDTH + x];
        if (tile && tile.kind === 'grass') tile.kind = 'plot';
      }
    }
  }
}

/* ---------------- ファイルとディレクトリ ---------------- */

/**
 * 学習者が作った資源だけが街になる。
 * 最初から在る OS のディレクトリ（`/etc` など）は描かない。開始時は更地である。
 */
function filesOf(vfs: VfsState, home: string, repoRoot: string | null, out: Built): void {
  if (stat(vfs, home) === undefined) return;
  const lots = new Lots('kernel', 3, 3);
  const walk = (dir: string, depth: number): void => {
    const names = [...list(vfs, dir)].sort();
    for (const name of names) {
      const path = dir === '/' ? `/${name}` : `${dir}/${name}`;
      const node = stat(vfs, path);
      if (node === undefined) continue;
      if (node.kind === 'dir') {
        const at = lots.next();
        out.plots.push({
          id: `dir:${path}`,
          label: name,
          x: at.x,
          y: at.y,
          w: 3,
          h: 3,
          district: at.district,
          command: `ls -l ${path}`,
          why: 'ディレクトリは街の区画。中に何が建っているかを見る',
        });
        if (depth < 2) walk(path, depth + 1);
      } else {
        const at = lots.next();
        out.buildings.push({
          id: `file:${path}`,
          kind: 'hut',
          x: at.x,
          y: at.y,
          w: 2,
          h: 2,
          level: levelOf(node.content.length),
          label: name,
          occupants: [],
          state: 'normal',
          phase: 'done',
          district: at.district,
          command: `cat ${path}`,
          why: 'ファイルは小屋。中身が増えると大きくなる',
          // 倉庫（index）へ運ぶ。リポジトリの中の小屋にだけ付く
          ...(repoRoot !== null && path.startsWith(`${repoRoot}/`)
            ? {
                actions: [
                  {
                    mark: 'send' as const,
                    command: `git add ${path.slice(repoRoot.length + 1)}`,
                    why: '小屋の中身を倉庫（index）へ運ぶ。commit で碑になる',
                  },
                ],
              }
            : {}),
        });
      }
    }
  };
  walk(home, 0);
}

/* ---------------- Git ---------------- */

interface CommitNode {
  hash: string;
  message: string;
  parents: string[];
}

/** すべてのブランチから辿れるコミットを、親が先に来る順で集める */
function commitsOf(git: GitState): CommitNode[] {
  const seen = new Map<string, CommitNode>();
  const tips: string[] = [];
  for (const [ref, hash] of [...git.refs].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (ref.startsWith('refs/heads/')) tips.push(hash);
  }
  if (git.head.type === 'detached') tips.push(git.head.hash);

  const stack = [...tips];
  while (stack.length > 0) {
    const hash = stack.pop();
    if (hash === undefined || seen.has(hash)) continue;
    const object = git.objects.read(hash);
    if (!object || object.type !== 'commit') continue;
    const parsed = parseCommit(object.body);
    seen.set(hash, { hash, message: parsed.message.trim().split('\n')[0] ?? '', parents: [...parsed.parents] });
    for (const parent of parsed.parents) stack.push(parent);
  }

  // 親が先に並ぶ順（歴史通りの順番）にする
  const order: CommitNode[] = [];
  const done = new Set<string>();
  const visit = (hash: string): void => {
    if (done.has(hash)) return;
    const node = seen.get(hash);
    if (node === undefined) return;
    done.add(hash);
    for (const parent of [...node.parents].sort()) visit(parent);
    order.push(node);
  };
  for (const hash of [...seen.keys()].sort()) visit(hash);
  return order;
}

function gitOf(git: GitState, out: Built): void {
  const area = districtArea('git');
  const commits = commitsOf(git);

  // 記念碑は歴史通りに沿って一列に並ぶ。commit のたびに新しい碑が建つ
  const placed = new Map<string, { x: number; y: number }>();
  commits.forEach((commit, i) => {
    const perRow = Math.max(1, Math.floor((area.w - 2) / 3));
    const at = { x: area.x + 1 + (i % perRow) * 3, y: area.y + 1 + Math.floor(i / perRow) * 4 };
    placed.set(commit.hash, at);
    out.buildings.push({
      id: `commit:${commit.hash}`,
      kind: 'monument',
      x: at.x,
      y: at.y,
      w: 2,
      h: 2,
      level: 1,
      label: commit.message === '' ? commit.hash.slice(0, 7) : commit.message,
      occupants: [],
      state: 'normal',
      phase: 'done',
      district: 'git',
      command: `git show ${commit.hash.slice(0, 7)}`,
      why: '記念碑はコミット。何を残したのかを見る',
    });
  });

  // 親から子へ通りが伸びる。分かれれば通りが分岐し、マージすれば合流する
  for (const commit of commits) {
    for (const parent of commit.parents) {
      if (!placed.has(parent)) continue;
      out.roads.push({ from: `commit:${parent}`, to: `commit:${commit.hash}`, active: true });
    }
  }

  // 旗はブランチ。tip の碑から通りが分かれる
  const head = git.head.type === 'branch' ? git.head.name : null;
  for (const [ref, hash] of [...git.refs].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (!ref.startsWith('refs/heads/')) continue;
    const name = ref.slice('refs/heads/'.length);
    const at = placed.get(hash);
    if (at === undefined) continue;
    out.buildings.push({
      id: `branch:${name}`,
      kind: 'flag',
      x: at.x,
      y: at.y + 2,
      w: 1,
      h: 1,
      level: 1,
      label: name,
      occupants: [],
      state: name === head ? 'busy' : 'normal',
      phase: 'done',
      district: 'git',
      command: `git switch ${name}`,
      why: '旗はブランチ。いまどの通りで作業するかを移す',
    });
    out.roads.push({ from: `commit:${hash}`, to: `branch:${name}`, active: name === head });
  }

  // 倉庫は index。add したファイルが家から運ばれ、commit で碑になる
  const staged = [...git.index.values()].sort((a, b) => (a.path < b.path ? -1 : 1));
  out.buildings.push({
    id: 'index',
    kind: 'depot',
    x: area.x + 1,
    y: area.y + area.h - 3,
    w: 3,
    h: 2,
    level: levelOf(staged.length),
    label: '倉庫',
    occupants: staged.map((entry) => ({
      id: `staged:${entry.path}`,
      label: entry.path,
      state: 'settled' as const,
      from: `file:${git.root}/${entry.path}`,
    })),
    state: staged.length > 0 ? 'busy' : 'normal',
    phase: 'done',
    district: 'git',
    command: 'git status',
    why: '倉庫は index。commit で碑になるものが置いてある',
  });
}

/* ---------------- Kubernetes ---------------- */

/** 管制の施設 1 つの大きさ（タイル） */
const CP_SIZE = { w: 3, h: 2 } as const;

/** Pod の様子を住人の様子に移す */
function occupantState(pod: Pod): Occupant['state'] {
  const phase = pod.status.phase;
  if (phase === 'Failed') return 'sick';
  if (phase === 'Succeeded') return 'gone';
  // 倒れて運ばれ、また戻る（CrashLoopBackOff や ImagePullBackOff）
  if (pod.status.containerStatuses.some((c) => c.waitingReason !== null)) return 'sick';
  if (phase === 'Running') return 'settled';
  return 'moving';
}

/**
 * 管制の 4 施設。窓口・台帳・監督・配置係。
 *
 * ノードが 1 台でもあれば Kubernetes はもう動いているので、この 4 つは最初から建っている。
 * 出す数はすべてクラスタから読む。飾りの建物ではない。
 */
function controlPlaneOf(cluster: ClusterState, lane: Lane, out: Built): void {
  const pods = [...cluster.pods.values()];
  // 配置係の待ち行列。まだ行き先の決まっていない Pod
  const waiting = pods.filter((p) => p.status.nodeName === null).length;
  // 台帳に載っている記録の数
  const records =
    cluster.nodes.size + cluster.pods.size + cluster.deployments.size + cluster.replicaSets.size +
    cluster.services.size + cluster.configMaps.size + cluster.secrets.size;
  // 監督が埋めようとしている開き。あるべき数と、いま揃っている数の差
  const gap =
    [...cluster.deployments.values()].reduce(
      (sum, d) => sum + Math.abs(d.spec.replicas - d.status.readyReplicas),
      0,
    ) +
    [...cluster.replicaSets.values()].reduce(
      (sum, r) => sum + Math.abs(r.spec.replicas - r.status.readyReplicas),
      0,
    );
  const ready = cluster.controlPlane.initialized;

  const desks: readonly {
    id: string;
    kind: BuildingKind;
    label: string;
    level: number;
    busy: boolean;
    command: string;
    why: string;
  }[] = [
    {
      id: 'cp:api',
      kind: 'desk',
      label: '窓口',
      level: levelOf(cluster.events.length),
      busy: false,
      command: 'kubectl get nodes',
      why: '窓口は API サーバ。街への願いは全部ここを通り、ここだけが台帳に書き込む',
    },
    {
      id: 'cp:store',
      kind: 'ledger',
      label: '台帳',
      level: levelOf(records),
      busy: false,
      command: 'kubectl get events',
      why: '台帳は etcd。街の決まりごとと出来事が、すべてここに残る',
    },
    {
      id: 'cp:controller',
      kind: 'watch',
      label: '監督',
      level: levelOf(gap + 1),
      busy: gap > 0,
      command: 'kubectl get deploy',
      why: '監督はコントローラ。あるべき数といまの数を見比べ、足りなければ足す',
    },
    {
      id: 'cp:scheduler',
      kind: 'dispatch',
      label: '配置係',
      level: levelOf(waiting + 1),
      busy: waiting > 0,
      command: 'kubectl get pods -o wide',
      why: '配置係はスケジューラ。空きのあるビルを選んで、新しい住人の行き先を決める',
    },
  ];

  for (const desk of desks) {
    const at = lane.next();
    out.buildings.push({
      id: desk.id,
      kind: desk.kind,
      x: at.x,
      y: at.y,
      w: CP_SIZE.w,
      h: CP_SIZE.h,
      level: desk.level,
      label: desk.label,
      occupants: [],
      state: !ready ? 'building' : desk.busy ? 'busy' : 'normal',
      phase: ready ? 'done' : 'frame',
      district: at.district,
      command: desk.command,
      why: desk.why,
    });
  }

  // 管制どうしは道でつながる。願いは窓口から台帳へ流れ、監督と配置係はそれを見ている
  out.roads.push({ from: 'cp:api', to: 'cp:store', active: ready });
  out.roads.push({ from: 'cp:store', to: 'cp:controller', active: gap > 0 });
  out.roads.push({ from: 'cp:store', to: 'cp:scheduler', active: waiting > 0 });
}

function k8sOf(cluster: ClusterState, before: Whereabouts | undefined, out: Built): void {
  const area = districtArea('k8s');
  const towers = new Map<string, Building>();
  /** 管理人（kubelet）が止まっているビル。中の住人の様子は当てにできない */
  const dark = new Set<string>();

  // 北から順に帯を積む。管制 → ビル → 事務所 → バス停
  const desks = new Lane(area, area.y, CP_SIZE.w, CP_SIZE.h);
  controlPlaneOf(cluster, desks, out);

  const lots = new Lane(area, desks.bottom, 4, 4);
  for (const node of [...cluster.nodes.values()].sort((a, b) => (a.metadata.name < b.metadata.name ? -1 : 1))) {
    const at = lots.next();
    const age = cluster.tick - node.metadata.createdAt;
    const ready = nodeCondition(cluster, node).ready;
    // 学習者が来る前からあるノードは、もう建ち上がっている。
    // あとから加わったノード（kubeadm join）だけが、数 tick かけて建つ
    const settled = node.metadata.createdAt === 0 || age >= BUILD_TICKS;
    if (settled && !ready) dark.add(node.metadata.name);
    const building: Building = {
      id: `node:${node.metadata.name}`,
      kind: 'tower',
      x: at.x,
      y: at.y,
      w: 4,
      h: 4,
      level: 1,
      label: node.metadata.name,
      occupants: [],
      // ノードが増えると建設が始まり、数 tick かけて建つ
      state: !settled ? 'building' : !ready ? 'broken' : node.spec.unschedulable ? 'busy' : 'normal',
      phase: settled ? 'done' : buildPhase(age),
      district: at.district,
      command: `kubectl describe node ${node.metadata.name}`,
      why: '高層ビルはノード。どれだけ入居できて、いま何が起きているかを見る',
      actions: [
        node.spec.unschedulable
          ? {
              mark: 'stop' as const,
              command: `kubectl uncordon ${node.metadata.name}`,
              why: '通行止めを解いて、新しい住人を受け入れられるようにする',
            }
          : {
              mark: 'stop' as const,
              command: `kubectl cordon ${node.metadata.name}`,
              why: 'このビルを通行止めにして、新しい住人が入らないようにする',
            },
      ],
    };
    towers.set(node.metadata.name, building);
    out.buildings.push(building);
    // 配置係が行き先を決めたビルへ、道が伸びる
    out.roads.push({ from: 'cp:scheduler', to: building.id, active: ready });
  }

  // 住人は Pod。配置されたビルへ入る。別ノードへ移ると引っ越す
  for (const pod of [...cluster.pods.values()].sort((a, b) => (a.metadata.name < b.metadata.name ? -1 : 1))) {
    const nodeName = pod.status.nodeName;
    if (nodeName === null) continue;
    const tower = towers.get(nodeName);
    if (tower === undefined) continue;
    const id = `pod:${pod.metadata.namespace}/${pod.metadata.name}`;
    const was = before?.get(id);
    const occupant: Occupant = {
      id,
      label: pod.metadata.name,
      // 管理人が止まったビルの住人は、動いているとは言えない。
      // 台帳の phase は Running のままでも、それは古い記録なので鵜呑みにしない
      state: dark.has(nodeName) ? 'sick' : occupantState(pod),
      command: `kubectl describe pod ${pod.metadata.name}`,
      why: '住人は Pod。いまどんな様子かを見る',
      actions: [
        {
          mark: 'close',
          command: `kubectl delete pod ${pod.metadata.name}`,
          why: 'この住人に出ていってもらう。Deployment の住人なら代わりが来る',
        },
      ],
    };
    if (was !== undefined && was !== tower.id) occupant.from = was;
    tower.occupants.push(occupant);
  }
  // 消された住人。直前の街にいて、いまの台帳に無い住人は、元のビルから出ていく姿を 1 度だけ見せる。
  // 消した瞬間に姿が消えると、何が起きたのかが街の上で分からないため
  const byId = new Map([...towers.values()].map((t) => [t.id, t]));
  for (const [id, where] of before ?? []) {
    if (!id.startsWith('pod:')) continue;
    const [namespace = '', name = ''] = id.slice('pod:'.length).split('/');
    if (cluster.pods.has(key(namespace, name))) continue;
    const tower = byId.get(where);
    if (tower === undefined) continue;
    tower.occupants.push({ id, label: name, state: 'gone', why: '出ていった住人。もう台帳には載っていない' });
  }
  for (const tower of towers.values()) tower.level = levelOf(tower.occupants.length);

  // 建設会社の事務所は Deployment。replicas を増やすと住人の募集が始まる
  const offices = new Lane(area, lots.bottom, 3, 2);
  for (const deploy of [...cluster.deployments.values()].sort((a, b) => (a.metadata.name < b.metadata.name ? -1 : 1))) {
    const at = offices.next();
    const id = `deploy:${deploy.metadata.namespace}/${deploy.metadata.name}`;
    out.buildings.push({
      id,
      kind: 'office',
      x: at.x,
      y: at.y,
      w: 3,
      h: 2,
      level: levelOf(deploy.spec.replicas),
      label: deploy.metadata.name,
      occupants: [],
      state: deploy.status.readyReplicas < deploy.spec.replicas ? 'busy' : 'normal',
      phase: 'done',
      district: at.district,
      command: `kubectl describe deploy ${deploy.metadata.name}`,
      why: '事務所は Deployment。いま何人を募集していて、何人揃ったかを見る',
      actions: [
        {
          mark: 'plus',
          command: `kubectl scale deploy ${deploy.metadata.name} --replicas=${String(deploy.spec.replicas + 1)}`,
          why: '募集する人数（replicas）を 1 人増やす',
        },
        {
          mark: 'minus',
          command: `kubectl scale deploy ${deploy.metadata.name} --replicas=${String(Math.max(0, deploy.spec.replicas - 1))}`,
          why: '募集する人数（replicas）を 1 人減らす',
        },
      ],
    });
    // 事務所の願いは監督が見ている
    out.roads.push({
      from: 'cp:controller',
      to: id,
      active: deploy.status.readyReplicas < deploy.spec.replicas,
    });
  }

  // バス停は Service。Endpoints に載った Pod のいるビルにだけ路線が伸びる
  const stops = new Lane(area, offices.bottom, 2, 2);
  for (const service of [...cluster.services.values()].sort((a, b) => (a.metadata.name < b.metadata.name ? -1 : 1))) {
    const at = stops.next();
    const id = `svc:${service.metadata.namespace}/${service.metadata.name}`;
    out.buildings.push({
      id,
      kind: 'stop',
      x: at.x,
      y: at.y,
      w: 2,
      h: 2,
      level: levelOf(service.status.endpoints.length),
      label: service.metadata.name,
      occupants: [],
      state: service.status.endpoints.length === 0 ? 'broken' : 'normal',
      phase: 'done',
      district: at.district,
      command: `kubectl describe service ${service.metadata.name}`,
      why: 'バス停は Service。どのビルへ路線が伸びているかを見る',
    });
    const reached = new Set<string>();
    for (const endpoint of service.status.endpoints) {
      const pod = [...cluster.pods.values()].find((p) => p.status.podIP === endpoint || p.metadata.name === endpoint);
      const nodeName = pod?.status.nodeName;
      if (nodeName != null && towers.has(nodeName)) reached.add(`node:${nodeName}`);
    }
    for (const to of [...reached].sort()) out.roads.push({ from: id, to, active: true });
  }
}

/* ---------------- ネットワーク ---------------- */

const DEVICE_KIND: Record<string, BuildingKind> = { host: 'house', router: 'relay', switch: 'gate' };

function netOf(net: Topology, out: Built): void {
  const lots = new Lots('net', 3, 3);
  const known = new Set<string>();
  for (const device of [...net.devices.values()].sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const at = lots.next();
    known.add(device.name);
    out.buildings.push({
      id: `dev:${device.name}`,
      kind: DEVICE_KIND[device.kind] ?? 'house',
      x: at.x,
      y: at.y,
      w: 3,
      h: 3,
      level: levelOf(device.interfaces.length),
      label: device.name,
      occupants: [],
      state: device.interfaces.some((i) => i.up) ? 'normal' : 'broken',
      phase: 'done',
      district: at.district,
      command: `ping ${device.name}`,
      why: '施設は機器。そこまで荷物が届くかを試す',
    });
  }

  // 道路はリンク。切れると道が崩れる
  for (const link of net.links) {
    const a = link.a.split(':')[0] ?? '';
    const b = link.b.split(':')[0] ?? '';
    if (!known.has(a) || !known.has(b)) continue;
    const dev = link.a.split(':')[1] ?? '';
    // ケーブルが繋がっていても、どちらかの差し込み口が落ちていれば通れない
    const usable = linkUsable(net, link);
    out.roads.push({
      from: `dev:${a}`,
      to: `dev:${b}`,
      active: usable,
      blocked: !usable,
      command: `ip link set ${dev} ${usable ? 'down' : 'up'}`,
      why: usable ? '道路はケーブル。落とすと通れなくなる' : '落ちている道路を通せるようにする',
    });
  }

  // 荷車はパケット。1 ホップずつ道を走る
  const trace = net.trace;
  if (trace !== undefined) {
    out.carts.push({
      id: `packet:${String(trace.id)}`,
      path: trace.path.filter((name) => known.has(name)).map((name) => `dev:${name}`),
      ttl: trace.path.length,
      delivered: trace.delivered,
    });
  }
}

/* ---------------- GitHub ---------------- */

function githubOf(repo: Repo, out: Built): void {
  const lots = new Lots('github', 4, 3);
  for (const pull of [...repo.pulls].sort((a, b) => a.number - b.number)) {
    const at = lots.next();
    const approvals = pull.reviews.filter((r) => r.state === 'approved').length;
    const blocked = pull.reviews.some((r) => r.state === 'changes_requested');
    const required = repo.protections.find((p) => p.branch === pull.base)?.requiredApprovals ?? 1;
    out.buildings.push({
      id: `pr:${String(pull.number)}`,
      kind: 'window',
      x: at.x,
      y: at.y,
      w: 4,
      h: 3,
      level: levelOf(approvals),
      label: `#${String(pull.number)} ${pull.title}`,
      occupants: pull.reviews.map((review) => ({
        id: `review:${String(pull.number)}:${review.reviewer}`,
        label: review.reviewer,
        state: review.state === 'approved' ? ('settled' as const) : ('moving' as const),
      })),
      // 承認が揃うと門が開く
      state: pull.state === 'merged' ? 'normal' : blocked ? 'broken' : approvals >= required ? 'normal' : 'busy',
      phase: 'done',
      district: at.district,
      command: `gh pr view ${String(pull.number)}`,
      why: '審査窓口は Pull Request。承認と検査が揃っているかを見る',
    });

    // 検査ラインは CI の job。依存順に流れ、失敗で下流が止まる
    const lines = new Lots('github', 3, 1);
    for (const check of pull.checks) {
      const at2 = lines.next();
      const id = `check:${String(pull.number)}:${check.name}`;
      out.buildings.push({
        id,
        kind: 'line',
        x: at2.x,
        y: at2.y,
        w: 3,
        h: 1,
        level: 1,
        label: check.name,
        occupants: [],
        state: check.status === 'failure' ? 'broken' : check.status === 'success' ? 'normal' : 'busy',
        phase: 'done',
        district: at2.district,
        command: `gh pr checks ${String(pull.number)}`,
        why: '検査ラインは CI の job。どこで止まったのかを見る',
      });
      for (const need of check.needs) {
        const upstream = `check:${String(pull.number)}:${need}`;
        out.roads.push({ from: upstream, to: id, active: check.status !== 'failure' });
      }
    }
  }
}

/* ---------------- 組み立て ---------------- */

interface Built {
  buildings: Building[];
  roads: CityRoad[];
  plots: CityPlot[];
  carts: Cart[];
}

/**
 * コマンドの手順で積み上がった階を、建てた順に 1 階ずつ配る。
 * 1 本通すたびにどこかの建物が必ず高くなるので、育ちが目に見える。
 */
function raiseFloors(buildings: Building[], floors: number): string | undefined {
  if (floors <= 0 || buildings.length === 0) return undefined;
  let last: string | undefined;
  for (let i = 0; i < floors; i += 1) {
    const target = buildings[i % buildings.length];
    if (target === undefined) continue;
    target.bonusFloors = (target.bonusFloors ?? 0) + 1;
    last = target.id;
  }
  return last;
}

/**
 * 理解度の問題に正解するたび、住民が 1 軒ぶん引っ越してくる。
 * 中央の広場のまわりに、決まった順で並ぶ（置き場所は毎回同じ）。
 */
function rewardHouses(houses: number, out: Built): void {
  if (houses <= 0) return;
  const lots = new Lots('center', 2, 2);
  for (let i = 0; i < houses; i += 1) {
    const at = lots.next();
    out.buildings.push({
      id: `home:${String(i + 1)}`,
      kind: 'house',
      x: at.x,
      y: at.y,
      w: 2,
      h: 2,
      level: 1,
      label: `住民の家 ${String(i + 1)}`,
      occupants: [],
      state: 'normal',
      phase: 'done',
      district: at.district,
    });
  }
}

/** 建てられる区画 1 つの大きさ（タイル） */
const SITE = { w: 3, h: 3 } as const;

/** 一度に光らせる区画の数。多すぎると街が点滅して見える */
const MAX_SITES = 36;

/** 建設メニューの種類ごとの、建つもの */
const DESIGN_BUILDING: Record<Exclude<DesignKind, 'road' | 'zone'>, { kind: BuildingKind; label: string }> = {
  house: { kind: 'house', label: '住宅' },
  office: { kind: 'office', label: 'オフィス' },
  monument: { kind: 'monument', label: '記念碑' },
  depot: { kind: 'depot', label: '倉庫' },
  hall: { kind: 'window', label: '市役所' },
  relay: { kind: 'relay', label: '中継塔' },
};

/** そのタイルが何かに使われているか */
function coverage(out: Built): Set<string> {
  const used = new Set<string>();
  const mark = (x: number, y: number, w: number, h: number): void => {
    for (let dy = 0; dy < h; dy += 1) {
      for (let dx = 0; dx < w; dx += 1) used.add(`${String(x + dx)},${String(y + dy)}`);
    }
  };
  for (const b of out.buildings) mark(b.x, b.y, b.w, b.h);
  for (const p of out.plots) mark(p.x, p.y, p.w, p.h);
  return used;
}

/**
 * 建てられる区画を並べる。開いた区域の空き地を、左上から順に 3x3 で切り出す。
 * 更地でもここが光るので、何も無い島を見せずに済む。
 */
function openSites(unlocked: ReadonlySet<DistrictId>, out: Built): CitySite[] {
  const used = coverage(out);
  const sites: CitySite[] = [];
  for (const area of DISTRICTS) {
    if (!unlocked.has(area.id)) continue;
    const cols = Math.floor((area.w - 1) / (SITE.w + 1));
    const rows = Math.floor((area.h - 1) / (SITE.h + 1));
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const x = area.x + 1 + col * (SITE.w + 1);
        const y = area.y + 1 + row * (SITE.h + 1);
        let free = true;
        for (let dy = 0; dy < SITE.h && free; dy += 1) {
          for (let dx = 0; dx < SITE.w && free; dx += 1) {
            if (used.has(`${String(x + dx)},${String(y + dy)}`)) free = false;
          }
        }
        if (!free) continue;
        sites.push({ id: `site:${area.id}:${String(col)}:${String(row)}`, x, y, w: SITE.w, h: SITE.h, district: area.id });
      }
    }
  }
  return sites.slice(0, MAX_SITES);
}

/**
 * 学習者が置いたものを街に足す。
 * 置き場所は区画の id なので、同じ設計からは必ず同じ街になる。
 */
function designedOf(designed: readonly Placement[], sites: readonly CitySite[], out: Built): CitySite[] {
  const where = new Map(sites.map((site) => [site.id, site]));
  const taken = new Set<string>();
  for (const placed of designed) {
    const site = where.get(placed.site);
    if (site === undefined || taken.has(site.id)) continue;
    taken.add(site.id);
    if (placed.kind === 'zone') {
      out.plots.push({ id: `design:${site.id}`, label: '区画', x: site.x, y: site.y, w: site.w, h: site.h, district: site.district });
      continue;
    }
    if (placed.kind === 'road') {
      // 道は建物ではなく地面。区画の真ん中を通す
      out.plots.push({ id: `road:${site.id}`, label: '道路', x: site.x, y: site.y + 1, w: site.w, h: 1, district: site.district });
      continue;
    }
    const shape = DESIGN_BUILDING[placed.kind];
    out.buildings.push({
      id: `design:${site.id}`,
      kind: shape.kind,
      x: site.x,
      y: site.y,
      w: site.w,
      h: site.h,
      level: Math.max(1, Math.min(5, placed.level ?? 1)),
      label: shape.label,
      occupants: [],
      state: 'normal',
      phase: 'done',
      district: site.district,
    });
  }
  return sites.filter((site) => !taken.has(site.id));
}

/**
 * 学習の状態から街を導く。純粋関数。
 * 開いていない区域には何も建たない。学習者が作った資源だけが建物になる。
 */
export function buildCity(input: CityInput): City {
  const unlocked = new Set<DistrictId>(input.unlocked ?? ['center']);
  const out: Built = { buildings: [], roads: [], plots: [], carts: [] };
  const home = input.home ?? DEFAULT_HOME;

  if (input.vfs && unlocked.has('kernel')) filesOf(input.vfs, home, input.git?.root ?? null, out);
  if (input.git && unlocked.has('git')) gitOf(input.git, out);
  if (input.cluster && unlocked.has('k8s')) k8sOf(input.cluster, input.before, out);
  if (input.net && unlocked.has('net')) netOf(input.net, out);
  if (input.repo && unlocked.has('github')) githubOf(input.repo, out);

  // 学習の積み上がりを街に映す。コマンドで階が伸び、正解で家が増える。
  // 家を先に建てる。学習の状態から導いた建物がまだ無い街でも、階が行き場を失わないため
  const growth = input.growth ?? { houses: 0, floors: 0 };
  rewardHouses(growth.houses, out);
  const lastRaised = raiseFloors(out.buildings, growth.floors);

  // 学習者が設計した街。空いている区画に、選んだものが建つ
  const sites = designedOf(input.designed ?? [], openSites(unlocked, out), out);

  const tiles = groundTiles(unlocked);
  markPlots(tiles, out.plots);

  return {
    width: CITY_WIDTH,
    height: CITY_HEIGHT,
    tiles,
    buildings: out.buildings,
    roads: out.roads,
    plots: out.plots,
    carts: out.carts,
    sites,
    ...(lastRaised === undefined ? {} : { lastRaised }),
    districts: DISTRICTS.map((area) => ({
      track: area.id,
      unlocked: unlocked.has(area.id),
      x: area.x,
      y: area.y,
      w: area.w,
      h: area.h,
    })),
  };
}
