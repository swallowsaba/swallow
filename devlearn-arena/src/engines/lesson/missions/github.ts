import { HOME } from '@/engines/kernel/path';
import { createRepo } from '@/engines/github/pr';
import type { LessonDefinition } from '../types';

const CI_YAML = `name: CI
on:
  push:
  pull_request:
jobs:
  lint:
    name: Lint
    steps:
      - name: run eslint
        run: npm run lint
  test:
    name: Test
    steps:
      - name: run vitest
        run: npm test
  build:
    name: Build
    needs: [lint, test]
    steps:
      - name: build
        run: npm run build
`;

export const ghPullRequest: LessonDefinition = {
  id: 'github/04/boss-blocked-merge',
  track: 'github',
  kind: 'boss',
  title: 'マージできない理由を全部潰す',
  objectives: ['保護ルールの意味が分かる', 'CI の依存関係を読める', 'レビューとチェックを揃えられる'],
  parCommands: 12,
  initial: {
    repo: createRepo('acme', 'app'),
    files: {
      [HOME]: null,
      [`${HOME}/.github/workflows/ci.yml`]: CI_YAML,
    },
  },
  steps: [
    {
      prompt: 'main ブランチを保護せよ。承認を 1 件、必須チェックを Build にすること。',
      check: 'main の保護ルールがあり、承認 1 件と Build が必須になっていること',
      hints: ['gh protect main --approvals=1 --checks=Build'],
      solution: ['gh protect main --approvals=1 --checks=Build'],
      assert: ({ shell }) => {
        const rule = shell.repo?.protections.find((p) => p.branch === 'main');
        return rule !== undefined && rule.requiredApprovals >= 1 && rule.requiredChecks.includes('Build');
      },
      explain:
        '保護ルールは「人が気を付ける」を「仕組みで止める」に変える。直 push を塞ぎ、条件を満たさない限りマージさせない。',
    },
    {
      prompt: 'feature ブランチから Pull Request を作れ。',
      check: 'open な Pull Request が1つ以上あること',
      hints: ['gh pr create -t "機能追加" -b feature'],
      solution: ['gh pr create -t "機能追加" -b feature'],
      assert: ({ shell }) => (shell.repo?.pulls.filter((p) => p.state === 'open').length ?? 0) >= 1,
      explain: 'PR は差分を出す場所ではなく、意図を伝えて合意を取る場所。',
    },
    {
      prompt: 'CI を走らせ、どのジョブが何に依存しているかを確かめよ。',
      check: 'Pull Request にチェックの結果が記録されていること',
      hints: ['gh workflow で構造が見える', 'gh pr checks 1 で実行できる'],
      solution: ['gh pr checks 1'],
      assert: ({ shell }) => (shell.repo?.pulls[0]?.checks.length ?? 0) > 0,
      explain:
        'Build は lint と test の両方に依存している。どちらかが失敗すれば Build は実行されず skipped になる。',
    },
    {
      prompt: 'すべての条件を満たして、Pull Request をマージせよ。',
      check: 'Pull Request が merged になっていること',
      hints: [
        'gh pr view 1 で、足りないものが全部出る',
        'gh pr review 1 --approve -r mentor で承認する',
        'gh pr checks 1 で Build を成功させる',
        'gh pr merge 1 --squash',
      ],
      solution: ['gh pr review 1 --approve -r mentor', 'gh pr merge 1 --squash'],
      assert: ({ shell }) => shell.repo?.pulls.some((p) => p.state === 'merged') === true,
      diagnose: ({ shell }) => {
        const repo = shell.repo;
        const pull = repo?.pulls[0];
        if (!repo || !pull) return null;
        const approvals = pull.reviews.filter((r) => r.state === 'approved').length;
        const build = pull.checks.find((c) => c.name === 'Build');
        if (approvals === 0) return 'まだ承認がありません。gh pr review 1 --approve -r mentor で承認してください。';
        if (build === undefined) return 'Build のチェックが未実行です。gh pr checks 1 を実行してください。';
        if (build.status !== 'success') return 'Build が成功していません。失敗の原因を取り除いて実行し直してください。';
        return null;
      },
      explain:
        'squash なら履歴に残るのは 1 コミット、merge ならマージコミットが増え、rebase なら載せ替えになる。' +
        'チームの読みやすさに合わせて選ぶ。',
    },
  ],
};
