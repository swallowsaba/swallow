import { z } from 'zod';
import { REGISTRY, addContext, addRegistry, createContainerHost, repoOf } from './container/container';
import { CONTROL_PLANE_TAINT } from './k8s/bootstrap';
import { advanceCluster } from './k8s/controllers';
import { emptyCluster, node, service } from './k8s/factory';
import { tickPods } from './k8s/kubelet';
import type { ClusterState, Node } from './k8s/types';
import { createClock } from './kernel/clock';
import { createDefaultRegistry } from './kernel/commands';
import { BUILTIN_NAMESPACES } from './kernel/commands/kubectlNamespace';
import { applyManifestText } from './kernel/commands/kubectlOps';
import type { GitServer, ShellState, WebWorld } from './kernel/registry';
import { createServiceTable } from './kernel/services';
import { createShellState, type SessionOptions } from './kernel/session';
import { execute } from './kernel/shell';
import { GROUP_FILE, groupFileOf } from './kernel/users';
import { exists, remove, setSize } from './kernel/vfs';
import { withZones } from './kernel/dnsZones';
import { buildNetwork, networkSetupSchema } from './net/spec';
import { DEMO_ROOT } from './tls/tls';

/**
 * 実戦の模擬環境の初期状態（docs/content-spec.md 2.4 の environment と setup）。
 *
 * レッスンの実戦は environment（ここに定義した ID）で土台を選び、setup で差分（置くファイル・サービス・壊れた状態など）を足す。
 * 端末の実戦（terminal）は、ここから仮想端末のシェルの初期状態を作る。DB の実戦（sql）は setup.sql の文で DB を作る（src/engines/db）。
 */

const routeSetup = z.object({ status: z.number().int().min(100).max(599), body: z.string(), headers: z.record(z.string()).optional() }).strict();

/** 道の答えの鍵: 「/path」（GET と HEAD）か「POST /path」 */
const routesSetup = z.record(z.string().regex(/^(?:[A-Z]+ )?\/\S*$/), routeSetup);

const serviceSetup = z.object({
  description: z.string().min(1),
  active: z.boolean().default(false),
  enabled: z.boolean().default(false),
  /** 動かそうとすると失敗する理由（ログに出る） */
  broken: z.string().optional(),
  /** 落ちた後（状態が failed）から始める */
  failed: z.boolean().optional(),
  /** それまでのログ（journalctl で読める行。「Oct 03 02:13:44 server web[812]: …」の形） */
  log: z.array(z.string()).optional(),
  port: z.number().int().optional(),
  /** 待ち受けるアドレス（無ければ 0.0.0.0。127.0.0.1 なら、その機械の中からだけ届く） */
  address: z.string().regex(/^\d+\.\d+\.\d+\.\d+$/).optional(),
  body: z.string().optional(),
  /** HTTP で応える状態の番号（無ければ 200） */
  status: z.number().int().min(100).max(599).optional(),
  /** 道ごとの答え（後ろのアプリ。書けば body・status より先に使う） */
  routes: routesSetup.optional(),
  /** 設定ファイルの場所（nginx 風。動かす時に読み、待ち受けるポートと証明書が決まる。src/engines/kernel/webConfig.ts） */
  config: z.string().startsWith('/').optional(),
  /** DNS のゾーンファイルの場所（動かす・読み直す時に読み、網の名前の答えになる） */
  zone: z.string().startsWith('/').optional(),
}).strict();

const certSetup = z.object({
  id: z.string(), subject: z.string(), issuer: z.string(), sans: z.array(z.string()),
  notBefore: z.string(), notAfter: z.string(), ca: z.boolean(),
}).strict();

const siteSetup = z.object({
  host: z.string(),
  port: z.number().int(),
  chain: z.array(certSetup).optional(),
  /** 対応する HTTP の版（無ければ 1.1 だけ） */
  versions: z.array(z.enum(['1.1', '2', '3'])).optional(),
  routes: routesSetup,
  /** 資源の集まりを覚えている API（/items と /items/3。src/engines/http） */
  api: z.object({
    base: z.string().startsWith('/'),
    items: z.array(z.record(z.unknown())),
    fields: z.record(z.enum(['string', 'number', 'boolean'])),
  }).strict().optional(),
}).strict();

const SIZE = /^\d+(\.\d+)?[KMGT]?$/;

