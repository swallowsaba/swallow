import { describe, expect, it } from 'vitest';
import { createDefaultRegistry } from '@/engines/kernel/commands';
import { createClock } from '@/engines/kernel/clock';
import { createShellState } from '@/engines/kernel/session';
import { execute } from '@/engines/kernel/shell';
import type { ShellState } from '@/engines/kernel/registry';
import { findMission } from './missions';
import { createProgress, evaluate } from './runner';

const registry = createDefaultRegistry();

/** 模範解答を流して、実際にクリアできるかを見る。落ちたらどの手順で止まったかを出す */
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

describe('Git の任務が実際に解ける', () => {
  it('参照を付け替えて位置を示す', () => {
    expectCleared('git/01/refs-head', [
      'git init',
      'git add .',
      'git commit -m "first"',
      'git tag v0.1.0',
      'git tag -a v1.0.0 -m "最初のリリース"',
      'git rev-parse v0.1.0 v1.0.0',
    ]);
  });

  it('3面を動かして status を読む', () => {
    expectCleared('git/02/three-trees', [
      'git init',
      'git add app.ts notes.md',
      'git commit -m "base"',
      'echo "export const version = 2;" > app.ts',
      'git add app.ts',
      'git restore --staged app.ts',
    ]);
  });

  it('直前のコミットを作り直す', () => {
    expectCleared('git/03/amend', [
      'git init',
      'git add index.html',
      'git commit -m "ページを追加"',
      'git add style.css',
      'git commit --amend -m "ページを追加"',
    ]);
  });

  it('台本を書き換えて履歴を整える', () => {
    expectCleared('git/06/interactive-rebase', [
      'git init',
      'git add .',
      'git commit -m "base"',
      'git switch -c topic',
      'echo a > a.txt',
      'git add .',
      'git commit -m "wip a"',
      'echo b > b.txt',
      'git add .',
      'git commit -m "wip b"',
      'echo c > c.txt',
      'git add .',
      'git commit -m "wip c"',
      'git rebase -i main',
      'printf "pick HEAD~2 wip a\\nsquash HEAD~1 wip b\\nsquash HEAD wip c\\n" > .git/rebase-merge/git-rebase-todo',
      'git rebase --continue',
    ]);
  });

  it('消したはずのコミットを取り戻す', () => {
    const lines = [
      'git init',
      'git add .',
      'git commit -m "first"',
      'echo 大事 >> report.md',
      'git add .',
      'git commit -m "second"',
    ];
    const mission = findMission('git/07/recover-hard-reset');
    expect(mission).toBeDefined();
    // 2つ目のハッシュを控えてから壊し、reflog を見て戻す
    const clock = createClock();
    let state = createShellState(mission?.initial ?? {});
    for (const line of lines) state = execute(state, line, registry, clock).state;
    const lost = state.git?.refs.get('refs/heads/main') ?? '';
    for (const line of ['git reset --hard HEAD~1', 'git fsck', 'git reflog', `git reset --hard ${lost}`]) {
      state = execute(state, line, registry, clock).state;
    }
    expectCleared('git/07/recover-hard-reset', [
      ...lines,
      'git reset --hard HEAD~1',
      'git fsck',
      'git reflog',
      `git reset --hard ${lost}`,
    ]);
  });

  it('切り替えずに並行して作業する', () => {
    expectCleared('git/08/worktree', [
      'git init',
      'git add .',
      'git commit -m "base"',
      'git branch hotfix',
      'git worktree add /tmp/hotfix hotfix',
      'git sparse-checkout set src',
      'git ls-files',
    ]);
  });

  it('別のリポジトリを1点で参照する', () => {
    expectCleared('git/08/submodule', [
      'git init',
      'git add .',
      'git commit -m "first"',
      'git remote add lib https://example.invalid/lib.git',
      'git push lib main',
      'git submodule add https://example.invalid/lib.git vendor/lib',
      'cat .gitmodules',
    ]);
  });

  it('リモートと食い違った', () => {
    expectCleared('git/09/boss-diverged', [
      'git init',
      'git add .',
      'git commit -m "first"',
      'git remote add origin https://example.invalid/service.git',
      'git push origin main',
      'echo "def helper(): pass" >> service.py',
      'git add .',
      'git commit -m "helper"',
      'echo "def helper(): return 2" > service.py',
      'git add .',
      'git commit --amend -m "helper v2"',
      'git push origin main --force-with-lease',
    ]);
  });

  it('リポジトリが太る理由を数える', () => {
    expectCleared('git/11/gc-packfile', [
      'git init',
      'git add .',
      'git commit -m "first"',
      'git count-objects -v',
      'cp data.txt copy.txt',
      'git add .',
      'git commit -m "copy"',
      'git fsck',
    ]);
  });

  it('いつ壊れたのかを突き止める', () => {
    const id = 'git/10/boss-find-regression';
    const mission = findMission(id);
    expect(mission).toBeDefined();
    const clock = createClock();
    const timeline: ShellState[] = [createShellState(mission?.initial ?? {})];
    let progress = mission ? createProgress(mission) : null;
    const run = (line: string) => {
      const last = timeline[timeline.length - 1];
      if (!last || !mission || !progress) return '';
      const outcome = execute(last, line, registry, clock);
      timeline.push(outcome.state);
      progress = evaluate(mission, progress, timeline);
      return outcome.chunks.filter((c) => c.stream === 'stdout').map((c) => c.text).join('');
    };

    run('git init');
    for (const i of [1, 2, 3]) {
      run(`echo ok > health.txt`);
      run(`echo mark${String(i)} > f${String(i)}.txt`);
      run('git add .');
      run(`git commit -m "c${String(i)}"`);
    }
    run('echo NG > health.txt');
    run('git add .');
    run('git commit -m "c4 壊れた"');
    for (const i of [5, 6]) {
      run(`echo mark${String(i)} > f${String(i)}.txt`);
      run('git add .');
      run(`git commit -m "c${String(i)}"`);
    }

    const entries = run('git log --oneline').trim().split('\n');
    const oldest = entries[entries.length - 1]?.split(' ')[0] ?? '';
    run('git bisect start');
    run('git bisect bad HEAD');
    run(`git bisect good ${oldest}`);
    for (let i = 0; i < 8; i += 1) {
      const health = run('cat health.txt');
      const verdict = health.includes('NG') ? 'bad' : 'good';
      const out = run(`git bisect ${verdict}`);
      if (out.includes('is the first bad commit')) break;
      if (out.includes('status:')) break;
    }
    run('git bisect reset');
    run('echo "grep -q NG health.txt && exit 1" > .git/hooks/pre-commit');

    expect(progress?.cleared, `手順 ${String((progress?.stepIndex ?? 0) + 1)} で止まりました`).toBe(true);
  });
});
