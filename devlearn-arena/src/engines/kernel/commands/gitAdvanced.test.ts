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
      '/home/learner/docs/guide.md': '# guide\n',
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

function commitAll(message: string) {
  run('git add .');
  run(`git commit -m "${message}"`);
}

function history(): string[] {
  return run('git log --oneline').out.trim().split('\n').filter((l) => l !== '');
}

describe('タグ', () => {
  beforeEach(() => {
    run('git init');
    commitAll('first');
  });

  it('軽量タグは参照が増えるだけ', () => {
    run('git tag v1.0.0');
    expect(run('git tag').out).toBe('v1.0.0\n');
    const objects = run('git cat-file -t v1.0.0').out;
    expect(objects).toBe('commit\n');
  });

  it('注釈付きタグは tag オブジェクトを1つ作る', () => {
    run('git tag -a v1.1.0 -m "最初のリリース"');
    expect(run('git cat-file -t v1.1.0').out).toBe('tag\n');
    expect(run('git tag -n').out).toContain('最初のリリース');
  });

  it('注釈付きタグでも rev-parse はコミットまで剥がす', () => {
    run('git tag -a v1.1.0 -m "release"');
    const head = run('git rev-parse HEAD').out.trim();
    expect(run('git rev-parse v1.1.0').out.trim()).toBe(head);
  });

  it('同じ名前は上書きしない', () => {
    run('git tag v1');
    expect(run('git tag v1').code).toBe(128);
    expect(run('git tag -f v1').code).toBe(0);
  });

  it('消せる', () => {
    run('git tag v1');
    expect(run('git tag -d v1').out).toContain('Deleted tag');
    expect(run('git tag').out).toBe('');
  });
});

describe('rev-parse', () => {
  beforeEach(() => {
    run('git init');
    commitAll('first');
    run('echo b > b.txt');
    commitAll('second');
  });

  it('HEAD~1 は1つ前を指す', () => {
    const entries = history();
    const parent = entries[1]?.split(' ')[0] ?? '';
    expect(run('git rev-parse HEAD~1').out.trim().startsWith(parent)).toBe(true);
  });

  it('HEAD@{n} は reflog をたどる。reset で消したコミットにも戻れる', () => {
    const lost = run('git rev-parse HEAD').out.trim();
    run('git reset --hard HEAD~1');
    expect(run('git rev-parse HEAD@{1}').out.trim()).toBe(lost);
    run('git reset --hard HEAD@{1}');
    expect(run('git rev-parse HEAD').out.trim()).toBe(lost);
  });

  it('存在しない参照は 128', () => {
    expect(run('git rev-parse nope').code).toBe(128);
  });
});

describe('bisect', () => {
  beforeEach(() => {
    run('git init');
    run('echo ok > app.txt');
    commitAll('c1');
    run('echo ok > f2.txt');
    commitAll('c2');
    run('echo BROKEN > app.txt');
    commitAll('c3 壊れた');
    run('echo ok > f4.txt');
    commitAll('c4');
  });

  it('start してから good と bad を指定すると、間を調べに行く', () => {
    const entries = history();
    const oldest = entries[entries.length - 1]?.split(' ')[0] ?? '';
    run('git bisect start');
    run('git bisect bad HEAD');
    const out = run(`git bisect good ${oldest}`).out;
    expect(out).toContain('revisions left to test');
  });

  it('二分して犯人にたどり着ける', () => {
    const entries = history();
    const oldest = entries[entries.length - 1]?.split(' ')[0] ?? '';
    run('git bisect start');
    run('git bisect bad HEAD');
    run(`git bisect good ${oldest}`);

    // 「app.txt が BROKEN なら悪い」を機械的に適用する
    for (let i = 0; i < 6; i += 1) {
      const status = run('git bisect status').out;
      if (status.includes('残り候補 0 件')) break;
      const broken = run('cat app.txt').out.includes('BROKEN');
      const result = run(`git bisect ${broken ? 'bad' : 'good'}`);
      if (result.out.includes('is the first bad commit')) break;
    }
    const culprit = run('git bisect status').out;
    expect(culprit).toContain('残り候補 0 件');
  });

  it('start していなければ bad は断られる', () => {
    expect(run('git bisect bad').code).toBe(1);
  });

  it('reset で元の場所に戻る', () => {
    const before = run('git rev-parse HEAD').out.trim();
    run('git bisect start');
    run('git bisect bad HEAD');
    run('git bisect good HEAD~3');
    run('git bisect reset');
    expect(run('git rev-parse HEAD').out.trim()).toBe(before);
    expect(run('git bisect status').out).toContain('動いていません');
  });
});

describe('worktree', () => {
  beforeEach(() => {
    run('git init');
    commitAll('first');
    run('git branch feature');
  });

  it('別の場所に別のブランチを展開できる', () => {
    expect(run('git worktree add /tmp/wt feature').out).toContain('feature');
    expect(run('cat /tmp/wt/a.txt').out).toBe('A\n');
  });

  it('list に両方出る', () => {
    run('git worktree add /tmp/wt feature');
    const out = run('git worktree list').out;
    expect(out).toContain('/home/learner');
    expect(out).toContain('/tmp/wt');
    expect(out).toContain('[feature]');
  });

  it('無いブランチは断られる', () => {
    expect(run('git worktree add /tmp/wt nope').code).toBe(128);
  });

  it('remove で消える', () => {
    run('git worktree add /tmp/wt feature');
    run('git worktree remove /tmp/wt');
    expect(run('git worktree list').out).not.toContain('/tmp/wt');
    expect(run('ls /tmp/wt').code).not.toBe(0);
  });
});

