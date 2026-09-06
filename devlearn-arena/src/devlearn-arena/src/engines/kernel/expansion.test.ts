import { beforeEach, describe, expect, it } from 'vitest';
import { createSession, type Session } from './session';
import { execute } from './shell';

let session: Session;
beforeEach(() => {
  session = createSession({
    files: {
      '/home/learner': null,
      '/home/learner/a.txt': 'A\n',
      '/home/learner/b.txt': 'B\n',
      '/home/learner/note.md': 'M\n',
      '/etc/hosts': '127.0.0.1 localhost\n',
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

describe('単語分割', () => {
  it('クォートしない展開は空白で分割され、複数の引数になる', () => {
    run('export LIST="a.txt b.txt"');
    expect(run('wc -l $LIST').out).toBe('2\n');
  });

  it('分割された結果が別々の引数になる', () => {
    run('export ARGS="one two three"');
    expect(run('echo $ARGS').out).toBe('one two three\n');
  });

  it('クォートすれば1つの引数のまま', () => {
    run('export NAME="two words"');
    expect(run('echo "$NAME" | wc -w').out).toBe('2\n');
  });

  it('空の展開は引数ごと消える', () => {
    expect(run('echo a $EMPTY b').out).toBe('a b\n');
  });

  it('クォートした空文字は引数として残る', () => {
    expect(run('echo "" | wc -c').out).toBe('1\n');
  });

  it('コマンド置換の結果も分割される', () => {
    expect(run('echo $(echo x y z) | wc -w').out).toBe('3\n');
  });
});

describe('パス名展開', () => {
  it('* が実在するファイルに展開される', () => {
    expect(run('echo *.txt').out).toBe('a.txt b.txt\n');
  });

  it('展開結果が引数として渡る', () => {
    expect(run('cat *.txt').out).toBe('A\nB\n');
  });

  it('一致が無ければパターンのまま渡す', () => {
    expect(run('echo *.zip').out).toBe('*.zip\n');
  });

  it('クォートすると展開しない', () => {
    expect(run('echo "*.txt"').out).toBe('*.txt\n');
  });

  it('ディレクトリを跨ぐパターンも効く', () => {
    run('mkdir sub');
    run('touch sub/x.log sub/y.log');
    expect(run('echo sub/*.log').out).toBe('sub/x.log sub/y.log\n');
  });
});

describe('パイプはサブシェル', () => {
  it('パイプ内の cd は外に漏れない', () => {
    run('cd /etc | cat');
    expect(run('pwd').out).toBe('/home/learner\n');
  });

  it('パイプ内の変数代入も漏れない', () => {
    run('export KEEP=outer');
    run('export KEEP=inner | cat');
    expect(run('echo $KEEP').out).toBe('outer\n');
  });

  it('ファイルへの変更は残る（プロセスではなく世界の状態だから）', () => {
    run('echo written > piped.txt | cat');
    expect(run('cat piped.txt').out).toBe('written\n');
  });

  it('パイプでない cd はもちろん反映される', () => {
    run('cd /etc');
    expect(run('pwd').out).toBe('/etc\n');
  });
});
