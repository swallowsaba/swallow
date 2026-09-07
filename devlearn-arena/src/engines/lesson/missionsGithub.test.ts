import { describe, expect, it } from 'vitest';
import { createDefaultRegistry } from '@/engines/kernel/commands';
import { createClock } from '@/engines/kernel/clock';
import { createShellState } from '@/engines/kernel/session';
import { execute } from '@/engines/kernel/shell';
import type { ShellState } from '@/engines/kernel/registry';
import { findMission } from './missions';
import { createProgress, evaluate } from './runner';

const registry = createDefaultRegistry();

function solve(id: string, lines: readonly string[]): { cleared: boolean; stoppedAt: number } {
  const mission = findMission(id);
  if (!mission) throw new Error(`任務が見つかりません: ${id}`);
  const clock = createClock();
  const timeline: ShellState[] = [createShellState(mission.initial)];
  let progress = createProgress(mission);
  for (const line of lines) {
    const last = timeline[timeline.length - 1];
    if (!last) break;
    timeline.push(execute(last, line, registry, clock).state);
    progress = evaluate(mission, progress, timeline);
  }
  return { cleared: progress.cleared, stoppedAt: progress.stepIndex };
}

function expectCleared(id: string, lines: readonly string[]): void {
  const result = solve(id, lines);
  expect(result.cleared, `${id} が手順 ${String(result.stoppedAt + 1)} で止まりました`).toBe(true);
}

describe('GitHub の任務が実際に解ける', () => {
  it('リモートと手元をつなぐ', () => {
    expectCleared('github/01/clone-remote', [
      'git init',
      'git add .',
      'git commit -m "first"',
      'git remote add origin https://github.com/acme/app.git',
      'git push origin main',
      'gh pr list',
    ]);
  });

  it('意図が伝わる Pull Request を出す', () => {
    expectCleared('github/02/pr-create', [
      'gh issue create -t "ログインできない"',
      'gh pr create -t "ログインを直す" -b fix --body="Closes #1"',
      'gh pr merge 1',
    ]);
  });

  it('変更した場所で、要る承認が変わる', () => {
    expectCleared('github/03/codeowners', [
      'gh codeowners load',
      'gh codeowners who docs/guide.md',
      'gh codeowners who db/schema.sql',
    ]);
  });

  it('課題を盤面で動かす', () => {
    expectCleared('github/05/projects', [
      'gh issue create -t "落ちる" -l bug',
      'gh issue create -t "遅い"',
      'gh project create Board --columns=Todo,Doing,Done',
      'gh project move Board 1 Doing',
      'gh project move Board 2 Todo',
    ]);
  });

  it('ジョブの依存を読む', () => {
    expectCleared('github/06/needs-dag', [
      'gh workflow',
      'gh pr create -t "変更" -b feature',
      'gh pr checks 1',
      'gh pr checks 1 --fail=lint',
    ]);
  });

  it('同じ手順を組み合わせで回す', () => {
    expectCleared('github/07/matrix', [
      'gh workflow',
      'gh pr create -t "多版検証" -b matrix',
      'gh pr checks 1',
      'gh pr checks 1 --fail=test:20',
    ]);
  });

  it('キャッシュ・成果物・シークレット', () => {
    expectCleared('github/07/cache-artifact', [
      'gh pr create -t "デプロイ" -b deploy',
      'gh pr checks 1',
      'gh secret set DEPLOY_TOKEN -b s3cret',
      'gh pr checks 1',
      'gh secret list',
    ]);
  });

  it('同じ手順を別のワークフローから呼ぶ', () => {
    expectCleared('github/07/reusable-workflows', [
      'gh workflow -w ci.yml',
      'gh pr create -t "共通化" -b shared',
      'gh pr checks 1 -w ci.yml',
    ]);
  });

  it('書き込み権限が無いところへ貢献する', () => {
    expectCleared('github/09/fork-flow', [
      'gh fork learner',
      'gh pr create -t "誤字を直す" -b typo-fix',
      'gh pr view 1',
    ]);
  });

  it('マージできない理由を全部潰す', () => {
    expectCleared('github/04/boss-blocked-merge', [
      'gh protect main --approvals=1 --checks=Build',
      'gh pr create -t "機能追加" -b feature',
      'gh pr checks 1',
      'gh pr review 1 --approve -r mentor',
      'gh pr merge 1 --squash',
    ]);
  });
});

describe('リリース', () => {
  it('どの版を配ったのかを残す', () => {
    expectCleared('github/08/tags-releases', [
      'gh release create v1.0.0 -t "初回リリース"',
      'git init',
      'git add .',
      'git commit -m "first"',
      'git tag -a v1.0.0 -m "初回リリース"',
      'gh release create v1.0.0 -t "初回リリース"',
    ]);
  });

  it('タグが無ければリリースは作れない', () => {
    const result = solve('github/08/tags-releases', ['gh release create v9.9.9 -t x']);
    expect(result.cleared).toBe(false);
  });
});
