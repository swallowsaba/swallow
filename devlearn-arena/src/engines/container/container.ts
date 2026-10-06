/**
 * コンテナの模型（docs/curriculum.md の ctr: コンテナの概念を先に教え、Docker はその具体的な技術として扱う）。純粋な関数。
 *
 * - イメージ: アプリと動くのに要る物を固めた、読み取り専用の型。レジストリ（置き場）から取ってくる（pull）
 * - コンテナ: イメージから作った、動いている（または止まった）1 つの実体。同じイメージから何個でも作れる
 * - ポートの公開: 手元のポートを、コンテナの中のポートにつなぐ（-p 8080:80）。同じ手元のポートは 2 つに使えない
 * - ボリューム: コンテナを消しても残す場所を、手元の場所につなぐ（-v）。
 *   中身を読む場所（serves.root）を持つイメージは、そこにつないだ手元の場所の index.html を返す（つないでいなければ 403）
 * - 隔離（ctr.i.02）: コンテナは名前空間で区切った機械のプロセス。中からは自分のプロセスだけが見え（主のプロセスが PID 1）、
 *   機械からは同じプロセスが機械の PID で見える（containerd-shim の子）。cgroups のメモリの上限（--memory）より多く使うと、
 *   起動してすぐカーネルに止められる（終了コード 137 = 128 + SIGKILL の 9、OOMKilled）
 *
 * ID は通し番号から決める（同じ操作からは同じ ID）。CLI（docker）は src/engines/docker がこの上に作る。
 */

import { runNodeApp } from './app';

export interface Image {
  /** 名前:タグ（nginx:1.27） */
  ref: string;
  id: string;
  size: string;
  /**
   * 動かした時に待ち受けるポートと、応える中身（Web サーバのイメージ）。
   * root があれば、コンテナの中のその場所から中身を読む（ボリュームでつないだ手元の場所の index.html。無ければ 403）
   */
  serves?: { port: number; body: string; root?: string };
  /** 動かすのに要る環境変数（無いと止まる） */
  requiresEnv?: { name: string; error: readonly string[] };
  /** 動き出してすぐ、要る物を確かめる前に出すログ（起動の行。原因の行はこの後に出る） */
  bootLog?: readonly string[];
  /** 動き出した時のログ */
  startLog: readonly string[];
  /** すぐに終わるイメージ（hello-world など） */
  oneShot?: boolean;
  /** 動いている間のプロセス（先頭が主のプロセス）。memory は使うメモリ（MiB）。無ければ 1 つ・10MiB */
  procs?: readonly { command: string; memory: number; user?: string }[];
  /** 動かす時の命令（Dockerfile の CMD。node で始まれば中のアプリを動かす。src/engines/container/app.ts） */
  cmd?: readonly string[];
  /** 命令を打つ場所（WORKDIR） */
  workdir?: string;
  /** 中の環境変数（ENV） */
  env?: Readonly<Record<string, string>>;
  /** イメージに入っているファイル（場所 → 中身）。docker exec の cat・ls で読める */
  files?: Readonly<Record<string, string>>;
  /** 動かす時に打つ命令（docker ps の COMMAND。無ければ /entrypoint） */
  command?: string;
  /** 中に ps などの道具がある（alpine の busybox）。無いイメージで docker exec ps は、実行するファイルが無いと言う */
  tools?: boolean;
}

/** 動いている間のプロセス */
export const procsOf = (image: Image | undefined): readonly { command: string; memory: number; user?: string }[] =>
  image?.procs ?? [{ command: '/entrypoint', memory: 10 }];

/** 動いている間に使うメモリ（MiB） */
export const memoryOf = (image: Image | undefined): number => procsOf(image).reduce((n, p) => n + p.memory, 0);

export interface PortMap {
  host: number;
  container: number;
}

export interface Container {
  id: string;
  name: string;
  image: string;
  state: 'created' | 'running' | 'exited';
  exitCode: number;
  ports: readonly PortMap[];
  volumes: readonly { host: string; container: string }[];
  env: Readonly<Record<string, string>>;
  log: readonly string[];
  /** メモリの上限（バイト。cgroups の memory.max）。無ければ上限無し */
  memoryLimit?: number;
  /** 上限を超えてカーネルに止められた */
  oomKilled?: boolean;
  /** 主のプロセスの、機械から見た PID（動いている間。シムはその 1 つ前） */
  pid: number;
  /** 中のアプリが待ち受けて答える物（作ったイメージのアプリが動いている時） */
  app?: { port: number; body: string };
}

