import {
  cwdIs, dirExists, dirHas, fileAbsent, fileEquals, fileExists, all,
} from '../authoring/assert';
import type { MissionSource } from '../authoring/mission';
import { HOME, family, fromNames, man } from './shared';

const CH = 'kernel/01';

/* ------------------------------------------------------------------ *
 * 1. 絶対パスと相対パスで同じ場所に辿り着く
 * ------------------------------------------------------------------ */

interface WalkSpec {
  tree: string[];
  target: string;
}

const WALKS: { slug: string; value: WalkSpec }[] = [
  { slug: 'srv-app-src', value: { tree: ['srv/app/src', 'srv/app/docs'], target: '/srv/app/src' } },
  { slug: 'var-log-nginx', value: { tree: ['var/log/nginx', 'var/log/mysql'], target: '/var/log/nginx' } },
  { slug: 'etc-conf-d', value: { tree: ['etc/conf.d', 'etc/init.d'], target: '/etc/conf.d' } },
  { slug: 'opt-tools-bin', value: { tree: ['opt/tools/bin', 'opt/tools/lib'], target: '/opt/tools/bin' } },
  { slug: 'home-work-2026', value: { tree: ['home/learner/work/2026', 'home/learner/work/2025'], target: `${HOME}/work/2026` } },
  { slug: 'data-raw-may', value: { tree: ['data/raw/may', 'data/raw/june'], target: '/data/raw/may' } },
  { slug: 'srv-web-static', value: { tree: ['srv/web/static', 'srv/web/templates'], target: '/srv/web/static' } },
  { slug: 'usr-share-doc', value: { tree: ['usr/share/doc', 'usr/share/man'], target: '/usr/share/doc' } },
  { slug: 'mnt-backup-db', value: { tree: ['mnt/backup/db', 'mnt/backup/files'], target: '/mnt/backup/db' } },
  { slug: 'srv-api-v2', value: { tree: ['srv/api/v1', 'srv/api/v2'], target: '/srv/api/v2' } },
  { slug: 'var-lib-app', value: { tree: ['var/lib/app', 'var/lib/cache'], target: '/var/lib/app' } },
  { slug: 'etc-ssl-certs', value: { tree: ['etc/ssl/certs', 'etc/ssl/private'], target: '/etc/ssl/certs' } },
];

function treeFiles(paths: readonly string[]): Record<string, string | null> {
  const files: Record<string, string | null> = { [HOME]: null };
  for (const path of paths) files[`/${path}`] = null;
  return files;
}

const walkDrills = family<WalkSpec>({
  track: 'kernel',
  chapterId: CH,
  family: 'navigate',
  docs: [man('cd', 1), man('pwd')],
  variants: WALKS,
  make: (spec) => ({
    title: `${spec.target} まで歩く`,
    objectives: ['絶対パスで移動できる', '相対パスで戻れる', 'いまどこに居るか言える'],
    initial: { files: treeFiles(spec.tree), cwd: HOME },
    solution: [`cd ${spec.target}`, 'cd ..', `cd ${spec.target}`],
    steps: [
      {
        prompt: `絶対パスで ${spec.target} へ移動せよ。`,
        check: `いまのディレクトリが ${spec.target} であること`,
        assert: cwdIs(spec.target),
        hints: ['cd に / から始まるパスを渡す', `cd ${spec.target}`],
        explain: '/ から書くのが絶対パス。どこに居ても同じ場所を指す。',
      },
      {
        prompt: '1つ上のディレクトリへ移動せよ。',
        check: `いまのディレクトリが ${spec.target.split('/').slice(0, -1).join('/') || '/'} であること`,
        assert: cwdIs(spec.target.split('/').slice(0, -1).join('/') || '/'),
        hints: ['.. は親を指す', 'cd ..'],
        explain: '.. は親、. は自分自身。相対パスはいまの場所からの道順になる。',
      },
      {
        prompt: '相対パスで、もう一度さっきの場所へ戻れ。',
        check: `いまのディレクトリが ${spec.target} であること`,
        assert: cwdIs(spec.target),
        hints: ['/ で始めなければ相対パス', `cd ${spec.target.split('/').slice(-1)[0] ?? ''}`],
        explain: '同じ場所へ行くのに道順は何通りもある。絶対パスは確実、相対パスは短い。',
      },
    ],
  }),
});

/* ------------------------------------------------------------------ *
 * 2. mkdir -p で階層をまとめて掘る
 * ------------------------------------------------------------------ */

