import { concepts } from '../glossary';
import { createRepo } from '@/engines/github/pr';
import { linkedIssues, ownersFor } from '@/engines/github/issues';
import { HOME } from '@/engines/kernel/path';
import type { LessonDefinition } from '../types';
import { ran } from '../authoring/ran';

const WORKFLOWS = `${HOME}/.github/workflows`;


const CODEOWNERS = `# 既定の所有者
*        @core
/docs/   @writers
*.sql    @dba
`;

const FILES = { [HOME]: null };

export const ghClone: LessonDefinition = {
  id: 'github/01/clone-remote',
  track: 'github',
  kind: 'training',
  title: 'リモートと手元をつなぐ',
  intro: {
    summary: '手元のリポジトリを GitHub につなぎ、push する。',
    why:
      '手元だけにある歴史は、パソコンが壊れたら消える。GitHub に送っておけば、みんなと共有でき、失くさない。',
    concepts: concepts('GitHub', 'リモート', 'push', 'Pull Request', 'リポジトリ'),
    commands: [
      { command: 'git remote add origin <URL>', means: 'GitHub のリポジトリを origin として登録する' },
      { command: 'git push origin main', means: 'main を送る' },
      { command: 'gh pr list', means: 'Pull Request の一覧を見る' },
    ],
  },
  objectives: ['origin が何を指しているか分かる', 'push で追跡参照が進むと分かる'],
  parCommands: 8,
  initial: {
    repo: createRepo('acme', 'app'),
    files: { ...FILES, [`${HOME}/README.md`]: '# app\n' },
  },
  steps: [
    {
      prompt: 'ここをリポジトリにして最初のコミットを作り、origin を登録して push せよ。',
      check: 'origin/main が手元の main と同じ位置にあること',
      hints: [
        'git init / git add . / git commit -m "first"',
        'git remote add origin https://github.com/acme/app.git',
        'git push origin main',
      ],
      solution: ['git init', 'git add .', 'git commit -m "first"', 'git remote add origin https://github.com/acme/app.git', 'git push origin main'],
      assert: ({ shell }) => {
        const git = shell.git;
        if (git === null) return false;
        const local = git.refs.get('refs/heads/main');
        return local !== undefined && git.refs.get('refs/remotes/origin/main') === local;
      },
      explain:
        'origin はただの名前。「よく使う相手」に付けた別名で、特別な意味は無い。',
    },
    {
      prompt: 'この GitHub リポジトリに、いま Pull Request がいくつあるかを確かめよ。',
      check: 'gh pr list を実行したこと',
      hints: ['gh pr list'],
      solution: ['gh pr list'],
      assert: ({ history }) => ran(history, 'gh', 'pr', 'list'),
      explain:
        '手元の git と、GitHub 側の Pull Request は別の層。git は履歴、GitHub は合意の場を持つ。',
    },
  ],
};

export const ghPrCreate: LessonDefinition = {
  id: 'github/02/pr-create',
  track: 'github',
  kind: 'training',
  title: '意図が伝わる Pull Request を出す',
  intro: {
    summary: 'Issue を立て、それを閉じる Pull Request を出して取り込む。',
    why:
      '「直した」と「閉じた」を人の手で合わせると、必ずずれる。本文に Closes #番号 と書いておけば、取り込んだ瞬間に Issue も閉じる。',
    concepts: concepts('Issue', 'Pull Request', 'マージ'),
    commands: [
      { command: 'gh issue create -t "題名"', means: 'Issue を立てる' },
      { command: 'gh pr create -t "題名" -b <ブランチ> --body "Closes #1"', means: 'Issue 1 を閉じる Pull Request を作る' },
      { command: 'gh pr merge 1', means: '取り込む' },
    ],
  },
  objectives: ['PR を作れる', '本文から Issue を閉じられると分かる'],
  parCommands: 8,
  initial: { repo: createRepo('acme', 'app'), files: { ...FILES } },
  steps: [
    {
      prompt: 'Issue を1つ立てよ。',
      check: 'Issue が1つ以上あること',
      hints: ['gh issue create -t "ログインできない"'],
      solution: ['gh issue create -t "ログインできない"'],
      assert: ({ shell }) => (shell.repo?.issues.length ?? 0) >= 1,
      explain: '先に「何を直すのか」を1件として置く。PR はその答えになる。',
    },
    {
      prompt: 'その Issue を閉じる Pull Request を作れ。本文に Closes #1 と書くこと。',
      check: 'PR の本文に Closes #1 が含まれていること',
      hints: ['gh pr create -t "ログインを直す" -b fix --body "Closes #1"'],
      solution: ['gh pr create -t "ログインを直す" -b fix --body "Closes #1"'],
      assert: ({ shell }) => {
        const pull = shell.repo?.pulls[0];
        return pull !== undefined && linkedIssues(pull.body).includes(1);
      },
      explain:
        '本文の Closes #n は、ただの文字ではなく機械が読む合図。マージすると自動で閉じる。',
    },
    {
      prompt: 'マージして、Issue が閉じることを確かめよ。',
      check: 'Issue #1 が closed になっていること',
      hints: ['gh pr merge 1'],
      solution: ['gh pr merge 1'],
      assert: ({ shell }) => shell.repo?.issues[0]?.state === 'closed',
      explain:
        '「直した」と「閉じた」を人手で合わせると必ずずれる。仕組みで繋いでおくと、記録が勝手に揃う。',
    },
  ],
};