export interface ContainerHost {
  /** 手元にあるイメージ */
  images: readonly Image[];
  containers: readonly Container[];
  /** ID と名前を決める通し番号 */
  seq: number;
  /** docker build で作った段の鍵（同じ鍵の段は使い回す） */
  buildCache?: readonly string[];
}

/** nginx の公式イメージに入っている設定と最初のページ（本物の default.conf の形） */
const NGINX_FILES: Readonly<Record<string, string>> = {
  '/etc/nginx/conf.d/default.conf': [
    'server {',
    '    listen       80;',
    '    listen  [::]:80;',
    '    server_name  localhost;',
    '',
    '    location / {',
    '        root   /usr/share/nginx/html;',
    '        index  index.html index.htm;',
    '    }',
    '',
    '    error_page   500 502 503 504  /50x.html;',
    '    location = /50x.html {',
    '        root   /usr/share/nginx/html;',
    '    }',
    '}',
    '',
  ].join('\n'),
  '/usr/share/nginx/html/index.html': '<!DOCTYPE html>\n<html><head><title>Welcome to nginx!</title></head><body><h1>Welcome to nginx!</h1></body></html>\n',
  '/usr/share/nginx/html/50x.html': '<!DOCTYPE html>\n<html><head><title>Error</title></head><body><h1>An error occurred.</h1></body></html>\n',
};

/** 模擬のレジストリに置いてあるイメージ（docs/learning-design.md 6 章: 本物は取りに行かない） */
export const REGISTRY: readonly Image[] = [
  {
    ref: 'nginx:1.27-alpine', id: 'b1a2c39e4f7d', size: '48.3MB', tools: true, files: NGINX_FILES, command: "/docker-entrypoint.sh nginx -g 'daemon off;'",
    serves: { port: 80, body: '<!DOCTYPE html>\n<html><head><title>Welcome to nginx!</title></head><body><h1>Welcome to nginx!</h1></body></html>' },
    startLog: ['/docker-entrypoint.sh: Configuration complete; ready for start up', 'nginx: start worker processes'],
    procs: [{ command: 'nginx: master process nginx -g daemon off;', memory: 3.4 }, { command: 'nginx: worker process', memory: 2.6, user: 'nginx' }, { command: 'nginx: worker process', memory: 2.6, user: 'nginx' }],
  },
  { ref: 'nginx:1.27', id: '3b25b682ea82', size: '192MB', files: NGINX_FILES, command: "/docker-entrypoint.sh nginx -g 'daemon off;'", serves: { port: 80, body: '<!DOCTYPE html>\n<html><head><title>Welcome to nginx!</title></head><body><h1>Welcome to nginx!</h1></body></html>' }, startLog: ['/docker-entrypoint.sh: Configuration complete; ready for start up', 'nginx: start worker processes'] },
  { ref: 'httpd:2.4', id: '9cfd0d8c7a1e', size: '148MB', command: 'httpd-foreground', serves: { port: 80, body: '<html><body><h1>It works!</h1></body></html>' }, startLog: ['AH00558: httpd: Could not reliably determine the server\'s fully qualified domain name', 'Apache/2.4 configured -- resuming normal operations'] },
  { ref: 'city-board:1.0', id: '5c1e7b2a9d40', size: '41MB', command: "/docker-entrypoint.sh nginx -g 'daemon off;'", serves: { port: 80, body: '', root: '/usr/share/nginx/html' }, startLog: ['city-board: serving /usr/share/nginx/html on port 80'] },
  {
    ref: 'city-report:1.0', id: '6d0f3a7c21b8', size: '182MB', tools: true, command: 'node /app/report.js',
    serves: { port: 80, body: '<html><body><h1>夜の集計</h1><p>予約 1,240 件を集計した</p></body></html>' },
    startLog: ['report: loading 1,240 reservations into memory', 'report: listening on :80'],
    procs: [{ command: 'node /app/report.js', memory: 182.4 }],
  },
  { ref: 'redis:7', id: '7e49ed81b42b', size: '117MB', command: 'docker-entrypoint.sh redis-server', startLog: ['Redis version=7.2.5, bits=64', 'Ready to accept connections tcp'] },
  {
    ref: 'postgres:16', id: 'b9390dd1ea18', size: '432MB', command: 'docker-entrypoint.sh postgres',
    requiresEnv: {
      name: 'POSTGRES_PASSWORD',
      error: [
        'Error: Database is uninitialized and superuser password is not specified.',
        '       You must specify POSTGRES_PASSWORD to a non-empty value for the',
        '       superuser. For example, "-e POSTGRES_PASSWORD=password" on "docker run".',
      ],
    },
    startLog: ['database system is ready to accept connections'],
  },
  {
    // 予約の窓口のアプリ（Node.js）。DB の場所を環境変数 DATABASE_URL で受け取る
    ref: 'city-reserve:2.0', id: '4f8a1c6e0b92', size: '156MB', command: 'docker-entrypoint.sh npm start',
    bootLog: ['', '> reserve@2.0.0 start', '> node server.js', '', 'reserve: version 2.0.0', 'reserve: reading settings from the environment'],
    requiresEnv: {
      name: 'DATABASE_URL',
      error: [
        'Error: missing environment variable DATABASE_URL',
        '    at loadSettings (/app/settings.js:14:11)',
        '    at main (/app/server.js:8:20)',
      ],
    },
    startLog: ['reserve: listening on :3000'],
  },
  { ref: 'node:20-alpine', id: '1f3d7a9c4e21', size: '135MB', tools: true, command: 'docker-entrypoint.sh node', cmd: ['node'], workdir: '/', startLog: [] },
  { ref: 'alpine:3.20', id: '91ef0af61f39', size: '7.8MB', command: '/bin/sh', oneShot: true, startLog: [] },
  { ref: 'hello-world:latest', id: 'd2c94e258dcb', size: '13.3kB', command: '/hello', oneShot: true, startLog: ['Hello from Docker!', 'This message shows that your installation appears to be working correctly.'] },
];

