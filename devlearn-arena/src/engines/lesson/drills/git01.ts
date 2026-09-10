import { fileContains, fileEquals } from '../authoring/assert';
import type { MissionSource } from '../authoring/mission';
import {
  branchExists, commitCountIs, headMessageIs, noConflictMarkers, onBranch, sameCommit,
  staged, stashCountIs, tagExists,
} from './gitAssert';
import { HOME, family, gitDoc } from './shared';
import { slugify } from './values';

/* ------------------------------------------------------------------ *
 * git/01 最初のコミットまで
 * ------------------------------------------------------------------ */

interface FirstSpec {
  slug: string;
  file: string;
  body: string;
  message: string;
}

const FIRST_ROWS: [string, string, string][] = [
  ['README.md', 'my app', 'add README'],
  ['index.html', 'hello page', 'add index page'],
  ['main.py', 'print hi', 'add entry point'],
  ['app.conf', 'port = 8080', 'add config'],
  ['LICENSE', 'MIT', 'add license'],
  ['Makefile', 'all:', 'add makefile'],
  ['.gitignore', 'node_modules/', 'ignore build output'],
  ['schema.sql', 'create table t (id int);', 'add schema'],
  ['NOTES.md', 'work in progress', 'add notes'],
  ['run.sh', 'echo run', 'add run script'],
  ['CHANGELOG.md', 'unreleased', 'add changelog'],
  ['Dockerfile', 'FROM scratch', 'add dockerfile'],
  ['values.yaml', 'replicas: 1', 'add values'],
  ['CODEOWNERS', '* @platform', 'add codeowners'],
  ['.editorconfig', 'indent_size = 2', 'add editorconfig'],
  ['go.mod', 'module app', 'add go module'],
  ['pyproject.toml', 'name = app', 'add project file'],
  ['docker-compose.yml', 'services:', 'add compose file'],
];

const FIRSTS: FirstSpec[] = FIRST_ROWS.map(([file = '', body = '', message = '']) => ({
  slug: slugify(file),
  file,
  body,
  message,
}));

const firstCommitDrills = family<FirstSpec>({
  track: 'git',
  chapterId: 'git/01',
  family: 'first-commit',
  docs: [gitDoc('init'), gitDoc('commit')],
  variants: FIRSTS.map((value) => ({ slug: value.slug, value })),
  make: (v) => ({
    title: `${v.file} を最初のコミットにする`,
    objectives: ['リポジトリを作れる', '3面（作業ツリー・索引・履歴）の移動が分かる'],
    initial: { files: { [HOME]: null }, cwd: HOME },
    solution: [
      'git init',
      `echo "${v.body}" > ${v.file}`,
      `git add ${v.file}`,
      `git commit -m "${v.message}"`,
    ],
    steps: [
      {
        prompt: 'いまの場所を git リポジトリにせよ。',
        check: 'リポジトリが作られていること',
        assert: (ctx) => ctx.shell.git !== null,
        hints: ['git init'],
        explain:
          'git init は .git というディレクトリを作るだけ。中身は全てそこに入り、作業ツリーには何も起きない。',
      },
      {
        prompt: `${v.file} を作り、中身を「${v.body}」にせよ。`,
        check: `${v.file} の中身が ${v.body} であること`,
        assert: fileEquals(v.file, v.body),
        hints: [`echo "${v.body}" > ${v.file}`],
        explain: 'この時点ではまだ git は何も知らない。作業ツリーに置かれただけ。',
      },
      {
        prompt: `${v.file} を索引に載せよ（ステージする）。`,
        check: `${v.file} が索引に載っていること`,
        assert: staged(v.file),
        hints: ['git status で今の状態が見える', `git add ${v.file}`],
        explain:
          'add は「次のコミットに含める」という宣言。作業ツリーと履歴のあいだに索引があるので、一部だけを選んで記録できる。',
      },
      {
        prompt: `「${v.message}」というメッセージでコミットせよ。`,
        conditions: [
          { label: 'コミットが 1 つあること', test: commitCountIs(1), howTo: 'git log で確かめられます' },
          {
            label: `メッセージが ${v.message} であること`,
            test: headMessageIs(v.message),
            howTo: 'git commit -m "..." の形でメッセージを渡します',
          },
        ],
        hints: [`git commit -m "${v.message}"`],
        explain:
          'コミットは索引の内容を丸ごと記録する。作業ツリーにあっても add していないものは入らない。',
      },
    ],
  }),
});

/* ------------------------------------------------------------------ *
 * git/04 ブランチを切って合流させる
 * ------------------------------------------------------------------ */

interface BranchSpec {
  slug: string;
  branch: string;
  file: string;
  body: string;
  message: string;
}

