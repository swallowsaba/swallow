import { nodeCondition } from '@/engines/k8s/bootstrap';
import type { ClusterState, Pod } from '@/engines/k8s/types';
import { parseCommit } from '@/engines/git/objects';
import type { GitState } from '@/engines/git/types';
import type { Repo } from '@/engines/github/types';
import type { Topology } from '@/engines/net/types';
import { list, stat, type VfsState } from '@/engines/kernel/vfs';
import { CITY_HEIGHT, CITY_WIDTH, DISTRICTS, districtArea, type DistrictId } from './growth';

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
 */
export type BuildingKind =
  | 'tower' | 'office' | 'stop'
  | 'monument' | 'flag' | 'depot'
  | 'hut' | 'house' | 'relay' | 'gate'
  | 'window' | 'line';

export interface Occupant {
  id: string;
  label: string;
  state: 'moving' | 'settled' | 'sick' | 'gone';
  /** 引っ越し中なら移動元の建物 */
  from?: string;
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
  /** どの区域に建っているか */
  district: DistrictId;
  /** 押したときに端末へ送るコマンド。無ければ押せない */
  command?: string;
  /** なぜそのコマンドなのか。押したときに一行で出す */
  why?: string;
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
}

/** 住人がどの建物にいたか。引っ越しを見せるために、直前の街から取っておく */
export type Whereabouts = ReadonlyMap<string, string>;

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
}

/** 高層ビルが建ち上がるまでの tick 数。ノードが増えるとまず工事が始まる */
export const BUILD_TICKS = 3;

const DEFAULT_HOME = '/home/learner';

/** 住人がいまどの建物にいるかを覚える。次の街に渡すと引っ越しが見える */
export function whereabouts(city: City): Whereabouts {
  const map = new Map<string, string>();
  for (const b of city.buildings) {
    for (const o of b.occupants) map.set(o.id, b.id);
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
function filesOf(vfs: VfsState, home: string, out: Built): void {
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
          district: at.district,
          command: `cat ${path}`,
          why: 'ファイルは小屋。中身が増えると大きくなる',
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
    district: 'git',
    command: 'git status',
    why: '倉庫は index。commit で碑になるものが置いてある',
  });
}

/* ---------------- Kubernetes ---------------- */

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

function k8sOf(cluster: ClusterState, before: Whereabouts | undefined, out: Built): void {
  const lots = new Lots('k8s', 4, 4);
  const towers = new Map<string, Building>();

  for (const node of [...cluster.nodes.values()].sort((a, b) => (a.metadata.name < b.metadata.name ? -1 : 1))) {
    const at = lots.next();
    const age = cluster.tick - node.metadata.createdAt;
    const ready = nodeCondition(cluster, node).ready;
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
      state: age < BUILD_TICKS ? 'building' : !ready ? 'broken' : node.spec.unschedulable ? 'busy' : 'normal',
      district: at.district,
      command: `kubectl describe node ${node.metadata.name}`,
      why: '高層ビルはノード。どれだけ入居できて、いま何が起きているかを見る',
    };
    towers.set(node.metadata.name, building);
    out.buildings.push(building);
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
      state: occupantState(pod),
    };
    if (was !== undefined && was !== tower.id) occupant.from = was;
    tower.occupants.push(occupant);
  }
  for (const tower of towers.values()) tower.level = levelOf(tower.occupants.length);

  // 建設会社の事務所は Deployment。replicas を増やすと住人の募集が始まる
  const offices = new Lots('k8s', 3, 2);
  for (const deploy of [...cluster.deployments.values()].sort((a, b) => (a.metadata.name < b.metadata.name ? -1 : 1))) {
    const at = offices.next();
    out.buildings.push({
      id: `deploy:${deploy.metadata.namespace}/${deploy.metadata.name}`,
      kind: 'office',
      x: at.x,
      y: at.y,
      w: 3,
      h: 2,
      level: levelOf(deploy.spec.replicas),
      label: deploy.metadata.name,
      occupants: [],
      state: deploy.status.readyReplicas < deploy.spec.replicas ? 'busy' : 'normal',
      district: at.district,
      command: `kubectl scale deploy ${deploy.metadata.name} --replicas=${String(deploy.spec.replicas)}`,
      why: '事務所は Deployment。募集する人数（replicas）を決める',
    });
  }

  // バス停は Service。Endpoints に載った Pod のいるビルにだけ路線が伸びる
  const stops = new Lots('k8s', 2, 2);
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
    out.roads.push({
      from: `dev:${a}`,
      to: `dev:${b}`,
      active: link.up,
      command: `ip link set ${dev} ${link.up ? 'down' : 'up'}`,
      why: link.up ? '道路はケーブル。落とすと通れなくなる' : '落ちている道路を通せるようにする',
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
 * 学習の状態から街を導く。純粋関数。
 * 開いていない区域には何も建たない。学習者が作った資源だけが建物になる。
 */
export function buildCity(input: CityInput): City {
  const unlocked = new Set<DistrictId>(input.unlocked ?? ['center']);
  const out: Built = { buildings: [], roads: [], plots: [], carts: [] };
  const home = input.home ?? DEFAULT_HOME;

  if (input.vfs && unlocked.has('kernel')) filesOf(input.vfs, home, out);
  if (input.git && unlocked.has('git')) gitOf(input.git, out);
  if (input.cluster && unlocked.has('k8s')) k8sOf(input.cluster, input.before, out);
  if (input.net && unlocked.has('net')) netOf(input.net, out);
  if (input.repo && unlocked.has('github')) githubOf(input.repo, out);

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
