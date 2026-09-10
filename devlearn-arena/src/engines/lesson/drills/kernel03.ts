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

const CUTS: CutSpec[] = [
  {
    slug: 'users', delimiter: ':', field: 1,
    header: ['name', 'uid', 'shell'],
    rows: [['alice', '1001', '/bin/sh'], ['bob', '1002', '/bin/devsh'], ['carol', '1003', '/bin/sh']],
  },
  {
    slug: 'users-shell', delimiter: ':', field: 3,
    header: ['name', 'uid', 'shell'],
    rows: [['alice', '1001', '/bin/sh'], ['bob', '1002', '/bin/devsh'], ['carol', '1003', '/bin/sh']],
  },
  {
    slug: 'orders', delimiter: ',', field: 2,
    header: ['id', 'item', 'qty'],
    rows: [['1', 'apple', '3'], ['2', 'pear', '1'], ['3', 'plum', '7']],
  },
  {
    slug: 'orders-qty', delimiter: ',', field: 3,
    header: ['id', 'item', 'qty'],
    rows: [['1', 'apple', '3'], ['2', 'pear', '1'], ['3', 'plum', '7']],
  },
  {
    slug: 'hosts', delimiter: ' ', field: 2,
    header: ['ip', 'name'],
    rows: [['10.0.0.1', 'web1'], ['10.0.0.2', 'web2'], ['10.0.0.3', 'db1']],
  },
  {
    slug: 'hosts-ip', delimiter: ' ', field: 1,
    header: ['ip', 'name'],
    rows: [['10.0.0.1', 'web1'], ['10.0.0.2', 'web2'], ['10.0.0.3', 'db1']],
  },
  {
    slug: 'services', delimiter: ':', field: 2,
    header: ['name', 'port'],
    rows: [['http', '80'], ['https', '443'], ['ssh', '22']],
  },
  {
    slug: 'metrics', delimiter: ',', field: 2,
    header: ['host', 'cpu', 'mem'],
    rows: [['web1', '12', '340'], ['web2', '87', '900'], ['db1', '45', '2100']],
  },
  {
    slug: 'metrics-mem', delimiter: ',', field: 3,
    header: ['host', 'cpu', 'mem'],
    rows: [['web1', '12', '340'], ['web2', '87', '900'], ['db1', '45', '2100']],
  },
  {
    slug: 'routes', delimiter: ' ', field: 2,
    header: ['dest', 'gw'],
    rows: [['10.1.0.0/16', '10.0.0.254'], ['10.2.0.0/16', '10.0.0.253'], ['0.0.0.0/0', '10.0.0.1']],
  },
];

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

const TALLIES: TallySpec[] = [
  { slug: 'status', words: ['200', '200', '500', '404', '200', '500'] },
  { slug: 'method', words: ['GET', 'POST', 'GET', 'GET', 'DELETE'] },
  { slug: 'host', words: ['web1', 'web2', 'web1', 'db1', 'web1', 'web2'] },
  { slug: 'level', words: ['INFO', 'WARN', 'INFO', 'ERROR', 'WARN', 'INFO'] },
  { slug: 'user', words: ['alice', 'bob', 'alice', 'carol'] },
  { slug: 'path', words: ['/', '/api', '/', '/health', '/api', '/'] },
  { slug: 'zone', words: ['a', 'b', 'a', 'c', 'b', 'a', 'a'] },
  { slug: 'browser', words: ['chrome', 'firefox', 'chrome', 'safari'] },
  { slug: 'region', words: ['tokyo', 'osaka', 'tokyo', 'tokyo', 'nagoya'] },
  { slug: 'errorcode', words: ['E01', 'E02', 'E01', 'E03', 'E01', 'E02'] },
];

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

const REPLACES: ReplaceSpec[] = [
  { slug: 'host', before: 'server=old-host\nport=80\n', from: 'old-host', to: 'new-host' },
  { slug: 'port', before: 'listen 8080;\nroot /srv;\n', from: '8080', to: '9090' },
  { slug: 'env', before: 'ENV=staging\nDEBUG=1\n', from: 'staging', to: 'production' },
  { slug: 'image', before: 'image: nginx:1.24\n', from: '1.24', to: '1.27' },
  { slug: 'domain', before: 'url=https://old.example.com/v1\n', from: 'old.example.com', to: 'api.example.com' },
  { slug: 'user', before: 'user = deploy\ngroup = deploy\n', from: 'deploy', to: 'runner' },
  { slug: 'path', before: 'root=/var/www\nlog=/var/log\n', from: '/var/www', to: '/srv/www' },
  { slug: 'level', before: 'log_level = debug\n', from: 'debug', to: 'warn' },
  { slug: 'region', before: 'region: ap-northeast-1\n', from: 'ap-northeast-1', to: 'ap-northeast-3' },
  { slug: 'replicas', before: 'replicas: 2\n', from: '2', to: '5' },
];

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