const TREES: { slug: string; value: { root: string; leaves: string[] } }[] = [
  { slug: 'project', value: { root: 'project', leaves: ['src/main', 'src/test', 'docs/api'] } },
  { slug: 'service', value: { root: 'service', leaves: ['config/dev', 'config/prod', 'logs'] } },
  { slug: 'site', value: { root: 'site', leaves: ['public/css', 'public/js', 'content/posts'] } },
  { slug: 'infra', value: { root: 'infra', leaves: ['terraform/modules', 'ansible/roles', 'scripts'] } },
  { slug: 'report', value: { root: 'report', leaves: ['2026/q1', '2026/q2', 'templates'] } },
  { slug: 'dataset', value: { root: 'dataset', leaves: ['raw/images', 'raw/labels', 'processed'] } },
  { slug: 'monorepo', value: { root: 'monorepo', leaves: ['apps/web', 'apps/api', 'packages/ui'] } },
  { slug: 'archive', value: { root: 'archive', leaves: ['2024/jan', '2025/jan', '2026/jan'] } },
  { slug: 'lab', value: { root: 'lab', leaves: ['exp/001', 'exp/002', 'notes'] } },
  { slug: 'backup', value: { root: 'backup', leaves: ['daily/db', 'weekly/db', 'monthly/db'] } },
];

const makeTreeDrills = family<{ root: string; leaves: string[] }>({
  track: 'kernel',
  chapterId: CH,
  family: 'make-tree',
  docs: [man('mkdir')],
  variants: TREES,
  make: (spec) => ({
    title: `${spec.root}/ の骨組みを掘る`,
    objectives: ['-p で途中の階層ごと作れる', '作った結果を確かめられる'],
    initial: { files: { [HOME]: null }, cwd: HOME },
    solution: [
      `mkdir -p ${spec.leaves.map((l) => `${spec.root}/${l}`).join(' ')}`,
    ],
    steps: [
      {
        prompt: `${spec.root}/ の下に ${spec.leaves.join(' と ')} を作れ。途中の階層も要る。`,
        check: `${spec.leaves.map((l) => `${spec.root}/${l}`).join(' / ')} が全てディレクトリとして存在すること`,
        assert: all(...spec.leaves.map((l) => dirExists(`${spec.root}/${l}`))),
        hints: [
          'mkdir だけだと途中の階層が無いと失敗する',
          '-p を付けると足りない階層をまとめて作る',
          `mkdir -p ${spec.root}/${spec.leaves[0] ?? ''}`,
        ],
        explain:
          '-p は「無ければ作る、あっても文句を言わない」。手順を何度流しても同じ結果になるので、スクリプトの中でよく使う。',
      },
    ],
  }),
});

/* ------------------------------------------------------------------ *
 * 3. cp と mv を使い分ける
 * ------------------------------------------------------------------ */

const MOVES: { slug: string; value: { file: string; from: string; to: string } }[] = [
  { slug: 'config', value: { file: 'app.conf', from: 'draft', to: 'config' } },
  { slug: 'report', value: { file: 'may.csv', from: 'inbox', to: 'reports' } },
  { slug: 'image', value: { file: 'logo.svg', from: 'tmp', to: 'assets' } },
  { slug: 'script', value: { file: 'deploy.sh', from: 'scratch', to: 'bin' } },
  { slug: 'schema', value: { file: 'schema.sql', from: 'incoming', to: 'db' } },
  { slug: 'cert', value: { file: 'server.crt', from: 'downloads', to: 'certs' } },
  { slug: 'note', value: { file: 'meeting.md', from: 'inbox', to: 'notes' } },
  { slug: 'backup', value: { file: 'dump.sql', from: 'tmp', to: 'backup' } },
  { slug: 'log', value: { file: 'access.log', from: 'var', to: 'archive' } },
  { slug: 'lock', value: { file: 'package-lock.json', from: 'old', to: 'current' } },
];

