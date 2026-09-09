import { all, fileEquals, fileExists } from '../authoring/assert';
import type { MissionSource } from '../authoring/mission';
import { HOME, family, man } from './shared';

const CH = 'kernel/02';

/** 決まった行数の本文。行番号が入るので head / tail / wc の答えが定まる */
function numbered(lines: number, label: string): string {
  return `${Array.from({ length: lines }, (_, i) => `${label}-${String(i + 1).padStart(3, '0')}`).join('\n')}\n`;
}

/* ------------------------------------------------------------------ *
 * 1. head / tail で端だけ見る
 * ------------------------------------------------------------------ */

interface EdgeSpec {
  file: string;
  lines: number;
  take: number;
  label: string;
}

const EDGES: EdgeSpec[] = [
  { file: 'access.log', lines: 40, take: 5, label: 'req' },
  { file: 'error.log', lines: 25, take: 3, label: 'err' },
  { file: 'audit.log', lines: 60, take: 10, label: 'audit' },
  { file: 'build.log', lines: 33, take: 7, label: 'step' },
  { file: 'query.log', lines: 18, take: 4, label: 'sql' },
  { file: 'cron.log', lines: 50, take: 6, label: 'job' },
  { file: 'boot.log', lines: 22, take: 8, label: 'unit' },
  { file: 'deploy.log', lines: 45, take: 12, label: 'rollout' },
  { file: 'gc.log', lines: 30, take: 2, label: 'gc' },
  { file: 'sync.log', lines: 55, take: 9, label: 'sync' },
  { file: 'mail.log', lines: 28, take: 5, label: 'mail' },
  { file: 'nginx.log', lines: 70, take: 15, label: 'nginx' },
];

const edgeDrills = family<EdgeSpec>({
  track: 'kernel',
  chapterId: CH,
  family: 'head-tail',
  docs: [man('head'), man('tail')],
  variants: EDGES.map((value) => ({ slug: value.file.replace('.', '-'), value })),
  make: (spec) => {
    const body = numbered(spec.lines, spec.label);
    const rows = body.trimEnd().split('\n');
    const first = rows.slice(0, spec.take).join('\n');
    const last = rows.slice(-spec.take).join('\n');
    return {
      title: `${spec.file} の先頭と末尾だけを取り出す`,
      objectives: ['先頭 n 行を取れる', '末尾 n 行を取れる', '結果をファイルに残せる'],
      initial: { files: { [HOME]: null, [`${HOME}/${spec.file}`]: body }, cwd: HOME },
      solution: [
        `head -n ${String(spec.take)} ${spec.file} > first.txt`,
        `tail -n ${String(spec.take)} ${spec.file} > last.txt`,
      ],
      steps: [
        {
          prompt: `${spec.file} の先頭 ${String(spec.take)} 行を first.txt に書き出せ。`,
          check: `first.txt の中身が ${spec.file} の先頭 ${String(spec.take)} 行と一致すること`,
          assert: fileEquals('first.txt', first),
          hints: ['head -n <行数> <ファイル>', `head -n ${String(spec.take)} ${spec.file} > first.txt`],
          explain:
            '大きなファイルを cat すると画面が流れてしまう。まず head で形を見るのが定石。',
        },
        {
          prompt: `同じファイルの末尾 ${String(spec.take)} 行を last.txt に書き出せ。`,
          check: `last.txt の中身が末尾 ${String(spec.take)} 行と一致すること`,
          assert: fileEquals('last.txt', last),
          hints: ['tail -n <行数> <ファイル>', `tail -n ${String(spec.take)} ${spec.file} > last.txt`],
          explain: '障害調査では末尾（＝最新）から読む。tail のほうを先に覚えるとよい。',
        },
      ],
    };
  },
});

/* ------------------------------------------------------------------ *
 * 2. wc で数える
 * ------------------------------------------------------------------ */

const COUNTS: EdgeSpec[] = EDGES.map((e) => ({ ...e, take: 0 }));

