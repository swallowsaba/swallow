import { concepts } from '../glossary';
import {
  cwdIs, dirExists, dirHas, fileAbsent, fileEquals, fileExists,
} from '../authoring/assert';
import type { MissionSource } from '../authoring/mission';
import { HOME, family, fromNames, man } from './shared';
import { DIR_NAMES, slugify } from './values';

const CH = 'kernel/01';

/* ------------------------------------------------------------------ *
 * 1. 絶対パスと相対パスで同じ場所に辿り着く
 * ------------------------------------------------------------------ */

interface WalkSpec {
  tree: string[];
  target: string;
}

const WALKS: { slug: string; value: WalkSpec }[] = DIR_NAMES.flatMap((top, i) =>
  ['src', 'conf', 'logs'].map((leaf, j) => {
    const middle = DIR_NAMES[(i + j + 1) % DIR_NAMES.length] ?? 'app';
    const target = `/${top}/${middle}/${leaf}`;
    return {
      slug: slugify(target),
      value: { tree: [`${top}/${middle}/${leaf}`, `${top}/${middle}/other`], target },
    };
  }),
);

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
    intro: {
      summary: '相対パスと絶対パスを使い分けて、目的の場所まで歩く。',
      why:
        '住所の書き方が2通りあると知っていれば、「どこから見た住所か」で迷わなくなる。スクリプトでは絶対パス、手で打つときは相対パスが便利。',
      concepts: concepts('パス', '絶対パス', '相対パス', 'いまいる場所', 'スクリプト'),
      commands: [
        { command: 'cd <行き先>', means: '行き先へ移る' },
        { command: 'cd ..', means: '1つ上のディレクトリへ戻る' },
        { command: 'cd ~', means: 'ホームディレクトリへ戻る' },
        { command: 'pwd', means: 'いまいる場所を表示する' },
      ],
    },
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

const LEAF_SETS = [
  ['src/main', 'src/test', 'docs/api'],
  ['config/dev', 'config/prod', 'logs'],
  ['public/css', 'public/js', 'content/posts'],
  ['terraform/modules', 'ansible/roles', 'scripts'],
  ['2026/q1', '2026/q2', 'templates'],
  ['raw/images', 'raw/labels', 'processed'],
  ['apps/web', 'apps/api', 'packages/ui'],
  ['daily/db', 'weekly/db', 'monthly/db'],
];

const TREES: { slug: string; value: { root: string; leaves: string[] } }[] = DIR_NAMES.flatMap(
  (root, i) =>
    [0, 1].map((k) => {
      const leaves = LEAF_SETS[(i + k) % LEAF_SETS.length] ?? LEAF_SETS[0] ?? [];
      return { slug: `${root}-${String(k + 1)}`, value: { root, leaves: [...leaves] } };
    }),
);

