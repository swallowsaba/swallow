import { describe, expect, it } from 'vitest';
import { createSession, type Session, type SessionOptions } from '../session';
import { execute } from '../shell';
import { createServiceTable } from '../services';
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

describe('作る・写す・移す・消す（本物と同じ文言）', () => {
  const files = { '/home/learner/config.txt': 'port=80\n', '/home/learner/empty': null };

  it('rm は空のディレクトリでも -r が要る', () => {
    const t = open({ files });
    expect(t.run('rm empty')).toEqual({ out: '', err: "rm: cannot remove 'empty': Is a directory\n", code: 1 });
    expect(t.run('rm -r empty').code).toBe(0);
  });

  it('無い物を写す・移すと cannot stat。ディレクトリを -r 無しで写すと省く', () => {
    const t = open({ files });
    expect(t.run('cp nofile.txt backup/').err).toBe("cp: cannot stat 'nofile.txt': No such file or directory\n");
    expect(t.run('mv nofile.txt b.txt').err).toBe("mv: cannot stat 'nofile.txt': No such file or directory\n");
    expect(t.run('cp empty copy').err).toBe("cp: -r not specified; omitting directory 'empty'\n");
  });
});

describe('権限を変える・グループ', () => {
  const files = {
    '/home/learner/deploy.sh': 'echo deployed\n',
    '/etc/hosts': '127.0.0.1 localhost\n',
    '/etc/group': 'root:x:0:\nlearner:x:1000:\nweb:x:1001:\n',
    '/srv/web': null,
  };
  const withWeb = (t: ReturnType<typeof open>): void => {
    t.s().state = { ...t.s().state, vfs: setMeta(t.s().state.vfs, '/srv/web', { mode: 0o775, owner: 'root', group: 'web' }) };
  };

  it('自分の物でないファイルの権限は変えられない（root は変えられる）', () => {
    const t = open({ files });
    t.s().state = { ...t.s().state, vfs: setMeta(t.s().state.vfs, '/etc/hosts', { mode: 0o644, owner: 'root', group: 'root' }) };
    expect(t.run('chmod 666 /etc/hosts').err).toBe("chmod: changing permissions of '/etc/hosts': Operation not permitted\n");
    expect(t.run('sudo chmod 640 /etc/hosts').code).toBe(0);
    expect(t.run('chmod +x deploy.sh').code).toBe(0);
  });

  it('グループに入れるのは root だけ。/etc/group に足しても、入り直す（newgrp）まで今のシェルには効かない', () => {
    const t = open({ files });
    withWeb(t);
    expect(t.run('touch /srv/web/index.html').err).toBe("touch: cannot touch '/srv/web/index.html': Permission denied\n");
    expect(t.run('usermod -aG web learner')).toEqual({ out: '', err: 'usermod: Permission denied.\n', code: 1 });
    expect(t.run('sudo usermod -aG web learner').code).toBe(0);
    expect(readFile(t.s().state.vfs, '/etc/group')).toContain('web:x:1001:learner\n');
    expect(t.run('groups').out).toBe('learner\n');
    expect(t.run('groups learner').out).toBe('learner : learner web\n');
    expect(t.run('touch /srv/web/index.html').code).toBe(1);
    expect(t.run('newgrp web').code).toBe(0);
    expect(t.run('id').out).toBe('uid=1000(learner) gid=1000(learner) groups=1000(learner),1001(web)\n');
    expect(t.run('touch /srv/web/index.html').code).toBe(0);
  });

  it('入っていないグループには newgrp できない。無いグループには usermod できない', () => {
    const t = open({ files });
    expect(t.run('newgrp web').err).toBe('newgrp: Permission denied.\n');
    expect(t.run('sudo usermod -aG nope learner').err).toBe("usermod: group 'nope' does not exist\n");
  });

  it('chgrp でグループを変える（root だけ）', () => {
    const t = open({ files });
    expect(t.run('sudo chgrp web /srv/web').code).toBe(0);
    expect(t.run('ls -ld /srv/web').out).toContain('learner web');
  });
});

describe('プロセスを止める（ほかの利用者のプロセス）', () => {
  const processes = [{ command: 'python3 report.py', cpu: 99 }, { command: '/usr/sbin/sshd', cpu: 0.1, user: 'root' }];

  it('一般の利用者は、ほかの利用者のプロセスを止められない（本物と同じ文言）。sudo なら止められる', () => {
    const t = open({ processes });
    expect(t.run('kill 101')).toEqual({ out: '', err: 'kill: (101) - Operation not permitted\n', code: 1 });
    expect(t.run('pkill sshd').err).toBe('pkill: killing pid 101 failed: Operation not permitted\n');
    expect(t.run('ps aux').out).toContain('/usr/sbin/sshd');
    expect(t.run('kill 100').code).toBe(0);
    expect(t.run('sudo kill 101').code).toBe(0);
    expect(t.run('ps aux').out).not.toContain('sshd');
  });
});