describe('sparse-checkout', () => {
  beforeEach(() => {
    run('git init');
    commitAll('first');
  });

  it('設定すると範囲外のファイルが作業ツリーから消える', () => {
    run('git sparse-checkout set src');
    expect(run('cat src/main.ts').code).toBe(0);
    expect(run('cat docs/guide.md').code).not.toBe(0);
  });

  it('履歴からは消えていない', () => {
    run('git sparse-checkout set src');
    expect(run('git ls-files').out).toContain('docs/guide.md');
  });

  it('disable で全部戻る', () => {
    run('git sparse-checkout set src');
    run('git sparse-checkout disable');
    expect(run('cat docs/guide.md').code).toBe(0);
  });

  it('list で現在のパターンが見える', () => {
    run('git sparse-checkout set src docs');
    expect(run('git sparse-checkout list').out).toBe('src\ndocs\n');
  });
});

describe('submodule', () => {
  beforeEach(() => {
    run('git init');
    commitAll('first');
    run('git remote add lib https://example.invalid/lib.git');
    run('git push lib main');
  });

  it('gitlink として記録される（中身をコピーしない）', () => {
    expect(run('git submodule add https://example.invalid/lib.git vendor/lib').code).toBe(0);
    const status = run('git submodule status').out;
    expect(status).toContain('vendor/lib');
  });

  it('.gitmodules に url と path が書かれる', () => {
    run('git submodule add https://example.invalid/lib.git vendor/lib');
    const text = run('cat .gitmodules').out;
    expect(text).toContain('path = vendor/lib');
    expect(text).toContain('url = https://example.invalid/lib.git');
  });

  it('登録していない url は断られる', () => {
    expect(run('git submodule add https://example.invalid/nope.git x').code).toBe(128);
  });
});

describe('hook', () => {
  beforeEach(() => {
    run('git init');
  });

  it('pre-commit が失敗するとコミットされない', () => {
    run('echo false > .git/hooks/pre-commit');
    run('git add .');
    const result = run('git commit -m "x"');
    expect(result.code).not.toBe(0);
    expect(result.err).toContain('pre-commit');
    expect(run('git log --oneline').code).toBe(128);
  });

  it('pre-commit が通ればコミットされる', () => {
    run('echo true > .git/hooks/pre-commit');
    commitAll('ok');
    expect(history()).toHaveLength(1);
  });

  it('--no-verify で hook を飛ばせる', () => {
    run('echo false > .git/hooks/pre-commit');
    run('git add .');
    run('git commit --no-verify -m "x"');
    expect(history()).toHaveLength(1);
  });

  it('hook のファイルはコミット対象にならない', () => {
    run('echo true > .git/hooks/pre-commit');
    commitAll('ok');
    expect(run('git ls-files').out).not.toContain('.git/');
  });
});

describe('rebase -i', () => {
  beforeEach(() => {
    run('git init');
    commitAll('base');
    run('git switch -c topic');
    run('echo one > one.txt');
    commitAll('c1');
    run('echo two > two.txt');
    commitAll('c2');
    run('echo three > three.txt');
    commitAll('c3');
  });

  it('台本を書き出して編集パネルを開く', () => {
    const outcome = execute(session.state, 'git rebase -i main', session.registry, session.clock);
    session = { ...session, state: outcome.state };
    expect(outcome.editor?.tool).toBe('rebase-todo');
    expect(outcome.editor?.content).toContain('pick');
    expect(run('cat .git/rebase-merge/git-rebase-todo').out).toContain('c1');
  });

  it('そのまま continue すれば件数は変わらない', () => {
    run('git rebase -i main');
    run('git rebase --continue');
    expect(history()).toHaveLength(4);
  });

  it('行を消すとそのコミットが消える', () => {
    run('git rebase -i main');
    const todo = run('cat .git/rebase-merge/git-rebase-todo').out
      .split('\n')
      .filter((l) => !l.includes('c2'))
      .join('\n');
    session = {
      ...session,
      state: {
        ...session.state,
        vfs: {
          ...session.state.vfs,
          nodes: new Map(session.state.vfs.nodes).set(
            '/home/learner/.git/rebase-merge/git-rebase-todo',
            { kind: 'file', content: todo },
          ),
        },
      },
    };
    run('git rebase --continue');
    expect(history()).toHaveLength(3);
    expect(run('cat two.txt').code).not.toBe(0);
  });

  it('squash すると2つが1つになる', () => {
    run('git rebase -i main');
    const todo = run('cat .git/rebase-merge/git-rebase-todo').out
      .split('\n')
      .map((l) => (l.includes('c2') ? l.replace('pick', 'squash') : l))
      .join('\n');
    session = {
      ...session,
      state: {
        ...session.state,
        vfs: {
          ...session.state.vfs,
          nodes: new Map(session.state.vfs.nodes).set(
            '/home/learner/.git/rebase-merge/git-rebase-todo',
            { kind: 'file', content: todo },
          ),
        },
      },
    };
    run('git rebase --continue');
    expect(history()).toHaveLength(3);
    // 潰しても中身は残る
    expect(run('cat two.txt').out).toBe('two\n');
  });

  it('終わったら台本は片付く', () => {
    run('git rebase -i main');
    run('git rebase --continue');
    expect(run('cat .git/rebase-merge/git-rebase-todo').code).not.toBe(0);
  });

  it('rebase 中でなければ continue は断られる', () => {
    expect(run('git rebase --continue').code).toBe(128);
  });
});