/** タグを省くと latest という名前のタグ（本物と同じ。最新の安定版という意味ではない） */
export function normalizeRef(raw: string): string {
  return raw.lastIndexOf(':') > raw.lastIndexOf('/') ? raw : `${raw}:latest`;
}

/** 置き場で探す。置き場の latest は、その名前の一番新しい版（置き場の並びの最後）と同じ中身（同じ ID） */
export function fromRegistry(ref: string): Image | undefined {
  const exact = REGISTRY.find((i) => i.ref === ref);
  if (exact || tagOf(ref) !== 'latest') return exact;
  const same = REGISTRY.filter((i) => repoOf(i.ref) === repoOf(ref));
  const newest = same[same.length - 1];
  return newest ? { ...newest, ref } : undefined;
}

/** 64 字の ID（docker run -d が出す物。先頭の 12 字が短い ID） */
export const longId = (id: string): string => `${id}${hexOf(Number.parseInt(id.slice(0, 8), 16) + 7, 52)}`;

/** 名前:タグ の名前（リポジトリ）の側 */
export function repoOf(ref: string): string {
  const colon = ref.lastIndexOf(':');
  return colon > ref.lastIndexOf('/') ? ref.slice(0, colon) : ref;
}

/** 名前:タグ のタグの側（無ければ latest） */
export function tagOf(ref: string): string {
  const colon = ref.lastIndexOf(':');
  return colon > ref.lastIndexOf('/') ? ref.slice(colon + 1) : 'latest';
}

export function createContainerHost(images: readonly string[] = []): ContainerHost {
  return { images: images.map((r) => fromRegistry(normalizeRef(r))).filter((i): i is Image => i !== undefined), containers: [], seq: 0 };
}

export type ContainerError =
  /** known: 名前（リポジトリ）は置き場にあるが、そのタグが無い（manifest unknown） */
  | { kind: 'image-not-found'; ref: string; known?: boolean }
  | { kind: 'name-in-use'; name: string; id: string }
  /** name・id: 作りかけて Created のまま残ったコンテナ（docker run の時。本物と同じく、作ってから動かす所で断られる） */
  | { kind: 'port-in-use'; port: number; name?: string; id?: string }
  | { kind: 'no-such-container'; ref: string }
  | { kind: 'container-running'; name: string }
  | { kind: 'image-in-use'; ref: string; container: string };

export type Result<T> = { ok: true; host: ContainerHost; value: T } | { ok: false; host: ContainerHost; error: ContainerError };

const NAMES = ['brave_turing', 'calm_lovelace', 'eager_hopper', 'jolly_ritchie', 'quiet_knuth', 'witty_babbage'];

function idOf(seq: number): string {
  return hexOf(seq, 12);
}

/** 通し番号から決まる 16 進の文字列（ID・層・digest。同じ数からは同じ文字列） */
export function hexOf(seed: number, length: number): string {
  let h = 2166136261 ^ seed;
  let out = '';
  for (let i = 0; i < Math.ceil(length / 2); i += 1) {
    h = Math.imul(h ^ (h >>> 13), 16777619) >>> 0;
    out += (h & 0xff).toString(16).padStart(2, '0');
  }
  return out.slice(0, length);
}

