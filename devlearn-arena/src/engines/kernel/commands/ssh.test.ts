import { describe, expect, it } from 'vitest';
import { initialShell } from '@/engines/environments';
import { netHolds } from '@/learning/practice';
import { createClock } from '../clock';
import { createDefaultRegistry } from '.';
import type { ShellState } from '../registry';
import { restoreShell, snapshotShell, type ShellSnapshotData } from '../session';
import { execute } from '../shell';
import { exists, metaOf, readFile } from '../vfs';

/** 手元の PC と、仮のパスワードで初めの登録ができるサーバ web01（利用者 deploy） */
function machine(host: Record<string, unknown> = {}) {
  let shell: ShellState = initialShell('linux-basic', {
    hostname: 'pc',
    sshHosts: [{ host: 'web01', user: 'deploy', password: true, motd: 'Welcome to web01', ...host }],
  });
  const registry = createDefaultRegistry();
  const clock = createClock();
  const run = (line: string): { out: string; err: string; code: number } => {
    const o = execute(shell, line, registry, clock);
    shell = o.state;
    const pick = (s: 'stdout' | 'stderr') => o.chunks.filter((c) => c.stream === s).map((c) => c.text).join('');
    return { out: pick('stdout'), err: pick('stderr'), code: o.exitCode };
  };
  return { run, shell: () => shell };
}

const KEY = '/home/learner/.ssh/id_ed25519';

describe('ssh-keygen', () => {
  it('~/.ssh を 700 で作り、秘密鍵を 600・公開鍵を 644 で置く', () => {
    const m = machine();
    const r = m.run('ssh-keygen -t ed25519');
    expect(r.code).toBe(0);
    expect(r.out).toContain("Created directory '/home/learner/.ssh'.");
    expect(r.out).toContain(`Your identification has been saved in ${KEY}`);
    const vfs = m.shell().vfs;
    expect(metaOf(vfs, '/home/learner/.ssh').mode).toBe(0o700);
    expect(metaOf(vfs, KEY).mode).toBe(0o600);
    expect(metaOf(vfs, `${KEY}.pub`).mode).toBe(0o644);
    expect(readFile(vfs, KEY)).toMatch(/^-----BEGIN OPENSSH PRIVATE KEY-----\n/);
    expect(readFile(vfs, `${KEY}.pub`)).toMatch(/^ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI\S+ learner@pc\n$/);
  });

  it('同じ操作からは同じ鍵ができる', () => {
    const a = machine();
    const b = machine();
    a.run('ssh-keygen -t ed25519 -N ""');
    b.run('ssh-keygen -t ed25519 -N ""');
    expect(readFile(a.shell().vfs, `${KEY}.pub`)).toBe(readFile(b.shell().vfs, `${KEY}.pub`));
  });

  it('もうある鍵は上書きしない', () => {
    const m = machine();
    m.run('ssh-keygen');
    const before = readFile(m.shell().vfs, KEY);
    const r = m.run('ssh-keygen');
    expect(r.code).toBe(1);
    expect(r.err).toContain(`${KEY} already exists.`);
    expect(readFile(m.shell().vfs, KEY)).toBe(before);
  });

  it('知らない種類は断る', () => {
    expect(machine().run('ssh-keygen -t dsa2').err).toBe('unknown key type dsa2\n');
  });
});

