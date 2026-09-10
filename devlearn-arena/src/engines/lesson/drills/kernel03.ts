import { fileEquals } from '../authoring/assert';
import type { MissionSource } from '../authoring/mission';
import { HOME, family, man } from './shared';

const CH = 'kernel/03';

/* ------------------------------------------------------------------ *
 * 1. cut で列を取り出す
 * ------------------------------------------------------------------ */

interface CutSpec {
  slug: string;
  header: string[];
  rows: string[][];
  delimiter: string;
  field: number;
}

const TABLES: { name: string; delimiter: string; header: string[]; rows: string[][] }[] = [
  { name: 'users', delimiter: ':', header: ['name', 'uid', 'shell'], rows: [['alice', '1001', '/bin/sh'], ['bob', '1002', '/bin/devsh'], ['carol', '1003', '/bin/sh']] },
  { name: 'orders', delimiter: ',', header: ['id', 'item', 'qty'], rows: [['1', 'apple', '3'], ['2', 'pear', '1'], ['3', 'plum', '7']] },
  { name: 'hosts', delimiter: ' ', header: ['ip', 'name'], rows: [['10.0.0.1', 'web1'], ['10.0.0.2', 'web2'], ['10.0.0.3', 'db1']] },
  { name: 'services', delimiter: ':', header: ['name', 'port'], rows: [['http', '80'], ['https', '443'], ['ssh', '22']] },
  { name: 'metrics', delimiter: ',', header: ['host', 'cpu', 'mem'], rows: [['web1', '12', '340'], ['web2', '87', '900'], ['db1', '45', '2100']] },
  { name: 'routes', delimiter: ' ', header: ['dest', 'gw'], rows: [['10.1.0.0/16', '10.0.0.254'], ['10.2.0.0/16', '10.0.0.253'], ['0.0.0.0/0', '10.0.0.1']] },
  { name: 'certs', delimiter: ',', header: ['domain', 'expires', 'issuer'], rows: [['a.example', '2026-06-01', 'ca1'], ['b.example', '2026-07-01', 'ca2'], ['c.example', '2026-08-01', 'ca1']] },
  { name: 'quota', delimiter: ':', header: ['team', 'cpu', 'memory'], rows: [['pay', '4', '8Gi'], ['ops', '2', '4Gi'], ['data', '8', '32Gi']] },
  { name: 'nodes', delimiter: ' ', header: ['node', 'role', 'version'], rows: [['n1', 'cp', 'v1.31'], ['n2', 'worker', 'v1.31'], ['n3', 'worker', 'v1.30']] },
  { name: 'jobs', delimiter: ',', header: ['job', 'status', 'seconds'], rows: [['build', 'ok', '42'], ['test', 'fail', '91'], ['deploy', 'ok', '13']] },
];

/** どの表も、列の数だけ演習になる */
const CUTS: CutSpec[] = TABLES.flatMap((table) =>
  table.header.map((_, i) => ({
    slug: `${table.name}-${String(i + 1)}`,
    header: table.header,
    rows: table.rows,
    delimiter: table.delimiter,
    field: i + 1,
  })),
);

const cutDrills = family<CutSpec>({
  track: 'kernel',
  chapterId: CH,
  family: 'cut',
  docs: [man('cut')],
  variants: CUTS.map((value) => ({ slug: value.slug, value })),
  make: (spec) => {
    const body = `${spec.rows.map((r) => r.join(spec.delimiter)).join('\n')}\n`;
    const wanted = spec.rows.map((r) => r[spec.field - 1] ?? '').join('\n');
    const column = spec.header[spec.field - 1] ?? String(spec.field);
    const delimiterShown = spec.delimiter === ' ' ? "' '" : `'${spec.delimiter}'`;
    return {
      title: `${column} の列だけを取り出す`,
      objectives: ['区切り文字を指定できる', '列を選べる'],
      initial: { files: { [HOME]: null, [`${HOME}/table.txt`]: body }, cwd: HOME },
      solution: [`cut -d ${delimiterShown} -f ${String(spec.field)} table.txt > column.txt`],
      steps: [
        {
          prompt: `table.txt は ${delimiterShown} 区切り。${String(spec.field)} 列目（${column}）だけを column.txt に書き出せ。`,
          check: `column.txt が ${spec.rows.length} 行の ${column} だけであること`,
          assert: fileEquals('column.txt', wanted),
          hints: [
            '-d で区切り文字、-f で何列目かを指定する',
            '区切りが空白のときは引用符で囲む',
            `cut -d ${delimiterShown} -f ${String(spec.field)} table.txt > column.txt`,
          ],
          explain:
            'cut は「列」を選ぶ。区切り文字を指定しないとタブ区切りとみなされるので、カンマや空白のときは -d が要る。',
        },
      ],
    };
  },
});

/* ------------------------------------------------------------------ *
 * 2. sort と uniq で数え上げる
 * ------------------------------------------------------------------ */

interface TallySpec {
  slug: string;
  words: string[];
}

