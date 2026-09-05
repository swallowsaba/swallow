import { beforeEach, describe, expect, it } from 'vitest';
import { createSession, type Session } from '../session';
import { execute } from '../shell';
import { parseSedScript } from './textTools';

let session: Session;
beforeEach(() => {
  session = createSession({
    files: {
      '/home/learner': null,
      '/home/learner/data.csv': 'id,name,role\n1,ada,dev\n2,linus,ops\n',
      '/home/learner/old.txt': 'alpha\nbeta\ngamma\n',
      '/home/learner/new.txt': 'alpha\nBETA\ngamma\n',
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

describe('printf', () => {
  it('%s と改行を扱う', () => {
    expect(run('printf "%s-%s\\n" a b').out).toBe('a-b\n');
  });
  it('%% はリテラルの %', () => {
    expect(run('printf "100%%"').out).toBe('100%');
  });
  it('%d は整数にする', () => {
    expect(run('printf "%d\\n" 42.9').out).toBe('42\n');
  });
});

describe('sed', () => {
  it('s/// で置換する', () => {
    expect(run('sed "s/beta/BETA/" old.txt').out).toBe('alpha\nBETA\ngamma\n');
  });
  it('g フラグで行内すべてを置換する', () => {
    expect(run('echo aaa | sed "s/a/b/g"').out).toBe('bbb\n');
  });
  it('行番号の指定が効く', () => {
    expect(run('sed "2d" old.txt').out).toBe('alpha\ngamma\n');
  });
  it('正規表現アドレスで削除する', () => {
    expect(run('sed "/beta/d" old.txt').out).toBe('alpha\ngamma\n');
  });
  it('-n と p で抽出する', () => {
    expect(run('sed -n "/beta/p" old.txt').out).toBe('beta\n');
  });
  it('-i でファイルを書き換える', () => {
    run('sed -i "s/alpha/ALPHA/" old.txt');
    expect(run('cat old.txt').out).toBe('ALPHA\nbeta\ngamma\n');
  });
  it('未対応のコマンドは黙って無視せずエラーにする', () => {
    const r = run('sed "y/abc/xyz/" old.txt');
    expect(r.code).toBe(1);
    expect(r.err).toContain('unsupported command');
  });
  it('スクリプトを直接パースできる', () => {
    expect(parseSedScript('s/a/b/g').length).toBe(1);
    expect(() => parseSedScript('q')).toThrow();
  });
});

describe('cut / tr', () => {
  it('-d と -f で列を取り出す', () => {
    expect(run('cut -d, -f2 data.csv').out).toBe('name\nada\nlinus\n');
  });
  it('複数列を指定できる', () => {
    expect(run('cut -d, -f1,3 data.csv').out).toBe('id,role\n1,dev\n2,ops\n');
  });
  it('-c で文字位置を取る', () => {
    expect(run('echo abcdef | cut -c2-4').out).toBe('bcd\n');
  });
  it('tr は範囲指定で置換する', () => {
    expect(run('echo hello | tr a-z A-Z').out).toBe('HELLO\n');
  });
  it('tr -d は削除する', () => {
    expect(run('echo a-b-c | tr -d -').out).toBe('abc\n');
  });
});

describe('tee / xargs', () => {
  it('tee はファイルに書きつつ流す', () => {
    expect(run('echo saved | tee out.txt').out).toBe('saved\n');
    expect(run('cat out.txt').out).toBe('saved\n');
  });
  it('tee -a は追記する', () => {
    run('echo one | tee out.txt');
    run('echo two | tee -a out.txt');
    expect(run('cat out.txt').out).toBe('one\ntwo\n');
  });
  it('xargs は入力を引数にして実行する', () => {
    expect(run('echo "x y" | xargs echo prefix').out).toBe('prefix x y\n');
  });
  it('xargs -n 1 は1つずつ実行する', () => {
    expect(run('echo "1 2" | xargs -n 1 echo').out).toBe('1\n2\n');
  });
  it('xargs の副作用がファイルシステムに残る', () => {
    run('echo "p q" | xargs -n 1 mkdir');
    expect(run('ls').out).toContain('p/');
    expect(run('ls').out).toContain('q/');
  });
});

describe('diff', () => {
  it('差分があれば 1 を返す', () => {
    const r = run('diff old.txt new.txt');
    expect(r.code).toBe(1);
    expect(r.out).toContain('-beta');
    expect(r.out).toContain('+BETA');
  });
  it('同一なら 0 で出力なし', () => {
    run('cp old.txt same.txt');
    const r = run('diff old.txt same.txt');
    expect(r.code).toBe(0);
    expect(r.out).toBe('');
  });
});

describe('seq / sleep', () => {
  it('seq N は 1..N', () => {
    expect(run('seq 3').out).toBe('1\n2\n3\n');
  });
  it('開始と刻みを指定できる', () => {
    expect(run('seq 2 2 6').out).toBe('2\n4\n6\n');
  });
  it('刻み 0 はエラー', () => {
    expect(run('seq 1 0 5').code).toBe(1);
  });
  it('sleep は実時間ではなく仮想時計を進める', () => {
    expect(session.clock.tick).toBe(0);
    run('sleep 2');
    expect(session.clock.tick).toBe(4);
    expect(run('uptime').out).toBe('up 2s (tick 4)\n');
  });
});
