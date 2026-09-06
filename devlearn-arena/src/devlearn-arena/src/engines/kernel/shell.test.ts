import { beforeEach, describe, expect, it } from 'vitest';
import { createSession, type Session } from './session';
import { execute, EXIT_NOT_FOUND } from './shell';
import { readFile } from './vfs';

let session: Session;

beforeEach(() => {
  session = createSession();
});

/** 1行実行して stdout を返す。state は使い回す。 */
function run(line: string): { out: string; err: string; code: number } {
  const outcome = execute(session.state, line, session.registry, session.clock);
  session = { ...session, state: outcome.state };
  const pick = (stream: 'stdout' | 'stderr') =>
    outcome.chunks.filter((c) => c.stream === stream).map((c) => c.text).join('');
  return { out: pick('stdout'), err: pick('stderr'), code: outcome.exitCode };
}

describe('基本', () => {
  it('echo が動く', () => {
    expect(run('echo hello').out).toBe('hello\n');
  });

  it('-n で改行を抑える', () => {
    expect(run('echo -n hello').out).toBe('hello');
  });

  it('空行は何もしない', () => {
    expect(run('   ').out).toBe('');
  });

  it('未知のコマンドは 127 と本物風のメッセージ', () => {
    const r = run('kubectl get pods');
    expect(r.code).toBe(EXIT_NOT_FOUND);
    expect(r.err).toBe('kubectl: command not found\n');
  });

  it('履歴に積まれる', () => {
    run('echo a');
    run('echo b');
    expect(session.state.history).toEqual(['echo a', 'echo b']);
  });
});

describe('クォートと展開', () => {
  it('ダブルクォートは変数を展開する', () => {
    run('export NAME=world');
    expect(run('echo "hello $NAME"').out).toBe('hello world\n');
  });

  it('シングルクォートは展開しない', () => {
    run('export NAME=world');
    expect(run("echo 'hello $NAME'").out).toBe('hello $NAME\n');
  });

  it('${} 形式も使える', () => {
    run('export NAME=world');
    expect(run('echo ${NAME}!').out).toBe('world!\n');
  });

  it('未定義変数は空になる', () => {
    expect(run('echo [$NOPE]').out).toBe('[]\n');
  });

  it('代入だけの行が使える', () => {
    run('X=5');
    expect(run('echo $X').out).toBe('5\n');
  });

  it('$? に直前の終了コードが入る', () => {
    run('false');
    expect(run('echo $?').out).toBe('1\n');
    run('true');
    expect(run('echo $?').out).toBe('0\n');
  });

  it('コマンド置換が動く', () => {
    expect(run('echo [$(echo inner)]').out).toBe('[inner]\n');
  });
});

describe('パイプと接続子', () => {
  it('パイプで標準入力を渡す', () => {
    expect(run('cat /etc/hosts | grep localhost | wc -l').out).toBe('1\n');
  });

  it('&& は成功時だけ次に進む', () => {
    expect(run('true && echo yes').out).toBe('yes\n');
    expect(run('false && echo yes').out).toBe('');
  });

  it('|| は失敗時だけ次に進む', () => {
    expect(run('false || echo fallback').out).toBe('fallback\n');
    expect(run('true || echo fallback').out).toBe('');
  });

  it('; は結果に関係なく続ける', () => {
    expect(run('false ; echo next').out).toBe('next\n');
  });
});

describe('リダイレクト', () => {
  it('> でファイルに書く', () => {
    expect(run('echo hi > out.txt').out).toBe('');
    expect(run('cat out.txt').out).toBe('hi\n');
  });

  it('>> で追記する', () => {
    run('echo one > out.txt');
    run('echo two >> out.txt');
    expect(run('cat out.txt').out).toBe('one\ntwo\n');
  });

  it('< でファイルを標準入力にする', () => {
    run('echo hello > in.txt');
    expect(run('wc -l < in.txt').out).toBe('1\n');
  });

  it('無いファイルからの入力はエラー', () => {
    const r = run('cat < nope.txt');
    expect(r.code).toBe(1);
    expect(r.err).toContain('No such file or directory');
  });
});

describe('ヒアドキュメント', () => {
  it('本文を標準入力に渡す', () => {
    expect(run('cat <<EOF\nalpha\nbeta\nEOF').out).toBe('alpha\nbeta\n');
  });

  it('ヒアドキュメントの内容をファイルに書ける', () => {
    run('cat <<EOF > note.txt\nfrom heredoc\nEOF');
    expect(run('cat note.txt').out).toBe('from heredoc\n');
  });
});

describe('ファイル操作', () => {
  it('mkdir -p して cd できる', () => {
    run('mkdir -p a/b/c');
    expect(run('cd a/b && pwd').out).toBe('/home/learner/a/b\n');
  });

  it('無いディレクトリへの cd は本物風のエラー', () => {
    const r = run('cd /nope');
    expect(r.err).toBe('cd: /nope: No such file or directory\n');
    expect(r.code).toBe(1);
  });

  it('ls はディレクトリに / を付ける', () => {
    run('mkdir work');
    run('touch work/a.txt');
    expect(run('ls').out).toContain('work/');
  });

  it('rm はディレクトリに -r を要求する', () => {
    run('mkdir -p d/e');
    expect(run('rm d').code).toBe(1);
    expect(run('rm -r d').code).toBe(0);
  });

  it('cp と mv が VFS に反映される', () => {
    run('echo data > src.txt');
    run('cp src.txt copy.txt');
    run('mv copy.txt moved.txt');
    expect(readFile(session.state.vfs, '/home/learner/moved.txt')).toBe('data\n');
    expect(run('cat copy.txt').code).toBe(1);
  });

  it('find で名前を探せる', () => {
    run('mkdir -p p/q');
    run('touch p/q/target.log p/other.txt');
    expect(run('find p -name "*.log"').out).toBe('p/q/target.log\n');
  });
});

describe('テキスト処理', () => {
  it('grep -n は行番号を付ける', () => {
    run('cat <<EOF > f.txt\nalpha\nbeta\ngamma\nEOF');
    expect(run('grep -n beta f.txt').out).toBe('2:beta\n');
  });

  it('grep は一致しなければ 1 を返す', () => {
    run('cat <<EOF > f.txt\nalpha\nEOF');
    expect(run('grep zzz f.txt').code).toBe(1);
  });

  it('head と tail が効く', () => {
    run('cat <<EOF > n.txt\n1\n2\n3\n4\nEOF');
    expect(run('head -n 2 n.txt').out).toBe('1\n2\n');
    expect(run('tail -n 1 n.txt').out).toBe('4\n');
  });

  it('sort と uniq を繋げられる', () => {
    run('cat <<EOF > s.txt\nb\na\na\nEOF');
    expect(run('sort s.txt | uniq').out).toBe('a\nb\n');
  });
});

describe('構文エラー', () => {
  it('閉じないクォートを報告する', () => {
    const r = run('echo "abc');
    expect(r.code).toBe(1);
    expect(r.err).toContain('syntax error');
  });
});
