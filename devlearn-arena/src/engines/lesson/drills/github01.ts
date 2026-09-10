import { createRepo } from '@/engines/github/pr';
import type { Repo } from '@/engines/github/types';
import type { AssertContext } from '../types';
import { fileContains, fileExists, type Check } from '../authoring/assert';
import type { MissionSource } from '../authoring/mission';
import { HOME, family, ghDoc } from './shared';

const PR_DOC = ghDoc('en/pull-requests/collaborating-with-pull-requests', 'Pull requests');
const ISSUE_DOC = ghDoc('en/issues/tracking-your-work-with-issues', 'Issues');
const PROTECT_DOC = ghDoc(
  'en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches',
  'About protected branches',
);
const ACTIONS_DOC = ghDoc('en/actions/writing-workflows', 'Writing workflows');

function withRepo(check: (repo: Repo, ctx: AssertContext) => boolean): Check {
  return (ctx) => {
    const repo = ctx.shell.repo;
    return repo !== null && check(repo, ctx);
  };
}

/* ------------------------------------------------------------------ *
 * github/05 Issue で仕事を並べる
 * ------------------------------------------------------------------ */

interface IssueSpec {
  slug: string;
  title: string;
  label: string;
}

const ISSUES: IssueSpec[] = [
  { slug: 'login-bug', title: 'ログインできない', label: 'bug' },
  { slug: 'slow-search', title: '検索が遅い', label: 'performance' },
  { slug: 'add-export', title: 'CSV 書き出しがほしい', label: 'enhancement' },
  { slug: 'broken-link', title: 'リンクが切れている', label: 'docs' },
  { slug: 'flaky-test', title: 'テストが不安定', label: 'flaky' },
  { slug: 'cert-expiry', title: '証明書が切れる', label: 'ops' },
  { slug: 'a11y', title: 'キーボードで操作できない', label: 'a11y' },
  { slug: 'i18n', title: '英語表示が崩れる', label: 'i18n' },
  { slug: 'oom', title: 'バッチがメモリ不足で落ちる', label: 'bug' },
  { slug: 'audit', title: '監査ログが残らない', label: 'security' },
];

const issueDrills = family<IssueSpec>({
  track: 'github',
  chapterId: 'github/05',
  family: 'issue',
  docs: [ISSUE_DOC],
  variants: ISSUES.map((value) => ({ slug: value.slug, value })),
  make: (v) => ({
    title: `「${v.title}」を Issue として立てる`,
    objectives: ['課題を起票できる', 'ラベルで分類できる', '片付いたら閉じられる'],
    initial: { repo: createRepo('acme', 'app'), files: { [HOME]: null }, cwd: HOME },
    solution: [
      `gh issue create -t "${v.title}" -l ${v.label}`,
      'gh issue close 1',
    ],
    steps: [
      {
        prompt: `「${v.title}」という Issue を、${v.label} ラベル付きで立てよ。`,
        conditions: [
          {
            label: `Issue「${v.title}」があること`,
            test: withRepo((r) => r.issues.some((i) => i.title === v.title)),
            howTo: 'gh issue create -t "<表題>"',
          },
          {
            label: `${v.label} ラベルが付いていること`,
            test: withRepo((r) => r.issues.some((i) => i.title === v.title && i.labels.includes(v.label))),
            howTo: '-l <ラベル> で付けられます。gh issue list で確かめられます',
          },
        ],
        hints: ['gh issue create -t "<表題>" -l <ラベル>', `gh issue create -t "${v.title}" -l ${v.label}`],
        explain:
          '起票は「誰かの頭の中にある問題」を、みんなが見える形にする作業。ラベルは後で絞り込むための取っ手になる。',
      },
      {
        prompt: 'その Issue を閉じよ。',
        conditions: [
          {
            label: `「${v.title}」が閉じていること`,
            test: withRepo((r) => r.issues.some((i) => i.title === v.title && i.state === 'closed')),
            howTo: 'gh issue list で番号を確かめてから閉じます',
          },
        ],
        hints: ['gh issue list で番号を見る', 'gh issue close <番号>'],
        explain:
          '閉じるのは「もう見なくてよい」の合図。放置された Issue が増えると、一覧そのものが読まれなくなる。',
      },
    ],
  }),
});

