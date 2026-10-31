import { describe, expect, it } from 'vitest';
import { initialShell } from '../../environments';
import { checkState } from '@/learning/practice';
import { createClock } from '../clock';
import type { ShellState } from '../registry';
import { execute } from '../shell';
import { createDefaultRegistry } from '.';

/** ufw（機械の入口の規則）と reboot（lab.i.01 Web サービスを公開する） */

function open(): { run: (line: string) => { out: string; err: string; code: number }; state: () => ShellState } {
  let state: ShellState = initialShell('linux-basic', {
    hostname: 'minato-shop',
    files: { '/etc/hosts': '127.0.0.1 localhost shop.example\n', '/etc/nginx/conf.d/shop.conf': 'server {\n  listen 80;\n  server_name shop.example;\n  root /var/www/shop;\n}\n', '/var/www/shop/index.html': '<h1>港の店</h1>\n' },
    services: {
      nginx: { description: 'nginx web server', enabled: false, config: '/etc/nginx/conf.d/shop.conf' },
      app: { description: 'App', enabled: false, port: 8080 },
    },
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

describe('ufw', () => {
  it('管理者でないと断る', () => {
    expect(open().run('ufw status')).toMatchObject({ code: 1, err: 'ERROR: You need to be root to run this script\n' });
  });

  it('初めは止まっている。allow で規則を足し、enable で動かす', () => {
    const t = open();
    expect(t.run('sudo ufw status').out).toBe('Status: inactive\n');
    expect(t.run('sudo ufw allow 443/tcp').out).toBe('Rules updated\nRules updated (v6)\n');
    expect(t.run('sudo ufw allow 443/tcp').out).toBe('Skipping adding existing rule\nSkipping adding existing rule (v6)\n');
    expect(t.run('sudo ufw enable').out).toBe('Firewall is active and enabled on system startup\n');
    expect(t.run('sudo ufw allow 22').out).toBe('Rule added\nRule added (v6)\n');
    expect(t.run('sudo ufw status').out).toBe([
      'Status: active',
      '',
      'To                         Action      From',
      '--                         ------      ----',
      '443/tcp                    ALLOW       Anywhere',
      '22                         ALLOW       Anywhere',
      '443/tcp (v6)               ALLOW       Anywhere (v6)',
      '22 (v6)                    ALLOW       Anywhere (v6)',
      '',
    ].join('\n'));
    expect(checkState({ kind: 'fs', path: '/etc/ufw/user.rules', contains: '--dport 443' }, { shell: t.state() })).toBe(true);
  });

  it('delete で規則を消す。読めない形は断る', () => {
    const t = open();
    t.run('sudo ufw allow 80/tcp');
    expect(t.run('sudo ufw delete allow 80/tcp').out).toBe('Rules updated\nRules updated (v6)\n');
    expect(t.run('sudo ufw allow nginx')).toMatchObject({ code: 1, err: "ERROR: Could not find a profile matching 'nginx'\n" });
    expect(t.run('sudo ufw open 80').code).toBe(1);
  });
});

describe('reboot', () => {
  it('有効なサービスだけが動き出す', () => {
    const t = open();
    t.run('sudo systemctl start nginx');
    t.run('sudo systemctl start app');
    t.run('sudo systemctl enable nginx');
    t.run('sudo reboot');
    expect(checkState({ kind: 'service', name: 'nginx', active: true }, { shell: t.state() })).toBe(true);
    expect(checkState({ kind: 'service', name: 'app', active: false }, { shell: t.state() })).toBe(true);
    expect(t.run('curl -s http://shop.example/').out).toContain('港の店');
  });

  it('管理者でないと断る', () => {
    expect(open().run('reboot')).toMatchObject({ code: 1, err: 'Call to Reboot failed: Interactive authentication required.\n' });
  });
});