const WORD_SETS: string[][] = [
  ['200', '200', '500', '404', '200', '500'],
  ['GET', 'POST', 'GET', 'GET', 'DELETE'],
  ['web1', 'web2', 'web1', 'db1', 'web1', 'web2'],
  ['INFO', 'WARN', 'INFO', 'ERROR', 'WARN', 'INFO'],
  ['alice', 'bob', 'alice', 'carol'],
  ['/', '/api', '/', '/health', '/api', '/'],
  ['a', 'b', 'a', 'c', 'b', 'a', 'a'],
  ['chrome', 'firefox', 'chrome', 'safari'],
  ['tokyo', 'osaka', 'tokyo', 'tokyo', 'nagoya'],
  ['E01', 'E02', 'E01', 'E03', 'E01', 'E02'],
  ['prod', 'stg', 'prod', 'dev', 'prod'],
  ['ok', 'fail', 'ok', 'ok', 'fail', 'fail'],
  ['v1', 'v2', 'v2', 'v3', 'v1', 'v2'],
  ['read', 'write', 'read', 'read', 'delete'],
  ['cache', 'db', 'cache', 'api', 'db'],
  ['mon', 'tue', 'mon', 'wed', 'tue', 'mon'],
];

const TALLIES: TallySpec[] = WORD_SETS.flatMap((words, i) =>
  [0, 1].map((k) => ({
    slug: `set${String(i + 1)}-${String(k + 1)}`,
    // 2つ目は並びを回して、同じ集計でも見え方を変える
    words: k === 0 ? words : [...words.slice(1), words[0] ?? ''],
  })),
);

const tallyDrills = family<TallySpec>({
  track: 'kernel',
  chapterId: CH,
  family: 'tally',
  docs: [man('sort'), man('uniq')],
  variants: TALLIES.map((value) => ({ slug: value.slug, value })),
  make: (spec) => {
    const body = `${spec.words.join('\n')}\n`;
    const unique = [...new Set(spec.words)].sort().join('\n');
    const counts = new Map<string, number>();
    for (const w of spec.words) counts.set(w, (counts.get(w) ?? 0) + 1);
    const tallied = [...counts.keys()]
      .sort()
      .map((w) => `${String(counts.get(w) ?? 0).padStart(7)} ${w}`)
      .join('\n');
    return {
      title: `${spec.slug} の種類と件数を数える`,
      objectives: ['重複を潰せる', '件数を付けられる', 'uniq の前に sort が要る理由が分かる'],
      initial: { files: { [HOME]: null, [`${HOME}/values.txt`]: body }, cwd: HOME },
      solution: [
        'sort values.txt | uniq > kinds.txt',
        'sort values.txt | uniq -c > counts.txt',
      ],
      steps: [
        {
          prompt: '何種類あるかを知りたい。重複を潰した一覧を kinds.txt に書き出せ。',
          check: `kinds.txt が ${String(new Set(spec.words).size)} 行の重複なし一覧であること`,
          assert: fileEquals('kinds.txt', unique),
          hints: [
            'uniq は「隣り合った」重複しか潰さない',
            '先に sort で並べる',
            'sort values.txt | uniq > kinds.txt',
          ],
          explain:
            'uniq は前の行としか比べない。だから sort と組にする。これは Unix の道具が「小さく単機能」である代表例。',
        },
        {
          prompt: '次に、それぞれ何回出てくるかを counts.txt に書き出せ。',
          check: 'counts.txt が件数付きの一覧であること',
          assert: fileEquals('counts.txt', tallied),
          hints: ['-c で件数が付く', 'sort values.txt | uniq -c > counts.txt'],
          explain: 'sort | uniq -c は、集計の最も短い書き方として覚えておくとよい。',
        },
      ],
    };
  },
});

/* ------------------------------------------------------------------ *
 * 3. tr と sed で置き換える
 * ------------------------------------------------------------------ */

interface ReplaceSpec {
  slug: string;
  before: string;
  from: string;
  to: string;
}

/** [slug, 元の中身（行の配列）, 置き換え前, 置き換え後] */
const REPLACE_PAIRS: [string, string[], string, string][] = [
  ['host', ['server=old-host', 'port=80'], 'old-host', 'new-host'],
  ['port', ['listen 8080;', 'root /srv;'], '8080', '9090'],
  ['env', ['ENV=staging', 'DEBUG=1'], 'staging', 'production'],
  ['image', ['image: nginx:1.24'], '1.24', '1.27'],
  ['domain', ['url=https://old.example.com/v1'], 'old.example.com', 'api.example.com'],
  ['user', ['user = deploy', 'group = deploy'], 'deploy', 'runner'],
  ['path', ['root=/var/www', 'log=/var/log'], '/var/www', '/srv/www'],
  ['level', ['log_level = debug'], 'debug', 'warn'],
  ['region', ['region: ap-northeast-1'], 'ap-northeast-1', 'ap-northeast-3'],
  ['replicas', ['replicas: 2'], '2', '5'],
  ['timeout', ['timeout = 30', 'retries = 3'], '30', '60'],
  ['scheme', ['endpoint=http://api'], 'http://', 'https://'],
  ['branch', ['default_branch = master'], 'master', 'main'],
  ['bucket', ['bucket: old-bucket'], 'old-bucket', 'new-bucket'],
  ['tag', ['tag: v1.0.0'], 'v1.0.0', 'v1.1.0'],
  ['owner', ['owner: alice', 'reviewer: alice'], 'alice', 'bob'],
  ['nodeport', ['nodePort: 30080'], '30080', '31080'],
  ['retention', ['retention = 7d'], '7d', '30d'],
  ['limit', ['max_connections = 100'], '100', '500'],
];

