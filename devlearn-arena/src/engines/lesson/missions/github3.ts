import { createRepo } from '@/engines/github/pr';
import { HOME } from '@/engines/kernel/path';
import type { LessonDefinition } from '../types';
import { ran } from '../authoring/ran';

const WORKFLOWS = `${HOME}/.github/workflows`;
const FILES = { [HOME]: null };

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


/** Actions の実務とリリース、OSS への貢献（07〜09 章） */

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
      solution: ['gh pr create -t "デプロイ" -b deploy', 'gh pr checks 1'],
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
      solution: ['gh secret set DEPLOY_TOKEN -b s3cret', 'gh pr checks 1'],
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
      solution: ['gh secret list'],
      assert: ({ history }) => ran(history, 'gh', 'secret', 'list'),
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
      solution: ['gh workflow'],
      assert: ({ history }) => ran(history, 'gh', 'workflow'),
      explain: 'matrix は「同じ手順を、値を変えて何回か回す」だけ。書くのは1回で済む。',
    },
    {
      prompt: 'Pull Request を作って CI を走らせ、ジョブが2つに増えることを確かめよ。',
      check: 'チェックが2件あり、両方 success であること',
      hints: ['gh pr create -t "多版検証" -b matrix', 'gh pr checks 1'],
      solution: ['gh pr create -t "多版検証" -b matrix', 'gh pr checks 1'],
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
      solution: ['gh pr checks 1 --fail=test:20'],
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
      solution: ['gh workflow -w ci.yml'],
      assert: ({ history }) => ran(history, 'gh', 'workflow'),
      explain:
        'jobs の中に steps ではなく uses が書いてあれば、それは別のワークフローの呼び出し。',
    },
    {
      prompt: 'Pull Request を作って CI を走らせ、呼び出し先のジョブが動くことを確かめよ。',
      check: 'チェックが success であること',
      hints: ['gh pr create -t "共通化" -b shared', 'gh pr checks 1 -w ci.yml'],
      solution: ['gh pr create -t "共通化" -b shared', 'gh pr checks 1 -w ci.yml'],
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
      solution: ['gh fork learner'],
      assert: ({ shell }) => shell.repo?.upstream?.owner === 'upstream',
      explain:
        'fork は「自分が書ける複製」。元には書けないので、まず書ける場所を作る。',
    },
    {
      prompt: 'fork 側に Pull Request を作り、元へ変更を提案せよ。',
      check: 'Pull Request が1件あること',
      hints: ['gh pr create -t "誤字を直す" -b typo-fix'],
      solution: ['gh pr create -t "誤字を直す" -b typo-fix'],
      assert: ({ shell }) => (shell.repo?.pulls.length ?? 0) >= 1,
      explain:
        'fork から出した PR は、元のリポジトリに「取り込みませんか」と提案する形になる。相手が受けるまで、元は何も変わらない。',
    },
    {
      prompt: '出した Pull Request の中身を確かめよ。',
      check: 'gh pr view を実行したこと',
      hints: ['gh pr view 1'],
      solution: ['gh pr view 1'],
      assert: ({ history }) => ran(history, 'gh', 'pr', 'view'),
      explain:
        '「誰の、どの枝から、どこへ」が全部見えるようになっている。これが無いと、受ける側は判断できない。',
    },
  ],
};

export const ghRelease: LessonDefinition = {
  id: 'github/08/tags-releases',
  track: 'github',
  kind: 'training',
  title: 'どの版を配ったのかを残す',
  objectives: ['タグとリリースの関係が分かる', '実在しないタグでは配れないと分かる'],
  parCommands: 10,
  initial: {
    repo: createRepo('acme', 'app'),
    files: { ...FILES, [`${HOME}/CHANGELOG.md`]: '# 変更履歴\n' },
  },
  steps: [
    {
      prompt: 'まだタグが無い状態で、v1.0.0 のリリースを作ろうとしてみよ。',
      check: 'gh release create を試したこと',
      hints: ['gh release create v1.0.0 -t "初回リリース"'],
      solution: ['gh release create v1.0.0 -t "初回リリース"'],
      assert: ({ history }) => ran(history, 'gh', 'release', 'create'),
      explain:
        'リリースは「このコミットを配った」という記録。指す先が無ければ作れない。',
    },
    {
      prompt: 'コミットして、注釈付きタグ v1.0.0 を打て。',
      check: 'タグ v1.0.0 があること',
      hints: [
        'git init / git add . / git commit -m "first"',
        'git tag -a v1.0.0 -m "初回リリース"',
      ],
      solution: ['git init', 'git add .', 'git commit -m "first"', 'git tag -a v1.0.0 -m "初回リリース"'],
      assert: ({ shell }) => shell.git?.refs.has('refs/tags/v1.0.0') === true,
      explain:
        'タグは動かない参照。ブランチと違って、後から中身が変わらないことが値打ち。',
    },
    {
      prompt: 'そのタグからリリースを作れ。',
      check: 'v1.0.0 のリリースがあること',
      hints: ['gh release create v1.0.0 -t "初回リリース"'],
      solution: ['gh release create v1.0.0 -t "初回リリース"'],
      assert: ({ shell }) => (shell.repo?.releases ?? []).some((r) => r.tag === 'v1.0.0'),
      diagnose: ({ shell }) =>
        shell.git?.refs.has('refs/tags/v1.0.0') === true
          ? null
          : 'まだタグがありません。git tag -a v1.0.0 -m "..." を先に実行してください。',
      explain:
        'タグは git の中の話、リリースは GitHub の中の話。同じ名前で繋がっているだけで、別のものを指している。',
    },
  ],
};