/** 9.8G・300M・512K の大きさをバイトにする（1024 ごと） */
export function parseSize(text: string): number {
  const m = /^(\d+(?:\.\d+)?)([KMGT]?)$/.exec(text);
  if (!m) throw new Error(`大きさ ${text} が読めない`);
  return Math.round(Number(m[1]) * 1024 ** ' KMGT'.indexOf(m[2] || ' '));
}

/** setup の形。どの環境でも同じ形で書き、使わない項目は書かない */
export const setupSchema = z.object({
  /** 端末の利用者（プロンプトと whoami） */
  user: z.string().regex(/^[a-z][a-z0-9-]*$/).optional(),
  /** 機械のアドレス（ip addr の eth0。CIDR の形） */
  address: z.string().regex(/^\d+\.\d+\.\d+\.\d+\/\d+$/).optional(),
  /** 機械の名前（プロンプト） */
  hostname: z.string().regex(/^[a-z][a-z0-9-]*$/).optional(),
  /** 始める場所 */
  cwd: z.string().startsWith('/').optional(),
  /** 作っておくディレクトリ */
  dirs: z.array(z.string().startsWith('/')).optional(),
  /** 置いておくファイル（場所 → 中身） */
  files: z.record(z.string().startsWith('/'), z.string()).optional(),
  /** ファイルの見かけの大きさ（場所 → 9.8G・300M・512K の形）。大きなログや DB を、中身を持たずに表す */
  sizes: z.record(z.string().startsWith('/'), z.string().regex(SIZE)).optional(),
  /** 機械のディスクの大きさ（20G の形。df が出す。無ければ 20G） */
  disk: z.string().regex(SIZE).optional(),
  /** systemd が管理するサービス */
  services: z.record(z.string().regex(/^[a-z][a-z0-9-]*$/), serviceSetup).optional(),
  /** 手元に取ってあるコンテナのイメージ */
  images: z.array(z.string()).optional(),
  /** 自分たちの置き場（docker login・push の相手。住所と、ログインできる利用者。初めは空。run の push で置く） */
  registries: z.array(z.object({ server: z.string().regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/), user: z.string().regex(/^[a-z][a-z0-9-]*$/) }).strict()).optional(),
  /** 頼む先の、別の機械の Engine（docker --context 名前）。images はその機械に取ってあるイメージ */
  contexts: z.array(z.object({
    name: z.string().regex(/^[a-z][a-z0-9-]*$/),
    endpoint: z.string().min(1),
    description: z.string().min(1),
    images: z.array(z.string()).optional(),
  }).strict()).optional(),
  /** 名前で引ける Web のサイト */
  sites: z.array(siteSetup).optional(),
  /** 手元が信頼するルート証明書（無ければ練習用のルート 1 枚） */
  roots: z.array(certSetup).optional(),
  /** 証明書の期限を見る日 */
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /** DB の初期状態（表を作り、行を入れる SQL） */
  sql: z.string().optional(),
  /** Kubernetes のクラスタ（Node の数。どれも同じ大きさ） */
  cluster: z.object({
    nodes: z.number().int().min(1).max(5),
    /** 制御の側（コントロールプレーン）の Node（cp-1）も並べる。Pod は置かない（本物と同じ印 NoSchedule） */
    controlPlane: z.boolean().optional(),
    /** 止まっている（kubelet が様子を知らせない）Node の名前。NotReady になる */
    notReady: z.array(z.string().regex(/^node-\d$/)).optional(),
    /** クラスタを作ってから経った日数（AGE に出る） */
    ageDays: z.number().int().min(0).max(800).optional(),
    /** 初めからクラスタに在る物（マニフェストの YAML。--- で複数）。前から動いている形で置く */
    manifests: z.string().min(1).optional(),
    /** 初めから在る区画（default などの決まった区画のほかに） */
    namespaces: z.array(z.string().regex(/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/)).optional(),
    /** 入れてある入口の係（ingress-nginx。種類 nginx を受け持つ）と、外から届く住所 */
    ingress: z.object({ address: z.string().regex(/^\d+\.\d+\.\d+\.\d+$/) }).strict().optional(),
  }).strict().optional(),
  /** 動いているプロセス（ps・top・kill。PID は 100 から順に振る） */
  processes: z.array(z.object({
    command: z.string().min(1),
    cpu: z.number().min(0).max(100).optional(),
    memory: z.number().min(0).optional(),
    user: z.string().optional(),
    state: z.enum(['R', 'S', 'D', 'Z', 'T']).optional(),
    ignoresTerm: z.boolean().optional(),
  }).strict()).optional(),
  /** 利用者のグループ（グループ → 入っている利用者）。/etc/group に書く（src/engines/kernel/users.ts） */
  groups: z.record(z.string().regex(/^[a-z][a-z0-9-]*$/), z.array(z.string())).optional(),
  /** 待ち受け以外の接続（ss で見える。状態・自分の側・相手の側） */
  sockets: z.array(z.object({
    state: z.enum(['ESTAB', 'SYN-SENT', 'SYN-RECV', 'TIME-WAIT', 'CLOSE-WAIT', 'FIN-WAIT-1', 'FIN-WAIT-2']),
    local: z.string().regex(/^\d+\.\d+\.\d+\.\d+:\d+$/),
    peer: z.string().regex(/^\d+\.\d+\.\d+\.\d+:\d+$/),
  }).strict()).optional(),
  /** 網（ping・traceroute・dig・curl が使う。機器・線・名前の答え。src/engines/net/spec.ts） */
  network: networkSetupSchema.optional(),
  /** 初期状態を作るために、始める前に打っておくコマンド（リポジトリと履歴を作る、など）。学習者には見せない */
  run: z.array(z.string().min(1)).optional(),
  /**
   * 手元の外のサーバにあるリポジトリ（git clone・push・fetch の相手）。run で履歴を作る（サーバの中の /srv/repo で打つ）。
   * after は、学習者の run の後に、ほかの人が複製して打つ（最後に git push して、サーバの履歴を進める）
   */
  gitServers: z.array(z.object({
    url: z.string().regex(/^https:\/\/\S+\.git$/),
    ssh: z.string().regex(/^git@[^:\s]+:\S+\.git$/).optional(),
    /** 登録された公開鍵（~/.ssh/id_*.pub の中身の 1 行） */
    keys: z.array(z.string()).optional(),
    run: z.array(z.string().min(1)),
    after: z.array(z.string().min(1)).optional(),
  }).strict()).optional(),
  /** SSH で入るサーバ（ssh-keygen・ssh-copy-id・ssh の相手。src/engines/kernel/commands/ssh.ts） */
  sshHosts: z.array(z.object({
    host: z.string().regex(/^[a-z][a-z0-9.-]*$/),
    user: z.string().regex(/^[a-z][a-z0-9-]*$/),
    /** 初めの登録のために、仮のパスワードでも入れる */
    password: z.boolean().optional(),
    /** 初めから登録されている公開鍵 */
    authorized: z.array(z.string()).optional(),
    motd: z.string().optional(),
  }).strict()).optional(),
  /** 設定の編集（editor）の実戦: 編集するファイルと、「保存して確かめる」で保存の後に打つコマンド（docs/content-spec.md 2.4.2） */
  edit: z.object({ path: z.string().startsWith('/'), apply: z.array(z.string().min(1)) }).strict().optional(),
}).strict();