const copyMoveDrills = family<{ file: string; from: string; to: string }>({
  track: 'kernel',
  chapterId: CH,
  family: 'copy-move',
  docs: [man('cp'), man('mv')],
  variants: MOVES,
  make: (spec) => ({
    title: `${spec.file} を写して、動かす`,
    objectives: ['cp は元が残る', 'mv は元が残らない', '違いを結果で確かめられる'],
    initial: {
      files: {
        [HOME]: null,
        [`${HOME}/${spec.from}`]: null,
        [`${HOME}/${spec.from}/${spec.file}`]: `${spec.file} の中身\n`,
        [`${HOME}/${spec.to}`]: null,
      },
      cwd: HOME,
    },
    solution: [
      `cp ${spec.from}/${spec.file} ${spec.to}/${spec.file}`,
      `mv ${spec.from}/${spec.file} ${spec.to}/${spec.file}.orig`,
    ],
    steps: [
      {
        prompt: `${spec.from}/${spec.file} を ${spec.to}/ にコピーせよ。元は残すこと。`,
        check: `${spec.to}/${spec.file} と ${spec.from}/${spec.file} の両方があること`,
        assert: all(fileExists(`${spec.to}/${spec.file}`), fileExists(`${spec.from}/${spec.file}`)),
        hints: ['cp <元> <先>', `cp ${spec.from}/${spec.file} ${spec.to}/`],
        explain: 'cp は写す。元はそのまま残る。',
      },
      {
        prompt: `続けて、元の ${spec.from}/${spec.file} を ${spec.to}/${spec.file}.orig という名前で移動せよ。`,
        check: `${spec.to}/${spec.file}.orig があり、${spec.from}/${spec.file} は無いこと`,
        assert: all(
          fileExists(`${spec.to}/${spec.file}.orig`),
          fileAbsent(`${spec.from}/${spec.file}`),
        ),
        hints: ['mv は移動と改名を兼ねる', `mv ${spec.from}/${spec.file} ${spec.to}/${spec.file}.orig`],
        explain:
          'mv は元を残さない。同じディレクトリの中で使えば「名前を変える」操作になる。',
      },
    ],
  }),
});

/* ------------------------------------------------------------------ *
 * 4. rm -r を正しく怖がる
 * ------------------------------------------------------------------ */

const CLEANUPS = fromNames([
  'tmp', 'cache', 'build', 'node_modules', 'dist', 'coverage', 'target', '.pytest_cache',
  'vendor', 'out',
]);

const removeDrills = family<string>({
  track: 'kernel',
  chapterId: CH,
  family: 'remove',
  docs: [man('rm')],
  variants: CLEANUPS,
  make: (dir) => ({
    title: `${dir}/ だけを片付ける`,
    objectives: ['中身のあるディレクトリは -r が要る', '消す対象を取り違えない'],
    initial: {
      files: {
        [HOME]: null,
        [`${HOME}/${dir}`]: null,
        [`${HOME}/${dir}/a.tmp`]: 'x\n',
        [`${HOME}/${dir}/nested`]: null,
        [`${HOME}/${dir}/nested/b.tmp`]: 'y\n',
        [`${HOME}/keep.txt`]: '消してはいけない\n',
      },
      cwd: HOME,
    },
    solution: [`rm -r ${dir}`],
    steps: [
      {
        prompt: `${dir}/ を中身ごと消せ。keep.txt は残すこと。`,
        check: `${dir} が無く、keep.txt が残っていること`,
        assert: all(fileAbsent(dir), fileExists('keep.txt')),
        hints: [
          '中身の入ったディレクトリは rm だけでは消えない',
          '-r で中まで辿って消す',
          `rm -r ${dir}`,
        ],
        explain:
          'rm -r は取り返しがつかない。消す前に ls で対象を目で確かめる癖をつけると事故が減る。',
      },
    ],
  }),
});

/* ------------------------------------------------------------------ *
 * 5. 置き場所を整える（複数ファイルの仕分け）
 * ------------------------------------------------------------------ */

const SORTINGS: { slug: string; value: { ext: string; dir: string; names: string[] } }[] = [
  { slug: 'log', value: { ext: 'log', dir: 'logs', names: ['app', 'db', 'web'] } },
  { slug: 'csv', value: { ext: 'csv', dir: 'data', names: ['users', 'orders', 'items'] } },
  { slug: 'md', value: { ext: 'md', dir: 'docs', names: ['readme', 'design', 'faq'] } },
  { slug: 'yaml', value: { ext: 'yaml', dir: 'manifests', names: ['deploy', 'service', 'ingress'] } },
  { slug: 'sh', value: { ext: 'sh', dir: 'bin', names: ['build', 'test', 'release'] } },
  { slug: 'json', value: { ext: 'json', dir: 'config', names: ['dev', 'stg', 'prod'] } },
  { slug: 'sql', value: { ext: 'sql', dir: 'migrations', names: ['001', '002', '003'] } },
  { slug: 'png', value: { ext: 'png', dir: 'images', names: ['hero', 'icon', 'banner'] } },
];