const BRANCH_ROWS: [string, string, string, string][] = [
  ['feature/login', 'login.js', 'login', 'add login'],
  ['feature/search', 'search.js', 'search', 'add search'],
  ['fix/typo', 'typo.md', 'fixed', 'fix typo'],
  ['chore/deps', 'deps.txt', 'updated', 'update deps'],
  ['feature/export', 'export.js', 'export', 'add export'],
  ['fix/crash', 'crash.md', 'handled', 'fix crash'],
  ['docs/api', 'api.md', 'api docs', 'document api'],
  ['feature/cache', 'cache.js', 'cache', 'add cache'],
  ['feature/upload', 'upload.js', 'upload', 'add upload'],
  ['fix/leak', 'leak.md', 'closed', 'fix leak'],
  ['perf/index', 'index.sql', 'create index', 'add index'],
  ['chore/lint', 'lint.json', 'rules', 'configure lint'],
  ['feature/webhook', 'webhook.js', 'webhook', 'add webhook'],
  ['fix/race', 'race.md', 'locked', 'fix race'],
  ['docs/runbook', 'runbook.md', 'steps', 'write runbook'],
  ['feature/report', 'report.js', 'report', 'add report'],
];

const BRANCHES: BranchSpec[] = BRANCH_ROWS.map(
  ([branch = '', file = '', body = '', message = '']) => ({
    slug: slugify(branch),
    branch,
    file,
    body,
    message,
  }),
);

const branchDrills = family<BranchSpec>({
  track: 'git',
  chapterId: 'git/04',
  family: 'branch-merge',
  docs: [gitDoc('branch'), gitDoc('merge')],
  variants: BRANCHES.map((value) => ({ slug: value.slug, value })),
  make: (v) => ({
    title: `${v.branch} で作業して main に合流させる`,
    objectives: ['ブランチを切れる', '切り替えられる', '早送りの合流が分かる'],
    initial: { files: { [HOME]: null }, cwd: HOME },
    solution: [
      'git init',
      'echo base > base.txt',
      'git add base.txt',
      'git commit -m "base"',
      `git switch -c ${v.branch}`,
      `echo "${v.body}" > ${v.file}`,
      `git add ${v.file}`,
      `git commit -m "${v.message}"`,
      'git switch main',
      `git merge ${v.branch}`,
    ],
    steps: [
      {
        prompt: 'リポジトリを作り、base.txt を「base」という内容で1つコミットせよ。',
        conditions: [
          { label: 'コミットが 1 つあること', test: commitCountIs(1) },
          { label: 'base.txt が索引にあること', test: staged('base.txt') },
        ],
        hints: ['git init', 'echo base > base.txt', 'git add base.txt', 'git commit -m "base"'],
        explain: '分かれ道を作る前に、共通の起点が要る。',
      },
      {
        prompt: `${v.branch} を作ってそちらへ移り、${v.file} を追加してコミットせよ。`,
        conditions: [
          { label: `${v.branch} があること`, test: branchExists(v.branch), howTo: 'git branch で一覧できます' },
          { label: `いま ${v.branch} に居ること`, test: onBranch(v.branch), howTo: 'git switch -c は作って移るまでを一度にやります' },
          { label: 'コミットが 2 つあること', test: commitCountIs(2) },
          { label: `メッセージが ${v.message} であること`, test: headMessageIs(v.message) },
        ],
        hints: [
          `git switch -c ${v.branch}`,
          `echo "${v.body}" > ${v.file}`,
          `git add ${v.file} && git commit -m "${v.message}"`,
        ],
        explain:
          'ブランチはコミットを指す付箋にすぎない。切っても履歴は複製されず、名前がひとつ増えるだけ。',
      },
      {
        prompt: `main に戻り、${v.branch} を合流させよ。`,
        conditions: [
          { label: 'いま main に居ること', test: onBranch('main'), howTo: 'git switch main' },
          {
            label: `main と ${v.branch} が同じコミットを指していること`,
            test: sameCommit('main', v.branch),
            howTo: '枝分かれしていなければ、合流は付箋を進めるだけで済みます',
          },
        ],
        hints: ['git switch main', `git merge ${v.branch}`],
        explain:
          'main が動いていなければ、合流はただの早送り。新しいコミットは作られず、付箋が前へ動くだけ。',
      },
    ],
  }),
});

/* ------------------------------------------------------------------ *
 * git/05 衝突を解く
 * ------------------------------------------------------------------ */

interface ConflictSpec {
  slug: string;
  file: string;
  base: string;
  ours: string;
  theirs: string;
  resolved: string;
}

