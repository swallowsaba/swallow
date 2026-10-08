/**
 * コンテナの模型（docs/curriculum.md の ctr: コンテナの概念を先に教え、Docker はその具体的な技術として扱う）。純粋な関数。
 *
 * - イメージ: アプリと動くのに要る物を固めた、読み取り専用の型。レジストリ（置き場）から取ってくる（pull）
 * - コンテナ: イメージから作った、動いている（または止まった）1 つの実体。同じイメージから何個でも作れる
 * - ポートの公開: 手元のポートを、コンテナの中のポートにつなぐ（-p 8080:80）。同じ手元のポートは 2 つに使えない
 * - ボリューム: コンテナを消しても残す場所を、コンテナの中の場所につなぐ（-v）。手元の場所（/srv/board）か、名前付きボリューム（db-data）。
 *   中身を読む場所（serves.root）を持つイメージは、そこにつないだ手元の場所の index.html を返す（つないでいなければ 403）。
 *   コンテナの中で書いた物は、名前付きボリュームをつないだ場所ならボリュームに、それ以外はコンテナの書き込みの層に入り、コンテナを消すと一緒に消える
 * - 網（docker.i.04）: 何も指定しないで動かしたコンテナは既定の網（bridge）に入る。そこではアドレスで届くが、名前は引けない。
 *   自分で作った網（docker network create）の中では、コンテナの名前で届く（Docker の中の DNS が、動いているコンテナのアドレスを答える）
 * - 置き場（docker.i.05）: 公開の置き場（REGISTRY）のほかに、自分たちの置き場（registry.city.example など）を持てる。
 *   名前の先頭が住所（. を含む）なら、その置き場に向かう。自分たちの置き場は、ログインした利用者だけが取れて・置ける
 * - 別の機械の Engine（docker --context）: CLI は手元のまま、頼む先の Engine だけを変える。置き場とログインは手元（CLI の側）の物を使う
 * - 隔離（ctr.i.02）: コンテナは名前空間で区切った機械のプロセス。中からは自分のプロセスだけが見え（主のプロセスが PID 1）、
 *   機械からは同じプロセスが機械の PID で見える（containerd-shim の子）。cgroups のメモリの上限（--memory）より多く使うと、
 *   起動してすぐカーネルに止められる（終了コード 137 = 128 + SIGKILL の 9、OOMKilled）
 *
 * ID は通し番号から決める（同じ操作からは同じ ID）。CLI（docker）は src/engines/docker がこの上に作る。
 */

import { runNodeApp } from './app';
import { initFiles, readTables, TABLES_FILE, type Tables } from './pg';

export interface Image {
  /** 名前:タグ（nginx:1.27） */
  ref: string;
  id: string;
  size: string;
  /**
   * 動かした時に待ち受けるポートと、応える中身（Web サーバのイメージ）。
   * root があれば、コンテナの中のその場所から中身を読む（ボリュームでつないだ手元の場所の index.html。無ければ 403）
   */
  serves?: {
    port: number; body: string; root?: string;
    /** 道ごとの答え（「/道」か「METHOD /道」）。あれば body ではなく、これで答える（クラスタの Ingress から届いた頼み） */
    routes?: Readonly<Record<string, { status: number; body: string }>>;
    /** 道が無い時の答えの形（express は Node.js の Express の Cannot GET。無ければ nginx の 404） */
    notFound?: 'express';
    /**
     * 動き出してから待ち受けるまでの秒数（データを読み込む間は、ポートで待ち受けない）。
     * あれば、クラスタの Pod は本物の確かめ（httpGet の liveness・readiness）でこのアプリを見る（src/engines/k8s/probes.ts）
     */
    warmup?: number;
  };
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
  /** DB（PostgreSQL）のイメージ: データを書く場所・DB の名前・最初の表（src/engines/container/pg.ts） */
  pg?: { dataDir: string; db: string; seed: Tables };
  /** 動き出す時に DB につなぐアプリ: DB の場所（postgres://利用者@名前:ポート/DB）を受け取る環境変数 */
  database?: { env: string };
  /**
   * 動いている間、環境変数の URL（http://Service の名前）に頼みを送り続ける道具（クラスタの負荷）。
   * millicores は、受ける側の Ready の Pod 全体に掛かる CPU の仕事の量（m。Pod の数で等しく分ける。src/engines/k8s/metrics.ts）
   */
  sends?: { env: string; millicores: number };
}

