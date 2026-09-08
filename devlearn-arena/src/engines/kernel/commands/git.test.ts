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

describe('リポジトリの外', () => {
  it('init 前は本物と同じエラー', () => {
    const r = run('git status');
    expect(r.err).toBe('fatal: not a git repository (or any of the parent directories): .git\n');
    expect(r.code).toBe(128);
  });

  it('init すると使えるようになる', () => {
    expect(run('git init').out).toContain('Initialized empty Git repository');
    expect(run('git status').code).toBe(0);
  });
});

describe('3面の状態が status に出る', () => {
  beforeEach(() => {
    run('git init');
  });

  it('最初は追跡外', () => {
    const out = run('git status').out;
    expect(out).toContain('On branch main');
    expect(out).toContain('Untracked files');
    expect(out).toContain('a.txt');
  });

  it('add すると staged に移る', () => {
    run('git add a.txt');
    const out = run('git status').out;
    expect(out).toContain('Changes to be committed');
    expect(out).toContain('new file:   a.txt');
  });

  it('commit すると clean になる', () => {
    run('git add .');
    expect(run('git commit -m "first"').out).toContain('] first');
    expect(run('git status').out).toContain('nothing to commit, working tree clean');
  });

  it('作業ツリーだけ変えると未ステージになる', () => {
    run('git add .');
    run('git commit -m "first"');
    run('echo changed > a.txt');
    const out = run('git status').out;
    expect(out).toContain('Changes not staged for commit');
    expect(out).toContain('modified:   a.txt');
  });

  it('存在しないパスの add はエラー', () => {
    const r = run('git add nope');
    expect(r.code).toBe(128);
    expect(r.err).toContain('did not match any files');
  });
});

describe('コミットと履歴', () => {
  beforeEach(() => {
    run('git init');
    run('git add .');
    run('git commit -m "first"');
  });

  it('log にコミットが並ぶ', () => {
    expect(run('git log --oneline').out.trim().split('\n')).toHaveLength(1);
  });

  it('2つ目のコミットが上に来る', () => {
    run('echo more > b.txt');
    run('git add b.txt');
    run('git commit -m "second"');
    const lines = run('git log --oneline').out.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('second');
    expect(lines[1]).toContain('first');
  });

  it('変更が無ければコミットしない', () => {
    const r = run('git commit -m "again"');
    expect(r.code).toBe(1);
    expect(r.out).toContain('nothing to commit');
  });

  it('メッセージが無ければ促す', () => {
    expect(run('git commit').code).toBe(1);
  });

  it('cat-file で本物と同じ中身が読める', () => {
    const hash = run('git hash-object a.txt').out.trim();
    expect(hash).toHaveLength(40);
    expect(run(`git cat-file -p ${hash}`).out).toBe('A\n');
    expect(run(`git cat-file -t ${hash}`).out).toBe('blob\n');
  });

  it('短縮ハッシュでも引ける', () => {
    const hash = run('git hash-object a.txt').out.trim();
    expect(run(`git cat-file -p ${hash.slice(0, 7)}`).out).toBe('A\n');
  });

  it('ls-files でインデックスの中身が見える', () => {
    expect(run('git ls-files').out.trim().split('\n').sort()).toEqual(['a.txt', 'src/main.ts']);
  });
});

describe('ブランチ', () => {
  beforeEach(() => {
    run('git init');
    run('git add .');
    run('git commit -m "first"');
  });

  it('一覧に現在のブランチが印付きで出る', () => {
    expect(run('git branch').out).toContain('* main');
  });

  it('作って切り替えられる', () => {
    run('git branch topic');
    expect(run('git switch topic').out).toContain("Switched to branch 'topic'");
    expect(run('git branch').out).toContain('* topic');
  });

  it('-b で作成と切り替えを同時にできる', () => {
    expect(run('git switch -c feature').out).toContain("Switched to branch 'feature'");
  });

  it('無いブランチには切り替えられない', () => {
    expect(run('git switch nope').code).toBe(128);
  });

  it('reflog に移動が残る', () => {
    run('git switch -c topic');
    expect(run('git reflog').out).toContain('checkout: moving to topic');
  });
});

