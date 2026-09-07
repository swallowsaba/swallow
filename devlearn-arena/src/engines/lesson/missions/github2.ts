import { createRepo } from '@/engines/github/pr';
import { linkedIssues, ownersFor } from '@/engines/github/issues';
import { HOME } from '@/engines/kernel/path';
import type { LessonDefinition } from '../types';

const WORKFLOWS = `${HOME}/.github/workflows`;

const MATRIX_YAML = `name: CI
on: [push]

jobs:
  test:
    strategy:
      matrix:
        node: ["18", "20"]
    steps:
      - name: setup
        run: use node \${{ matrix.node }}
      - name: test
        run: npm test
`;

const CACHE_YAML = `name: Build
on: [push]

jobs:
  build:
    steps:
      - uses: actions/cache@v4
        with:
          key: node-modules-v1
      - name: install
        run: npm ci
      - uses: actions/upload-artifact@v4
        with:
          name: dist
      - name: build
        run: npm run build

  deploy:
    needs: build
    steps:
      - uses: actions/download-artifact@v4
        with:
          name: dist
      - name: deploy
        run: ./deploy.sh --token=\${{ secrets.DEPLOY_TOKEN }}
`;

const SHARED_YAML = `name: Shared build
on: workflow_call

jobs:
  build:
    steps:
      - name: build
        run: npm run build
`;

