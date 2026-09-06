import { beforeEach, describe, expect, it } from 'vitest';
import { createVfs, remove, writeFile, type VfsState } from '@/engines/kernel/vfs';
import { hashBlob } from './objects';
import {
  addPaths, branches, commit, createBranch, headCommit, initRepository, log, materialize,
  status, switchBranch, treeFiles, walkWorktree,
} from './repository';
import type { GitState } from './types';

const ROOT = '/home/learner/proj';
let vfs: VfsState;
let git: GitState;

beforeEach(() => {
  vfs = createVfs({
    [ROOT]: null,
    [`${ROOT}/a.txt`]: 'A\n',
    [`${ROOT}/src/main.ts`]: 'console.log(1)\n',
  });
  git = initRepository(ROOT);
});

function addAll(): void {
  git = addPaths(git, vfs, ['.']).git;
}

describe('作業ツリーの走査', () => {
  it('ルートからの相対パスで集める', () => {
    expect([...walkWorktree(vfs, ROOT).keys()].sort()).toEqual(['a.txt', 'src/main.ts']);
  });
});

describe('git add', () => {
  it('指定したファイルだけをインデックスに載せる', () => {
    const result = addPaths(git, vfs, ['a.txt']);
    expect([...result.git.index.keys()]).toEqual(['a.txt']);
    expect(result.git.index.get('a.txt')?.hash).toBe(hashBlob('A\n'));
  });

  it('ディレクトリを指定すると配下すべてが載る', () => {
    expect([...addPaths(git, vfs, ['src']).git.index.keys()]).toEqual(['src/main.ts']);
  });

  it('. で全部載る', () => {
    expect([...addPaths(git, vfs, ['.']).git.index.keys()].sort()).toEqual(['a.txt', 'src/main.ts']);
  });

  it('存在しないパスは missing に入る', () => {
    expect(addPaths(git, vfs, ['nope']).missing).toEqual(['nope']);
  });

  it('blob がオブジェクトDBに書かれる', () => {
    const result = addPaths(git, vfs, ['a.txt']);
    expect(result.git.objects.has(hashBlob('A\n'))).toBe(true);
  });
});

describe('git commit', () => {
  it('最初のコミットは親を持たない', () => {
    addAll();
    const result = commit(git, 'first', 100);
    expect(result.empty).toBe(false);
    expect(log(result.git)).toHaveLength(1);
    expect(log(result.git)[0]?.parents).toEqual([]);
  });

  it('HEAD がブランチを通してコミットを指す', () => {
    addAll();
    const result = commit(git, 'first', 100);
    expect(headCommit(result.git)).toBe(result.hash);
    expect(result.git.refs.get('refs/heads/main')).toBe(result.hash);
  });

  it('2回目のコミットは1回目を親にする', () => {
    addAll();
    const first = commit(git, 'first', 100);
    vfs = writeFile(vfs, `${ROOT}/a.txt`, 'A2\n');
    const staged = addPaths(first.git, vfs, ['a.txt']).git;
    const second = commit(staged, 'second', 200);
    expect(log(second.git).map((e) => e.message)).toEqual(['second', 'first']);
    expect(log(second.git)[0]?.parents).toEqual([first.hash]);
  });

  it('変更が無ければコミットしない', () => {
    addAll();
    const first = commit(git, 'first', 100);
    const again = commit(first.git, 'again', 200);
    expect(again.empty).toBe(true);
    expect(log(again.git)).toHaveLength(1);
  });

  it('ツリーに階層が保たれる', () => {
    addAll();
    const result = commit(git, 'first', 100);
    expect([...treeFiles(result.git, result.hash).keys()].sort()).toEqual(['a.txt', 'src/main.ts']);
  });

  it('同じ内容と同じ時刻なら同じハッシュ（決定論）', () => {
    addAll();
    const a = commit(git, 'x', 100).hash;
    const b = commit(initRepository(ROOT) as GitState, 'x', 100);
    void b;
    const again = commit(addPaths(initRepository(ROOT), vfs, ['.']).git, 'x', 100).hash;
    expect(a).toBe(again);
  });
});

describe('git status', () => {
  it('初期状態は全部が追跡外', () => {
    const report = status(git, vfs);
    expect(report.untracked.sort()).toEqual(['a.txt', 'src/main.ts']);
    expect(report.clean).toBe(false);
  });

  it('add したものは staged になる', () => {
    addAll();
    const report = status(git, vfs);
    expect(report.staged.map((e) => e.path).sort()).toEqual(['a.txt', 'src/main.ts']);
    expect(report.untracked).toEqual([]);
  });

  it('コミット直後は clean', () => {
    addAll();
    const result = commit(git, 'first', 100);
    expect(status(result.git, vfs).clean).toBe(true);
  });

  it('作業ツリーだけ変えると unstaged になる', () => {
    addAll();
    const result = commit(git, 'first', 100);
    const changed = writeFile(vfs, `${ROOT}/a.txt`, 'changed\n');
    const report = status(result.git, changed);
    expect(report.unstaged).toEqual([{ path: 'a.txt', state: 'modified' }]);
    expect(report.staged).toEqual([]);
  });

  it('ファイルを消すと unstaged の削除になる', () => {
    addAll();
    const result = commit(git, 'first', 100);
    const removed = remove(vfs, `${ROOT}/a.txt`);
    expect(status(result.git, removed).unstaged).toContainEqual({ path: 'a.txt', state: 'deleted' });
  });

  it('ブランチ名が入る', () => {
    expect(status(git, vfs).branch).toBe('main');
  });
});

describe('ブランチ', () => {
  it('コミット前は作れない', () => {
    expect(createBranch(git, 'topic').error).toBeDefined();
  });

  it('作って切り替えられる', () => {
    addAll();
    const base = commit(git, 'first', 100).git;
    const made = createBranch(base, 'topic');
    expect(made.error).toBeUndefined();
    expect(branches(made.git)).toEqual(['main', 'topic']);
    const moved = switchBranch(made.git, 'topic');
    expect(moved.git.head).toEqual({ type: 'branch', name: 'topic' });
  });

  it('同名は作れない', () => {
    addAll();
    const base = commit(git, 'first', 100).git;
    const made = createBranch(base, 'topic').git;
    expect(createBranch(made, 'topic').error).toContain('already exists');
  });

  it('無いブランチには切り替えられない', () => {
    expect(switchBranch(git, 'nope').error).toContain('invalid reference');
  });
});

describe('コミットの中身を取り出す', () => {
  it('パスと中身の対応が戻る', () => {
    addAll();
    const result = commit(git, 'first', 100);
    expect(materialize(result.git, result.hash).get('src/main.ts')).toBe('console.log(1)\n');
  });
});