describe('未知のサブコマンド', () => {
  it('本物風に断る', () => {
    run('git init');
    const r = run('git frobnicate');
    expect(r.code).toBe(1);
    expect(r.err).toContain("is not a git command");
  });
});

describe('diff / restore / reset', () => {
  beforeEach(() => {
    run('git init');
    run('git add .');
    run('git commit -m "first"');
  });

  it('作業ツリーの変更が diff に出る', () => {
    run('echo changed > a.txt');
    const out = run('git diff').out;
    expect(out).toContain('--- a/a.txt');
    expect(out).toContain('+++ b/a.txt');
    expect(out).toContain('-A');
    expect(out).toContain('+changed');
  });

  it('変更が無ければ diff は空', () => {
    expect(run('git diff').out).toBe('');
  });

  it('--staged はインデックスと HEAD の差を見る', () => {
    run('echo staged > a.txt');
    run('git add a.txt');
    expect(run('git diff').out).toBe('');
    expect(run('git diff --staged').out).toContain('+staged');
  });

  it('restore --staged でインデックスを戻せる', () => {
    run('echo x > b.txt');
    run('git add b.txt');
    expect(run('git status').out).toContain('new file:   b.txt');
    run('git restore --staged b.txt');
    expect(run('git status').out).toContain('Untracked files');
  });

  it('restore で作業ツリーを戻せる', () => {
    run('echo broken > a.txt');
    run('git restore a.txt');
    expect(run('cat a.txt').out).toBe('A\n');
  });

  it('reset --hard で1つ前に戻る', () => {
    run('echo second > b.txt');
    run('git add b.txt');
    run('git commit -m "second"');
    const first = run('git log --oneline').out.trim().split('\n')[1]?.split(' ')[0] ?? '';
    run(`git reset --hard ${first}`);
    expect(run('git log --oneline').out.trim().split('\n')).toHaveLength(1);
    expect(run('git status').out).toContain('nothing to commit');
  });

  it('reset --soft は履歴だけ戻し、インデックスは残す', () => {
    run('echo second > b.txt');
    run('git add b.txt');
    run('git commit -m "second"');
    const first = run('git log --oneline').out.trim().split('\n')[1]?.split(' ')[0] ?? '';
    run(`git reset --soft ${first}`);
    expect(run('git status').out).toContain('Changes to be committed');
  });
});

describe('merge', () => {
  beforeEach(() => {
    run('git init');
    run('git add .');
    run('git commit -m "first"');
  });

  it('分岐していなければ早送り', () => {
    run('git switch -c topic');
    run('echo topic > t.txt');
    run('git add t.txt');
    run('git commit -m "topic work"');
    run('git switch main');
    expect(run('git merge topic').out).toContain('Fast-forward');
    expect(run('git log --oneline').out).toContain('topic work');
  });

  it('別のファイルを触っていれば自動で統合できる', () => {
    run('git switch -c topic');
    run('echo t > t.txt');
    run('git add t.txt');
    run('git commit -m "topic"');
    run('git switch main');
    run('echo m > m.txt');
    run('git add m.txt');
    run('git commit -m "main"');
    const r = run('git merge topic');
    expect(r.out).toContain('Merge made');
    expect(run('cat t.txt').out).toBe('t\n');
    expect(run('cat m.txt').out).toBe('m\n');
  });

  it('同じ行を双方が変えていたら衝突マーカが入る', () => {
    run('git switch -c topic');
    run('echo THEIRS > a.txt');
    run('git add a.txt');
    run('git commit -m "topic"');
    run('git switch main');
    run('echo OURS > a.txt');
    run('git add a.txt');
    run('git commit -m "main"');
    const r = run('git merge topic');
    expect(r.code).toBe(1);
    expect(r.err).toContain('Automatic merge failed');
    const content = run('cat a.txt').out;
    expect(content).toContain('<<<<<<< HEAD');
    expect(content).toContain('OURS');
    expect(content).toContain('>>>>>>> topic');
  });

  it('すでに取り込み済みなら何もしない', () => {
    run('git switch -c topic');
    run('git switch main');
    expect(run('git merge topic').out).toContain('Already up to date.');
  });
});