const REPLACES: ReplaceSpec[] = REPLACE_PAIRS.map(([slug = '', body = [], from = '', to = '']) => ({
  slug,
  before: [...body, ''].join('\n'),
  from,
  to,
}));

const replaceDrills = family<ReplaceSpec>({
  track: 'kernel',
  chapterId: CH,
  family: 'replace',
  docs: [man('sed'), man('tr')],
  variants: REPLACES.map((value) => ({ slug: value.slug, value })),
  make: (spec) => {
    const after = spec.before.split(spec.from).join(spec.to);
    return {
      title: `${spec.from} を ${spec.to} に書き換える`,
      objectives: ['置き換えができる', '元を壊さずに結果を残せる'],
      initial: { files: { [HOME]: null, [`${HOME}/app.conf`]: spec.before }, cwd: HOME },
      solution: [`sed 's/${spec.from.replace(/\//g, '\\/')}/${spec.to.replace(/\//g, '\\/')}/g' app.conf > app.conf.new`],
      steps: [
        {
          prompt: `app.conf の ${spec.from} を全て ${spec.to} に変えた結果を app.conf.new に書き出せ。元のファイルは変えないこと。`,
          conditions: [
            {
              label: `app.conf.new が置き換え後の中身であること`,
              test: fileEquals('app.conf.new', after.trimEnd()),
              howTo: 'cat app.conf.new で結果を確かめてください',
            },
            {
              label: 'app.conf は元のままであること',
              test: fileEquals('app.conf', spec.before.trimEnd()),
              howTo: '-i を付けると元のファイルが書き換わります。ここでは付けません',
            },
          ],
          hints: [
            "sed の置換は s/前/後/ の形",
            '全部置き換えるには末尾に g',
            `sed 's/${spec.from.replace(/\//g, '\\/')}/${spec.to.replace(/\//g, '\\/')}/g' app.conf > app.conf.new`,
          ],
          explain:
            'sed は行ごとに処理する。g を付けないと各行の最初の1つしか置き換わらない。/ を含む文字列を扱うときは区切りを変えるか \\ で逃がす。',
        },
      ],
    };
  },
});

/* ------------------------------------------------------------------ *
 * 4. tee で流れを分ける
 * ------------------------------------------------------------------ */

const TEES: { slug: string; value: { words: string[] } }[] = [
  { slug: 'three', value: { words: ['alpha', 'beta', 'gamma'] } },
  { slug: 'hosts', value: { words: ['web1', 'web2', 'db1'] } },
  { slug: 'codes', value: { words: ['200', '404', '500'] } },
  { slug: 'stages', value: { words: ['build', 'test', 'deploy'] } },
  { slug: 'envs', value: { words: ['dev', 'stg', 'prod'] } },
  { slug: 'zones', value: { words: ['a', 'b', 'c'] } },
  { slug: 'levels', value: { words: ['info', 'warn', 'error'] } },
  { slug: 'weeks', value: { words: ['mon', 'tue', 'wed'] } },
];

const teeDrills = family<{ words: string[] }>({
  track: 'kernel',
  chapterId: CH,
  family: 'tee',
  docs: [man('tee')],
  variants: TEES,
  make: (spec) => {
    const body = `${spec.words.join('\n')}\n`;
    const sorted = [...spec.words].sort().join('\n');
    return {
      title: '途中の結果を残しながら流す',
      objectives: ['tee で分岐できる', '最終結果も残せる'],
      initial: { files: { [HOME]: null, [`${HOME}/in.txt`]: body }, cwd: HOME },
      solution: ['sort in.txt | tee sorted.txt > final.txt'],
      steps: [
        {
          prompt:
            'in.txt を並べ替え、その結果を sorted.txt に残しつつ、同じものを final.txt にも書け。並べ替えは一度だけ行うこと。',
          conditions: [
            {
              label: 'sorted.txt が並べ替えた結果であること',
              test: fileEquals('sorted.txt', sorted),
              howTo: 'tee は受け取ったものをファイルに書き、同じものを次へ流します',
            },
            {
              label: 'final.txt も同じ内容であること',
              test: fileEquals('final.txt', sorted),
              howTo: 'tee の後ろに > を置くと、流れてきたものがそこに入ります',
            },
          ],
          hints: [
            'tee は「T字の分岐」',
            'sort の結果を tee に渡し、その先を > で受ける',
            'sort in.txt | tee sorted.txt > final.txt',
          ],
          explain:
            '長いパイプラインの途中を覗きたいときにも tee は効く。どこで壊れているかを、流しながら確かめられる。',
        },
      ],
    };
  },
});

export function kernel03(): MissionSource[] {
  return [...cutDrills, ...tallyDrills, ...replaceDrills, ...teeDrills];
}