const countDrills = family<EdgeSpec>({
  track: 'kernel',
  chapterId: CH,
  family: 'count',
  docs: [man('wc')],
  variants: COUNTS.map((value) => ({ slug: value.file.replace('.', '-'), value })),
  make: (spec) => {
    const body = numbered(spec.lines, spec.label);
    return {
      title: `${spec.file} が何行あるか数える`,
      objectives: ['行数を数えられる', '数だけを取り出せる'],
      initial: { files: { [HOME]: null, [`${HOME}/${spec.file}`]: body }, cwd: HOME },
      solution: [`wc -l < ${spec.file} > count.txt`],
      steps: [
        {
          prompt: `${spec.file} の行数だけを count.txt に書き出せ。ファイル名は入れないこと。`,
          check: `count.txt の中身が ${String(spec.lines)} であること`,
          assert: fileEquals('count.txt', String(spec.lines)),
          hints: [
            'wc -l はファイル名も一緒に出す',
            '標準入力から渡すとファイル名が付かない',
            `wc -l < ${spec.file} > count.txt`,
          ],
          explain:
            'wc はファイル名を引数で受け取ると名前も出す。< で標準入力に流し込むと、数だけになる。',
        },
      ],
    };
  },
});

/* ------------------------------------------------------------------ *
 * 3. grep で絞る
 * ------------------------------------------------------------------ */

interface GrepSpec {
  needle: string;
  hits: number;
  noise: number;
}

const GREPS: GrepSpec[] = [
  { needle: 'ERROR', hits: 4, noise: 20 },
  { needle: 'WARN', hits: 7, noise: 18 },
  { needle: 'timeout', hits: 3, noise: 25 },
  { needle: 'refused', hits: 5, noise: 22 },
  { needle: 'OutOfMemory', hits: 2, noise: 30 },
  { needle: 'deadlock', hits: 6, noise: 15 },
  { needle: 'panic', hits: 1, noise: 28 },
  { needle: 'retry', hits: 9, noise: 12 },
  { needle: 'denied', hits: 8, noise: 16 },
  { needle: 'expired', hits: 3, noise: 24 },
  { needle: 'throttled', hits: 5, noise: 19 },
  { needle: 'unreachable', hits: 4, noise: 21 },
];

/** 目印の行と雑音の行を混ぜる。順番は決まっているので答えも定まる */
function mixed(needle: string, hits: number, noise: number): string {
  const rows: string[] = [];
  for (let i = 0; i < hits + noise; i += 1) {
    if (i % 3 === 0 && rows.filter((r) => r.includes(needle)).length < hits) {
      rows.push(`2026-05-01 10:00:${String(i).padStart(2, '0')} ${needle} something happened`);
    } else {
      rows.push(`2026-05-01 10:00:${String(i).padStart(2, '0')} INFO routine work`);
    }
  }
  // 足りなければ末尾に足して、必ず指定した本数にする
  let have = rows.filter((r) => r.includes(needle)).length;
  while (have < hits) {
    rows.push(`2026-05-01 11:00:${String(have).padStart(2, '0')} ${needle} something happened`);
    have += 1;
  }
  return `${rows.join('\n')}\n`;
}

