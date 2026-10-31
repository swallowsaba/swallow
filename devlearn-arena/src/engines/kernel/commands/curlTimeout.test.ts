import { describe, expect, it } from 'vitest';
import { initialShell } from '../../environments';
import { createClock } from '../clock';
import type { ShellState } from '../registry';
import { execute } from '../shell';
import { createDefaultRegistry } from '.';

/** curl の待つ時間の指定（--max-time・-m・--connect-timeout）。値は引数なので、URL と取り違えない */

function open(setup: unknown): (line: string) => { err: string; code: number } {
  let state: ShellState = initialShell(setup === null ? 'linux-basic' : 'net-client', setup ?? { files: { '/etc/hosts': '127.0.0.1 localhost' } });
  const registry = createDefaultRegistry();
  const clock = createClock();
  return (line) => {
    const o = execute(state, line, registry, clock);
    state = o.state;
    return { err: o.chunks.filter((c) => c.stream === 'stderr').map((c) => c.text).join(''), code: o.exitCode };
  };
}

const NET = {
  user: 'root',
  network: {
    self: 'pc',
    devices: [{ name: 'pc', addrs: ['192.168.1.10/24'] }, { name: 'web', addrs: ['192.168.1.20/24'], listen: [80], body: 'ok' }],
    links: [['pc', 'web']],
    dns: { 'web.example': '192.168.1.20' },
  },
};

describe('curl の待つ時間の指定', () => {
  it.each(['--max-time 3', '-m 3', '--connect-timeout 3'])('網のある実戦で %s を URL と取り違えない', (opt) => {
    expect(open(NET)(`curl ${opt} http://web.example/`).code).toBe(0);
  });

  it.each(['--max-time 3', '-m 3', '--connect-timeout 3'])('網の無い実戦で %s を断らない', (opt) => {
    expect(open(null)(`curl ${opt} http://localhost:9/`).err).toContain('Failed to connect');
  });
});
