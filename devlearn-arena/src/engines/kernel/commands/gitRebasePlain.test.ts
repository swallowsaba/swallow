import { describe, expect, it } from 'vitest';
import { initialShell } from '@/engines/environments';
import { gitHolds } from '@/engines/git/check';
import { createClock } from '../clock';
import { createDefaultRegistry } from '.';
import type { ShellState } from '../registry';
import { execute } from '../shell';

/**
 * main と feature が分かれた所。feature は「決まりを書く」（別のファイル）と「雨の日は休み」（boat.txt の 1 行目）、
 * main は「夏は 17 時まで」（boat.txt の 1 行目）を記録している
 */
function machine(conflict = true) {
  let shell: ShellState = initialShell('linux-basic', {
    cwd: '/home/learner/boat',
    dirs: ['/home/learner/boat'],
    run: [
      'git init',
      'export GIT_AUTHOR_NAME=Tanaka GIT_AUTHOR_EMAIL=tanaka@city.example GIT_AUTHOR_DATE="2026-09-25 10:00"',
      "printf 'ボート: 10:00-16:00\\n料金: 500 円\\n' > boat.txt",
      'git add boat.txt',
      'git commit -m "ボート乗り場を作る"',
      'git switch -c feature',
      'export GIT_AUTHOR_NAME=Learner GIT_AUTHOR_EMAIL=learner@example.com GIT_AUTHOR_DATE="2026-09-28 10:00"',
      "echo '1 回 30 分まで' > rules.txt",
      'git add rules.txt',
      'git commit -m "決まりを書く"',
      conflict ? "printf 'ボート: 10:00-16:00（雨の日は休み）\\n料金: 500 円\\n' > boat.txt" : "printf 'ボート: 10:00-16:00\\n料金: 600 円\\n' > boat.txt",
      'git commit -am "雨の日は休みにする"',
      'git switch main',
      'export GIT_AUTHOR_NAME=Sato GIT_AUTHOR_EMAIL=sato@city.example GIT_AUTHOR_DATE="2026-10-01 10:00"',
      "printf 'ボート: 10:00-17:00\\n料金: 500 円\\n' > boat.txt",
      'git commit -am "夏は 17 時まで開ける"',
      'git switch feature',
      'unset GIT_AUTHOR_NAME GIT_AUTHOR_EMAIL GIT_AUTHOR_DATE',
    ],
  });
  const registry = createDefaultRegistry();
  const clock = createClock();
  const run = (line: string): { out: string; err: string; all: string; code: number } => {
    const o = execute(shell, line, registry, clock);
    shell = o.state;
    const pick = (s: 'stdout' | 'stderr') => o.chunks.filter((c) => c.stream === s).map((c) => c.text).join('');
    return { out: pick('stdout'), err: pick('stderr'), all: o.chunks.map((c) => c.text).join(''), code: o.exitCode };
  };
  const holds = (expr: string): boolean => gitHolds(shell.git, shell.vfs, expr);
  return { run, holds };
}

describe('git rebase（台本を使わない載せ替え）', () => {
  it('同じ行の変更で止まり、本物と同じ言い方で、解いて続ける・飛ばす・やめるを示す。前の記録は載せ替え済み', () => {
    const m = machine();
    const r = m.run('git rebase main');
    expect(r.code).toBe(1);
    expect(r.all).toMatch(/^Auto-merging boat\.txt\nCONFLICT \(content\): Merge conflict in boat\.txt\nerror: could not apply [0-9a-f]{7}\.\.\. 雨の日は休みにする\n/);
    expect(r.all).toContain('hint: Resolve all conflicts manually, mark them as resolved with');
    expect(r.all).toContain('hint: "git add/rm <conflicted_files>", then run "git rebase --continue".');
    expect(r.all).toContain('run "git rebase --abort".');
    expect(m.run('cat boat.txt').out).toMatch(/^<<<<<<< HEAD\nボート: 10:00-17:00\n=======\nボート: 10:00-16:00（雨の日は休み）\n>>>>>>> [0-9a-f]{7} \(雨の日は休みにする\)\n料金: 500 円\n$/);
    expect(m.run('cat rules.txt').out).toBe('1 回 30 分まで\n');
    const st = m.run('git status').out;
    expect(st).toMatch(/You are currently rebasing branch 'feature' on '[0-9a-f]{7}'\./);
    expect(st).toContain('(fix conflicts and then run "git rebase --continue")');
    expect(st).toContain('both modified:   boat.txt');
    expect(m.holds('on:feature')).toBe(false);
  });

  it('add する前の --continue は断り、解いて add すれば続きを流して枝を進める。履歴は一直線になり、記録の番号は変わる', () => {
    const m = machine();
    const before = m.run('git log --oneline -2').out;
    m.run('git rebase main');
    const early = m.run('git rebase --continue');
    expect(early.code).toBe(1);
    expect(early.err).toContain('you must edit all merge conflicts and then mark them as resolved using git add');
    m.run("printf 'ボート: 10:00-17:00（雨の日は休み）\\n料金: 500 円\\n' > boat.txt");
    m.run('git add boat.txt');
    expect(m.run('git status').out).toContain('all conflicts fixed: run "git rebase --continue"');
    const done = m.run('git rebase --continue');
    expect(done.code).toBe(0);
    expect(done.out).toContain('Successfully rebased and updated refs/heads/feature.');
    expect(m.run('git log --oneline').out).toMatch(/^[0-9a-f]{7} \(HEAD -> feature\) 雨の日は休みにする\n[0-9a-f]{7} 決まりを書く\n[0-9a-f]{7} \(main\) 夏は 17 時まで開ける\n[0-9a-f]{7} ボート乗り場を作る\n$/);
    const after = m.run('git log --oneline -2').out;
    expect(after.slice(0, 7)).not.toBe(before.slice(0, 7));
    // 作者と説明は元の記録のまま
    expect(m.run('git log -1').out).toContain('Author: Learner <learner@example.com>');
    expect(m.holds('on:feature branch:main merged-into:feature linear clean')).toBe(true);
    expect(m.run('cat boat.txt').out).toBe('ボート: 10:00-17:00（雨の日は休み）\n料金: 500 円\n');
  });

  it('--abort は載せ替える前の枝とファイルに戻す', () => {
    const m = machine();
    const before = m.run('git log --oneline').out;
    m.run('git rebase main');
    expect(m.run('git rebase --abort').code).toBe(0);
    expect(m.run('git log --oneline').out).toBe(before);
    expect(m.run('cat boat.txt').out).toBe('ボート: 10:00-16:00（雨の日は休み）\n料金: 500 円\n');
    expect(m.holds('on:feature clean')).toBe(true);
    expect(m.run('git rebase --continue').err).toContain('No rebase in progress?');
  });

  it('別の行の変更なら止まらずに載せ替え、合流の記録の無い一直線の履歴になる', () => {
    const m = machine(false);
    expect(m.holds('linear')).toBe(true);
    const r = m.run('git rebase main');
    expect(r.code).toBe(0);
    expect(r.out).toBe('Successfully rebased and updated refs/heads/feature.\n');
    expect(m.run('cat boat.txt').out).toBe('ボート: 10:00-17:00\n料金: 600 円\n');
    expect(m.holds('branch:main merged-into:feature linear')).toBe(true);
    expect(m.run('git rebase main').out).toBe('Current branch feature is up to date.\n');
  });

  it('linear は、合流の記録（親が 2 つ）があれば満たさない', () => {
    const m = machine(false);
    m.run('git merge main');
    expect(m.holds('branch:main merged-into:feature')).toBe(true);
    expect(m.holds('linear')).toBe(false);
  });
});
