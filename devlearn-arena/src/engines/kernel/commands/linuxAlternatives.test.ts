import { describe, expect, it } from 'vitest';
import { createSession, type SessionOptions } from '../session';
import { createServiceTable } from '../services';
import { execute } from '../shell';
import type { ShellState } from '../registry';

/**
 * 同じ結果に至る別の正しい Linux の書き方（VERIFY-FREE.txt【1】）。
 * find -exec・-iname・-maxdepth、head -c、uname の長い名前、ip -4 addr show 口、netstat（網の構成が無い機械）、
 * pkill -f、xargs の後ろの旗、代入の ~、sshd の別名、iptables -nL・-R
 */

function machine(options: SessionOptions = {}) {
  const s = createSession(options);
  let state: ShellState = s.state;
  const run = (line: string) => {
    const out = execute(state, line, s.registry, s.clock);
    state = out.state;
    const pick = (k: 'stdout' | 'stderr') => out.chunks.filter((c) => c.stream === k).map((c) => c.text).join('');
    return { out: pick('stdout'), err: pick('stderr'), code: out.exitCode };
  };
  return { run, state: () => state };
}

const logs = {
  '/home/learner': null,
  '/var/log/app': null,
  '/var/log/app/web.log': 'ok\ntimeout a\ntimeout b\n',
  '/var/log/app/batch.log': 'timeout c\n',
  '/etc/app': null,
  '/etc/app/App.conf': 'x=1\n',
};

describe('find', () => {
  it('-exec コマンド {} + は見つけた物をまとめて渡し、; は 1 つずつ渡す', () => {
    const { run } = machine({ files: logs });
    expect(run('find /var/log/app -type f -exec grep -c timeout {} +').out.split('\n').filter(Boolean).sort()).toEqual(['/var/log/app/batch.log:1', '/var/log/app/web.log:2']);
    expect(run("find /var/log/app -type f -exec wc -l {} ';'").out.trim().split('\n')).toHaveLength(2);
  });

  it('-iname は大文字と小文字を区別しない。-maxdepth で深さを決める', () => {
    const { run } = machine({ files: logs });
    expect(run('find / -iname app.conf').out.trim()).toBe('/etc/app/App.conf');
    expect(run('find / -name app.conf').out).toBe('');
    expect(run('find /var/log -maxdepth 1').out.trim().split('\n')).toEqual(['/var/log', '/var/log/app']);
  });

  it('知らない式は、そう言って止まる', () => {
    expect(machine({ files: logs }).run('find / -frobnicate').err).toContain("unknown predicate `-frobnicate'");
  });
});

describe('文字と機械の名前', () => {
  it('head -c は先頭のバイト数（UTF-8 の 1 文字は 3 バイト）', () => {
    const { run } = machine({ files: { '/home/learner': null, '/home/learner/a.txt': 'こんにちは\n' } });
    expect(run('head -c 3 a.txt').out).toBe('こ');
  });

  it('uname --kernel-name は -s と同じ', () => {
    const { run } = machine();
    expect(run('uname --kernel-name').out).toBe(run('uname -s').out);
  });
});

describe('網の構成が無い機械の口と待ち受け', () => {
  const opts: SessionOptions = {
    vars: { __HOST_ADDR: '10.0.0.5/24' },
    services: createServiceTable([{ name: 'nginx', description: 'web', active: 'active', enabled: true, port: 80 }, { name: 'ssh', description: 'ssh', active: 'active', enabled: true, port: 22, program: 'sshd' }]),
  };

  it('ip -4 addr show eth0 は、その口だけを出す', () => {
    const r = machine(opts).run('ip -4 addr show eth0');
    expect(r.code).toBe(0);
    expect(r.out).toContain('inet 10.0.0.5/24 scope global eth0');
    expect(r.out).not.toContain('127.0.0.1');
  });

  it('netstat -tlnp は、動いているサービスの待ち受けを出す（ss と同じ）', () => {
    const r = machine(opts).run('netstat -tlnp');
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/tcp .*0\.0\.0\.0:80 .*LISTEN/);
    expect(r.out).toMatch(/0\.0\.0\.0:22 /);
  });

  it('systemctl restart sshd は、ssh のサービス（Ubuntu の別名）', () => {
    expect(machine(opts).run('systemctl restart sshd').code).toBe(0);
  });
});

describe('別のコマンドを動かすコマンド', () => {
  it('xargs の旗は、動かすコマンドより前の物だけ（xargs -n 1 grep -c の -c は grep の物）', () => {
    const { run } = machine({ files: logs });
    const r = run('echo /var/log/app/web.log /var/log/app/batch.log | xargs -n 1 grep -c timeout');
    expect(r.code).toBe(0);
    expect(r.out).toBe('2\n1\n');
  });

  it('pkill -f は旗で、合図ではない（名前で選んで止める）', () => {
    const { run } = machine({ processes: [{ user: 'learner', command: 'python3 resize.py', cpu: 98 }] });
    expect(run('pkill -f resize.py').code).toBe(0);
    expect(run('ps aux').out).not.toContain('resize.py');
  });
});

describe('代入の ~', () => {
  it('export PATH=~/bin:$PATH の ~ はホームになる（引用符の中はそのまま）', () => {
    const { run } = machine();
    run('export PATH=~/bin:$PATH');
    expect(run('echo $PATH').out.startsWith('/home/learner/bin:')).toBe(true);
    expect(run("echo '~/bin'").out).toBe('~/bin\n');
  });
});

describe('グループ', () => {
  const opts: SessionOptions = { files: { '/home/learner': null, '/etc/group': 'learner:x:1000:\nweb:x:1001:\n', '/srv/web': null } };

  it('sudo gpasswd -a 利用者 グループ は、usermod -aG と同じくグループに入れる（-d で外す）', () => {
    const { run } = machine(opts);
    expect(run('gpasswd -a learner web').code).not.toBe(0);
    const r = run('sudo gpasswd -a learner web');
    expect(r.code).toBe(0);
    expect(r.out).toBe('Adding user learner to group web\n');
    expect(run('groups learner').out).toContain('web');
    expect(run('sudo gpasswd -d learner web').out).toBe('Removing user learner from group web\n');
    expect(run('groups learner').out).not.toContain('web');
    expect(run('sudo gpasswd -a learner nope').err).toContain("group 'nope' does not exist");
  });

  it('sg グループ -c "命令" は、入ったグループで 1 行だけ動かす（今のシェルのグループは変えない）', () => {
    const { run } = machine(opts);
    expect(run("sg web -c 'id'").err).toContain('Permission denied');
    run('sudo gpasswd -a learner web');
    expect(run("sg web -c 'id -Gn'").code).toBe(0);
    expect(run("sg web -c 'groups'").out).toContain('web');
    expect(run('groups').out).not.toContain('web');
  });
});