export type PracticeSetup = z.infer<typeof setupSchema>;

interface EnvironmentDef {
  /** 画面に出す名前 */
  name: string;
  /** 端末の実戦で使える環境か（sql は DB の実戦だけ） */
  shell: boolean;
  defaults: PracticeSetup;
}

/** 模擬環境の土台。ID は content の practice.environment に書く */
/** クラスタの窓口（API サーバ）の住所。制御の側（cp-1）の 6443 番 */
const API_SERVER = 'https://10.0.0.10:6443';

/** 操作する機械の、接続先の設定（kubeconfig）。kubectl はこれを読んで窓口に頼む */
const KUBECONFIG = [
  'apiVersion: v1',
  'kind: Config',
  'clusters:',
  '- name: city-cluster',
  '  cluster:',
  `    server: ${API_SERVER}`,
  'contexts:',
  '- name: learner@city-cluster',
  '  context:',
  '    cluster: city-cluster',
  '    user: learner',
  'current-context: learner@city-cluster',
  'users:',
  '- name: learner',
  '  user: {}  # 本物はここに利用者の証明書が入る（練習では省く）',
  '',
].join('\n');

export const ENVIRONMENTS = {
  /** 一般の利用者の端末（ファイルとディレクトリ・権限・プロセス） */
  'linux-basic': { name: '練習用の機械', shell: true, defaults: { user: 'learner', hostname: 'arena', cwd: '/home/learner', dirs: ['/home/learner', '/tmp'] } },
  /** 管理者で入るサーバ（サービス・ログ） */
  'linux-server': { name: '練習用のサーバ', shell: true, defaults: { user: 'root', hostname: 'server', cwd: '/root', dirs: ['/root', '/etc/systemd/system', '/var/log'], services: {} } },
  /** コンテナの動く機械（docker） */
  'container-host': { name: 'コンテナの動く機械', shell: true, defaults: { user: 'learner', hostname: 'docker-host', cwd: '/home/learner', dirs: ['/home/learner'], images: [] } },
  /** Web のサイトに手元から取りに行く（curl・証明書） */
  'web-client': { name: 'Web を確かめる機械', shell: true, defaults: { user: 'learner', hostname: 'client', cwd: '/home/learner', dirs: ['/home/learner'], sites: [] } },
  /** 網の中の機械。ping・traceroute・dig・curl で、届くか・どこで止まるか・名前の答えを確かめる */
  'net-client': { name: 'ネットワークを確かめる機械', shell: true, defaults: { user: 'learner', cwd: '/home/learner', dirs: ['/home/learner'] } },
  /** Kubernetes のクラスタ（Node 2 台）を kubectl で操作する機械 */
  'k8s-cluster': { name: 'クラスタを操作する機械', shell: true, defaults: { user: 'learner', hostname: 'console', cwd: '/home/learner', dirs: ['/home/learner', '/home/learner/.kube'], files: { '/home/learner/.kube/config': KUBECONFIG }, cluster: { nodes: 2 } } },
  /** ブラウザ内の SQLite（SQL の実戦） */
  'sql-sqlite': { name: 'ブラウザ内の DB', shell: false, defaults: { sql: '' } },
} as const satisfies Record<string, EnvironmentDef>;

