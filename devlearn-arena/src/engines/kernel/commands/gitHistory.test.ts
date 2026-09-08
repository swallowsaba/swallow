import { beforeEach, describe, expect, it } from 'vitest';
import { createSession, type Session } from '../session';
import { execute } from '../shell';

let session: Session;

beforeEach(() => {
  session = createSession({
    files: {
      '/home/learner': null,
      '/home/learner/a.txt': 'A\n',
      '/home/learner/src/main.ts': 'console.log(1)\n',
    },
  });
});

function run(line: string): { out: string; err: string; code: number } {
  const outcome = execute(session.state, line, session.registry, session.clock);
  session = { ...session, state: outcome.state };
  const pick = (s: 'stdout' | 'stderr') =>
    outcome.chunks.filter((c) => c.stream === s).map((c) => c.text).join('');
  return { out: pick('stdout'), err: pick('stderr'), code: outcome.exitCode };
}

describe('履歴の作り直し', () => {
  beforeEach(() => {
    run('git init');
    run('git add .');
    run('git commit -m "base"');
  });

  it('rebase で分岐したコミットが載せ替わる', () => {
    run('git switch -c topic');
    run('echo t > t.txt');
    run('git add t.txt');
    run('git commit -m "topic work"');
    run('git switch main');
    run('echo m > m.txt');
    run('git add m.txt');
    run('git commit -m "main work"');
    run('git switch topic');
    const r = run('git rebase main');
    expect(r.code).toBe(0);
    const lines = run('git log --oneline').out.trim().split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('topic work');
    expect(lines[1]).toContain('main work');
  });

  it('進んでいなければ何もしない', () => {
    run('git switch -c topic');
    expect(run('git rebase main').out).toContain('up to date');
  });

  it('cherry-pick で別ブランチの1つを取り込める', () => {
    run('git switch -c topic');
    run('echo t > t.txt');
    run('git add t.txt');
    run('git commit -m "pick me"');
    const hash = run('git log --oneline').out.trim().split(' ')[0] ?? '';
    run('git switch main');
    run(`git cherry-pick ${hash}`);
    expect(run('cat t.txt').out).toBe('t\n');
    expect(run('git log --oneline').out).toContain('pick me');
  });

  it('revert で打ち消しコミットができる', () => {
    run('echo added > new.txt');
    run('git add new.txt');
    run('git commit -m "add new"');
    const hash = run('git log --oneline').out.trim().split('\n')[0]?.split(' ')[0] ?? '';
    run(`git revert ${hash}`);
    expect(run('git log --oneline').out).toContain('Revert');
    expect(run('cat new.txt').code).toBe(1);
  });

  it('stash で退避して戻せる', () => {
    run('echo wip > a.txt');
    expect(run('git stash').out).toContain('Saved');
    expect(run('cat a.txt').out).toBe('A\n');
    expect(run('git stash list').out).toContain('WIP on main');
    run('git stash pop');
    expect(run('cat a.txt').out).toBe('wip\n');
  });

  it('退避が無ければ pop できない', () => {
    expect(run('git stash pop').code).toBe(1);
  });
});

describe('リモート', () => {
  beforeEach(() => {
    run('git init');
    run('git add .');
    run('git commit -m "first"');
    run('git remote add origin https://example.invalid/demo.git');
  });

  it('remote -v に登録が出る', () => {
    const out = run('git remote -v').out;
    expect(out).toContain('origin');
    expect(out).toContain('(push)');
  });

  it('同じ名前は登録できない', () => {
    expect(run('git remote add origin x').code).toBe(3);
  });

  it('push すると追跡参照が進む', () => {
    expect(run('git push origin main').out).toContain('main -> main');
    expect(run('git status').out).not.toContain('ahead');
  });

  it('push 前は ahead と出る', () => {
    run('git push origin main');
    run('echo more > c.txt');
    run('git add c.txt');
    run('git commit -m "second"');
    expect(run('git status').out).toContain("ahead of 'origin/main' by 1");
  });

  it('存在しないリモートには push できない', () => {
    expect(run('git push upstream main').code).toBe(128);
  });

  it('fetch は同じ内容なら何も出さない', () => {
    run('git push origin main');
    expect(run('git fetch origin').out).toBe('');
  });

  it('pull は取り込むものが無ければそう言う', () => {
    run('git push origin main');
    expect(run('git pull origin main').out).toContain('Already up to date.');
  });
});

describe('衝突の解決とマージコミット', () => {
  beforeEach(() => {
    run('git init');
    run('printf "l1\\nl2\\nl3\\n" > m.txt');
    run('git add m.txt');
    run('git commit -m "base"');
    run('git switch -c topic');
    run('printf "l1\\nTHEIRS\\nl3\\n" > m.txt');
    run('git add m.txt');
    run('git commit -m "topic"');
    run('git switch main');
    run('printf "l1\\nOURS\\nl3\\n" > m.txt');
    run('git add m.txt');
    run('git commit -m "main"');
  });

  it('衝突しても、衝突していない行は残る', () => {
    run('git merge topic');
    const content = run('cat m.txt').out;
    expect(content).toContain('l1');
    expect(content).toContain('l3');
    expect(content).toContain('<<<<<<< HEAD');
  });

  it('status が未解決であることを伝える', () => {
    run('git merge topic');
    expect(run('git status').out).toContain('You have unmerged paths.');
  });

  it('解決してコミットするとマージコミットになる', () => {
    run('git merge topic');
    run('printf "l1\\nRESOLVED\\nl3\\n" > m.txt');
    run('git add m.txt');
    run('git commit -m "resolve"');
    const entries = run('git log --oneline').out.trim().split('\n');
    // base / topic / main / resolve の 4 つが見える
    expect(entries).toHaveLength(4);
    expect(run('git status').out).not.toContain('unmerged');
  });

  it('reset すると途中のマージは畳まれる', () => {
    run('git merge topic');
    run('git reset --hard HEAD');
    expect(run('git status').out).not.toContain('unmerged');
  });
});
