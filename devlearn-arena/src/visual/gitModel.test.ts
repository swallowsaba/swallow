import { describe, expect, it } from 'vitest';
import { createSession, type Session } from '@/engines/kernel/session';
import { execute } from '@/engines/kernel/shell';
import { fileSpots, gitChanges, NO_CHANGES, placeCommits } from './gitModel';

function start() {
  let session: Session = createSession({
    files: { '/home/learner': null, '/home/learner/a.txt': 'A\n', '/home/learner/b.txt': 'B\n' },
  });
  const sh = {
    run(line: string) {
      session = { ...session, state: execute(session.state, line, session.registry, session.clock).state };
      return sh;
    },
    get git() {
      const git = session.state.git;
      if (git === null) throw new Error('リポジトリがありません');
      return git;
    },
    get vfs() {
      return session.state.vfs;
    },
    spot(path: string) {
      return fileSpots(sh.git, sh.vfs).find((f) => f.path === path);
    },
    hash(ref: string) {
      const outcome = execute(session.state, `git rev-parse ${ref}`, session.registry, session.clock);
      return outcome.chunks.map((c) => c.text).join('').trim();
    },
  };
  return sh;
}

describe('3面のどこにファイルがいるか', () => {
  it('add で真ん中（インデックス）へ、commit で右（HEAD）へ動く', () => {
    const sh = start().run('git init');
    expect(sh.spot('a.txt')).toMatchObject({ lane: 'worktree', note: 'new' });
    sh.run('git add a.txt');
    expect(sh.spot('a.txt')).toMatchObject({ lane: 'index', note: 'new' });
    expect(sh.spot('b.txt')?.lane).toBe('worktree');
    sh.run('git commit -m first');
    expect(sh.spot('a.txt')).toMatchObject({ lane: 'head', note: 'clean' });
  });

  it('記録済みのファイルを書き換えると、また左に戻る', () => {
    const sh = start().run('git init').run('git add .').run('git commit -m first');
    sh.run('echo changed > a.txt');
    expect(sh.spot('a.txt')).toMatchObject({ lane: 'worktree', note: 'modified' });
    sh.run('git add a.txt');
    expect(sh.spot('a.txt')).toMatchObject({ lane: 'index', note: 'modified', alsoChanged: false });
    sh.run('echo again > a.txt');
    expect(sh.spot('a.txt')).toMatchObject({ lane: 'index', alsoChanged: true });
  });
});

describe('分岐は横にずれ、マージで合流する', () => {
  it('一本道なら全部が同じ列に並ぶ', () => {
    const sh = start().run('git init').run('git add .').run('git commit -m one');
    sh.run('echo 2 > a.txt').run('git add .').run('git commit -m two');
    const placed = placeCommits(sh.git);
    expect(placed.commits.map((c) => c.col)).toEqual([0, 0]);
    expect(placed.commits.map((c) => c.message)).toEqual(['two', 'one']);
  });

  it('ブランチが分かれると別の列になり、マージで1つに戻る', () => {
    const sh = start().run('git init').run('git add .').run('git commit -m base');
    sh.run('git switch -c feature').run('echo f > b.txt').run('git add .').run('git commit -m feature-work');
    sh.run('git switch main').run('echo m > a.txt').run('git add .').run('git commit -m main-work');
    const split = placeCommits(sh.git);
    const col = (msg: string) => split.commits.find((c) => c.message === msg)?.col;
    expect(col('main-work')).not.toBe(col('feature-work'));
    expect(col('base')).toBe(col('main-work'));
    expect(split.columns).toBe(2);

    sh.run('git merge feature -m merged');
    const merged = placeCommits(sh.git);
    const top = merged.commits[0];
    expect(top?.parents.length).toBe(2);
    // 合流の線は、横にずれた列から戻ってくる
    expect(merged.edges.filter((e) => e.from === top?.hash).some((e) => e.bend)).toBe(true);
    expect(merged.commits.find((c) => c.message === 'base')?.col).toBe(0);
  });

  it('子は必ず親より上の行にある', () => {
    const sh = start().run('git init').run('git add .').run('git commit -m base');
    sh.run('git switch -c x').run('echo x > b.txt').run('git add .').run('git commit -m x1');
    sh.run('git switch main').run('git merge x');
    const { commits } = placeCommits(sh.git);
    const row = new Map(commits.map((c) => [c.hash, c.row]));
    for (const c of commits) for (const p of c.parents) expect(row.get(c.hash) ?? 0).toBeLessThan(row.get(p) ?? 0);
  });

  it('ブランチの先頭しか辿れないコミットも出る（HEAD から見えなくても）', () => {
    const sh = start().run('git init').run('git add .').run('git commit -m base');
    sh.run('git switch -c side').run('echo s > b.txt').run('git add .').run('git commit -m side-only');
    sh.run('git switch main');
    expect(placeCommits(sh.git).commits.map((c) => c.message)).toContain('side-only');
    expect(sh.hash('side')).toMatch(/^[0-9a-f]{40}$/);
  });
});

describe('直前から何が変わったか', () => {
  it('新しいコミットと、指す先が変わったブランチを返す', () => {
    const sh = start().run('git init').run('git add .').run('git commit -m one');
    const before = sh.git;
    sh.run('echo 2 > a.txt').run('git add .').run('git commit -m two');
    const changes = gitChanges(before, sh.git);
    expect([...changes.newCommits]).toEqual([sh.hash('HEAD')]);
    expect([...changes.movedBranches]).toEqual(['main']);
    expect(changes.copies).toEqual([]);
  });

  it('何も変わらなければ空', () => {
    const sh = start().run('git init').run('git add .').run('git commit -m one');
    expect(gitChanges(sh.git, sh.git)).toBe(NO_CHANGES);
    expect(gitChanges(undefined, sh.git)).toBe(NO_CHANGES);
  });

  it('rebase は元のコミットを複製して新しい親にぶら下げる。元は薄く残す', () => {
    const sh = start().run('git init').run('git add .').run('git commit -m base');
    sh.run('git switch -c feature');
    sh.run('echo f1 > b.txt').run('git add .').run('git commit -m f1');
    sh.run('echo f2 > c.txt').run('git add .').run('git commit -m f2');
    sh.run('git switch main').run('echo m > a.txt').run('git add .').run('git commit -m m1');
    sh.run('git switch feature');
    const oldF1 = sh.hash('HEAD~1');
    const oldF2 = sh.hash('HEAD');
    const before = sh.git;
    sh.run('git rebase main');
    const changes = gitChanges(before, sh.git);
    // 付け直した順（f1 → f2）に、元 → 複製 の組が並ぶ
    expect(changes.copies).toEqual([
      { from: oldF1, to: sh.hash('HEAD~1') },
      { from: oldF2, to: sh.hash('HEAD') },
    ]);
    expect(changes.ghostTips).toEqual([oldF2]);

    // 図には元のコミットが「元」として残り、複製は main の上にぶら下がる
    const placed = placeCommits(sh.git, changes.ghostTips);
    const byHash = new Map(placed.commits.map((c) => [c.hash, c]));
    expect(byHash.get(oldF1)?.ghost).toBe(true);
    expect(byHash.get(oldF2)?.ghost).toBe(true);
    expect(byHash.get(sh.hash('HEAD'))?.ghost).toBe(false);
    expect(byHash.get(sh.hash('HEAD~1'))?.parents).toEqual([sh.hash('main')]);
  });
});
