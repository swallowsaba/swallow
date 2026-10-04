import { describe, expect, it } from 'vitest';
import { createSession, type Session, type SessionOptions } from '../session';
import { execute } from '../shell';
import { exists, readFile, setMeta } from '../vfs';

/**
 * Linux の初級の実戦に要る端末の振る舞い（docs/lessons/linux.md）。
 * 打った行の記録・grep の再帰・権限で見られない場所・/dev/null・less・sh と source
 */

function open(options: SessionOptions = {}): { run: (line: string) => { out: string; err: string; code: number }; s: () => Session } {
  let session = createSession(options);
  return {
    run: (line) => {
      const o = execute(session.state, line, session.registry, session.clock);
      session = { ...session, state: o.state };
      const pick = (k: 'stdout' | 'stderr'): string => o.chunks.filter((c) => c.stream === k).map((c) => c.text).join('');
      return { out: pick('stdout'), err: pick('stderr'), code: o.exitCode };
    },
    s: () => session,
  };
}

describe('打った行の記録（HISTFILE）', () => {
  it('HISTFILE があれば、打った行を 1 行ずつ足す。空の行は足さない', () => {
    const t = open({ vars: { HISTFILE: '/home/learner/.bash_history' } });
    t.run('pwd');
    t.run('   ');
    t.run('ls -l ~');
    expect(readFile(t.s().state.vfs, '/home/learner/.bash_history')).toBe('pwd\nls -l ~\n');
  });

  it('HISTFILE が無ければ書かない', () => {
    const t = open();
    t.run('pwd');
    expect(exists(t.s().state.vfs, '/home/learner/.bash_history')).toBe(false);
  });
});

describe('grep', () => {
  const files = {
    '/home/learner': null,
    '/var/log/app/a.log': 'ok\ntimeout 1\nTimeout 2\n',
    '/var/log/app/b.log': 'timeout 3\n',
  };

  it('ファイルが 2 つ以上なら、行の前にファイル名を付ける', () => {
    expect(open({ files }).run('grep timeout /var/log/app/a.log /var/log/app/b.log').out).toBe('/var/log/app/a.log:timeout 1\n/var/log/app/b.log:timeout 3\n');
  });

  it('-r はディレクトリの中まで探す。-ri は大文字小文字を問わない。-rc は ファイルごとの数', () => {
    const t = open({ files });
    expect(t.run('grep -r timeout /var/log').out).toBe('/var/log/app/a.log:timeout 1\n/var/log/app/b.log:timeout 3\n');
    expect(t.run('grep -ri timeout /var/log | wc -l').out).toBe('3\n');
    expect(t.run('grep -r timeout /var/log -c').out).toBe('/var/log/app/a.log:1\n/var/log/app/b.log:1\n');
  });

  it('-r が無いままディレクトリを渡すと、そう言う', () => {
    expect(open({ files }).run('grep timeout /var/log').err).toBe('grep: /var/log: Is a directory\n');
  });

  it('読めないファイルは Permission denied を出して、ほかを探し続ける', () => {
    const t = open({ files: { ...files, '/var/log/secure': 'timeout 9\n' } });
    t.s().state = { ...t.s().state, vfs: setMeta(t.s().state.vfs, '/var/log/secure', { mode: 0o600, owner: 'root', group: 'root' }) };
    const r = t.run('grep -r timeout /var/log');
    expect(r.out).toBe('/var/log/app/a.log:timeout 1\n/var/log/app/b.log:timeout 3\n');
    expect(r.err).toBe('grep: /var/log/secure: Permission denied\n');
  });
});

describe('find と権限・/dev/null', () => {
  const files = { '/home/learner': null, '/etc/app/app.conf': 'a=1\n', '/root/app.conf': 'x\n' };

  it('読めないディレクトリは Permission denied を出し、中は探さない。2>/dev/null で捨てられる', () => {
    const t = open({ files });
    t.s().state = { ...t.s().state, vfs: setMeta(t.s().state.vfs, '/root', { mode: 0o700, owner: 'root', group: 'root' }) };
    const r = t.run('find / -name app.conf');
    expect(r.out).toBe('/etc/app/app.conf\n');
    expect(r.err).toBe("find: '/root': Permission denied\n");
    const quiet = t.run('find / -name app.conf 2>/dev/null');
    expect(quiet).toEqual({ out: '/etc/app/app.conf\n', err: '', code: 1 });
  });

  it('/dev/null に書いた物は消え、読むと空', () => {
    const t = open({ files });
    expect(t.run('echo hi > /dev/null').out).toBe('');
    expect(t.run('cat /dev/null').out).toBe('');
    expect(t.run('wc -l < /dev/null').out).toBe('0\n');
  });
});

describe('less', () => {
  it('中身を出し、終わりの印を付ける（画面は送らない）', () => {
    const r = open({ files: { '/home/learner/a.txt': 'one\ntwo\n' } }).run('less a.txt');
    expect(r.out).toBe('one\ntwo\n(END)\n');
  });
  it('無いファイルはそう言う', () => {
    expect(open({ files: { '/home/learner': null } }).run('less nope.txt').err).toBe('less: nope.txt: No such file or directory\n');
  });
});

describe('sh と source', () => {
  const files = { '/home/learner/set.sh': 'export GREETING=hello\ncd /tmp\necho done\n', '/tmp': null };

  it('sh は別のシェルで動かすので、変数と現在地は戻る', () => {
    const t = open({ files });
    expect(t.run('sh set.sh').out).toBe('done\n');
    expect(t.run('echo "[$GREETING]"').out).toBe('[]\n');
    expect(t.run('pwd').out).toBe('/home/learner\n');
  });

  it('source（.）は今のシェルで動かすので、変数と現在地が残る', () => {
    const t = open({ files });
    expect(t.run('source set.sh').out).toBe('done\n');
    expect(t.run('echo $GREETING').out).toBe('hello\n');
    expect(t.run('pwd').out).toBe('/tmp\n');
    expect(open({ files }).run('. ~/set.sh').code).toBe(0);
  });

  it('無いファイルはそう言う', () => {
    expect(open({ files }).run('source nope.sh').err).toBe('source: nope.sh: No such file or directory\n');
  });
});
