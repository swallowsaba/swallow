import { describe, expect, it } from 'vitest';
import { initialShell } from '@/engines/environments';
import { createClock } from '@/engines/kernel/clock';
import { createDefaultRegistry } from '@/engines/kernel/commands';
import type { ShellState } from '@/engines/kernel/registry';
import { execute } from '@/engines/kernel/shell';
import { gitHolds } from './check';

/** main に 1 件、holiday に同じ行を変えた 1 件があるリポジトリ（setup の run で作る） */
function repo() {
  let shell: ShellState = initialShell('linux-basic', {
    cwd: '/home/learner/notice',
    dirs: ['/home/learner/notice'],
    run: [
      'git init',
      "echo '開館は 9 時' > notice.txt",
      'git add notice.txt',
      'git commit -m "お知らせを作る"',
      'git switch -c holiday',
      "echo '開館は 10 時' > notice.txt",
      'git commit -am "休日は 10 時"',
      'git switch main',
    ],
  });
  const registry = createDefaultRegistry();
  const clock = createClock();
  const run = (line: string): string => {
    const out = execute(shell, line, registry, clock);
    shell = out.state;
    return out.chunks.map((c) => c.text).join('');
  };
  const holds = (expr: string): boolean => gitHolds(shell.git, shell.vfs, expr);
  return { run, holds, shell: () => shell };
}

describe('git の達成条件（リポジトリの状態で判定する）', () => {
  it('setup の run で作った履歴から始まり、打った跡は残らない', () => {
    const r = repo();
    expect(r.shell().history).toEqual([]);
    expect(r.holds('on:main clean commits:main>=1 commits:holiday>=2 branch:holiday')).toBe(true);
    expect(r.holds('branch:holiday merged-into:main')).toBe(false);
  });

  it('記録していない変更があると clean ではない。コミットすると clean', () => {
    const r = repo();
    r.run("echo '開館は 8 時' > notice.txt");
    expect(r.holds('clean')).toBe(false);
    r.run('git commit -am "平日は 8 時"');
    expect(r.holds('clean commits:main>=2')).toBe(true);
  });

  it('衝突した統合は、印を残したままでは resolved でも clean でもない。直して記録すると取り込まれる', () => {
    const r = repo();
    r.run("echo '開館は 8 時' > notice.txt");
    r.run('git commit -am "平日は 8 時"');
    expect(r.run('git merge holiday')).toContain('CONFLICT');
    expect(r.holds('clean')).toBe(false);
    r.run('git add notice.txt');
    r.run('git commit -m "印を残したまま"');
    expect(r.holds('branch:holiday merged-into:main')).toBe(true);
    expect(r.holds('resolved')).toBe(false);
  });

  it('印を消して両方の意図を活かして記録すると、resolved で clean で、取り込まれている', () => {
    const r = repo();
    r.run("echo '開館は 8 時' > notice.txt");
    r.run('git commit -am "平日は 8 時"');
    r.run('git merge holiday');
    r.run("echo '平日は 8 時、休日は 10 時に開館' > notice.txt");
    r.run('git add notice.txt');
    r.run('git commit -m "開館の時刻をまとめる"');
    expect(r.holds('branch:holiday merged-into:main clean resolved')).toBe(true);
  });

  it('リポジトリが無ければ満たさない。知らない条件は内容の誤りとして投げる', () => {
    const shell = initialShell('linux-basic', {});
    expect(gitHolds(shell.git, shell.vfs, 'clean')).toBe(false);
    const r = repo();
    expect(() => r.holds('tagged:v1')).toThrow();
  });

  it('committed:<パス> は、今の枝の先の記録に、そのファイルが今の中身で入っている時だけ', () => {
    const r = repo();
    expect(r.holds('committed:notice.txt')).toBe(true);
    r.run("echo 'メモ' > memo.txt");
    expect(r.holds('committed:memo.txt')).toBe(false);
    r.run("echo '開館は 8 時' > notice.txt");
    expect(r.holds('committed:notice.txt')).toBe(false);
    r.run('git commit -am "平日は 8 時"');
    expect(r.holds('committed:notice.txt')).toBe(true);
    expect(r.holds('committed:memo.txt')).toBe(false);
  });

  it('先頭の ! は否定（その条件を満たさない）', () => {
    const r = repo();
    r.run("echo 'メモ' > memo.txt");
    expect(r.holds('committed:notice.txt !committed:memo.txt')).toBe(true);
    expect(r.holds('!on:main')).toBe(false);
  });
});