export const ghCodeowners: LessonDefinition = {
  id: 'github/03/codeowners',
  track: 'github',
  kind: 'training',
  title: '変更した場所で、要る承認が変わる',
  intro: {
    summary: 'CODEOWNERS を読み込み、変えた場所ごとに誰の承認が要るかを調べる。',
    why:
      'どの変更を誰が見るべきかを毎回考えていると抜けが出る。場所ごとに担当を決めておけば、自動で正しい人に頼める。',
    concepts: concepts('CODEOWNERS', '承認', 'レビュー'),
    commands: [
      { command: 'gh codeowners load', means: 'CODEOWNERS を読み込む' },
      { command: 'gh codeowners who <パス>', means: 'そのファイルを変えたら誰の承認が要るかを見る' },
    ],
  },
  objectives: ['CODEOWNERS の書き方が読める', '後の行が勝つと分かる', '所有者の承認を揃えられる'],
  parCommands: 10,
  initial: {
    repo: createRepo('acme', 'app'),
    files: { ...FILES, [`${HOME}/CODEOWNERS`]: CODEOWNERS },
  },
  steps: [
    {
      prompt: 'CODEOWNERS を読み込め。',
      check: '3件の規則が読み込まれていること',
      hints: ['gh codeowners load'],
      solution: ['gh codeowners load'],
      assert: ({ shell }) => (shell.repo?.codeowners.length ?? 0) === 3,
      explain: '所有者は「詳しい人」を示す印。変更した場所によって、レビューを頼む相手が決まる。',
    },
    {
      prompt: 'docs/guide.md を変えたとき、誰の承認が要るかを調べよ。',
      check: 'gh codeowners who を実行したこと',
      hints: ['gh codeowners who docs/guide.md'],
      solution: ['gh codeowners who docs/guide.md'],
      assert: ({ shell, history }) => {
        if (!ran(history, 'gh', 'codeowners', 'who')) return false;
        const rules = shell.repo?.codeowners ?? [];
        return ownersFor(rules, ['docs/guide.md']).includes('@writers');
      },
      explain:
        '`*` は全部に当たるが、後ろの `/docs/` が勝つ。上から順に当てはめて、最後に当たった行が採用される。',
    },
    {
      prompt: 'db/schema.sql の所有者も調べ、違うことを確かめよ。',
      check: '.sql のパスについても調べたこと',
      hints: ['gh codeowners who db/schema.sql'],
      solution: ['gh codeowners who db/schema.sql'],
      assert: ({ history }) => ran(history, 'gh', 'codeowners', 'who', /^\/?db\/schema\.sql$/),
      explain:
        '同じ PR でも、触った場所が増えれば必要な承認も増える。だから変更は小さく分けたほうが早く通る。',
    },
  ],
};