/* ------------------------------------------------------------------ *
 * github/02 Pull Request を出して通す
 * ------------------------------------------------------------------ */

interface PrSpec {
  slug: string;
  title: string;
  branch: string;
}

const PRS: PrSpec[] = [
  { slug: 'login', title: 'ログイン画面を追加', branch: 'feature/login' },
  { slug: 'search', title: '検索を速くする', branch: 'perf/search' },
  { slug: 'export', title: 'CSV 書き出し', branch: 'feature/export' },
  { slug: 'docs', title: '手順書を直す', branch: 'docs/runbook' },
  { slug: 'deps', title: '依存を更新', branch: 'chore/deps' },
  { slug: 'crash', title: '落ちる不具合を直す', branch: 'fix/crash' },
  { slug: 'a11y', title: 'キーボード操作に対応', branch: 'feature/a11y' },
  { slug: 'i18n', title: '英語表示を直す', branch: 'fix/i18n' },
];

const prDrills = family<PrSpec>({
  track: 'github',
  chapterId: 'github/02',
  family: 'pull-request',
  docs: [PR_DOC],
  variants: PRS.map((value) => ({ slug: value.slug, value })),
  make: (v) => ({
    title: `${v.branch} から Pull Request を出す`,
    objectives: ['PR を作れる', 'レビューを受けられる', 'マージできる'],
    initial: { repo: createRepo('acme', 'app'), files: { [HOME]: null }, cwd: HOME },
    solution: [
      `gh pr create -t "${v.title}" -b ${v.branch}`,
      'gh pr review 1 --approve',
      'gh pr merge 1',
    ],
    steps: [
      {
        prompt: `${v.branch} から main へ、「${v.title}」という Pull Request を作れ。`,
        conditions: [
          {
            label: `「${v.title}」の Pull Request があること`,
            test: withRepo((r) => r.pulls.some((p) => p.title === v.title)),
            howTo: 'gh pr create -t "<表題>" -b <ブランチ>',
          },
          {
            label: `元のブランチが ${v.branch} であること`,
            test: withRepo((r) => r.pulls.some((p) => p.title === v.title && p.head === v.branch)),
            howTo: '-b で元のブランチを指定します',
          },
        ],
        hints: ['gh pr create -t "<表題>" -b <ブランチ>', `gh pr create -t "${v.title}" -b ${v.branch}`],
        explain:
          'Pull Request は「この差分を取り込んでほしい」という申し込み。差分そのものより、議論の場としての役割が大きい。',
      },
      {
        prompt: 'その Pull Request を承認せよ。',
        conditions: [
          {
            label: '承認が 1 件あること',
            test: withRepo((r) => r.pulls.some((p) => p.reviews.some((rev) => rev.state === 'approved'))),
            howTo: 'gh pr review <番号> --approve',
          },
        ],
        hints: ['gh pr review 1 --approve'],
        explain: 'レビューは品質のためだけではなく、「知っている人を増やす」ためにもある。',
      },
      {
        prompt: 'マージせよ。',
        conditions: [
          {
            label: 'Pull Request が merged になっていること',
            test: withRepo((r) => r.pulls.some((p) => p.state === 'merged')),
            howTo: 'gh pr merge <番号>',
          },
        ],
        hints: ['gh pr merge 1'],
        explain: 'マージの仕方（merge / squash / rebase）で履歴の形が変わる。どれを選ぶかはチームの約束。',
      },
    ],
  }),
});

/* ------------------------------------------------------------------ *
 * github/04 ブランチ保護
 * ------------------------------------------------------------------ */

const PROTECTS: { slug: string; value: { branch: string; approvals: number; check: string } }[] = [
  { slug: 'main-1-build', value: { branch: 'main', approvals: 1, check: 'Build' } },
  { slug: 'main-2-test', value: { branch: 'main', approvals: 2, check: 'Test' } },
  { slug: 'release-1-lint', value: { branch: 'release', approvals: 1, check: 'Lint' } },
  { slug: 'develop-1-build', value: { branch: 'develop', approvals: 1, check: 'Build' } },
  { slug: 'main-2-security', value: { branch: 'main', approvals: 2, check: 'Security' } },
  { slug: 'hotfix-1-test', value: { branch: 'hotfix', approvals: 1, check: 'Test' } },
];

