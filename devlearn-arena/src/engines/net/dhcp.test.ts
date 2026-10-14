import { describe, expect, it } from 'vitest';
import { initialShell } from '@/engines/environments';
import { createClock } from '@/engines/kernel/clock';
import { createDefaultRegistry } from '@/engines/kernel/commands';
import type { ShellState } from '@/engines/kernel/registry';
import { execute } from '@/engines/kernel/shell';
import { readFile } from '@/engines/kernel/vfs';
import { checkState } from '@/learning/practice';
import { activeLeases, leasesText, parseDhcpConf, serveLeases } from './dhcp';

const conf = (range: string): string => [
  'default-lease-time 86400;',
  'authoritative;',
  '',
  'subnet 192.168.1.0 netmask 255.255.255.0 {',
  `  ${range}`,
  '  option routers 192.168.1.1;',
  '}',
  '',
].join('\n');

const guests = [1, 2, 3, 4, 5].map((n) => ({ host: `guest-${String(n)}`, mac: `52:54:00:aa:01:0${String(n)}` }));

describe('DHCP のサーバ（dhcpd.conf）', () => {
  it('dhcpd -t と同じ確かめ: ; の書き忘れは行と場所を示し、網の外の範囲は断る', () => {
    expect(parseDhcpConf(conf('range 192.168.1.100 192.168.1.150;'), 'dhcpd.conf')).toMatchObject({ ok: true, config: { leaseTime: 86400, subnets: [{ network: '192.168.1.0', prefix: 24, ranges: [['192.168.1.100', '192.168.1.150']], routers: '192.168.1.1' }] } });
    expect(parseDhcpConf(conf('range 192.168.1.100 192.168.1.150'), 'dhcpd.conf')).toEqual({ ok: false, lines: ['dhcpd.conf line 5: semicolon expected.', '  range 192.168.1.100 192.168.1.150', '^', 'Configuration file errors encountered -- exiting'] });
    expect(parseDhcpConf(conf('range 10.0.0.1 10.0.0.9;'), 'dhcpd.conf')).toEqual({ ok: false, lines: ['Address range 10.0.0.1 to 10.0.0.9 not on net 192.168.1.0/255.255.255.0!', 'Configuration file errors encountered -- exiting'] });
  });

  it('小さい方から貸す。使われているアドレスは借りた機械が断り（abandoned）、尽きると no free leases', () => {
    const parsed = parseDhcpConf(conf('range 192.168.1.1 192.168.1.3;'), 'c');
    if (!parsed.ok) throw new Error('設定が読めない');
    const run = serveLeases(parsed.config, guests, ['192.168.1.1'], 'eth0');
    expect(run.leases.map((l) => [l.client.host, l.ip])).toEqual([['guest-1', '192.168.1.2'], ['guest-2', '192.168.1.3']]);
    expect(run.abandoned).toEqual(['192.168.1.1']);
    expect(run.starved.map((c) => c.host)).toEqual(['guest-3', 'guest-4', 'guest-5']);
    expect(run.log).toContain('Abandoning IP address 192.168.1.1: declined.');
    expect(run.log).toContain('DHCPDISCOVER from 52:54:00:aa:01:05 via eth0: network 192.168.1.0/24: no free leases');
    // リースのファイルは本物の形で、動いている貸し出しだけを読み戻せる
    const text = leasesText(run, 86400, 1791018000);
    expect(text).toContain('lease 192.168.1.1 {\n  starts 6 2026/10/03 09:00:00;\n  ends 0 2026/10/04 09:00:00;\n  binding state abandoned;');
    expect(activeLeases(text)).toEqual([
      { ip: '192.168.1.2', mac: '52:54:00:aa:01:01', host: 'guest-1', ends: '2026-10-04 09:00:00' },
      { ip: '192.168.1.3', mac: '52:54:00:aa:01:02', host: 'guest-2', ends: '2026-10-04 09:00:00' },
    ]);
  });
});

describe('isc-dhcp-server のサービスと道具（systemctl・dhcpd -t・dhcp-lease-list）', () => {
  const setup = {
    files: { '/etc/dhcp/dhcpd.conf': conf('range 192.168.1.1 192.168.1.3;') },
    services: { 'isc-dhcp-server': { description: 'ISC DHCP IPv4 server', enabled: true, dhcp: { config: '/etc/dhcp/dhcpd.conf', leases: '/var/lib/dhcp/dhcpd.leases', clients: guests, inUse: ['192.168.1.1', '192.168.1.10'] } } },
  };
  const registry = createDefaultRegistry();
  const clock = createClock();

  it('動かすと貸してリースのファイルに書く。設定を直して動かし直すと、全ての機械が重ならずに借りる', () => {
    let shell: ShellState = initialShell('linux-server', setup);
    const run = (line: string): { out: string; err: string } => {
      const o = execute(shell, line, registry, clock);
      shell = o.state;
      const of = (k: string): string => o.chunks.filter((c) => c.stream === k).map((c) => c.text).join('');
      return { out: of('stdout'), err: of('stderr') };
    };
    const done = { kind: 'fs' as const, path: '/var/lib/dhcp/dhcpd.leases', contains: 'client-hostname "guest-5"', lacks: ['abandoned'] };
    run('systemctl start isc-dhcp-server');
    expect(run('dhcp-lease-list').out).toContain('52:54:00:aa:01:02  192.168.1.3     guest-2');
    const abandoned = run('grep -B3 abandoned /var/lib/dhcp/dhcpd.leases').out.split('\n');
    expect(abandoned[0]).toBe('lease 192.168.1.1 {');
    expect(abandoned.slice(1, 4).map((x) => x.trim().split(' ')[0])).toEqual(['starts', 'ends', 'binding']);
    expect(abandoned[3]).toBe('  binding state abandoned;');
    expect(checkState(done, { shell })).toBe(false);
    run("sed -i 's/range 192.168.1.1 192.168.1.3;/range 192.168.1.100 192.168.1.150/' /etc/dhcp/dhcpd.conf");
    expect(run('dhcpd -t -q -cf /etc/dhcp/dhcpd.conf').err).toContain('semicolon expected.');
    // 誤りのある設定では動かし直せない（dhcpd の言い方がログに残る）
    expect(run('systemctl restart isc-dhcp-server').err).toContain('Job for isc-dhcp-server.service failed');
    expect(run('journalctl -u isc-dhcp-server --no-pager').out).toContain('dhcpd.conf line 5: semicolon expected.');
    run("sed -i 's/192.168.1.150$/192.168.1.150;/' /etc/dhcp/dhcpd.conf");
    expect(run('dhcpd -t -q -cf /etc/dhcp/dhcpd.conf && systemctl restart isc-dhcp-server').err).toBe('');
    expect(run('dhcp-lease-list').out).toContain('192.168.1.104   guest-5');
    expect(readFile(shell.vfs, '/var/lib/dhcp/dhcpd.leases')).not.toContain('abandoned');
    expect(checkState(done, { shell })).toBe(true);
    // -q を付けなければ、本物と同じく名乗りの行を標準エラーに出す
    expect(run('dhcpd -t -cf /etc/dhcp/dhcpd.conf').err).toContain('Internet Systems Consortium DHCP Server');
  });
});