const makeTreeDrills = family<{ root: string; leaves: string[] }>({
  track: 'kernel',
  chapterId: CH,
  family: 'make-tree',
  docs: [man('mkdir')],
  variants: TREES,
  make: (spec) => ({
    title: `${spec.root}/ の骨組みを掘る`,
    intro: {
      summary: 'mkdir -p で、深いディレクトリを途中の階層ごと一度に作る。',
      why:
        'アプリを置く場所やログの置き場は、何段にもなった入れ物で整理する。-p を知っていれば一行で作れ、何度実行しても失敗しない。',
      concepts: concepts('ディレクトリ', 'オプション', '冪等'),
      commands: [
        { command: 'mkdir -p a/b/c', means: 'a と a/b が無ければ一緒に作り、最後に a/b/c を作る' },
        { command: 'ls -R', means: '中身を下の階層まで全部表示する' },
      ],
    },
    objectives: ['-p で途中の階層ごと作れる', '作った結果を確かめられる'],
    initial: { files: { [HOME]: null }, cwd: HOME },
    solution: [
      `mkdir -p ${spec.leaves.map((l) => `${spec.root}/${l}`).join(' ')}`,
    ],
    steps: [
      {
        prompt: `${spec.root}/ の下に ${spec.leaves.join(' と ')} を作れ。途中の階層も要る。`,
        conditions: spec.leaves.map((l) => ({
          label: `${spec.root}/${l} がディレクトリとして存在すること`,
          test: dirExists(`${spec.root}/${l}`),
          howTo: 'ls -R で、いまどこまで掘れているか見えます',
        })),
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

const MOVE_FILES = [
  'app.conf', 'may.csv', 'logo.svg', 'deploy.sh', 'schema.sql', 'server.crt',
  'meeting.md', 'dump.sql', 'access.log', 'package-lock.json', 'notes.txt', 'index.html',
  'values.yaml', 'seed.sql', 'report.pdf', 'chart.png', 'main.go', 'setup.py',
];

const MOVES: { slug: string; value: { file: string; from: string; to: string } }[] =
  MOVE_FILES.map((file, i) => ({
    slug: slugify(file),
    value: {
      file,
      from: DIR_NAMES[i % DIR_NAMES.length] ?? 'inbox',
      to: DIR_NAMES[(i + 5) % DIR_NAMES.length] ?? 'archive',
    },
  }));

const copyMoveDrills = family<{ file: string; from: string; to: string }>({
  track: 'kernel',
  chapterId: CH,
  family: 'copy-move',
  docs: [man('cp'), man('mv')],
  variants: MOVES,
  make: (spec) => ({
    title: `${spec.file} を写して、動かす`,
    intro: {
      summary: 'cp で写し、mv で動かす。違いは「元が残るかどうか」。',
      why:
        '設定ファイルを直す前に写しを取っておく、古いものを片付け場所へ動かす。どちらも毎日のようにやる。取り違えると元のファイルが消えるので、違いを結果で確かめておく。',
      concepts: concepts('パス', 'ディレクトリ'),
      commands: [
        { command: 'cp <元> <先>', means: '元を残したまま、先に写しを作る' },
        { command: 'mv <元> <先>', means: '元を先へ動かす（名前を変えるのにも使う）' },
        { command: 'ls <ディレクトリ>', means: '中に何があるか見る' },
      ],
    },
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
        conditions: [
          {
            label: `${spec.to}/${spec.file} があること`,
            test: fileExists(`${spec.to}/${spec.file}`),
            howTo: `ls ${spec.to} で確かめられます`,
          },
          {
            label: `${spec.from}/${spec.file} が元のまま残っていること`,
            test: fileExists(`${spec.from}/${spec.file}`),
            howTo: 'mv を使うと元が消えます。写すのは cp です',
          },
        ],
        hints: ['cp <元> <先>', `cp ${spec.from}/${spec.file} ${spec.to}/`],
        explain: 'cp は写す。元はそのまま残る。',
      },
      {
        prompt: `続けて、元の ${spec.from}/${spec.file} を ${spec.to}/${spec.file}.orig という名前で移動せよ。`,
        conditions: [
          {
            label: `${spec.to}/${spec.file}.orig があること`,
            test: fileExists(`${spec.to}/${spec.file}.orig`),
            howTo: '移動先には新しい名前まで含めて書きます',
          },
          {
            label: `${spec.from}/${spec.file} が無くなっていること`,
            test: fileAbsent(`${spec.from}/${spec.file}`),
            howTo: 'cp では元が残ります。動かすのは mv です',
          },
        ],
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
  'vendor', 'out', 'obj', 'bin-tmp', 'logs-old', 'staging', 'scratch', 'artifacts',
]);

const removeDrills = family<string>({
  track: 'kernel',
  chapterId: CH,
  family: 'remove',
  docs: [man('rm')],
  variants: CLEANUPS,
  make: (dir) => ({
    title: `${dir}/ だけを片付ける`,
    intro: {
      summary: 'rm で、指定したものだけを消す。',
      why:
        '端末の rm にはゴミ箱が無い。消したら戻らない。だから「消してよいものだけを正確に指す」練習をしておく。',
      concepts: concepts('ディレクトリ', 'オプション'),
      commands: [
        { command: 'rm <ファイル>', means: 'ファイルを消す' },
        { command: 'rm -r <ディレクトリ>', means: 'ディレクトリを中身ごと消す' },
        { command: 'ls', means: '消す前と後で、何が残っているか確かめる' },
      ],
    },
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
        conditions: [
          { label: `${dir} が無くなっていること`, test: fileAbsent(dir), howTo: 'ls で残っていないか見てください' },
          {
            label: 'keep.txt が残っていること',
            test: fileExists('keep.txt'),
            howTo: '消す対象を取り違えていないか、rm に渡した引数を見直してください',
          },
        ],
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
      intro: {
        summary: '散らばったファイルを、ワイルドカードでまとめて1か所に集める。',
        why:
          '同じ種類のファイルを1つずつ動かすのは時間の無駄で、打ち間違いも増える。*.log のようにまとめて指せれば、何十個でも一行で片付く。',
        concepts: concepts('ワイルドカード', 'ディレクトリ'),
        commands: [
          { command: 'mkdir <置き場>', means: '集める先を作る' },
          { command: 'mv *.<拡張子> <置き場>/', means: '名前がその拡張子で終わるものを全部動かす' },
        ],
      },
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
          conditions: [
            {
              label: `${spec.dir}/ に ${spec.names.map((n) => `${n}.${spec.ext}`).join(', ')} が揃っていること`,
              test: dirHas(spec.dir, ...spec.names.map((n) => `${n}.${spec.ext}`)),
              howTo: `ls ${spec.dir} で中身を見てください`,
            },
            ...spec.names.map((n) => ({
              label: `元の場所に ${n}.${spec.ext} が残っていないこと`,
              test: fileAbsent(`${n}.${spec.ext}`),
              howTo: 'cp ではなく mv を使うと元が残りません',
            })),
          ],
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

const NOTE_PAIRS: [string, string][] = [
  ['TODO.txt', 'ログを片付ける'], ['OWNER.txt', 'platform-team'], ['VERSION', '1.4.2'],
  ['CONTACT.md', 'oncall@example.com'], ['RUNBOOK.md', '再起動の前に必ず記録を残す'],
  ['motd', 'ようこそ'], ['FEATURE_FLAG', 'enabled'], ['ENDPOINT', 'https://api.example.com'],
  ['REGION', 'ap-northeast-1'], ['TIER', 'standard'], ['MAINTAINER', 'infra'],
  ['SCHEDULE', 'daily 03:00'], ['RETENTION', '30d'], ['LIMIT', '512'],
  ['MODE', 'readonly'], ['CHANNEL', 'stable'],
];

const NOTES: { slug: string; value: { path: string; text: string } }[] = NOTE_PAIRS.map(
  ([path = '', text = '']) => ({ slug: slugify(path), value: { path, text } }),
);

const writeDrills = family<{ path: string; text: string }>({
  track: 'kernel',
  chapterId: CH,
  family: 'write-file',
  docs: [man('touch')],
  variants: NOTES,
  make: (spec) => ({
    title: `${spec.path} を作って中身を書く`,
    intro: {
      summary: 'echo とリダイレクトで、ファイルを作って中身を書く。',
      why:
        '設定の一行を足す、メモを残す。エディタを開かなくても、一行ならコマンドだけで書ける。',
      concepts: concepts('リダイレクト', '標準出力'),
      commands: [
        { command: 'echo "文字" > <ファイル>', means: 'ファイルを作り直して文字を書く' },
        { command: 'echo "文字" >> <ファイル>', means: '今の中身の後ろに書き足す' },
        { command: 'cat <ファイル>', means: '中身を確かめる' },
      ],
    },
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