const sortingDrills = family<{ ext: string; dir: string; names: string[] }>({
  track: 'kernel',
  chapterId: CH,
  family: 'sort-into',
  docs: [man('mv')],
  variants: SORTINGS,
  make: (spec) => {
    const files: Record<string, string | null> = { [HOME]: null };
    for (const name of spec.names) files[`${HOME}/${name}.${spec.ext}`] = `${name}\n`;
    return {
      title: `散らばった .${spec.ext} を ${spec.dir}/ にまとめる`,
      objectives: ['まとめ先を作る', 'まとめて動かす', '元の場所に残っていないことを確かめる'],
      initial: { files, cwd: HOME },
      solution: [`mkdir -p ${spec.dir}`, `mv *.${spec.ext} ${spec.dir}/`],
      steps: [
        {
          prompt: `${spec.dir}/ を作れ。`,
          check: `${spec.dir} がディレクトリとして存在すること`,
          assert: dirExists(spec.dir),
          hints: ['mkdir <名前>', `mkdir ${spec.dir}`],
          explain: '入れ物を先に作る。無い場所へは動かせない。',
        },
        {
          prompt: `.${spec.ext} のファイルを全て ${spec.dir}/ へ移せ。`,
          check: `${spec.dir}/ に ${spec.names.map((n) => `${n}.${spec.ext}`).join(', ')} が揃っていること`,
          assert: all(
            dirHas(spec.dir, ...spec.names.map((n) => `${n}.${spec.ext}`)),
            ...spec.names.map((n) => fileAbsent(`${n}.${spec.ext}`)),
          ),
          hints: [
            '1つずつ動かしてもよい',
            '* を使うとまとめて指定できる',
            `mv *.${spec.ext} ${spec.dir}/`,
          ],
          explain:
            '* を展開するのはシェルであって mv ではない。mv は展開された結果のファイル名を受け取っている。',
        },
      ],
    };
  },
});

/* ------------------------------------------------------------------ *
 * 6. ファイルを作って中身を書く
 * ------------------------------------------------------------------ */

const NOTES: { slug: string; value: { path: string; text: string } }[] = [
  { slug: 'todo', value: { path: 'TODO.txt', text: 'ログを片付ける' } },
  { slug: 'owner', value: { path: 'OWNER.txt', text: 'platform-team' } },
  { slug: 'version', value: { path: 'VERSION', text: '1.4.2' } },
  { slug: 'contact', value: { path: 'CONTACT.md', text: 'oncall@example.com' } },
  { slug: 'runbook', value: { path: 'RUNBOOK.md', text: '再起動の前に必ず記録を残す' } },
  { slug: 'motd', value: { path: 'motd', text: 'ようこそ' } },
  { slug: 'flag', value: { path: 'FEATURE_FLAG', text: 'enabled' } },
  { slug: 'endpoint', value: { path: 'ENDPOINT', text: 'https://api.example.com' } },
];

const writeDrills = family<{ path: string; text: string }>({
  track: 'kernel',
  chapterId: CH,
  family: 'write-file',
  docs: [man('touch')],
  variants: NOTES,
  make: (spec) => ({
    title: `${spec.path} を作って中身を書く`,
    objectives: ['空のファイルを作れる', 'リダイレクトで中身を書ける'],
    initial: { files: { [HOME]: null }, cwd: HOME },
    solution: [`touch ${spec.path}`, `echo "${spec.text}" > ${spec.path}`],
    steps: [
      {
        prompt: `${spec.path} を空のファイルとして作れ。`,
        check: `${spec.path} がファイルとして存在すること`,
        assert: fileExists(spec.path),
        hints: ['touch は無ければ作る', `touch ${spec.path}`],
        explain: 'touch は本来「最終更新時刻を今にする」道具。無ければ作る、という副作用のほうが有名になった。',
      },
      {
        prompt: `${spec.path} の中身を「${spec.text}」だけにせよ。`,
        check: `${spec.path} の中身が ${spec.text} であること`,
        assert: fileEquals(spec.path, spec.text),
        hints: ['echo の出力を > で流し込む', `echo "${spec.text}" > ${spec.path}`],
        explain: '> は上書き、>> は追記。取り違えると消える。',
      },
    ],
  }),
});

export function kernel01(): MissionSource[] {
  return [
    ...walkDrills,
    ...makeTreeDrills,
    ...copyMoveDrills,
    ...removeDrills,
    ...sortingDrills,
    ...writeDrills,
  ];
}
