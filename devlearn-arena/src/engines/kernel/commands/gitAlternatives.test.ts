import { beforeEach, describe, expect, it } from 'vitest';
import { gitHolds } from '@/engines/git/check';
import { createSession, type Session } from '../session';
import { execute } from '../shell';

/**
 * 同じ結果に至る別の正しい git の書き方（VERIFY-FREE.txt【1】）。
 * add -A・checkout <記録> -- <ファイル>・log -S・log <ファイル>・rev-list --count・diff --name-only・config --get・
 * commit --no-edit（取り込みの途中）・rebase <先> <枝>
 */

let session: Session;

function run(line: string): { out: string; err: string; code: number } {
  const outcome = execute(session.state, line, session.registry, session.clock);
  session = { ...session, state: outcome.state };
  const pick = (s: 'stdout' | 'stderr') => outcome.chunks.filter((c) => c.stream === s).map((c) => c.text).join('');
  return { out: pick('stdout'), err: pick('stderr'), code: outcome.exitCode };
}

const read = (path: string): string => {
  const node = session.state.vfs.nodes.get(path);
  return node?.kind === 'file' ? node.content : '';
};

beforeEach(() => {
  session = createSession({ files: { '/home/learner': null, '/home/learner/plan.txt': '入口: 南側\n', '/home/learner/note.txt': 'timeout=5\n' } });
  run('git init');
  run('git add .');
  run('git commit -m "最初の案"');
  run("printf '入口: 北側\\n' > plan.txt");
  run('git commit -a -m "入口を北側に移す"');
  run("printf 'timeout=3\\n' > note.txt");
  run('git commit -a -m "待ち時間を縮める"');
});

describe('履歴を読む', () => {
  it('git log <ファイル> は、そのファイルを変えた記録だけ（-p で差分も）', () => {
    const r = run('git log --oneline plan.txt');
    expect(r.code).toBe(0);
    expect(r.out).toContain('入口を北側に移す');
    expect(r.out).toContain('最初の案');
    expect(r.out).not.toContain('待ち時間を縮める');
    expect(run('git log -p plan.txt').out).toContain('+入口: 北側');
    expect(run('git log --oneline -- note.txt').out).toContain('待ち時間を縮める');
  });

  it('git log -S 文字 は、その文字の数が変わった記録だけ', () => {
    const r = run('git log -S timeout=3 --oneline');
    expect(r.code).toBe(0);
    expect(r.out.trim().split('\n')).toHaveLength(1);
    expect(r.out).toContain('待ち時間を縮める');
    expect(run("git log -S'timeout=3' --oneline").out).toContain('待ち時間を縮める');
  });

  it('git rev-list --count <枝> は、辿れる記録の数', () => {
    expect(run('git rev-list --count main')).toMatchObject({ out: '3\n', code: 0 });
    expect(run('git rev-list --count HEAD').out).toBe('3\n');
  });
});

describe('ファイルを戻す', () => {
  it('git checkout <記録> -- <ファイル> は、そのファイルだけその記録の版にする', () => {
    // 記録の短い番号（git log --oneline の一番下）で指す
    const first = run('git log --oneline').out.trim().split('\n').at(-1)?.split(' ')[0] ?? '';
    expect(run(`git checkout ${first} -- plan.txt`).code).toBe(0);
    expect(read('/home/learner/plan.txt')).toBe('入口: 南側\n');
    expect(run('git checkout HEAD~1 -- note.txt').code).toBe(0);
    expect(read('/home/learner/note.txt')).toBe('timeout=5\n');
  });
});

describe('選ぶ・記録する', () => {
  it('git add -A・--all は、変えた物も新しい物も全て選ぶ', () => {
    run('echo x > new.txt');
    run("printf '入口: 東側\\n' > plan.txt");
    expect(run('git add -A').code).toBe(0);
    expect(run('git status').out).toContain('new file:   new.txt');
    expect(run('git status').out).toContain('modified:   plan.txt');
    run('echo y > other.txt');
    expect(run('git add --all').code).toBe(0);
    expect(run('git status').out).toContain('new file:   other.txt');
  });

  it('取り込みの途中の git commit --no-edit は、既定の文で取り込みの記録を作る', () => {
    run('git switch -c feature');
    run("printf '入口: 西側\\n' > plan.txt");
    run('git commit -a -m "西側にする"');
    run('git switch main');
    run("printf '入口: 東側\\n' > plan.txt");
    run('git commit -a -m "東側にする"');
    expect(run('git merge feature').code).not.toBe(0);
    expect(run('git diff --name-only --diff-filter=U')).toMatchObject({ out: 'plan.txt\n', code: 0 });
    run("printf '入口: 東側と西側\\n' > plan.txt");
    run('git add -A');
    const r = run('git commit --no-edit');
    expect(r.code).toBe(0);
    expect(run('git log --oneline -n 1').out).toContain("Merge branch 'feature'");
    expect(gitHolds(session.state.git, session.state.vfs, 'branch:feature merged-into:main clean')).toBe(true);
  });

  it('git diff --name-only は、変えたファイルの名前だけ', () => {
    run("printf '入口: 東側\\n' > plan.txt");
    expect(run('git diff --name-only').out).toBe('plan.txt\n');
  });
});

describe('設定と載せ替え', () => {
  it('git config --get remote.origin.url・git config remote.origin.url は、送り先の住所', () => {
    const origin = session.state.git;
    expect(origin).not.toBeNull();
    run('git remote add origin https://git.city.example/park/reserve.git');
    expect(run('git config --get remote.origin.url')).toMatchObject({ out: 'https://git.city.example/park/reserve.git\n', code: 0 });
    expect(run('git config remote.origin.url').out).toBe('https://git.city.example/park/reserve.git\n');
    expect(run('git config --get remote.nothing.url').code).toBe(1);
  });

  it('git rebase <先> <枝> は、その枝に移ってから載せ替える', () => {
    run('git switch -c topic');
    run('echo t > t.txt');
    run('git add t.txt');
    run('git commit -m "topic work"');
    run('git switch main');
    run('echo m > m.txt');
    run('git add m.txt');
    run('git commit -m "main work"');
    const r = run('git rebase main topic');
    expect(r.code).toBe(0);
    const lines = run('git log --oneline').out.trim().split('\n');
    expect(lines[0]).toContain('topic work');
    expect(lines[1]).toContain('main work');
  });
});