const grepDrills = family<GrepSpec>({
  track: 'kernel',
  chapterId: CH,
  family: 'grep',
  docs: [man('grep')],
  variants: GREPS.map((value) => ({ slug: value.needle.toLowerCase(), value })),
  make: (spec) => {
    const body = mixed(spec.needle, spec.hits, spec.noise);
    const hitLines = body.trimEnd().split('\n').filter((l) => l.includes(spec.needle));
    return {
      title: `${spec.needle} の行だけを抜き出す`,
      objectives: ['文字列で行を絞れる', '件数を数えられる'],
      initial: { files: { [HOME]: null, [`${HOME}/app.log`]: body }, cwd: HOME },
      solution: [
        `grep ${spec.needle} app.log > hits.txt`,
        `grep -c ${spec.needle} app.log > hits-count.txt`,
      ],
      steps: [
        {
          prompt: `app.log から ${spec.needle} を含む行だけを hits.txt に書き出せ。`,
          check: `hits.txt が ${spec.needle} を含む行だけで出来ていること`,
          assert: fileEquals('hits.txt', hitLines.join('\n')),
          hints: ['grep <文字列> <ファイル>', `grep ${spec.needle} app.log > hits.txt`],
          explain: 'grep は「行」を選ぶ道具。列を選ぶのは cut、置き換えるのは sed。',
        },
        {
          prompt: `同じ条件の件数だけを hits-count.txt に書き出せ。`,
          check: `hits-count.txt の中身が ${String(spec.hits)} であること`,
          assert: fileEquals('hits-count.txt', String(spec.hits)),
          hints: ['-c で件数になる', `grep -c ${spec.needle} app.log > hits-count.txt`],
          explain: 'grep -c は「一致した行数」。一致した回数ではないことに注意。',
        },
      ],
    };
  },
});

/* ------------------------------------------------------------------ *
 * 4. 正規表現で絞る
 * ------------------------------------------------------------------ */

interface RegexSpec {
  slug: string;
  pattern: string;
  lines: string[];
  wanted: number[];
  why: string;
}

const REGEXES: RegexSpec[] = [
  {
    slug: 'starts-with',
    pattern: '^ERROR',
    lines: ['ERROR disk full', 'WARN ERROR mentioned', 'ERROR timeout', 'INFO ok'],
    wanted: [0, 2],
    why: '^ は行の先頭。文中に出てくるだけの行は外れる。',
  },
  {
    slug: 'ends-with',
    pattern: 'failed$',
    lines: ['job failed', 'failed to start', 'task failed', 'ok'],
    wanted: [0, 2],
    why: '$ は行の末尾。',
  },
  {
    slug: 'digits',
    pattern: '[0-9][0-9][0-9]',
    lines: ['status 500', 'status ok', 'code 404', 'code 7'],
    wanted: [0, 2],
    why: '[0-9] は数字1文字。3つ並べれば3桁になる。',
  },
  {
    slug: 'either',
    pattern: 'WARN\\|ERROR',
    lines: ['WARN slow', 'INFO ok', 'ERROR down', 'DEBUG x'],
    wanted: [0, 2],
    why: '基本正規表現では \\| が「または」。',
  },
  {
    slug: 'any-char',
    pattern: 'us.r',
    lines: ['user not found', 'usr missing', 'us r', 'admin'],
    wanted: [0, 2],
    why: '. は任意の1文字。空白にも当たる。',
  },
  {
    slug: 'repeat',
    pattern: 'ab*c',
    lines: ['ac here', 'abc here', 'abbbc here', 'adc'],
    wanted: [0, 1, 2],
    why: '* は直前の文字の 0 回以上の繰り返し。ac も当たる。',
  },
  {
    slug: 'word-start',
    pattern: '^ *retry',
    lines: ['retry now', '  retry later', 'no retry', 'retryable'],
    wanted: [0, 1, 3],
    why: '空白の 0 回以上に続いて retry。retryable も先頭一致で当たる。',
  },
  {
    slug: 'ip-like',
    pattern: '10\\.0\\.',
    lines: ['from 10.0.0.1', 'from 192.168.0.1', 'to 10.0.1.5', 'x'],
    wanted: [0, 2],
    why: '. をそのまま書くと任意の1文字。点そのものを表すには \\. と書く。',
  },
  {
    slug: 'not-info',
    pattern: 'INFO',
    lines: ['INFO ok', 'ERROR down', 'INFO fine', 'WARN slow'],
    wanted: [1, 3],
    why: '-v は一致しなかった行を出す。',
  },
  {
    slug: 'case',
    pattern: 'error',
    lines: ['ERROR down', 'error small', 'Error mixed', 'ok'],
    wanted: [0, 1, 2],
    why: '-i で大文字小文字を無視する。',
  },
];