const CONFLICT_ROWS: [string, string, string, string, string][] = [
  ['app.conf', 'port = 80', 'port = 8080', 'port = 9090', 'port = 9090'],
  ['VERSION', '1.0.0', '1.1.0', '2.0.0', '2.0.0'],
  ['title.txt', 'title a', 'title b', 'title c', 'title c'],
  ['OWNER', 'alice', 'bob', 'carol', 'carol'],
  ['log.conf', 'level = info', 'level = debug', 'level = warn', 'level = warn'],
  ['deploy.yaml', 'image: app:1.0', 'image: app:1.1', 'image: app:2.0', 'image: app:2.0'],
  ['limits.conf', 'max = 100', 'max = 200', 'max = 500', 'max = 500'],
  ['region.txt', 'tokyo', 'osaka', 'nagoya', 'nagoya'],
  ['replicas.txt', '1', '2', '4', '4'],
  ['branch.txt', 'master', 'develop', 'main', 'main'],
  ['timeout.conf', 'timeout = 10', 'timeout = 20', 'timeout = 30', 'timeout = 30'],
  ['plan.txt', 'free', 'pro', 'enterprise', 'enterprise'],
];

const CONFLICTS: ConflictSpec[] = CONFLICT_ROWS.map(
  ([file = '', base = '', ours = '', theirs = '', resolved = '']) => ({
    slug: slugify(file),
    file,
    base,
    ours,
    theirs,
    resolved,
  }),
);

const conflictDrills = family<ConflictSpec>({
  track: 'git',
  chapterId: 'git/05',
  family: 'conflict',
  docs: [gitDoc('merge')],
  variants: CONFLICTS.map((value) => ({ slug: value.slug, value })),
  make: (v) => ({
    title: `${v.file} の衝突を解く`,
    objectives: ['衝突がどう見えるか分かる', '自分で選んで解ける', '解いたら記録できる'],
    initial: { files: { [HOME]: null }, cwd: HOME },
    solution: [
      'git init',
      `echo "${v.base}" > ${v.file}`,
      `git add ${v.file}`,
      'git commit -m "base"',
      'git switch -c other',
      `echo "${v.theirs}" > ${v.file}`,
      `git add ${v.file}`,
      'git commit -m "theirs"',
      'git switch main',
      `echo "${v.ours}" > ${v.file}`,
      `git add ${v.file}`,
      'git commit -m "ours"',
      'git merge other',
      `echo "${v.resolved}" > ${v.file}`,
      `git add ${v.file}`,
      'git commit -m "resolve conflict"',
    ],
    steps: [
      {
        prompt: `${v.file} を「${v.base}」で1つコミットし、other ブランチで「${v.theirs}」に、main で「${v.ours}」に変えてそれぞれコミットせよ。`,
        conditions: [
          {
            label: 'main から辿れるコミットが 2 つあること（base と ours）',
            test: commitCountIs(2),
            howTo: 'other 側のコミットは main からは辿れません。git log --oneline で数えられます',
          },
          { label: 'other ブランチがあること', test: branchExists('other') },
          { label: 'いま main に居ること', test: onBranch('main') },
        ],
        hints: [
          'git init / git add / git commit',
          'git switch -c other で分かれる',
          'git switch main で戻る',
        ],
        explain: '同じ行を両側で変えると衝突する。まずその状況を自分で作る。',
      },
      {
        prompt: `other を main に合流させよ。衝突するはずなので、${v.file} を「${v.resolved}」にして解決し、コミットまで済ませよ。`,
        conditions: [
          {
            label: `${v.file} に衝突の目印が残っていないこと`,
            test: noConflictMarkers(v.file),
            howTo: '<<<<<<< と >>>>>>> の行はすべて消します',
          },
          {
            label: `${v.file} の中身が ${v.resolved} であること`,
            test: fileEquals(v.file, v.resolved),
            howTo: '選んだほうだけを残します',
          },
          {
            label: 'コミットが 4 つになっていること（合流のコミット）',
            test: commitCountIs(4),
            howTo: '解決したら git add してから git commit します',
          },
        ],
        hints: [
          'git merge other',
          `衝突した ${v.file} を開いて、残す側だけにする`,
          `echo "${v.resolved}" > ${v.file} && git add ${v.file} && git commit -m "resolve conflict"`,
        ],
        explain:
          '衝突は「git が決められない」というだけで、壊れているわけではない。どちらを残すかは人が決める仕事。',
      },
    ],
  }),
});

/* ------------------------------------------------------------------ *
 * git/08 作業を一時退避する
 * ------------------------------------------------------------------ */

const STASHES: { slug: string; value: { file: string; body: string } }[] = [
  'wip.txt', 'draft.md', 'debug.log', 'patch.diff', 'style.css', 'test.js',
  'notes.txt', 'sketch.svg', 'query.sql', 'todo.md', 'scratch.go', 'idea.txt',
].map((file) => ({ slug: slugify(file), value: { file, body: `${file} 書きかけ` } }));