const CALLER_YAML = `name: CI
on: [push]

jobs:
  call-shared:
    uses: ./.github/workflows/shared.yml
`;

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
      assert: ({ history }) => history.some((l) => l.includes('gh pr list')),
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
  objectives: ['PR を作れる', '本文から Issue を閉じられると分かる'],
  parCommands: 8,
  initial: { repo: createRepo('acme', 'app'), files: { ...FILES } },
  steps: [
    {
      prompt: 'Issue を1つ立てよ。',
      check: 'Issue が1つ以上あること',
      hints: ['gh issue create -t "ログインできない"'],
      assert: ({ shell }) => (shell.repo?.issues.length ?? 0) >= 1,
      explain: '先に「何を直すのか」を1件として置く。PR はその答えになる。',
    },
    {
      prompt: 'その Issue を閉じる Pull Request を作れ。本文に Closes #1 と書くこと。',
      check: 'PR の本文に Closes #1 が含まれていること',
      hints: ['gh pr create -t "ログインを直す" -b fix --body "Closes #1"'],
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
      assert: ({ shell }) => (shell.repo?.codeowners.length ?? 0) === 3,
      explain: '所有者は「詳しい人」を示す印。変更した場所によって、レビューを頼む相手が決まる。',
    },
    {
      prompt: 'docs/guide.md を変えたとき、誰の承認が要るかを調べよ。',
      check: 'gh codeowners who を実行したこと',
      hints: ['gh codeowners who docs/guide.md'],
      assert: ({ shell, history }) => {
        if (!history.some((l) => l.includes('codeowners who'))) return false;
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
      assert: ({ history }) => history.some((l) => l.includes('.sql')),
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
  objectives: ['Issue とラベルで整理できる', '盤面の列で進み具合を表せる'],
  parCommands: 12,
  initial: { repo: createRepo('acme', 'app'), files: { ...FILES } },
  steps: [
    {
      prompt: 'Issue を2つ立て、片方に bug ラベルを付けよ。',
      check: 'Issue が2つあり、bug ラベルが付いたものがあること',
      hints: ['gh issue create -t "落ちる" -l bug', 'gh issue create -t "遅い"'],
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
      assert: ({ shell }) => (shell.repo?.projects[0]?.columns.length ?? 0) === 3,
      explain: '列は状態そのもの。「誰が何をしているか」を、置き場所で表す。',
    },
    {
      prompt: '1件目を Doing へ、2件目を Todo に置け。',
      check: '#1 が Doing、#2 が Todo にあること',
      hints: ['gh project move Board 1 Doing', 'gh project move Board 2 Todo'],
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
      assert: ({ history }) => history.some((l) => l.includes('gh workflow')),
      explain:
        'needs があるところにだけ順序がある。書いていないジョブ同士は同時に走る。',
    },
    {
      prompt: 'Pull Request を作り、CI を通せ。',
      check: 'PR にチェックが3つ付き、全て success であること',
      hints: ['gh pr create -t "変更" -b feature', 'gh pr checks 1'],
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
      assert: ({ shell }) => {
        const checks = shell.repo?.pulls[0]?.checks ?? [];
        return checks.find((c) => c.name === 'build')?.status === 'skipped';
      },
      explain:
        'failed ではなく skipped。「失敗した」のではなく「走る条件を満たさなかった」。区別できると原因追跡が速くなる。',
    },
  ],
};

export const ghActionsPractice: LessonDefinition = {
  id: 'github/07/cache-artifact',
  track: 'github',
  kind: 'training',
  title: 'キャッシュ・成果物・シークレット',
  objectives: ['キャッシュの当たり外れが分かる', '成果物がジョブ間で渡ると分かる', '未設定のシークレットで落ちると分かる'],
  parCommands: 12,
  initial: {
    repo: createRepo('acme', 'app'),
    files: { ...FILES, [`${WORKFLOWS}/build.yml`]: CACHE_YAML },
  },
  steps: [
    {
      prompt: 'Pull Request を作り、CI を走らせよ。シークレットが無いので落ちるはず。',
      check: 'deploy が failure になっていること',
      hints: ['gh pr create -t "デプロイ" -b deploy', 'gh pr checks 1'],
      assert: ({ shell }) => {
        const checks = shell.repo?.pulls[0]?.checks ?? [];
        return checks.find((c) => c.name === 'deploy')?.status === 'failure';
      },
      explain:
        '参照しているシークレットが無ければ、そのジョブは動かしようがない。ログには名前だけが出て、値は出ない。',
    },
    {
      prompt: 'DEPLOY_TOKEN を登録し、もう一度 CI を走らせて通せ。',
      check: 'build と deploy が両方 success であること',
      hints: ['gh secret set DEPLOY_TOKEN -b s3cret', 'gh pr checks 1'],
      assert: ({ shell }) => {
        const checks = shell.repo?.pulls[0]?.checks ?? [];
        return checks.length >= 2 && checks.every((c) => c.status === 'success');
      },
      diagnose: ({ shell }) =>
        Object.keys(shell.repo?.secrets ?? {}).includes('DEPLOY_TOKEN')
          ? null
          : 'まだ DEPLOY_TOKEN を登録していません。',
      explain:
        'artifact は build が上げ、deploy が下ろす。ジョブは別の場所で走るので、渡したいものは明示的に受け渡す。',
    },
    {
      prompt: '登録済みのシークレットを一覧し、値が表示されないことを確かめよ。',
      check: 'gh secret list を実行したこと',
      hints: ['gh secret list'],
      assert: ({ history }) => history.some((l) => l.includes('gh secret list')),
      explain:
        '一度入れた値は読み出せない。取り出せないからこそ、置き場所として信用できる。',
    },
  ],
};

export const ghMatrix: LessonDefinition = {
  id: 'github/07/matrix',
  track: 'github',
  kind: 'training',
  title: '同じ手順を組み合わせで回す',
  objectives: ['matrix が組み合わせに展開されると分かる', '1つだけ落ちる状況を作れる'],
  parCommands: 10,
  initial: {
    repo: createRepo('acme', 'app'),
    files: { ...FILES, [`${WORKFLOWS}/ci.yml`]: MATRIX_YAML },
  },
  steps: [
    {
      prompt: 'ワークフローを確かめ、matrix に何が並んでいるか見よ。',
      check: 'gh workflow を実行したこと',
      hints: ['gh workflow'],
      assert: ({ history }) => history.some((l) => l.includes('gh workflow')),
      explain: 'matrix は「同じ手順を、値を変えて何回か回す」だけ。書くのは1回で済む。',
    },
    {
      prompt: 'Pull Request を作って CI を走らせ、ジョブが2つに増えることを確かめよ。',
      check: 'チェックが2件あり、両方 success であること',
      hints: ['gh pr create -t "多版検証" -b matrix', 'gh pr checks 1'],
      assert: ({ shell }) => {
        const checks = shell.repo?.pulls[0]?.checks ?? [];
        return checks.length === 2 && checks.every((c) => c.status === 'success');
      },
      explain: '組み合わせのぶんだけ独立して走る。1つが落ちても他は最後まで走る。',
    },
    {
      prompt: 'node 20 の側だけを落として、片方だけが失敗することを確かめよ。',
      check: '1件が failure、もう1件が success であること',
      hints: ['gh pr checks 1 --fail=test:20'],
      assert: ({ shell }) => {
        const checks = shell.repo?.pulls[0]?.checks ?? [];
        const failed = checks.filter((c) => c.status === 'failure');
        return checks.length === 2 && failed.length === 1;
      },
      explain:
        'どの組み合わせで落ちたかが名前に出る。「全部落ちた」と「特定の版だけ落ちた」は原因が全く違う。',
    },
  ],
};

export const ghReusable: LessonDefinition = {
  id: 'github/07/reusable-workflows',
  track: 'github',
  kind: 'training',
  title: '同じ手順を別のワークフローから呼ぶ',
  objectives: ['再利用可能ワークフローの呼び出し方が分かる', '呼び出し先が無いと失敗すると分かる'],
  parCommands: 10,
  initial: {
    repo: createRepo('acme', 'app'),
    files: {
      ...FILES,
      [`${WORKFLOWS}/ci.yml`]: CALLER_YAML,
      [`${WORKFLOWS}/shared.yml`]: SHARED_YAML,
    },
  },
  steps: [
    {
      prompt: 'ci.yml が何を呼んでいるかを確かめよ。',
      check: 'gh workflow を実行したこと',
      hints: ['gh workflow -w ci.yml'],
      assert: ({ history }) => history.some((l) => l.includes('gh workflow')),
      explain:
        'jobs の中に steps ではなく uses が書いてあれば、それは別のワークフローの呼び出し。',
    },
    {
      prompt: 'Pull Request を作って CI を走らせ、呼び出し先のジョブが動くことを確かめよ。',
      check: 'チェックが success であること',
      hints: ['gh pr create -t "共通化" -b shared', 'gh pr checks 1 -w ci.yml'],
      assert: ({ shell }) => {
        const checks = shell.repo?.pulls[0]?.checks ?? [];
        return checks.length >= 1 && checks.every((c) => c.status === 'success');
      },
      explain:
        '同じビルド手順を各リポジトリに写すと、直すときに全部を直すことになる。1か所に置いて呼べば、直すのも1か所で済む。',
    },
  ],
};

export const ghForkFlow: LessonDefinition = {
  id: 'github/09/fork-flow',
  track: 'github',
  kind: 'training',
  title: '書き込み権限が無いところへ貢献する',
  objectives: ['fork が何を作るか分かる', 'fork から PR を出せる'],
  parCommands: 10,
  initial: { repo: createRepo('upstream', 'oss'), files: { ...FILES } },
  steps: [
    {
      prompt: 'このリポジトリを自分の側に fork せよ。',
      check: 'fork になっていて、元を指していること',
      hints: ['gh fork learner'],
      assert: ({ shell }) => shell.repo?.upstream?.owner === 'upstream',
      explain:
        'fork は「自分が書ける複製」。元には書けないので、まず書ける場所を作る。',
    },
    {
      prompt: 'fork 側に Pull Request を作り、元へ変更を提案せよ。',
      check: 'Pull Request が1件あること',
      hints: ['gh pr create -t "誤字を直す" -b typo-fix'],
      assert: ({ shell }) => (shell.repo?.pulls.length ?? 0) >= 1,
      explain:
        'fork から出した PR は、元のリポジトリに「取り込みませんか」と提案する形になる。相手が受けるまで、元は何も変わらない。',
    },
    {
      prompt: '出した Pull Request の中身を確かめよ。',
      check: 'gh pr view を実行したこと',
      hints: ['gh pr view 1'],
      assert: ({ history }) => history.some((l) => l.includes('gh pr view')),
      explain:
        '「誰の、どの枝から、どこへ」が全部見えるようになっている。これが無いと、受ける側は判断できない。',
    },
  ],
};
