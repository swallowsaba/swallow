import { describe, expect, it } from 'vitest';
import { initialShell } from '../../environments';
import { checkState } from '@/learning/practice';
import { createClock } from '../clock';
import type { ShellState } from '../registry';
import { execute } from '../shell';
import { createDefaultRegistry } from '.';

/** ディスクの満杯（trouble.i.01）。使用中のファイルを消しても空きは戻らない。truncate なら戻る。満杯の間、書くサービスは 500 を返す */

function open(): { run: (line: string) => { out: string; err: string; code: number }; state: () => ShellState } {
  let state: ShellState = initialShell('linux-basic', {
    hostname: 'reserve-web',
    disk: '20G',
    files: { '/etc/hosts': '127.0.0.1\tlocalhost reserve.example\n', '/var/log/app/app.log': 'line\n', '/var/lib/app/data.bin': 'x\n' },
    sizes: { '/var/log/app/app.log': '18G', '/var/lib/app/data.bin': '2G' },
    processes: [{ command: '/usr/bin/reserve', memory: 64, user: 'learner', openFiles: ['/var/log/app/app.log'] }],
    services: { reserve: { description: 'Reserve app', active: true, enabled: true, port: 80, body: '<h1>港の予約</h1>', diskGuard: true } },
  });
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

const use = (t: ReturnType<typeof open>): string => t.run('df --output=pcent').out.trim().split('\n')[1]?.trim() ?? '';

describe('ディスクの満杯', () => {
  it('満杯の間、書くサービスは 500 を返す', () => {
    const t = open();
    expect(use(t)).toBe('100%');
    expect(t.run("curl -s -o /dev/null -w '%{http_code}' http://reserve.example/").out).toBe('500');
  });

  it('truncate -s 0 で中身を空にすると、空きが戻り、サービスも答える', () => {
    const t = open();
    expect(t.run('truncate -s 0 /var/log/app/app.log').code).toBe(0);
    expect(t.run('cat /var/log/app/app.log').out).toBe('');
    expect(use(t)).toBe('11%');
    expect(t.run("curl -s -o /dev/null -w '%{http_code}' http://reserve.example/").out).toBe('200');
    expect(checkState({ kind: 'disk', maxUse: 70 }, { shell: t.state() })).toBe(true);
  });

  it('使用中のファイルを rm しても、掴んでいる間は空きが戻らない。サービスを動かし直すと戻る', () => {
    const t = open();
    t.run('rm /var/log/app/app.log');
    expect(t.run('ls /var/log/app').out).toBe('');
    expect(use(t)).toBe('100%');
    expect(checkState({ kind: 'disk', maxUse: 70 }, { shell: t.state() })).toBe(false);
    t.run('sudo systemctl restart reserve');
    expect(use(t)).toBe('11%');
  });

  it('truncate の誤り: ファイルを書かない・大きさの無い形', () => {
    const t = open();
    expect(t.run('truncate -s 0')).toMatchObject({ code: 1, err: "truncate: missing file operand\nTry 'truncate --help' for more information.\n" });
    expect(t.run('truncate /var/log/app/app.log')).toMatchObject({ code: 1, err: "truncate: you must specify either '--size' or '--reference'\nTry 'truncate --help' for more information.\n" });
  });
});