const stashDrills = family<{ file: string; body: string }>({
  track: 'git',
  chapterId: 'git/08',
  family: 'stash',
  docs: [gitDoc('stash')],
  variants: STASHES,
  make: (v) => ({
    title: '手を止めずに割り込みへ移る',
    objectives: ['退避できる', '戻せる', '退避中は作業ツリーが綺麗になると分かる'],
    initial: { files: { [HOME]: null }, cwd: HOME },
    solution: [
      'git init',
      'echo base > base.txt',
      'git add base.txt',
      'git commit -m "base"',
      `echo "${v.body}" > ${v.file}`,
      `git add ${v.file}`,
      'git stash',
      'git stash pop',
    ],
    steps: [
      {
        prompt: `base.txt を1つコミットしたあと、${v.file} を「${v.body}」で作って add せよ。`,
        conditions: [
          { label: 'コミットが 1 つあること', test: commitCountIs(1) },
          { label: `${v.file} が索引にあること`, test: staged(v.file) },
        ],
        hints: ['git init / git add base.txt / git commit -m "base"', `echo "${v.body}" > ${v.file}`, `git add ${v.file}`],
        explain: '書きかけの状態を作る。ここに割り込みが入った、という想定。',
      },
      {
        prompt: '書きかけを退避せよ。',
        conditions: [
          { label: '退避が 1 件あること', test: stashCountIs(1), howTo: 'git stash list で確かめられます' },
          {
            label: `${v.file} が索引から消えていること`,
            test: (ctx) => ctx.shell.git !== null && !ctx.shell.git.index.has(v.file),
            howTo: '退避すると作業ツリーは直前のコミットの状態に戻ります',
          },
        ],
        hints: ['git stash'],
        explain:
          'stash は「まだコミットしたくないが、いったん片付けたい」ときのための置き場。履歴には残らない。',
      },
      {
        prompt: '割り込みが終わったので、退避した作業を戻せ。',
        conditions: [
          { label: '退避が 0 件になっていること', test: stashCountIs(0) },
          { label: `${v.file} が戻っていること`, test: fileContains(v.file, v.body) },
        ],
        hints: ['git stash pop'],
        explain:
          'pop は取り出して消す、apply は取り出して残す。同じものを複数の場所へ当てたいときは apply を使う。',
      },
    ],
  }),
});

/* ------------------------------------------------------------------ *
 * git/03 印を付ける（タグ）
 * ------------------------------------------------------------------ */

const TAGS: { slug: string; value: string }[] = [
  'v1.0.0', 'v1.1.0', 'v2.0.0', 'v0.9.1', 'release-2026-05', 'v1.0.0-rc1',
  'v1.2.3', 'v2.1.0', 'v3.0.0-beta', 'v0.1.0', 'stable-2026', 'hotfix-1',
].map((value) => ({ slug: slugify(value), value }));

const tagDrills = family<string>({
  track: 'git',
  chapterId: 'git/03',
  family: 'tag',
  docs: [gitDoc('tag')],
  variants: TAGS,
  make: (name) => ({
    title: `${name} の印を付ける`,
    objectives: ['タグを打てる', 'ブランチとの違いが言える'],
    initial: { files: { [HOME]: null }, cwd: HOME },
    solution: [
      'git init',
      'echo v1 > app.txt',
      'git add app.txt',
      'git commit -m "release"',
      `git tag ${name}`,
    ],
    steps: [
      {
        prompt: 'app.txt を1つコミットせよ。',
        check: 'コミットが 1 つあること',
        assert: commitCountIs(1),
        hints: ['git init', 'echo v1 > app.txt', 'git add app.txt', 'git commit -m "release"'],
        explain: 'タグは既にあるコミットに付ける印なので、まず対象が要る。',
      },
      {
        prompt: `そのコミットに ${name} というタグを付けよ。`,
        conditions: [
          { label: `${name} が存在すること`, test: tagExists(name), howTo: 'git tag で一覧できます' },
          {
            label: `${name} が HEAD と同じコミットを指していること`,
            test: sameCommit(name, 'HEAD'),
            howTo: '引数を付けなければ、いまの HEAD に付きます',
          },
        ],
        hints: [`git tag ${name}`],
        explain:
          'タグは動かない印、ブランチは動く付箋。リリース地点のように「もう動かさない」ものにはタグを使う。',
      },
    ],
  }),
});

export function git01(): MissionSource[] {
  return [
    ...firstCommitDrills,
    ...branchDrills,
    ...conflictDrills,
    ...stashDrills,
    ...tagDrills,
  ];
}