/** 網（決まって在る bridge・host・none と、自分で作った網） */
export interface Network {
  name: string;
  id: string;
  driver: 'bridge' | 'host' | 'null';
  /** アドレスの 2 つ目の数（172.18.0.0/16 の 18）。アドレスを持たない網は 0 */
  subnet: number;
}

/** 名前付きボリューム（コンテナを消しても残る。files はボリュームの中からの相対パス → 中身） */
export interface Volume {
  name: string;
  files: Readonly<Record<string, string>>;
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
  /** 書き込みの層（中で書いたファイル。場所 → 中身）。コンテナを消すと一緒に消える */
  files?: Readonly<Record<string, string>>;
  /** 入っている網の名前（無ければ既定の網 bridge だけ） */
  networks?: readonly string[];
  /** 網ごとのアドレス */
  addresses?: Readonly<Record<string, string>>;
  /** 自作の網の中で、名前のほかに引ける別名（Compose のサービス名） */
  aliases?: readonly string[];
  /** 札（Compose の構成の名前・サービス・設定の指紋） */
  labels?: Readonly<Record<string, string>>;
}

export interface ContainerHost {
  /** 手元にあるイメージ */
  images: readonly Image[];
  containers: readonly Container[];
  /** ID と名前を決める通し番号 */
  seq: number;
  /** docker build で作った段の鍵（同じ鍵の段は使い回す） */
  buildCache?: readonly string[];
  /** 名前付きボリューム */
  volumes?: readonly Volume[];
  /** 名前ごとに、コンテナを作った回数（作り直したことを確かめる） */
  made?: Readonly<Record<string, number>>;
  /** 自分で作った網 */
  networks?: readonly Network[];
  /** 自分たちの置き場（手元の CLI の側だけが持つ） */
  registries?: readonly PrivateRegistry[];
  /** ログインした置き場（住所 → 利用者。手元の CLI の側だけが持つ） */
  logins?: Readonly<Record<string, string>>;
  /** 頼む先の Engine（docker context。手元の CLI の側だけが持つ） */
  contexts?: readonly EngineContext[];
  /** 今の頼む先（無ければ default = 手元の Engine） */
  context?: string;
}

/** 自分たちの置き場。置けるのは、ログインした利用者（user）だけ */
export interface PrivateRegistry {
  server: string;
  user: string;
  images: readonly Image[];
}