export type EnvironmentId = keyof typeof ENVIRONMENTS;

export const isEnvironmentId = (id: string): id is EnvironmentId => Object.hasOwn(ENVIRONMENTS, id);

/** 土台に setup を重ねた、実戦の初期状態の設定。知らない環境や形の違う setup は投げる */
export function resolveSetup(environment: string, setup: unknown): PracticeSetup & { environment: EnvironmentId } {
  if (!isEnvironmentId(environment)) throw new Error(`知らない模擬環境 ${environment}`);
  const own = setupSchema.parse(setup ?? {});
  const base: PracticeSetup = ENVIRONMENTS[environment].defaults;
  return {
    ...base,
    ...own,
    environment,
    dirs: [...(base.dirs ?? []), ...(own.dirs ?? [])],
    files: { ...base.files, ...own.files },
    ...(base.services || own.services ? { services: { ...base.services, ...own.services } } : {}),
  };
}

/** setup の cluster から、組み上がったクラスタを作る（Node は node-1〜。制御の側は cp-1） */
function clusterOf(c: NonNullable<PracticeSetup['cluster']>): ClusterState {
  // 0 - … にして、日数が 0 の時に -0 にしない（保存すると 0 に変わる）
  const born = 0 - (c.ageDays ?? 0) * 86400;
  const at = (n: Node): Node => ({ ...n, metadata: { ...n.metadata, createdAt: born } });
  const workers = Array.from({ length: c.nodes }, (_, i) => {
    const n = at(node(`node-${String(i + 1)}`, 4000, 8192));
    return c.notReady?.includes(n.metadata.name) === true ? { ...n, status: { ...n.status, kubeletHealthy: false } } : n;
  });
  const cp = at(node('cp-1', 2000, 4096, {}, { role: 'control-plane' }));
  const nodes = c.controlPlane === true ? [{ ...cp, spec: { ...cp.spec, taints: [{ ...CONTROL_PLANE_TAINT }] } }, ...workers] : workers;
  // 取れるイメージは、模擬の置き場（REGISTRY）にある物と、その名前の latest
  const images = [...new Set(REGISTRY.flatMap((i) => [i.ref, `${repoOf(i.ref)}:latest`]))];
  // 窓口そのものの Service（本物のクラスタには必ずある。セレクタは無く、宛先は制御の側の 6443 番）
  const api = service('kubernetes', {}, { port: 443, targetPort: 6443 });
  let cluster: ClusterState = {
    ...emptyCluster(nodes), server: API_SERVER, images,
    namespaces: [...BUILTIN_NAMESPACES, ...(c.namespaces ?? [])].map((name) => ({ name, createdAt: born })),
    ...(c.ingress === undefined ? {} : { ingressController: { className: 'nginx', address: c.ingress.address } }),
    services: new Map([['default/kubernetes', { ...api, metadata: { ...api.metadata, labels: { component: 'apiserver', provider: 'kubernetes' }, createdAt: born }, status: { endpoints: ['10.0.0.10'] } }]]),
  };
  if (c.manifests === undefined) return cluster;
  const applied = applyManifestText(cluster, c.manifests);
  if ('error' in applied) throw new Error(`setup の cluster.manifests が読めない: ${applied.error}`);
  if (applied.failures.length > 0) throw new Error(`setup の cluster.manifests が断られた: ${applied.failures.join(' ')}`);
  // 前から動いている形にする: 落ち着くまで時間を進め、作った時刻をクラスタと同じにし、古い知らせを消す（本物も 1 時間で消える）
  cluster = applied.cluster;
  for (let i = 0; i < 20; i += 1) cluster = advanceCluster(cluster, tickPods);
  const aged = rebirth(cluster, born);
  // 動いている Pod は、前から動いていて Ready だった（metrics-server も前から測っている）
  const pods = new Map([...aged.pods].map(([id, p]) => [id, p.status.startedAt === null ? p : {
    ...p, status: { ...p.status, startedAt: born, ...(p.status.readySince === undefined ? {} : { readySince: born }) },
  }]));
  return { ...aged, pods, events: [] };
}