const regexDrills = family<RegexSpec>({
  track: 'kernel',
  chapterId: CH,
  family: 'grep-regex',
  docs: [man('grep'), man('regex', 7)],
  variants: REGEXES.map((value) => ({ slug: value.slug, value })),
  make: (spec) => {
    const invert = spec.slug === 'not-info';
    const ignoreCase = spec.slug === 'case';
    const flag = invert ? '-v ' : ignoreCase ? '-i ' : '';
    const wanted = spec.wanted.map((i) => spec.lines[i] ?? '').join('\n');
    return {
      title: `${spec.pattern} に当たる行を選ぶ`,
      objectives: ['正規表現で絞れる', '当たる行と当たらない行を説明できる'],
      initial: {
        files: { [HOME]: null, [`${HOME}/lines.txt`]: `${spec.lines.join('\n')}\n` },
        cwd: HOME,
      },
      solution: [`grep ${flag}'${spec.pattern}' lines.txt > picked.txt`],
      steps: [
        {
          prompt: `lines.txt から ${spec.pattern} ${invert ? 'に当たらない' : 'に当たる'}行${ignoreCase ? '（大文字小文字は区別しない）' : ''}を picked.txt に書き出せ。`,
          check: `picked.txt が ${String(spec.wanted.length)} 行で、期待する行だけであること`,
          assert: fileEquals('picked.txt', wanted),
          hints: [
            'パターンは引用符で囲むと安全',
            invert ? '-v で「当たらない行」を出せる' : ignoreCase ? '-i で大文字小文字を無視できる' : 'grep <パターン> <ファイル>',
            `grep ${flag}'${spec.pattern}' lines.txt > picked.txt`,
          ],
          explain: spec.why,
        },
      ],
    };
  },
});

/* ------------------------------------------------------------------ *
 * 5. find で探す
 * ------------------------------------------------------------------ */

interface FindSpec {
  slug: string;
  ext: string;
  places: string[];
}

const FINDS: FindSpec[] = [
  { slug: 'conf', ext: 'conf', places: ['etc', 'etc/nginx', 'opt/app'] },
  { slug: 'log', ext: 'log', places: ['var/log', 'var/log/old', 'srv/app'] },
  { slug: 'yaml', ext: 'yaml', places: ['manifests', 'manifests/base', 'manifests/overlays'] },
  { slug: 'sql', ext: 'sql', places: ['db', 'db/migrations', 'db/seeds'] },
  { slug: 'sh', ext: 'sh', places: ['bin', 'scripts', 'scripts/ci'] },
  { slug: 'json', ext: 'json', places: ['config', 'config/dev', 'config/prod'] },
  { slug: 'md', ext: 'md', places: ['docs', 'docs/api', 'docs/ops'] },
  { slug: 'csv', ext: 'csv', places: ['data', 'data/raw', 'data/clean'] },
  { slug: 'pem', ext: 'pem', places: ['certs', 'certs/old', 'certs/new'] },
  { slug: 'bak', ext: 'bak', places: ['backup', 'backup/2025', 'backup/2026'] },
];