/** 頼む先の、別の機械の Engine */
export interface EngineContext {
  name: string;
  endpoint: string;
  description: string;
  host: ContainerHost;
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

/** 市の売店の画面（city-shop:1.0） */
const SHOP_PAGE = '<!DOCTYPE html>\n<html><head><title>市の売店</title></head><body><h1>市の売店</h1><p>図書館の本・公園の地図・記念の品</p></body></html>\n';

/** 売店の次の版の画面（city-shop:1.1） */
const SHOP_PAGE_11 = '<!DOCTYPE html>\n<html><head><title>市の売店</title></head><body><h1>市の売店</h1><p>図書館の本・公園の地図・記念の品・季節の品</p></body></html>\n';

/** nginx の誤りの画面（本物の形。版を名乗る） */
const nginxError = (status: string): string => `<html>\r\n<head><title>${status}</title></head>\r\n<body>\r\n<center><h1>${status}</h1></center>\r\n<hr><center>nginx/1.27.2</center>\r\n</body>\r\n</html>\r\n`;
const NGINX_403 = nginxError('403 Forbidden');
const NGINX_404 = nginxError('404 Not Found');

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
  {
    // 市の売店の画面（nginx が置いた HTML を返す。k8s.i.04）。動き出すとすぐ待ち受ける（確かめは本物の httpGet で見る）
    ref: 'city-shop:1.0', id: '2a7c5e91f3d8', size: '43.6MB', command: "/docker-entrypoint.sh nginx -g 'daemon off;'",
    serves: {
      port: 80, body: SHOP_PAGE, warmup: 0,
      routes: { '/': { status: 200, body: SHOP_PAGE }, '/index.html': { status: 200, body: SHOP_PAGE } },
    },
    startLog: ['/docker-entrypoint.sh: Configuration complete; ready for start up', 'nginx: start worker processes'],
  },
  {
    // 売店の次の版（季節の品を足した。k8s.i.08）
    ref: 'city-shop:1.1', id: '7b3f0c9e5a21', size: '43.7MB', command: "/docker-entrypoint.sh nginx -g 'daemon off;'",
    serves: {
      port: 80, body: SHOP_PAGE_11, warmup: 0,
      routes: { '/': { status: 200, body: SHOP_PAGE_11 }, '/index.html': { status: 200, body: SHOP_PAGE_11 } },
    },
    startLog: ['/docker-entrypoint.sh: Configuration complete; ready for start up', 'nginx: start worker processes'],
  },
  {
    // 壊れた版（k8s.i.08）。画面の作り方を変えた時に HTML を置く場所を誤り、/usr/share/nginx/html に index.html が無い。
    // nginx は動くが、/ には本物と同じく 403（ディレクトリの一覧を禁じている）で答える
    ref: 'city-shop:1.2', id: 'e05d8a4b1c76', size: '43.7MB', command: "/docker-entrypoint.sh nginx -g 'daemon off;'",
    serves: {
      port: 80, body: '', warmup: 0,
      routes: { '/': { status: 403, body: NGINX_403 }, '/index.html': { status: 404, body: NGINX_404 } },
    },
    startLog: [
      '/docker-entrypoint.sh: Configuration complete; ready for start up',
      'nginx: start worker processes',
      '[error] 29#29: *1 directory index of "/usr/share/nginx/html/" is forbidden, client: 10.244.1.1, server: localhost, request: "GET / HTTP/1.1"',
    ],
  },
  {
    // 市の施設の空きを答える API（Node.js の Express。/api の下で答える。k8s.i.04）
    ref: 'city-api:1.0', id: '8e3b0d6a4c17', size: '151MB', command: 'docker-entrypoint.sh node server.js',
    serves: {
      port: 3000, body: '', notFound: 'express',
      routes: {
        '/api/rooms': { status: 200, body: '[{"id":1,"name":"図書館の会議室","free":true},{"id":2,"name":"体育館","free":false},{"id":3,"name":"公民館の和室","free":true}]' },
        '/api/health': { status: 200, body: '{"status":"ok"}' },
      },
    },
    startLog: ['api: version 1.0.0', 'api: listening on :3000'],
  },
  {
    // 市の案内（Node.js）。動き出してから地図のデータを 20 秒かけて読み込み、それから 8080 番で待ち受ける（k8s.i.05）
    ref: 'city-guide:1.0', id: '5f0c2b8e7a34', size: '164MB', command: 'docker-entrypoint.sh node server.js',
    serves: {
      port: 8080, body: '', notFound: 'express', warmup: 20,
      routes: {
        '/': { status: 200, body: '<!DOCTYPE html>\n<html><head><title>市の案内</title></head><body><h1>市の案内</h1><p>図書館・公園・駅の地図</p></body></html>\n' },
        '/healthz': { status: 200, body: '{"status":"ok"}' },
        '/ready': { status: 200, body: '{"ready":true}' },
      },
    },
    bootLog: ['guide: version 1.0.0', 'guide: loading map data (about 20s)'],
    startLog: ['guide: map data loaded (1,812 places)', 'guide: listening on :8080'],
  },
  {
    // 市の利用者の波を作る道具（k8s.i.06）。TARGET_URL の Service に頼みを送り続け、受ける側の Pod 全体に CPU 700m の仕事を掛ける
    ref: 'city-crowd:1.0', id: 'c4d81e2b9f60', size: '12.4MB', command: '/crowd',
    requiresEnv: { name: 'TARGET_URL', error: ['crowd: TARGET_URL is not set'] },
    sends: { env: 'TARGET_URL', millicores: 700 },
    startLog: ['crowd: sending about 40 requests per second'],
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
    // 市の予約の DB（PostgreSQL 16 に、予約の表を最初から入れた物）。データを書く場所が空なら、最初に作る（docker.i.03）
    ref: 'city-db:1.0', id: '8c2e5f1a7d36', size: '438MB', command: 'docker-entrypoint.sh postgres',
    pg: {
      dataDir: '/var/lib/postgresql/data', db: 'reserve',
      seed: { reservations: { columns: ['id', 'name'], rows: [['1', '図書館の会議室'], ['2', '体育館'], ['3', '公民館の和室']] } },
    },
    startLog: ['LOG:  starting PostgreSQL 16.4 on x86_64-pc-linux-gnu', 'LOG:  listening on IPv4 address "0.0.0.0", port 5432', 'LOG:  database system is ready to accept connections'],
    procs: [{ command: 'postgres', memory: 28.6, user: 'postgres' }],
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
    database: { env: 'DATABASE_URL' },
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
  | { kind: 'image-in-use'; ref: string; container: string }
  | { kind: 'no-such-volume'; name: string }
  /** ids: つないでいるコンテナ（止まった物も） */
  | { kind: 'volume-in-use'; name: string; ids: readonly string[] }
  | { kind: 'no-such-network'; ref: string }
  | { kind: 'network-exists'; name: string }
  | { kind: 'network-builtin'; name: string }
  | { kind: 'network-in-use'; name: string; id: string }
  | { kind: 'already-connected'; name: string; network: string }
  | { kind: 'not-connected'; id: string; network: string }
  /** 置き場の住所が引けない */
  | { kind: 'registry-unknown'; server: string }
  | { kind: 'push-no-image'; ref: string }
  /** 住所の無い名前（Docker Hub）に置こうとした。この練習には Docker Hub の利用者は無い */
  | { kind: 'push-denied'; ref: string }
  | { kind: 'push-unauthorized'; ref: string }
  | { kind: 'login-failed'; server: string };

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

/** 名前の先頭の置き場の住所（registry.city.example/shop/web:1.2 の registry.city.example）。住所が無ければ null（Docker Hub） */
export function serverOf(ref: string): string | null {
  const first = ref.split('/')[0] ?? '';
  return ref.includes('/') && (first.includes('.') || first.includes(':') || first === 'localhost') ? first : null;
}

export function pull(host: ContainerHost, raw: string): Result<Image> {
  const ref = normalizeRef(raw);
  const have = host.images.find((i) => i.ref === ref);
  if (have) return { ok: true, host, value: have };
  const server = serverOf(ref);
  if (server !== null) {
    const reg = host.registries?.find((r) => r.server === server);
    if (!reg) return { ok: false, host, error: { kind: 'registry-unknown', server } };
    // ログインしていなければ、あるかどうかも教えない（本物と同じ）
    const image = host.logins?.[server] === undefined ? undefined : reg.images.find((i) => i.ref === ref);
    if (!image) return { ok: false, host, error: { kind: 'image-not-found', ref, known: host.logins?.[server] !== undefined } };
    return { ok: true, host: { ...host, images: [...host.images, image] }, value: image };
  }
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

/** DB（PostgreSQL）がデータを書く場所を初めて作った時のログ（本物の docker-entrypoint.sh の形を詰めた物） */
export const PG_INIT = [
  'The files belonging to this database system will be owned by user "postgres".', 'This user must also own the server process.', '',
  'fixing permissions on existing directory /var/lib/postgresql/data ... ok', 'creating subdirectories ... ok', 'creating configuration files ... ok', '',
  'Success. You can now start the database server.', '', '/usr/local/bin/docker-entrypoint.sh: running /docker-entrypoint-initdb.d/reserve.sql',
  'CREATE TABLE', 'INSERT 0 3', '', 'PostgreSQL init process complete; ready for start up.', '',
];
/** データを書く場所に、もう DB がある時のログ */
export const PG_SKIP = ['', 'PostgreSQL Database directory appears to contain a database; Skipping initialization', ''];

/**
 * DB の場所（postgres://利用者@名前:ポート/DB）につなぐ。名前は、同じ自作の網にいる動いているコンテナの名前なら引ける。
 * localhost はコンテナ自身。届いた先が DB（5432 番で待ち受け）でなければ断られる。出す文は Node.js の pg の物
 */
function connectDb(host: ContainerHost, c: Container, url: string): { target: string; error?: string[]; db?: Container } {
  const m = /^[a-z]+:\/\/(?:[^@/]*@)?([^:/]+)(?::(\d+))?/.exec(url);
  const name = m?.[1] ?? url;
  const port = Number(m?.[2] ?? 5432);
  const target = `${name}:${String(port)}`;
  const refused = (ip: string): string[] => [`Error: connect ECONNREFUSED ${ip}:${String(port)}`, '    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1555:16)'];
  if (name === 'localhost' || name === '127.0.0.1') return { target, error: refused('127.0.0.1') };
  const to = /^\d+\.\d+\.\d+\.\d+$/.test(name) ? reachableAt(host, c, name) : resolveName(host, c, name);
  if (!to) {
    if (/^\d+\.\d+\.\d+\.\d+$/.test(name)) return { target, error: [`Error: connect ETIMEDOUT ${name}:${String(port)}`, '    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1555:16)'] };
    return { target, error: [`Error: getaddrinfo ENOTFOUND ${name}`, '    at GetAddrInfoReqWrap.onlookup [as oncomplete] (node:dns:107:26)'] };
  }
  const listens = host.images.find((i) => i.ref === to.c.image)?.pg !== undefined && port === 5432;
  return listens ? { target, db: to.c } : { target, error: refused(to.ip) };
}

/** 動かす。DB のイメージは、データを書く場所が空なら最初の表を作り（init）、あればそのまま使う。DB につなぐアプリは、つなげなければ止まる */
function bootIn(host: ContainerHost, c: Container, image: Image): Result<Container> {
  const booted = boot(c, image);
  if (image.database && booted.state === 'running') {
    const r = connectDb(host, booted, c.env[image.database.env] ?? '');
    const head = [...c.log, ...(image.bootLog ?? []), `reserve: connecting to the database at ${r.target}`];
    // つながったら、3000 番で待ち受け、DB にある予約の数を答える
    const pg = r.db ? host.images.find((i) => i.ref === r.db?.image)?.pg : undefined;
    const count = r.db && pg ? (readTables(filesInside(host, r.db)[`${pg.dataDir}/${TABLES_FILE}`]).reservations?.rows.length ?? 0) : 0;
    const next: Container = r.error
      ? { ...booted, state: 'exited', exitCode: 1, log: [...head, ...r.error] }
      : {
        ...booted, log: [...head, `reserve: connected to the database at ${r.target}`, ...image.startLog],
        app: { port: 3000, body: `<html><body><h1>市の予約の窓口</h1><p>予約 ${String(count)} 件</p></body></html>` },
      };
    return { ok: true, host: replace(host, next), value: next };
  }
  if (!image.pg || booted.state !== 'running') return { ok: true, host: replace(host, booted), value: booted };
  const dir = image.pg.dataDir;
  const fresh = filesInside(host, booted)[`${dir}/PG_VERSION`] === undefined;
  const next = { ...booted, log: [...c.log, ...(fresh ? PG_INIT : PG_SKIP), ...image.startLog] };
  if (!fresh) return { ok: true, host: replace(host, next), value: next };
  const files = Object.fromEntries(Object.entries(initFiles(image.pg.seed)).map(([k, v]) => [`${dir}/${k}`, v]));
  const h = writeInside(replace(host, next), next, files);
  const value = h.containers.find((x) => x.id === c.id) ?? next;
  return { ok: true, host: h, value };
}

export interface RunOptions {
  image: string;
  name?: string;
  ports?: readonly PortMap[];
  volumes?: readonly { host: string; container: string }[];
  env?: Readonly<Record<string, string>>;
  /** メモリの上限（バイト） */
  memory?: number;
  /** 入る網（無ければ bridge） */
  network?: string;
  aliases?: readonly string[];
  labels?: Readonly<Record<string, string>>;
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
  const net = findNetwork(host, o.network ?? 'bridge');
  if (!net) return { ok: false, host, error: { kind: 'no-such-network', ref: o.network ?? '' } };
  const c: Container = join(host, {
    id: idOf(host.seq + 1), name, image: pulled.value.ref, state: 'created', exitCode: 0,
    ports: o.ports ?? [], volumes: o.volumes ?? [], env: o.env ?? {}, log: [], pid: pidOf(host.seq + 1), networks: [],
    ...(o.memory !== undefined ? { memoryLimit: o.memory } : {}),
    ...(o.aliases ? { aliases: o.aliases } : {}),
    ...(o.labels ? { labels: o.labels } : {}),
  }, net);
  // つなぐ名前付きボリュームが無ければ作る（本物と同じ）
  const have = new Set((host.volumes ?? []).map((v) => v.name));
  const added = c.volumes.filter((v) => isVolumeName(v.host) && !have.has(v.host)).map((v) => ({ name: v.host, files: {} }));
  host = {
    ...host, seq: host.seq + 1, containers: [...host.containers, c],
    ...(added.length > 0 || host.volumes ? { volumes: [...(host.volumes ?? []), ...added] } : {}),
    made: { ...host.made, [name]: (host.made?.[name] ?? 0) + 1 },
  };
  // 外のポートが使用中なら、作ったコンテナは Created のまま残る
  for (const p of c.ports) if (portOwner(host, p.host)) return { ok: false, host, error: { kind: 'port-in-use', port: p.host, name: c.name, id: c.id } };
  return bootIn(host, c, pulled.value);
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
  return image ? bootIn(host, c, image) : { ok: true, host, value: c };
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

/** 決まって在る網 */
export const BUILTIN_NETWORKS: readonly Network[] = [
  { name: 'bridge', id: hexOf(9001, 64), driver: 'bridge', subnet: 17 },
  { name: 'host', id: hexOf(9002, 64), driver: 'host', subnet: 0 },
  { name: 'none', id: hexOf(9003, 64), driver: 'null', subnet: 0 },
];

/** 全ての網（名前の順。docker network ls と同じ） */
export const allNetworks = (host: ContainerHost): Network[] => [...BUILTIN_NETWORKS, ...(host.networks ?? [])].sort((a, b) => a.name.localeCompare(b.name));

/** 名前か ID（先頭の数文字でよい）で網を探す */
export function findNetwork(host: ContainerHost, ref: string): Network | undefined {
  const all = allNetworks(host);
  return all.find((n) => n.name === ref) ?? (ref.length >= 3 ? all.find((n) => n.id.startsWith(ref)) : undefined);
}

/** コンテナの入っている網（無ければ既定の網だけ） */
export const networksOf = (c: Container): readonly string[] => c.networks ?? ['bridge'];

/** 網に入れる。アドレスは、その網で空いている一番小さい 172.<網>.0.<2〜> */
function join(host: ContainerHost, c: Container, net: Network): Container {
  const networks = [...networksOf(c).filter((n) => n !== net.name), net.name];
  if (net.subnet === 0) return { ...c, networks };
  const used = new Set(host.containers.filter((x) => x.id !== c.id).map((x) => x.addresses?.[net.name]));
  let n = 2;
  while (used.has(`172.${String(net.subnet)}.0.${String(n)}`)) n += 1;
  return { ...c, networks, addresses: { ...c.addresses, [net.name]: `172.${String(net.subnet)}.0.${String(n)}` } };
}

/** 自分で作る網か（名前が引けるのは、この網の中だけ） */
const userDefined = (name: string): boolean => !BUILTIN_NETWORKS.some((n) => n.name === name);

/** from から name を引く: 同じ自作の網にいる、動いているコンテナの名前なら、その網のアドレス */
export function resolveName(host: ContainerHost, from: Container, name: string): { c: Container; ip: string } | null {
  for (const net of networksOf(from).filter(userDefined)) {
    const to = host.containers.find((x) => (x.name === name || x.aliases?.includes(name) === true) && x.state === 'running' && networksOf(x).includes(net));
    const ip = to?.addresses?.[net];
    if (to && ip !== undefined) return { c: to, ip };
  }
  return null;
}

/** from からアドレスで届く、動いているコンテナ（同じ網にいれば、既定の網でも届く） */
function reachableAt(host: ContainerHost, from: Container, ip: string): { c: Container; ip: string } | null {
  const to = host.containers.find((x) => x.state === 'running' && networksOf(x).some((n) => networksOf(from).includes(n) && x.addresses?.[n] === ip));
  return to ? { c: to, ip } : null;
}

export function createNetwork(host: ContainerHost, name: string): Result<Network> {
  if (findNetwork(host, name)?.name === name) return { ok: false, host, error: { kind: 'network-exists', name } };
  const subnet = Math.max(17, ...(host.networks ?? []).map((n) => n.subnet)) + 1;
  const net: Network = { name, id: hexOf(7000 + subnet, 64), driver: 'bridge', subnet };
  return { ok: true, host: { ...host, networks: [...(host.networks ?? []), net] }, value: net };
}

/** 網を消す（動いているコンテナが入っていれば消せない。決まって在る網は消せない） */
export function removeNetwork(host: ContainerHost, ref: string): Result<Network> {
  const net = findNetwork(host, ref);
  if (!net) return { ok: false, host, error: { kind: 'no-such-network', ref } };
  if (!userDefined(net.name)) return { ok: false, host, error: { kind: 'network-builtin', name: net.name } };
  if (host.containers.some((c) => c.state === 'running' && networksOf(c).includes(net.name))) return { ok: false, host, error: { kind: 'network-in-use', name: net.name, id: net.id } };
  return { ok: true, host: { ...host, networks: (host.networks ?? []).filter((n) => n !== net) }, value: net };
}

/** 網に入れる（docker network connect）。止まっているコンテナも入れられる */
export function connectNetwork(host: ContainerHost, netRef: string, ref: string): Result<Container> {
  const net = findNetwork(host, netRef);
  if (!net) return { ok: false, host, error: { kind: 'no-such-network', ref: netRef } };
  const c = findContainer(host, ref);
  if (!c) return { ok: false, host, error: { kind: 'no-such-container', ref } };
  if (networksOf(c).includes(net.name)) return { ok: false, host, error: { kind: 'already-connected', name: c.name, network: net.name } };
  const next = join(host, c, net);
  return { ok: true, host: replace(host, next), value: next };
}

/** 網から外す（docker network disconnect） */
export function disconnectNetwork(host: ContainerHost, netRef: string, ref: string): Result<Container> {
  const net = findNetwork(host, netRef);
  if (!net) return { ok: false, host, error: { kind: 'no-such-network', ref: netRef } };
  const c = findContainer(host, ref);
  if (!c) return { ok: false, host, error: { kind: 'no-such-container', ref } };
  if (!networksOf(c).includes(net.name)) return { ok: false, host, error: { kind: 'not-connected', id: longId(c.id), network: net.name } };
  const addresses = Object.fromEntries(Object.entries(c.addresses ?? {}).filter(([n]) => n !== net.name));
  const next: Container = { ...c, networks: networksOf(c).filter((n) => n !== net.name), addresses };
  return { ok: true, host: replace(host, next), value: next };
}

/** 置く（docker push）。名前に置き場の住所があり、そこにログインしていれば置ける。同じ名前:タグは置き換わる */
export function push(host: ContainerHost, raw: string): Result<Image> {
  const ref = normalizeRef(raw);
  const image = host.images.find((i) => i.ref === ref);
  if (!image) return { ok: false, host, error: { kind: 'push-no-image', ref } };
  const server = serverOf(ref);
  if (server === null) return { ok: false, host, error: { kind: 'push-denied', ref } };
  const reg = host.registries?.find((r) => r.server === server);
  if (!reg) return { ok: false, host, error: { kind: 'registry-unknown', server } };
  if (host.logins?.[server] === undefined) return { ok: false, host, error: { kind: 'push-unauthorized', ref } };
  const next: PrivateRegistry = { ...reg, images: [...reg.images.filter((i) => i.ref !== ref), image] };
  return { ok: true, host: { ...host, registries: (host.registries ?? []).map((r) => (r === reg ? next : r)) }, value: image };
}

/** ログインする（練習の端末が、置き場の利用者とパスワードを代わりに入れる。違う利用者は断られる） */
export function login(host: ContainerHost, server: string, user?: string): Result<string> {
  const reg = host.registries?.find((r) => r.server === server);
  if (!reg) return { ok: false, host, error: { kind: 'registry-unknown', server } };
  if (user !== undefined && user !== reg.user) return { ok: false, host, error: { kind: 'login-failed', server } };
  return { ok: true, host: { ...host, logins: { ...host.logins, [server]: reg.user } }, value: reg.user };
}

export function logout(host: ContainerHost, server: string): ContainerHost {
  return { ...host, logins: Object.fromEntries(Object.entries(host.logins ?? {}).filter(([k]) => k !== server)) };
}

/** 自分たちの置き場を足す（setup の registries） */
export function addRegistry(host: ContainerHost, server: string, user: string): ContainerHost {
  return { ...host, registries: [...(host.registries ?? []), { server, user, images: [] }] };
}

/** 頼む先の Engine を足す（setup の contexts） */
export function addContext(host: ContainerHost, name: string, endpoint: string, description: string, images: readonly string[] = []): ContainerHost {
  return { ...host, contexts: [...(host.contexts ?? []), { name, endpoint, description, host: createContainerHost(images) }] };
}

/** 頼む先の Engine から見た模型（置き場とログインは手元の物）。無い名前は null */
export function engineOf(world: ContainerHost, name: string): ContainerHost | null {
  if (name === 'default') return world;
  const ctx = world.contexts?.find((c) => c.name === name);
  if (!ctx) return null;
  return { ...ctx.host, ...(world.registries ? { registries: world.registries } : {}), ...(world.logins ? { logins: world.logins } : {}) };
}

/** 頼む先の Engine で変わった物を、手元の模型に戻す */
export function withEngine(world: ContainerHost, name: string, engine: ContainerHost): ContainerHost {
  if (name === 'default') return engine;
  const { registries, logins, ...own } = engine;
  return {
    ...world,
    ...(registries ? { registries } : {}),
    ...(logins ? { logins } : {}),
    contexts: (world.contexts ?? []).map((c) => (c.name === name ? { ...c, host: own } : c)),
  };
}

/** 機械にいない、コンテナの中の利用者の番号 */
const UIDS: Readonly<Record<string, string>> = { nginx: '101', postgres: '999' };

/**
 * 機械から見た、動いているコンテナのプロセス（ps aux に出る物）。
 * コンテナごとに containerd-shim が親になり、その子が主のプロセス（docker inspect の .State.Pid）。
 * 機械にいない利用者（nginx・postgres）は、番号（101・999）で出る
 */
export function hostProcesses(host: ContainerHost | null): { pid: number; ppid: number; user: string; command: string; memory: number }[] {
  const out: { pid: number; ppid: number; user: string; command: string; memory: number }[] = [];
  for (const c of host?.containers ?? []) {
    if (c.state !== 'running') continue;
    const image = host?.images.find((i) => i.ref === c.image);
    const shim = c.pid - 1;
    out.push({ pid: shim, ppid: 1, user: 'root', command: `/usr/bin/containerd-shim-runc-v2 -namespace moby -id ${longId(c.id)} -address /run/containerd/containerd.sock`, memory: 12 });
    procsOf(image).forEach((p, i) => {
      out.push({ pid: c.pid + i, ppid: i === 0 ? shim : c.pid, user: p.user === undefined || p.user === 'root' ? 'root' : (UIDS[p.user] ?? '1000'), command: p.command, memory: p.memory });
    });
  }
  return out;
}

/** 名前付きボリュームの名前か（手元の場所は / や . で始まる） */
export const isVolumeName = (s: string): boolean => /^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(s);

const trimSlash = (p: string): string => p.replace(/(.)\/+$/, '$1');

/** 中の場所 path を受け持つ名前付きボリュームと、その中からの相対パス */
function volumeAt(c: Container, path: string): { name: string; rel: string } | null {
  for (const v of c.volumes) {
    const dir = trimSlash(v.container);
    if (isVolumeName(v.host) && path.startsWith(`${dir}/`)) return { name: v.host, rel: path.slice(dir.length + 1) };
  }
  return null;
}

/** コンテナの中から見えるファイル（イメージに入っている物・書き込みの層・つないだ名前付きボリュームの中身） */
export function filesInside(host: ContainerHost, c: Container): Readonly<Record<string, string>> {
  const out: Record<string, string> = { ...host.images.find((i) => i.ref === c.image)?.files, ...c.files };
  for (const m of c.volumes) {
    const v = isVolumeName(m.host) ? host.volumes?.find((x) => x.name === m.host) : undefined;
    for (const [rel, text] of Object.entries(v?.files ?? {})) out[`${trimSlash(m.container)}/${rel}`] = text;
  }
  return out;
}

/** コンテナの中で書く（名前付きボリュームをつないだ場所ならボリュームに、それ以外は書き込みの層に） */
export function writeInside(host: ContainerHost, c: Container, files: Readonly<Record<string, string>>): ContainerHost {
  let volumes = host.volumes ?? [];
  const layer: Record<string, string> = { ...c.files };
  for (const [path, text] of Object.entries(files)) {
    const at = volumeAt(c, path);
    if (at) volumes = volumes.map((v) => (v.name === at.name ? { ...v, files: { ...v.files, [at.rel]: text } } : v));
    else layer[path] = text;
  }
  return replace({ ...host, ...(host.volumes ? { volumes } : {}) }, { ...c, files: layer });
}

/** 名前付きボリュームを作る（もうあれば、そのまま） */
export function createVolume(host: ContainerHost, name: string): Result<Volume> {
  const have = host.volumes?.find((v) => v.name === name);
  if (have) return { ok: true, host, value: have };
  const v: Volume = { name, files: {} };
  return { ok: true, host: { ...host, volumes: [...(host.volumes ?? []), v] }, value: v };
}

/** 名前付きボリュームを消す（つないでいるコンテナがあれば、止まっていても消せない） */
export function removeVolume(host: ContainerHost, name: string): Result<Volume> {
  const v = host.volumes?.find((x) => x.name === name);
  if (!v) return { ok: false, host, error: { kind: 'no-such-volume', name } };
  const users = host.containers.filter((c) => c.volumes.some((m) => m.host === name));
  if (users.length > 0) return { ok: false, host, error: { kind: 'volume-in-use', name, ids: users.map((c) => longId(c.id)) } };
  return { ok: true, host: { ...host, volumes: (host.volumes ?? []).filter((x) => x !== v) }, value: v };
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