export function pull(host: ContainerHost, raw: string): Result<Image> {
  const ref = normalizeRef(raw);
  const have = host.images.find((i) => i.ref === ref);
  if (have) return { ok: true, host, value: have };
  const image = fromRegistry(ref);
  if (!image) return { ok: false, host, error: { kind: 'image-not-found', ref, known: REGISTRY.some((i) => repoOf(i.ref) === repoOf(ref)) } };
  return { ok: true, host: { ...host, images: [...host.images, image] }, value: image };
}

/** 名前か ID（先頭の数文字でよい）でコンテナを探す */
export function findContainer(host: ContainerHost, ref: string): Container | undefined {
  return host.containers.find((c) => c.name === ref) ?? (ref.length >= 3 ? host.containers.find((c) => c.id.startsWith(ref)) : undefined);
}

function replace(host: ContainerHost, c: Container): ContainerHost {
  return { ...host, containers: host.containers.map((x) => (x.id === c.id ? c : x)) };
}

/** 主のプロセスの、機械から見た PID（コンテナの通し番号から決める。同じ操作からは同じ PID） */
const pidOf = (seq: number): number => 2000 + seq * 100 + 1;

/** 動かす（イメージの決まりに合わなければ、すぐに止まる。メモリの上限より多く使えば、カーネルに止められる） */
function boot(c: Container, image: Image): Container {
  const head = [...c.log, ...(image.bootLog ?? [])];
  if (image.requiresEnv && !(image.requiresEnv.name in c.env)) return { ...c, state: 'exited', exitCode: 1, log: [...head, ...image.requiresEnv.error] };
  if (image.cmd) {
    const app = runNodeApp(image.cmd, image.workdir ?? '/', image.files ?? {});
    if (app) {
      if (app.exitCode !== null) return { ...c, state: 'exited', exitCode: app.exitCode, log: [...head, ...app.log] };
      return { ...c, state: 'running', exitCode: 0, oomKilled: false, log: [...head, ...app.log], ...(app.serves ? { app: app.serves } : {}) };
    }
  }
  if (image.oneShot) return { ...c, state: 'exited', exitCode: 0, log: [...c.log, ...image.startLog] };
  if (c.memoryLimit !== undefined && memoryOf(image) * 1024 * 1024 > c.memoryLimit) {
    // 動き出して読み込む途中で、上限を超えて止められる（SIGKILL。128 + 9）
    return { ...c, state: 'exited', exitCode: 137, oomKilled: true, log: [...c.log, ...image.startLog.slice(0, 1)] };
  }
  return { ...c, state: 'running', exitCode: 0, oomKilled: false, log: [...head, ...image.startLog] };
}

export interface RunOptions {
  image: string;
  name?: string;
  ports?: readonly PortMap[];
  volumes?: readonly { host: string; container: string }[];
  env?: Readonly<Record<string, string>>;
  /** メモリの上限（バイト） */
  memory?: number;
}

/** 手元のポートを、動いているコンテナが既に使っているか */
export function portOwner(host: ContainerHost, port: number): Container | undefined {
  return host.containers.find((c) => c.state === 'running' && c.ports.some((p) => p.host === port));
}

export function run(host0: ContainerHost, o: RunOptions): Result<Container> {
  const pulled = pull(host0, o.image);
  if (!pulled.ok) return pulled;
  let host = pulled.host;
  const name = o.name ?? `${NAMES[host.seq % NAMES.length] ?? 'box'}${host.seq >= NAMES.length ? String(host.seq) : ''}`;
  const same = host.containers.find((c) => c.name === name);
  if (same) return { ok: false, host, error: { kind: 'name-in-use', name, id: same.id } };
  const c: Container = {
    id: idOf(host.seq + 1), name, image: pulled.value.ref, state: 'created', exitCode: 0,
    ports: o.ports ?? [], volumes: o.volumes ?? [], env: o.env ?? {}, log: [], pid: pidOf(host.seq + 1),
    ...(o.memory !== undefined ? { memoryLimit: o.memory } : {}),
  };
  host = { ...host, seq: host.seq + 1, containers: [...host.containers, c] };
  // 外のポートが使用中なら、作ったコンテナは Created のまま残る
  for (const p of c.ports) if (portOwner(host, p.host)) return { ok: false, host, error: { kind: 'port-in-use', port: p.host, name: c.name, id: c.id } };
  const booted = boot(c, pulled.value);
  return { ok: true, host: replace(host, booted), value: booted };
}