export const ghIssuePlanning: LessonDefinition = {
  id: 'github/05/projects',
  track: 'github',
  kind: 'training',
  title: '課題を盤面で動かす',
  intro: {
    summary: 'Issue を盤面の列に並べて、作業の進み具合を見える形にする。',
    why:
      '「誰が何をやっていて、何が残っているか」を口で確かめるのは大変。盤面にしておけば、一目で分かる。',
    concepts: concepts('Issue', 'ラベル'),
    commands: [
      { command: 'gh issue create -t "題名" -l bug', means: 'bug ラベル付きで Issue を立てる' },
      { command: 'gh project create Board --columns=Todo,Doing,Done', means: '3列の盤面を作る' },
      { command: 'gh project move Board <番号> <列>', means: 'カードを列へ動かす' },
    ],
  },
  objectives: ['Issue とラベルで整理できる', '盤面の列で進み具合を表せる'],
  parCommands: 12,
  initial: { repo: createRepo('acme', 'app'), files: { ...FILES } },
  steps: [
    {
      prompt: 'Issue を2つ立て、片方に bug ラベルを付けよ。',
      check: 'Issue が2つあり、bug ラベルが付いたものがあること',
      hints: ['gh issue create -t "落ちる" -l bug', 'gh issue create -t "遅い"'],
      solution: ['gh issue create -t "落ちる" -l bug', 'gh issue create -t "遅い"'],
      assert: ({ shell }) => {
        const issues = shell.repo?.issues ?? [];
        return issues.length >= 2 && issues.some((i) => i.labels.includes('bug'));
      },
      explain: 'ラベルは検索と集計のための取っ手。付け方を決めておかないと、あとで数えられない。',
    },
    {
      prompt: 'Todo / Doing / Done の盤面を作れ。',
      check: '3列の盤面があること',
      hints: ['gh project create Board --columns=Todo,Doing,Done'],
      solution: ['gh project create Board --columns=Todo,Doing,Done'],
      assert: ({ shell }) => (shell.repo?.projects[0]?.columns.length ?? 0) === 3,
      explain: '列は状態そのもの。「誰が何をしているか」を、置き場所で表す。',
    },
    {
      prompt: '1件目を Doing へ、2件目を Todo に置け。',
      check: '#1 が Doing、#2 が Todo にあること',
      hints: ['gh project move Board 1 Doing', 'gh project move Board 2 Todo'],
      solution: ['gh project move Board 1 Doing', 'gh project move Board 2 Todo'],
      assert: ({ shell }) => {
        const columns = shell.repo?.projects[0]?.columns ?? [];
        const doing = columns.find((c) => c.name === 'Doing')?.items ?? [];
        const todo = columns.find((c) => c.name === 'Todo')?.items ?? [];
        return doing.includes(1) && todo.includes(2);
      },
      explain:
        'カードは1つの列にしか置けない。動かせば前の列から消える。だから「今どこか」が必ず1つに決まる。',
    },
  ],
};

export const ghNeedsDag: LessonDefinition = {
  id: 'github/06/needs-dag',
  track: 'github',
  kind: 'training',
  title: 'ジョブの依存を読む',
  intro: {
    summary: 'ワークフローのジョブの順番（needs）を読み、1つ落ちると下流がどうなるかを見る。',
    why:
      'CI が赤いとき、「どれが本当に落ちたのか」「どれは走らなかっただけか」を区別できると、原因にすぐたどり着ける。',
    concepts: concepts('ワークフロー', 'ジョブ', 'needs', 'CI', 'チェック'),
    commands: [
      { command: 'gh workflow', means: 'ジョブと順番の形を見る' },
      { command: 'gh pr checks 1', means: 'CI を走らせる' },
      { command: 'gh pr checks 1 --fail=lint', means: 'lint をわざと落として走らせる' },
    ],
  },
  objectives: ['needs で順序が決まると分かる', '失敗の下流が skipped になると分かる'],
  parCommands: 8,
  initial: {
    repo: createRepo('acme', 'app'),
    files: {
      ...FILES,
      [`${WORKFLOWS}/ci.yml`]: `name: CI
on: [push]

jobs:
  lint:
    steps:
      - name: lint
        run: npm run lint
  test:
    steps:
      - name: test
        run: npm test
  build:
    needs: [lint, test]
    steps:
      - name: build
        run: npm run build
`,
    },
  },
  steps: [
    {
      prompt: 'ワークフローの構造を確かめよ。どのジョブが何に依存しているか。',
      check: 'gh workflow を実行したこと',
      hints: ['gh workflow'],
      solution: ['gh workflow'],
      assert: ({ history }) => ran(history, 'gh', 'workflow'),
      explain:
        'needs があるところにだけ順序がある。書いていないジョブ同士は同時に走る。',
    },
    {
      prompt: 'Pull Request を作り、CI を通せ。',
      check: 'PR にチェックが3つ付き、全て success であること',
      hints: ['gh pr create -t "変更" -b feature', 'gh pr checks 1'],
      solution: ['gh pr create -t "変更" -b feature', 'gh pr checks 1'],
      assert: ({ shell }) => {
        const checks = shell.repo?.pulls[0]?.checks ?? [];
        return checks.length === 3 && checks.every((c) => c.status === 'success');
      },
      explain: '3つとも通って初めて、この PR は「壊していない」と言える。',
    },
    {
      prompt: 'lint をわざと失敗させて、下流がどうなるか確かめよ。',
      check: 'build が skipped になっていること',
      hints: ['gh pr checks 1 --fail=lint'],
      solution: ['gh pr checks 1 --fail=lint'],
      assert: ({ shell }) => {
        const checks = shell.repo?.pulls[0]?.checks ?? [];
        return checks.find((c) => c.name === 'build')?.status === 'skipped';
      },
      explain:
        'failed ではなく skipped。「失敗した」のではなく「走る条件を満たさなかった」。区別できると原因追跡が速くなる。',
    },
  ],
};