describe('ssh-copy-id と ssh', () => {
  it('公開鍵を登録すると、鍵で入れる。判定の式 ssh は、鍵で入った後に満たす', () => {
    const m = machine();
    m.run('ssh-keygen -N ""');
    const copied = m.run('ssh-copy-id deploy@web01');
    expect(copied.code).toBe(0);
    expect(copied.out).toContain(`Source of key(s) to be installed: "${KEY}.pub"`);
    expect(copied.out).toContain('Number of key(s) added: 1');
    expect(netHolds(m.shell(), 'ssh deploy@web01')).toBe(false);
    const login = m.run('ssh deploy@web01');
    expect(login.err).toBe('');
    expect(login.out).toContain('Welcome to web01');
    expect(login.out).toContain('Connection to web01 closed.');
    expect(netHolds(m.shell(), 'ssh deploy@web01')).toBe(true);
  });

  it('-i に秘密鍵を書いても、送るのは公開鍵（.pub）', () => {
    const m = machine();
    m.run('ssh-keygen -N ""');
    const r = m.run(`ssh-copy-id -i ${KEY} deploy@web01`);
    expect(r.out).toContain(`"${KEY}.pub"`);
    const keys = m.run('ssh deploy@web01 cat .ssh/authorized_keys').out;
    expect(keys).toMatch(/^ssh-ed25519 /);
    expect(keys).not.toContain('PRIVATE KEY');
  });

  it('鍵が無いと、パスワードを聞かれて入る（鍵で入ったことにならない）', () => {
    const m = machine();
    const r = m.run('ssh deploy@web01');
    expect(r.err).toBe("deploy@web01's password: \n");
    expect(netHolds(m.shell(), 'ssh deploy@web01')).toBe(false);
  });

  it('秘密鍵の権限が広すぎると、本物と同じ警告を出して鍵を使わない', () => {
    const m = machine();
    m.run('ssh-keygen -N ""');
    m.run('ssh-copy-id deploy@web01');
    m.run(`chmod 644 ${KEY}`);
    const r = m.run('ssh deploy@web01');
    expect(r.err).toContain('WARNING: UNPROTECTED PRIVATE KEY FILE!');
    expect(r.err).toContain(`Permissions 0644 for '${KEY}' are too open.`);
    expect(r.err).toContain("deploy@web01's password:");
    expect(netHolds(m.shell(), 'ssh deploy@web01')).toBe(false);
    m.run(`chmod 600 ${KEY}`);
    expect(m.run('ssh deploy@web01').err).toBe('');
    expect(netHolds(m.shell(), 'ssh deploy@web01')).toBe(true);
  });

  it('パスワードで入れないサーバ・違う利用者・知らない名前は断られる', () => {
    const m = machine({ password: false });
    m.run('ssh-keygen -N ""');
    expect(m.run('ssh-copy-id deploy@web01').err).toBe('deploy@web01: Permission denied (publickey).\n');
    expect(m.run('ssh deploy@web01')).toMatchObject({ err: 'deploy@web01: Permission denied (publickey).\n', code: 255 });
    const n = machine();
    n.run('ssh-keygen -N ""');
    expect(n.run('ssh-copy-id web01').err).toBe('learner@web01: Permission denied (publickey,password).\n');
    expect(n.run('ssh deploy@web02').err).toBe('ssh: Could not resolve hostname web02: Name or service not known\n');
  });

  it('鍵が無い時の ssh-copy-id は、鍵が見つからないと言う', () => {
    expect(machine().run('ssh-copy-id deploy@web01').err).toBe('/usr/bin/ssh-copy-id: ERROR: No identities found\n');
  });

  it('サーバの authorized_keys に秘密鍵を書くと、判定の式 ssh を満たさない', () => {
    const m = machine();
    m.run('ssh-keygen -N ""');
    m.run('ssh-copy-id deploy@web01');
    m.run('ssh deploy@web01');
    m.run('ssh deploy@web01 "echo -----BEGIN OPENSSH PRIVATE KEY----- >> .ssh/authorized_keys"');
    expect(netHolds(m.shell(), 'ssh deploy@web01')).toBe(false);
    // 手元の秘密鍵は手元に残る
    expect(exists(m.shell().vfs, KEY)).toBe(true);
  });

  it('保存して戻しても、登録した鍵と入った記録が残る', () => {
    const m = machine();
    m.run('ssh-keygen -N ""');
    m.run('ssh-copy-id deploy@web01');
    m.run('ssh deploy@web01');
    expect(netHolds(restoreShell(JSON.parse(JSON.stringify(snapshotShell(m.shell()))) as ShellSnapshotData), 'ssh deploy@web01')).toBe(true);
  });
});