/** 全ての資源の作った時刻を揃える（setup で前から在った物にする） */
function rebirth(cluster: ClusterState, born: number): ClusterState {
  const out: Record<string, unknown> = { ...cluster };
  for (const [k, v] of Object.entries(cluster)) {
    if (!(v instanceof Map)) continue;
    out[k] = new Map([...(v as Map<string, unknown>)].map(([id, r]) => {
      const meta = (r as { metadata?: { createdAt?: number } }).metadata;
      return [id, meta?.createdAt === undefined ? r : { ...(r as object), metadata: { ...meta, createdAt: born } }];
    }));
  }
  return out as unknown as ClusterState;
}

/** 端末の実戦の、シェルの初期状態（src/engines/kernel/session の createShellState に渡す） */
export function shellOptions(environment: string, setup: unknown): SessionOptions {
  const s = resolveSetup(environment, setup);
  if (!ENVIRONMENTS[s.environment].shell) throw new Error(`${environment} は端末の実戦に使えない`);
  const files: Record<string, string | null> = {};
  for (const d of s.dirs ?? []) files[d] = null;
  for (const [path, content] of Object.entries(s.files ?? {})) files[path] = content;
  const user = s.user ?? 'learner';
  const home = user === 'root' ? '/root' : `/home/${user}`;
  if (s.groups) files[GROUP_FILE] = groupFileOf(s.groups, user);
  const options: SessionOptions = {
    files,
    cwd: s.cwd ?? home,
    // 打った行を ~/.bash_history に残す（「打ったことが記録される」を状態で確かめるため。src/engines/kernel/shell.ts）
    vars: {
      USER: user, HOME: home, HOSTNAME: s.hostname ?? s.network?.self ?? 'arena', HISTFILE: `${home}/.bash_history`,
      ...(s.network ? { NET_SELF: s.network.self } : {}),
      ...(s.sockets ? { __SOCKETS: JSON.stringify(s.sockets) } : {}),
      ...(s.address !== undefined ? { __HOST_ADDR: s.address } : {}),
      ...(s.disk !== undefined ? { __DISK_SIZE: String(parseSize(s.disk)) } : {}),
    },
  };
  if (s.services) {
    options.services = createServiceTable(Object.entries(s.services).map(([name, v]) => ({
      name,
      description: v.description,
      active: v.failed ? 'failed' : v.active ? 'active' : 'inactive',
      enabled: v.enabled,
      ...(v.broken !== undefined ? { broken: v.broken } : {}),
      ...(v.port !== undefined ? { port: v.port } : {}),
      ...(v.address !== undefined ? { address: v.address } : {}),
      ...(v.body !== undefined ? { body: v.body } : {}),
      ...(v.status !== undefined ? { status: v.status } : {}),
      ...(v.routes !== undefined ? { routes: v.routes } : {}),
      ...(v.config !== undefined ? { config: v.config } : {}),
      ...(v.zone !== undefined ? { zone: v.zone } : {}),
      ...(v.log !== undefined ? { log: v.log } : {}),
    })));
  }
  if (s.processes) options.processes = s.processes;
  if (s.cluster) options.cluster = clusterOf(s.cluster);
  if (s.network) options.net = buildNetwork(s.network);
  if (s.images) {
    let host = createContainerHost(s.images);
    for (const r of s.registries ?? []) host = addRegistry(host, r.server, r.user);
    for (const c of s.contexts ?? []) host = addContext(host, c.name, c.endpoint, c.description, c.images ?? []);
    options.containers = host;
  }
  if (s.gitServers) options.gitServers = buildGitServers(s.gitServers);
  if (s.sshHosts) {
    options.sshHosts = new Map(s.sshHosts.map((h) => [h.host, {
      host: h.host, user: h.user, password: h.password ?? false, authorized: h.authorized ?? [], keyLogins: [], ...(h.motd !== undefined ? { motd: h.motd } : {}),
    }]));
  }
  if (s.sites || s.roots) {
    const web: WebWorld = { sites: s.sites ?? [], roots: s.roots ?? [DEMO_ROOT], today: s.today ?? '2026-10-03', hostname: s.hostname ?? 'arena' };
    options.web = web;
  }
  return options;
}