const protectDrills = family<{ branch: string; approvals: number; check: string }>({
  track: 'github',
  chapterId: 'github/04',
  family: 'protect',
  docs: [PROTECT_DOC],
  variants: PROTECTS,
  make: (v) => ({
    title: `${v.branch} を守る（承認 ${String(v.approvals)} 件・${v.check} 必須）`,
    objectives: ['保護ルールを置ける', '条件を満たさないとマージできないと分かる'],
    initial: { repo: createRepo('acme', 'app'), files: { [HOME]: null }, cwd: HOME },
    solution: [
      `gh protect ${v.branch} --approvals=${String(v.approvals)} --checks=${v.check}`,
    ],
    steps: [
      {
        prompt: `${v.branch} に、承認 ${String(v.approvals)} 件と ${v.check} の成功を必須とする保護を掛けよ。`,
        conditions: [
          {
            label: `${v.branch} に保護ルールがあること`,
            test: withRepo((r) => r.protections.some((p) => p.branch === v.branch)),
            howTo: 'gh protect <ブランチ> ...',
          },
          {
            label: `承認が ${String(v.approvals)} 件必要になっていること`,
            test: withRepo((r) =>
              r.protections.some((p) => p.branch === v.branch && p.requiredApprovals === v.approvals),
            ),
            howTo: `--approvals=${String(v.approvals)}`,
          },
          {
            label: `${v.check} が必須チェックに入っていること`,
            test: withRepo((r) =>
              r.protections.some((p) => p.branch === v.branch && p.requiredChecks.includes(v.check)),
            ),
            howTo: `--checks=${v.check}`,
          },
        ],
        hints: [
          'gh protect <ブランチ> --approvals=<数> --checks=<名前>',
          `gh protect ${v.branch} --approvals=${String(v.approvals)} --checks=${v.check}`,
        ],
        explain:
          '保護ルールは「人が気を付ける」を「仕組みで止める」に変える。合意した約束を、機械に守らせるための道具。',
      },
    ],
  }),
});

/* ------------------------------------------------------------------ *
 * github/06 ワークフローを書いて動かす
 * ------------------------------------------------------------------ */

interface FlowSpec {
  slug: string;
  job: string;
  step: string;
}

const FLOWS: FlowSpec[] = [
  { slug: 'build', job: 'build', step: 'npm run build' },
  { slug: 'test', job: 'test', step: 'npm test' },
  { slug: 'lint', job: 'lint', step: 'npm run lint' },
  { slug: 'typecheck', job: 'typecheck', step: 'npm run typecheck' },
  { slug: 'audit', job: 'audit', step: 'npm audit' },
  { slug: 'e2e', job: 'e2e', step: 'npm run e2e' },
];

function workflowYaml(job: string, step: string): string {
  return [
    'name: CI',
    'on: [push]',
    'jobs:',
    `  ${job}:`,
    '    runs-on: ubuntu-latest',
    '    steps:',
    `      - run: ${step}`,
    '',
  ].join('\n');
}

