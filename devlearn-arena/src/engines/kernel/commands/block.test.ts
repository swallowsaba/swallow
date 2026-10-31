import { describe, expect, it } from 'vitest';
import { initialShell } from '../../environments';
import { checkState } from '@/learning/practice';
import { createClock } from '../clock';
import type { ShellState } from '../registry';
import { execute } from '../shell';
import { createDefaultRegistry } from '.';

/** 記憶装置とマウント（linux.a.03）と、資源の計器 vmstat・iostat・iotop（linux.a.02）と、sshd -t（linux.a.04） */

function open(setup: unknown): { run: (line: string) => { out: string; err: string; code: number }; state: () => ShellState } {
  let state: ShellState = initialShell('linux-basic', setup);
  const registry = createDefaultRegistry();
  const clock = createClock();
  return {
    run: (line) => {
      const o = execute(state, line, registry, clock);
      state = o.state;
      const pick = (k: 'stdout' | 'stderr'): string => o.chunks.filter((c) => c.stream === k).map((c) => c.text).join('');
      return { out: pick('stdout'), err: pick('stderr'), code: o.exitCode };
    },
    state: () => state,
  };
}

const disk = (): ReturnType<typeof open> => open({ hostname: 'srv', blockDevices: [{ name: 'vdb', size: '100G' }], files: { '/etc/fstab': 'UUID=root / ext4 defaults 0 1\n' } });

describe('記憶装置とマウント', () => {
  it('lsblk は装置を出す', () => {
    const t = disk();
    const o = t.run('lsblk').out;
    expect(o).toContain('NAME   MAJ:MIN RM  SIZE RO TYPE MOUNTPOINTS');
    expect(o).toMatch(/^vdb .*100G {2}0 disk$/m);
  });

  it('ファイルシステムを作らないと取り付かない。場所が無いと取り付かない', () => {
    const t = disk();
    expect(t.run('sudo mount /dev/vdb /data')).toMatchObject({ code: 32, err: 'mount: /data: mount point does not exist.\n' });
    t.run('sudo mkdir /data');
    expect(t.run('sudo mount /dev/vdb /data').err).toContain('wrong fs type, bad option, bad superblock on /dev/vdb');
    expect(t.run('mount /dev/vdb /data').err).toBe('mount: /data: must be superuser to use mount.\n');
  });

  it('作って取り付けると、findmnt と判定に出る。再起動すると fstab の物だけが残る', () => {
    const t = disk();
    t.run('sudo mkfs.ext4 /dev/vdb');
    t.run('sudo mkdir /data');
    expect(t.run('sudo mount /dev/vdb /data').code).toBe(0);
    expect(t.run('findmnt /data').out).toContain('/dev/vdb');
    expect(checkState({ kind: 'mount', path: '/data', device: '/dev/vdb' }, { shell: t.state() })).toBe(true);
    t.run('sudo reboot');
    expect(checkState({ kind: 'mount', path: '/data', device: '/dev/vdb' }, { shell: t.state() })).toBe(false);
    t.run("echo '/dev/vdb /data ext4 defaults 0 2' | sudo tee -a /etc/fstab");
    expect(t.run('sudo mount -a').code).toBe(0);
    t.run('sudo reboot');
    expect(checkState({ kind: 'mount', path: '/data', device: '/dev/vdb' }, { shell: t.state() })).toBe(true);
  });

  it('UUID でも書ける。blkid で読める', () => {
    const t = disk();
    t.run('sudo mkfs -t ext4 /dev/vdb');
    t.run('sudo mkdir /data');
    const uuid = /UUID="([^"]+)"/.exec(t.run('blkid /dev/vdb').out)?.[1] ?? '';
    expect(uuid).not.toBe('');
    t.run(`echo 'UUID=${uuid} /data ext4 defaults 0 2' | sudo tee -a /etc/fstab`);
    expect(t.run('sudo mount -a').code).toBe(0);
    expect(checkState({ kind: 'mount', path: '/data', device: '/dev/vdb' }, { shell: t.state() })).toBe(true);
  });

  it('fstab の誤りは mount -a で分かる。そのまま再起動すると緊急モードで止まる', () => {
    const t = disk();
    t.run('sudo mkfs.ext4 /dev/vdb');
    t.run('sudo mkdir /data');
    t.run("echo '/dev/vdx /data ext4 defaults 0 2' | sudo tee -a /etc/fstab");
    expect(t.run('sudo mount -a')).toMatchObject({ code: 32, err: 'mount: /data: special device /dev/vdx does not exist.\n' });
    expect(t.run('sudo reboot').err).toContain('You are in emergency mode');
  });
});

describe('資源の計器', () => {
  const slow = (): ReturnType<typeof open> => open({
    hostname: 'srv',
    meters: { cpus: 4, load: [8.2, 7.9, 6.1], us: 12, sy: 4, id: 20, wa: 64, writeMBs: 180, util: 98 },
    processes: [{ command: '/usr/bin/report-batch', memory: 120, cpu: 5, ioMBs: 176 }, { command: '/usr/bin/web', memory: 200, cpu: 8, ioMBs: 1 }],
  });

  it('uptime と top に負荷平均と待ちが出る', () => {
    const t = slow();
    expect(t.run('uptime').out).toContain('load average: 8.20, 7.90, 6.10');
    const top = t.run('top -b -n 1').out;
    expect(top).toContain('load average: 8.20, 7.90, 6.10');
    expect(top).toContain('%Cpu(s): 12.0 us,  4.0 sy,  0.0 ni, 20.0 id, 64.0 wa,  0.0 hi,  0.0 si,  0.0 st');
  });

  it('vmstat の wa・iostat の %util', () => {
    const t = slow();
    const v = t.run('vmstat').out.split('\n');
    expect(v[1]).toContain('us sy id wa st');
    expect((v[2] ?? '').trim().split(/\s+/).slice(-5)).toEqual(['12', '4', '20', '64', '0']);
    expect(t.run('iostat -x').out).toMatch(/^vda\s.*98\.0$/m);
  });

  it('iotop は管理者だけ。書き込みの多い順に並ぶ', () => {
    const t = slow();
    expect(t.run('iotop -b -n 1').err).toContain('requires root');
    const lines = t.run('sudo iotop -b -o -n 1').out.split('\n');
    expect(lines[0]).toContain('Total DISK WRITE');
    expect(lines[2]).toContain('/usr/bin/report-batch');
    expect(lines[2]).toContain('176.00 M/s');
    expect(lines[3]).toContain('/usr/bin/web');
  });
});

describe('sshd -t', () => {
  it('設定を検査する。知らない鍵は行の番号で断る', () => {
    const t = open({ files: { '/etc/ssh/sshd_config': 'PermitRootLogin no\nPasswordAuthentication no\n' } });
    expect(t.run('sudo sshd -t').code).toBe(0);
    t.run("sudo sed -i 's/PermitRootLogin no/PermitRoot no/' /etc/ssh/sshd_config");
    expect(t.run('sudo sshd -t')).toMatchObject({ code: 255, err: '/etc/ssh/sshd_config: line 1: Bad configuration option: PermitRoot\n/etc/ssh/sshd_config: terminating, 1 bad configuration options\n' });
  });
});