const findDrills = family<FindSpec>({
  track: 'kernel',
  chapterId: CH,
  family: 'find',
  docs: [man('find')],
  variants: FINDS.map((value) => ({ slug: value.slug, value })),
  make: (spec) => {
    const files: Record<string, string | null> = { [HOME]: null };
    for (const place of spec.places) {
      files[`/${place}`] = null;
      files[`/${place}/a.${spec.ext}`] = 'x\n';
      files[`/${place}/b.txt`] = 'y\n';
    }
    const found = spec.places.map((p) => `/${p}/a.${spec.ext}`).sort().join('\n');
    return {
      title: `.${spec.ext} のファイルを全部見つける`,
      objectives: ['再帰的に探せる', '名前で絞れる', '結果を並べ替えて残せる'],
      initial: { files, cwd: HOME },
      solution: [
        `find / -name "*.${spec.ext}" | sort > found.txt`,
      ],
      steps: [
        {
          prompt: `/ の下にある .${spec.ext} ファイルの一覧を、辞書順に並べて found.txt に書き出せ。`,
          check: `found.txt に ${String(spec.places.length)} 本のパスが辞書順で並んでいること`,
          assert: fileEquals('found.txt', found),
          hints: [
            'find <探す場所> -name <パターン>',
            'パターンは引用符で囲む（シェルに先に展開させない）',
            `find / -name "*.${spec.ext}" | sort > found.txt`,
          ],
          explain:
            '引用符を外すと、シェルが先に * を展開してしまい、find には別の引数が渡る。囲むのは find 自身に展開させるため。',
        },
      ],
    };
  },
});

/* ------------------------------------------------------------------ *
 * 6. 見つけた場所へ辿り着く
 * ------------------------------------------------------------------ */

const HIDDEN: { slug: string; value: { name: string; where: string } }[] = [
  { slug: 'token', value: { name: 'token.txt', where: '/srv/app/secret' } },
  { slug: 'license', value: { name: 'LICENSE', where: '/opt/vendor/pkg' } },
  { slug: 'dump', value: { name: 'core.dump', where: '/var/crash/2026' } },
  { slug: 'key', value: { name: 'id_ed25519', where: '/home/learner/.ssh' } },
  { slug: 'lock', value: { name: 'app.lock', where: '/run/app' } },
  { slug: 'seed', value: { name: 'seed.sql', where: '/db/fixtures' } },
  { slug: 'trace', value: { name: 'trace.json', where: '/var/log/traces' } },
  { slug: 'patch', value: { name: 'fix.patch', where: '/tmp/incoming' } },
];

const locateDrills = family<{ name: string; where: string }>({
  track: 'kernel',
  chapterId: CH,
  family: 'locate',
  docs: [man('find')],
  variants: HIDDEN,
  make: (spec) => ({
    title: `${spec.name} の在り処を突き止める`,
    objectives: ['名前だけを頼りに探せる', '見つけた場所の中身を確かめられる'],
    initial: {
      files: {
        [HOME]: null,
        [spec.where]: null,
        [`${spec.where}/${spec.name}`]: 'found me\n',
        '/var/tmp': null,
        '/var/tmp/decoy.txt': 'no\n',
      },
      cwd: HOME,
    },
    solution: [
      `find / -name ${spec.name} > where.txt`,
      `cp ${spec.where}/${spec.name} ./copy.txt`,
    ],
    steps: [
      {
        prompt: `${spec.name} がどこにあるかを探し、そのパスを where.txt に書き出せ。`,
        check: `where.txt の中身が ${spec.where}/${spec.name} であること`,
        assert: fileEquals('where.txt', `${spec.where}/${spec.name}`),
        hints: ['find / -name <名前>', `find / -name ${spec.name} > where.txt`],
        explain: '名前しか分からないときは find。場所が分かっていれば ls のほうが速い。',
      },
      {
        prompt: `見つけたファイルを、いまの場所に copy.txt という名前でコピーせよ。`,
        check: 'copy.txt の中身が found me であること',
        assert: all(fileExists('copy.txt'), fileEquals('copy.txt', 'found me')),
        hints: ['cp <見つけたパス> ./copy.txt', `cp ${spec.where}/${spec.name} ./copy.txt`],
        explain: '探すのと取り出すのは別の操作。見つけたパスをそのまま次のコマンドに渡す。',
      },
    ],
  }),
});

export function kernel02(): MissionSource[] {
  return [
    ...edgeDrills,
    ...countDrills,
    ...grepDrills,
    ...regexDrills,
    ...findDrills,
    ...locateDrills,
  ];
}