const flowDrills = family<FlowSpec>({
  track: 'github',
  chapterId: 'github/06',
  family: 'workflow',
  docs: [ACTIONS_DOC],
  variants: FLOWS.map((value) => ({ slug: value.slug, value })),
  make: (v) => {
    const yaml = workflowYaml(v.job, v.step);
    return {
      title: `${v.job} を走らせるワークフローを書く`,
      objectives: ['ワークフローを自分で書ける', '走らせて結果を読める'],
      initial: {
        repo: createRepo('acme', 'app'),
        files: { [HOME]: null, [`${HOME}/.github/workflows`]: null },
        cwd: HOME,
      },
      solution: [
        `cat > .github/workflows/ci.yml <<EOF\n${yaml.trimEnd()}\nEOF`,
        'gh pr create -t "CI を通す" -b feature/ci',
        'gh pr checks 1',
      ],
      steps: [
        {
          prompt: `.github/workflows/ci.yml を書け。push で起動し、${v.job} という job が ${v.step} を実行する形にすること。`,
          conditions: [
            {
              label: 'ci.yml があること',
              test: fileExists('.github/workflows/ci.yml'),
              howTo: 'ヒアドキュメント（cat > ファイル <<EOF ... EOF）でまとめて書けます',
            },
            {
              label: `job 名が ${v.job} であること`,
              test: fileContains('.github/workflows/ci.yml', `${v.job}:`),
              howTo: 'jobs: の下に job 名を書きます',
            },
            {
              label: `${v.step} を実行する step があること`,
              test: fileContains('.github/workflows/ci.yml', v.step),
              howTo: 'steps: の下に - run: <コマンド> を並べます',
            },
          ],
          hints: [
            'jobs > <job 名> > runs-on / steps という並び',
            'ヒアドキュメントなら書いた形のまま入る',
            `cat > .github/workflows/ci.yml <<EOF\n${yaml.trimEnd()}\nEOF`,
          ],
          explain:
            'ワークフローはリポジトリの中のただのファイル。だから変更履歴が残り、レビューの対象にもなる。',
        },
        {
          prompt: 'Pull Request を作り、チェックを走らせて結果を見よ。',
          conditions: [
            {
              label: 'Pull Request があること',
              test: withRepo((r) => r.pulls.length > 0),
              howTo: 'gh pr create -t "<表題>" -b <ブランチ>',
            },
            {
              label: `${v.job} のチェックが成功していること`,
              test: withRepo((r) =>
                r.pulls.some((p) => p.checks.some((c) => c.name === v.job && c.status === 'success')),
              ),
              howTo: 'gh pr checks <番号> で走らせて結果を見ます',
            },
          ],
          hints: ['gh pr create -t "CI を通す" -b feature/ci', 'gh pr checks 1'],
          explain:
            'チェックは「人が見る前に機械が見る」層。ここで落ちるものをレビューに回さないことで、人の時間を守る。',
        },
      ],
    };
  },
});

/* ------------------------------------------------------------------ *
 * github/09 秘密を安全に渡す
 * ------------------------------------------------------------------ */

const SECRETS: { slug: string; value: { name: string; value: string } }[] = [
  { slug: 'npm-token', value: { name: 'NPM_TOKEN', value: 'npm_abcdef' } },
  { slug: 'aws-key', value: { name: 'AWS_ACCESS_KEY_ID', value: 'AKIAEXAMPLE' } },
  { slug: 'slack', value: { name: 'SLACK_WEBHOOK', value: 'https://hooks.example/abc' } },
  { slug: 'registry', value: { name: 'REGISTRY_PASSWORD', value: 'hunter2' } },
  { slug: 'signing', value: { name: 'SIGNING_KEY', value: 'key-material' } },
  { slug: 'deploy', value: { name: 'DEPLOY_TOKEN', value: 'dep_123456' } },
];

const secretDrills = family<{ name: string; value: string }>({
  track: 'github',
  chapterId: 'github/09',
  family: 'secret',
  docs: [ghDoc('en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions', 'Using secrets')],
  variants: SECRETS,
  make: (v) => ({
    title: `${v.name} を秘密として登録する`,
    objectives: ['秘密を置ける', 'ログに出ないことを確かめられる'],
    initial: { repo: createRepo('acme', 'app'), files: { [HOME]: null }, cwd: HOME },
    solution: [`gh secret set ${v.name} --body=${v.value}`],
    steps: [
      {
        prompt: `${v.name} という名前で秘密を登録せよ。`,
        conditions: [
          {
            label: `${v.name} が登録されていること`,
            test: withRepo((r) => r.secrets[v.name] !== undefined),
            howTo: 'gh secret set <名前> --body=<値>',
          },
        ],
        hints: ['gh secret set <名前> --body=<値>', `gh secret set ${v.name} --body=${v.value}`],
        explain:
          '秘密は値そのものを見せずに使う。ワークフローのログでは伏せ字になるので、うっかり出力しても漏れにくい。ただし工夫すれば漏らせるので、権限は最小にする。',
      },
    ],
  }),
});

export function github01(): MissionSource[] {
  return [...issueDrills, ...prDrills, ...protectDrills, ...flowDrills, ...secretDrills];
}
