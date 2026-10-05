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
    expect(run('git switch -c feature').out).toBe("Switched to a new branch 'feature'\n");
  });

  it('無いブランチには切り替えられない', () => {
    expect(run('git switch nope').code).toBe(128);
  });

  it('reflog に移動が残る', () => {
    run('git switch -c topic');
    expect(run('git reflog').out).toContain('checkout: moving to topic');
  });

  it('別の枝で記録してから戻ると、索引（index）も戻った枝の内容に揃い、変更は無い', () => {
    run('git switch -c topic');
    run('echo changed > a.txt');
    run('git commit -am "topic"');
    run('git switch main');
    expect(run('git status').out).toContain('nothing to commit, working tree clean');
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

describe('git show', () => {
  beforeEach(() => {
    run('git init');
    run('git add .');
    run('git commit -m "first"');
  });

  it('最初のコミットは、全部のファイルを足した差分として出る', () => {
    const r = run('git show');
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/^commit [0-9a-f]{40}\n/);
    expect(r.out).toContain('    first');
    expect(r.out).toContain('diff --git a/a.txt b/a.txt');
    expect(r.out).toContain('--- /dev/null');
    expect(r.out).toContain('+A');
  });

  it('ハッシュを指すと、そのコミットの1つ前からの差分だけが出る', () => {
    const first = run('git rev-parse HEAD').out.trim();
    run('echo B > a.txt');
    run('git add a.txt');
    run('git commit -m "second"');
    const second = run('git show HEAD').out;
    expect(second).toContain('-A');
    expect(second).toContain('+B');
    expect(second).not.toContain('src/main.ts');
    expect(run(`git show ${first.slice(0, 7)}`).out).toContain('    first');
  });

  it('無いものを指すと本物と同じく断る', () => {
    const r = run('git show nope');
    expect(r.code).toBe(128);
    expect(r.err).toContain("ambiguous argument 'nope'");
  });
});

describe('記録の日付と作者（本物の git の表示と環境変数）', () => {
  beforeEach(() => {
    run('git init');
  });

  it('日付は機械の時刻で、本物と同じ形で出る', () => {
    run('git add a.txt');
    run('git commit -m "first"');
    expect(run('git log').out).toMatch(/Date: {3}Sat Oct 3 09:00:\d\d 2026 \+0900\n/);
    expect(run('git show HEAD').out).toMatch(/Date: {3}Sat Oct 3 09:00:\d\d 2026 \+0900\n/);
  });

  it('GIT_AUTHOR_NAME・GIT_AUTHOR_EMAIL・GIT_AUTHOR_DATE の記録は、その作者と日付で残り、log はそれぞれの作者を出す', () => {
    run('export GIT_AUTHOR_NAME=Tanaka GIT_AUTHOR_EMAIL=tanaka@city.example GIT_AUTHOR_DATE="2026-09-29 14:30"');
    run('git add a.txt');
    run('git commit -m "first"');
    run('unset GIT_AUTHOR_NAME GIT_AUTHOR_EMAIL GIT_AUTHOR_DATE');
    run('echo B > a.txt');
    run('git commit -am "second"');
    const out = run('git log').out;
    expect(out).toMatch(/Author: Learner <learner@example\.com>\nDate: {3}Sat Oct 3 09:00:\d\d 2026 \+0900\n\n {4}second/);
    expect(out).toContain('Author: Tanaka <tanaka@city.example>\nDate:   Tue Sep 29 14:30:00 2026 +0900\n\n    first');
  });

  it('最初の記録は (root-commit) と出る。2 件目からは出ない', () => {
    run('git add a.txt');
    expect(run('git commit -m "first"').out).toMatch(/^\[main \(root-commit\) [0-9a-f]{7}\] first\n/);
    run('echo B > a.txt');
    expect(run('git commit -am "second"').out).toMatch(/^\[main [0-9a-f]{7}\] second\n/);
  });

  it('add していないファイルだけがある時の commit は、本物と同じく「untracked files present」と言う', () => {
    const r = run('git commit -m "x"');
    expect(r.code).toBe(1);
    expect(r.out + r.err).toContain('nothing added to commit but untracked files present (use "git add" to track)');
  });
});

describe('commit -a', () => {
  it('追跡しているファイルの変更だけを記録し、追跡していない新しいファイルは記録しない（本物と同じ）', () => {
    run('git init');
    run('git add a.txt');
    run('git commit -m "first"');
    run('echo B > a.txt');
    run('echo memo > memo.txt');
    run('git commit -am "second"');
    expect(run('git show --stat HEAD').out + run('git ls-files').out).not.toContain('memo.txt');
    expect(run('git status').out).toContain('Untracked files');
    expect(run('git status').out).toContain('memo.txt');
  });
});

describe('選ばずに commit した時の文（本物と同じ）', () => {
  it('追跡しているファイルを直しただけで commit すると「no changes added to commit」', () => {
    run('git init');
    run('git add a.txt');
    run('git commit -m "first"');
    run('echo B > a.txt');
    const r = run('git commit -m "x"');
    expect(r.code).toBe(1);
    expect(r.out).toContain('no changes added to commit (use "git add" and/or "git commit -a")');
  });
});

describe('差分と履歴の表示（本物と同じ形）', () => {
  beforeEach(() => {
    run('git init');
    run('export GIT_AUTHOR_NAME=Tanaka GIT_AUTHOR_EMAIL=tanaka@city.example GIT_AUTHOR_DATE="2026-09-30 10:00"');
    run('git add a.txt');
    run('git commit -m "first"');
    run('export GIT_AUTHOR_NAME=Sato GIT_AUTHOR_EMAIL=sato@city.example GIT_AUTHOR_DATE="2026-10-02 18:00"');
    run('echo B >> a.txt');
    run('git commit -am "second"');
    run('unset GIT_AUTHOR_NAME GIT_AUTHOR_EMAIL GIT_AUTHOR_DATE');
  });

  it('git diff は diff --git の行から始まり、ファイル末尾の改行を空の行として数えない。1 行のハンクは数を省く', () => {
    run('echo C >> a.txt');
    expect(run('git diff').out).toBe('diff --git a/a.txt b/a.txt\n--- a/a.txt\n+++ b/a.txt\n@@ -1,2 +1,3 @@\n A\n B\n+C\n');
    run('git add a.txt');
    expect(run('git diff').out).toBe('');
    expect(run('git diff --staged').out).toBe('diff --git a/a.txt b/a.txt\n--- a/a.txt\n+++ b/a.txt\n@@ -1,2 +1,3 @@\n A\n B\n+C\n');
  });

  it('git show は HEAD~1 のような親をたどる書き方も受ける', () => {
    const out = run('git show HEAD~1').out;
    expect(out).toContain('    first');
    expect(out).toContain('+A\n');
    expect(out).toContain('@@ -0,0 +1 @@');
  });

  it('git log は -1・-n 2・-p・--author・--since・--until を受ける', () => {
    expect(run('git log --oneline -1').out.trim().split('\n')).toHaveLength(1);
    expect(run('git log --oneline -n 2').out.trim().split('\n')).toHaveLength(2);
    expect(run('git log -p -1').out).toContain('diff --git a/a.txt b/a.txt');
    expect(run('git log --oneline --author=Tanaka').out).toMatch(/^[0-9a-f]{7} first\n$/);
    // 機械の今は 2026-10-03 09:00。yesterday は 24 時間前から
    expect(run('git log --oneline --since=yesterday').out).toMatch(/^[0-9a-f]{7} \(HEAD -> main\) second\n$/);
    expect(run('git log --oneline --since="2026-10-01"').out).toMatch(/^[0-9a-f]{7} \(HEAD -> main\) second\n$/);
    expect(run('git log --oneline --until="2026-10-01"').out).toMatch(/^[0-9a-f]{7} first\n$/);
    expect(run('git log --oneline --since="3 days ago"').out.trim().split('\n')).toHaveLength(2);
  });
});

describe('枝の見え方（本物と同じ）', () => {
  beforeEach(() => {
    run('git init');
    run('git add a.txt');
    run('git commit -m "first"');
  });

  it('git log は、枝の先に (HEAD -> 今の枝, ほかの枝) の印を付ける。--all は全ての枝の記録を出す', () => {
    run('git switch -c feature');
    run('echo B >> a.txt');
    run('git commit -am "second"');
    expect(run('git log --oneline').out).toMatch(/^[0-9a-f]{7} \(HEAD -> feature\) second\n[0-9a-f]{7} \(main\) first\n$/);
    expect(run('git log').out).toMatch(/^commit [0-9a-f]{40} \(HEAD -> feature\)\n/);
    run('git switch main');
    expect(run('git log --oneline').out).toMatch(/^[0-9a-f]{7} \(HEAD -> main\) first\n$/);
    expect(run('git log --oneline --all').out).toMatch(/^[0-9a-f]{7} \(feature\) second\n[0-9a-f]{7} \(HEAD -> main\) first\n$/);
  });

  it('git branch -v は、枝ごとに先の記録の番号と説明を出す', () => {
    run('git branch feature');
    expect(run('git branch -v').out).toMatch(/^ {2}feature [0-9a-f]{7} first\n\* main {4}[0-9a-f]{7} first\n$/);
  });

  it('git status は、選んでいない変更だけの時に「no changes added to commit」で終わる', () => {
    run('echo B >> a.txt');
    expect(run('git status').out).toMatch(/no changes added to commit \(use "git add" and\/or "git commit -a"\)\n$/);
  });
});
