import { z } from 'zod';
import { createContainerHost } from './container/container';
import { emptyCluster, node } from './k8s/factory';
import { createClock } from './kernel/clock';
import { createDefaultRegistry } from './kernel/commands';
import type { ShellState, WebWorld } from './kernel/registry';
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
  /** 名前で引ける Web のサイト */
  sites: z.array(siteSetup).optional(),
  /** 手元が信頼するルート証明書（無ければ練習用のルート 1 枚） */
  roots: z.array(certSetup).optional(),
  /** 証明書の期限を見る日 */
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /** DB の初期状態（表を作り、行を入れる SQL） */
  sql: z.string().optional(),
  /** Kubernetes のクラスタ（Node の数。どれも同じ大きさ） */
  cluster: z.object({ nodes: z.number().int().min(1).max(5) }).strict().optional(),
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
  'k8s-cluster': { name: 'クラスタを操作する機械', shell: true, defaults: { user: 'learner', hostname: 'console', cwd: '/home/learner', dirs: ['/home/learner'], cluster: { nodes: 2 } } },
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
  if (s.cluster) options.cluster = emptyCluster(Array.from({ length: s.cluster.nodes }, (_, i) => node(`node-${String(i + 1)}`, 4000, 8192)));
  if (s.network) options.net = buildNetwork(s.network);
  if (s.images) options.containers = createContainerHost(s.images);
  if (s.sites || s.roots) {
    const web: WebWorld = { sites: s.sites ?? [], roots: s.roots ?? [DEMO_ROOT], today: s.today ?? '2026-10-03', hostname: s.hostname ?? 'arena' };
    options.web = web;
  }
  return options;
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
  if (!s.run?.length) return shell;
  const registry = createDefaultRegistry();
  const clock = createClock();
  const cwd = shell.cwd;
  for (const line of s.run) {
    const out = execute(shell, line, registry, clock);
    const err = out.chunks.filter((c) => c.stream === 'stderr').map((c) => c.text).join('').trim();
    if (out.exitCode !== 0) throw new Error(`setup の run「${line}」が失敗した: ${err}`);
    shell = out.state;
  }
  // 打った跡（履歴と ~/.bash_history）は残さず、始める場所に戻す
  const histfile = shell.vars.get('HISTFILE');
  const vfs = histfile !== undefined && exists(shell.vfs, histfile) ? remove(shell.vfs, histfile) : shell.vfs;
  return { ...shell, vfs, history: [], cwd, lastExit: 0, vars: new Map([...shell.vars, ['PWD', cwd]]) };
}
