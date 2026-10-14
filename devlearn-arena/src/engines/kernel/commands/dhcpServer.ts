import { activeLeases, parseDhcpConf } from '@/engines/net/dhcp';
import { normalize } from '../path';
import type { CommandSpec } from '../registry';
import { exists, isDir, readFile } from '../vfs';
import { fromLines } from './args';

const BANNER = [
  'Internet Systems Consortium DHCP Server 4.4.3-P1',
  'Copyright 2004-2022 Internet Systems Consortium.',
  'All rights reserved.',
  'For info, please visit https://www.isc.org/software/dhcp/',
];

/**
 * DHCP のサーバの道具（net.b.08）。
 * - `dhcpd -t [-q] -cf 設定`: 設定の書き方を確かめる（本物と同じく、名乗りの行は標準エラーに出し、-q で黙る）
 * - `dhcp-lease-list [--lease ファイル]`: リースのファイルから、今貸しているアドレスを並べる
 */
export const dhcpServerCommands: CommandSpec[] = [
  {
    name: 'dhcpd',
    summary: 'DHCP のサーバ（-t で設定の書き方を確かめる）',
    handler: ({ argv, shell }) => {
      const args = argv.slice(1);
      const at = args.indexOf('-cf');
      const file = at >= 0 ? args[at + 1] : '/etc/dhcp/dhcpd.conf';
      if (file === undefined) return { stderr: 'dhcpd: -cf: missing argument\n', code: 1 };
      if (!args.includes('-t')) return { stderr: 'dhcpd: 練習の機械では、サーバは systemctl で動かす（isc-dhcp-server）。設定を確かめるのは dhcpd -t\n', code: 1 };
      const quiet = args.includes('-q');
      const path = normalize(file.startsWith('/') ? file : `${shell.cwd}/${file}`);
      const head = quiet ? [] : BANNER;
      if (!exists(shell.vfs, path) || isDir(shell.vfs, path)) return { stderr: fromLines([...head, `Can't open ${file}: No such file or directory`]), code: 1 };
      const r = parseDhcpConf(readFile(shell.vfs, path), file);
      if (!r.ok) return { stderr: fromLines([...head, ...r.lines]), code: 1 };
      return quiet ? {} : { stderr: fromLines([...head, `Config file: ${file}`, 'Database file: /var/lib/dhcp/dhcpd.leases', 'PID file: /var/run/dhcpd.pid']) };
    },
  },
  {
    name: 'dhcp-lease-list',
    summary: 'DHCP のサーバが今貸しているアドレスを並べる',
    handler: ({ argv, shell }) => {
      const at = argv.indexOf('--lease');
      const file = at >= 0 ? (argv[at + 1] ?? '') : '/var/lib/dhcp/dhcpd.leases';
      const path = normalize(file.startsWith('/') ? file : `${shell.cwd}/${file}`);
      if (!exists(shell.vfs, path) || isDir(shell.vfs, path)) return { stderr: `Cannot open ${file}: No such file or directory\n`, code: 1 };
      const rows = activeLeases(readFile(shell.vfs, path));
      return {
        stdout: fromLines([
          `${'MAC'.padEnd(19)}${'IP'.padEnd(16)}${'hostname'.padEnd(15)}${'valid until'.padEnd(20)}manufacturer`,
          '='.repeat(95),
          ...rows.map((r) => `${r.mac.padEnd(19)}${r.ip.padEnd(16)}${r.host.padEnd(15)}${r.ends.padEnd(20)}-NA-`),
        ]),
      };
    },
  },
];