export function stop(host: ContainerHost, ref: string): Result<Container> {
  const c = findContainer(host, ref);
  if (!c) return { ok: false, host, error: { kind: 'no-such-container', ref } };
  const next = c.state === 'running' ? { ...c, state: 'exited' as const, exitCode: 0 } : c;
  return { ok: true, host: replace(host, next), value: next };
}

export function start(host: ContainerHost, ref: string): Result<Container> {
  const c = findContainer(host, ref);
  if (!c) return { ok: false, host, error: { kind: 'no-such-container', ref } };
  if (c.state === 'running') return { ok: true, host, value: c };
  for (const p of c.ports) if (portOwner(host, p.host)) return { ok: false, host, error: { kind: 'port-in-use', port: p.host } };
  const image = host.images.find((i) => i.ref === c.image);
  const next = image ? boot(c, image) : c;
  return { ok: true, host: replace(host, next), value: next };
}

export function remove(host: ContainerHost, ref: string, force = false): Result<Container> {
  const c = findContainer(host, ref);
  if (!c) return { ok: false, host, error: { kind: 'no-such-container', ref } };
  if (c.state === 'running' && !force) return { ok: false, host, error: { kind: 'container-running', name: c.name } };
  return { ok: true, host: { ...host, containers: host.containers.filter((x) => x.id !== c.id) }, value: c };
}

export function removeImage(host: ContainerHost, raw: string): Result<Image> {
  const ref = normalizeRef(raw);
  const image = host.images.find((i) => i.ref === ref || i.id.startsWith(raw));
  if (!image) return { ok: false, host, error: { kind: 'image-not-found', ref } };
  const user = host.containers.find((c) => c.image === image.ref);
  if (user) return { ok: false, host, error: { kind: 'image-in-use', ref: image.ref, container: user.id.slice(0, 12) } };
  return { ok: true, host: { ...host, images: host.images.filter((i) => i !== image) }, value: image };
}

/**
 * 機械から見た、動いているコンテナのプロセス（ps aux に出る物）。
 * コンテナごとに containerd-shim が親になり、その子が主のプロセス（docker inspect の .State.Pid）。
 * 機械にいない利用者（nginx）は、番号（101）で出る
 */
export function hostProcesses(host: ContainerHost | null): { pid: number; ppid: number; user: string; command: string; memory: number }[] {
  const out: { pid: number; ppid: number; user: string; command: string; memory: number }[] = [];
  for (const c of host?.containers ?? []) {
    if (c.state !== 'running') continue;
    const image = host?.images.find((i) => i.ref === c.image);
    const shim = c.pid - 1;
    out.push({ pid: shim, ppid: 1, user: 'root', command: `/usr/bin/containerd-shim-runc-v2 -namespace moby -id ${longId(c.id)} -address /run/containerd/containerd.sock`, memory: 12 });
    procsOf(image).forEach((p, i) => {
      out.push({ pid: c.pid + i, ppid: i === 0 ? shim : c.pid, user: p.user === undefined || p.user === 'root' ? 'root' : '101', command: p.command, memory: p.memory });
    });
  }
  return out;
}

/** コンテナの中から見えるファイル（イメージに入っている物） */
export function filesInside(host: ContainerHost, c: Container): Readonly<Record<string, string>> {
  return host.images.find((i) => i.ref === c.image)?.files ?? {};
}

/** 中身を読む場所を持つイメージが、中身を見つけられない時の答え */
const FORBIDDEN = '<html><head><title>403 Forbidden</title></head><body><h1>403 Forbidden</h1></body></html>';

/**
 * 手元のポートで応えるコンテナ（src/engines/http が使う）。
 * read は手元のファイルを読む関数（ボリュームでつないだ場所の中身を返すため。無ければ null）
 */
export function servedAt(host: ContainerHost | null, port: number, read: (path: string) => string | null = () => null): { container: Container; body: string; status: number } | null {
  if (!host) return null;
  const c = portOwner(host, port);
  if (!c) return null;
  const image = host.images.find((i) => i.ref === c.image);
  const map = c.ports.find((p) => p.host === port);
  if (c.app) return map?.container === c.app.port ? { container: c, body: c.app.body, status: 200 } : null;
  if (!image?.serves || map?.container !== image.serves.port) return null;
  const root = image.serves.root;
  if (root === undefined) return { container: c, body: image.serves.body, status: 200 };
  const volume = c.volumes.find((v) => v.container.replace(/\/+$/, '') === root);
  const page = volume ? read(`${volume.host.replace(/\/+$/, '')}/index.html`) : null;
  return page === null ? { container: c, body: FORBIDDEN, status: 403 } : { container: c, body: page, status: 200 };
}
