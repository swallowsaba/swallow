import { addressesOf, checkZone, parseZone, type ZoneRecord } from '@/engines/net/zone';
import type { ShellState } from './registry';
import { exists, isDir, readFile } from './vfs';

/**
 * 動いている DNS のサーバ（ゾーンファイルを持つサービス）が読んだ答えを、網の名前の答えに入れる。
 * 動かした時・読み直した時（systemctl start・restart・reload）と、実戦の始めに呼ぶ。
 * ゾーンファイルを書き換えただけでは答えは変わらない（本物と同じく、読み直すまで古い答えのまま）。
 * 誤りのあるゾーン（named-checkzone が通らない物）は読み込まず、前に読んだ答えのまま（本物の named と同じ）
 */
export function withZones(shell: ShellState): ShellState {
  if (shell.net === null || shell.services === null) return shell;
  let dns = shell.net.dns;
  let records: ZoneRecord[] | undefined = shell.net.records;
  for (const s of shell.services.services.values()) {
    if (s.active !== 'active' || s.zone === undefined) continue;
    if (!exists(shell.vfs, s.zone) || isDir(shell.vfs, s.zone)) continue;
    const text = readFile(shell.vfs, s.zone);
    const recs = parseZone(text);
    const origin = /^\$ORIGIN\s+(\S+)/m.exec(text)?.[1]?.replace(/\.$/, '') ?? '';
    if (origin !== '' && !checkZone(text, origin, s.zone).ok) continue;
    dns = new Map([...dns, ...addressesOf(recs)]);
    const names = new Set(recs.map((r) => r.name));
    records = [...(records ?? []).filter((r) => !names.has(r.name) && !(origin !== '' && (r.name === origin || r.name.endsWith(`.${origin}`)))), ...recs];
  }
  if (dns === shell.net.dns && records === shell.net.records) return shell;
  return { ...shell, net: { ...shell.net, dns, ...(records ? { records } : {}) } };
}