describe('ログを読む（journalctl の時刻での絞り込み）', () => {
  const log = [
    'Oct 02 21:00:01 server systemd[1]: Started web.service - Web server.',
    'Oct 02 23:58:10 server web[812]: GET /report 200',
    'Oct 03 02:13:43 server web[812]: warning: memory usage 7.8G of 8G',
    'Oct 03 02:13:44 server systemd[1]: web.service: A process of this unit has been killed by the OOM killer.',
    'Oct 03 02:13:49 server web[820]: error: cache is locked',
  ];
  const services = () => createServiceTable([
    { name: 'web', description: 'Web server', active: 'failed', enabled: true, log },
    { name: 'db', description: 'Database', active: 'active', enabled: true, log: ['Oct 03 01:00:00 server db[300]: checkpoint complete'] },
  ]);

  it('--since today は今日（Oct 03）の行だけ。時刻だけなら今日のその時刻から。--until まで', () => {
    const t = open({ services: services() });
    expect(t.run('journalctl -u web --since today').out).toBe(`${log.slice(2).join('\n')}\n`);
    expect(t.run('journalctl -u web --since 02:13:44').out).toBe(`${log.slice(3).join('\n')}\n`);
    expect(t.run('journalctl -u web --since "2026-10-02 23:00" --until "2026-10-03 02:13:43"').out).toBe(`${log.slice(1, 3).join('\n')}\n`);
    expect(t.run('journalctl -u web --since yesterday --until today').out).toBe(`${log.slice(0, 2).join('\n')}\n`);
  });

  it('-u を書かなければ全てのサービスを時刻の順に。-r は新しい順。読めない時刻はエラー', () => {
    const t = open({ services: services() });
    expect(t.run('journalctl --since today').out.split('\n')[0]).toContain('checkpoint complete');
    expect(t.run('journalctl -u web -r -n 1').out).toBe(`${log[4] ?? ''}\n`);
    expect(t.run('journalctl --since soon').err).toBe('Failed to parse timestamp: soon\n');
  });
});

describe('パッケージ管理（apt）', () => {
  it('一覧を更新しないと見つからない。更新してから入れると、依存も一緒に入り、命令が使える', () => {
    const t = open();
    expect(t.run('sudo apt install nginx').err).toBe('E: Unable to locate package nginx\n');
    expect(t.run('nginx -v').code).toBe(127);
    expect(t.run('sudo apt update').out).toContain("2 packages can be upgraded. Run 'apt list --upgradable' to see them.");
    const r = t.run('sudo apt install nginx');
    expect(r.out).toContain('The following additional packages will be installed:\n  nginx-common\n');
    expect(r.out).toContain('Setting up nginx (1.24.0-2ubuntu7) ...');
    expect(t.run('nginx -v').out).toBe('nginx version: nginx/1.24.0 (Ubuntu)\n');
    expect(readFile(t.s().state.vfs, '/var/lib/dpkg/status')).toContain('Package: nginx-common\n');
    expect(t.run('dpkg -l nginx').out).toContain('ii  nginx');
    expect(t.run('sudo apt install nginx').out).toContain('nginx is already the newest version (1.24.0-2ubuntu7).');
  });

  it('管理者でなければ、一覧の更新も導入も断られる（本物と同じ文言）。&& の後は打たれない', () => {
    const t = open();
    expect(t.run('apt update').err).toBe('E: Could not open lock file /var/lib/apt/lists/lock - open (13: Permission denied)\nE: Unable to lock directory /var/lib/apt/lists/\n');
    expect(t.run('apt install nginx && echo ok')).toEqual({
      out: '', code: 100,
      err: 'E: Could not open lock file /var/lib/dpkg/lock-frontend - open (13: Permission denied)\nE: Unable to acquire the dpkg frontend lock (/var/lib/dpkg/lock-frontend), are you root?\n',
    });
  });

  it('upgrade は、更新した一覧に新しい版がある物を上げる。remove で消す', () => {
    const t = open();
    t.run('sudo apt update');
    expect(t.run('apt list --upgradable').out).toBe('Listing... Done\nlibssl3/noble-updates 3.0.13-0ubuntu3.4 amd64 [upgradable from: 3.0.13-0ubuntu3.1]\nopenssl/noble-updates 3.0.13-0ubuntu3.4 amd64 [upgradable from: 3.0.13-0ubuntu3.1]\n');
    expect(t.run('sudo apt upgrade -y').out).toContain('2 upgraded');
    expect(t.run('apt list --upgradable').out).toBe('Listing... Done\n');
    t.run('sudo apt install -y tree');
    expect(t.run('sudo apt remove tree').out).toContain('Removing tree ...');
    expect(t.run('tree').code).toBe(127);
  });
});

describe('IP とポートを確かめる（ip addr・ss）', () => {
  const services = () => createServiceTable([
    { name: 'web', description: 'Web server', active: 'active', enabled: true, port: 80, address: '127.0.0.1' },
    { name: 'sshd', description: 'OpenSSH server', active: 'active', enabled: true, port: 22 },
    { name: 'db', description: 'Database', active: 'inactive', enabled: false, port: 5432 },
  ]);

  it('ネットワークの模擬が無い機械でも、ip addr は自分の口（lo と、あれば eth0）を出す', () => {
    const t = open({ vars: { HOST_ADDR: '10.0.0.5/24' } });
    const out = t.run('ip addr').out;
    expect(out).toContain('1: lo: <LOOPBACK,UP,LOWER_UP>');
    expect(out).toContain('inet 127.0.0.1/8 scope host lo');
    expect(out).toContain('2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP>');
    expect(out).toContain('inet 10.0.0.5/24 scope global eth0');
    expect(t.run('ip a').out).toBe(out);
  });

  it('ss -tlnp は、動いているサービスの待ち受けのアドレス・ポート・プログラムを出す。止まっている物は出ない', () => {
    const t = open({ services: services(), vars: { USER: 'root' } });
    const out = t.run('ss -tlnp').out;
    expect(out.split('\n')[0]).toMatch(/^State\s+Recv-Q\s+Send-Q\s+Local Address:Port\s+Peer Address:Port\s+Process$/);
    expect(out).toMatch(/LISTEN\s+0\s+511\s+127\.0\.0\.1:80\s+0\.0\.0\.0:\*\s+users:\(\("web",pid=\d+,fd=6\)\)/);
    expect(out).toMatch(/LISTEN\s+0\s+511\s+0\.0\.0\.0:22\s+/);
    expect(out).not.toContain(':5432');
    expect(t.run('ss -tln').out).not.toContain('users:');
  });
});