type GitServerSetup = NonNullable<PracticeSetup['gitServers']>[number];

/** setup の行を順に打つ。失敗すれば内容の誤りとして投げる */
function runLines(shell: ShellState, lines: readonly string[], where: string): ShellState {
  const registry = createDefaultRegistry();
  const clock = createClock();
  let state = shell;
  for (const line of lines) {
    const out = execute(state, line, registry, clock);
    const err = out.chunks.filter((c) => c.stream === 'stderr').map((c) => c.text).join('').trim();
    if (out.exitCode !== 0) throw new Error(`${where}「${line}」が失敗した: ${err}`);
    state = out.state;
  }
  return state;
}

/** サーバのリポジトリを、run の行で作る（サーバの中の /srv/repo で打つ） */
function buildGitServers(list: readonly GitServerSetup[]): Map<string, GitServer> {
  const servers = new Map<string, GitServer>();
  for (const g of list) {
    const shell = runLines(createShellState({ files: { '/srv/repo': null }, cwd: '/srv/repo' }), ['git init', ...g.run], `gitServers（${g.url}）の run`);
    if (shell.git === null) throw new Error(`gitServers（${g.url}）にリポジトリができない`);
    servers.set(g.url, { url: g.url, ...(g.ssh !== undefined ? { ssh: g.ssh } : {}), keys: g.keys ?? [], state: shell.git });
  }
  return servers;
}

/** ほかの人の作業（after）: サーバのリポジトリを複製して打ち、push でサーバの履歴を進める */
function othersWork(shell: ShellState, list: readonly GitServerSetup[]): ShellState {
  let servers = shell.gitServers;
  for (const g of list) {
    if (!g.after?.length || !servers) continue;
    const other = runLines(createShellState({ files: { '/srv': null }, cwd: '/srv', gitServers: servers }), [`git clone ${g.url} work`, 'cd work', ...g.after], `gitServers（${g.url}）の after`);
    servers = other.gitServers;
  }
  return servers ? { ...shell, gitServers: servers } : shell;
}

/**
 * 端末の実戦の、シェルの初期状態。setup の run のコマンドを打ち終えた所から始める（同じ setup からは同じ状態）。
 * run のコマンドがエラーになれば、内容の誤りとして投げる
 */
export function initialShell(environment: string, setup: unknown): ShellState {
  const s = resolveSetup(environment, setup);
  // 動いている DNS のサーバは、始めにゾーンファイルを読んでいる
  let shell = withZones(createShellState(shellOptions(environment, setup)));
  for (const [path, size] of Object.entries(s.sizes ?? {})) shell = { ...shell, vfs: setSize(shell.vfs, path, parseSize(size)) };
  if (!s.run?.length) return othersWork(shell, s.gitServers ?? []);
  const cwd = shell.cwd;
  shell = othersWork(runLines(shell, s.run, 'setup の run'), s.gitServers ?? []);
  // 打った跡（履歴と ~/.bash_history）は残さず、始める場所に戻す
  const histfile = shell.vars.get('HISTFILE');
  const vfs = histfile !== undefined && exists(shell.vfs, histfile) ? remove(shell.vfs, histfile) : shell.vfs;
  return { ...shell, vfs, history: [], cwd, lastExit: 0, vars: new Map([...shell.vars, ['PWD', cwd]]) };
}
