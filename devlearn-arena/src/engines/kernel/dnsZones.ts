import { addressesOf, parseZone } from '@/engines/net/zone';
import type { ShellState } from './registry';
import { exists, isDir, readFile } from './vfs';

/**
 * 動いている DNS のサーバ（ゾーンファイルを持つサービス）が読んだ答えを、網の名前の答えに入れる。
 * 動かした時・読み直した時（systemctl start・restart・reload）と、実戦の始めに呼ぶ。
 * ゾーンファイルを書き換えただけでは答えは変わらない（本物と同じく、読み直すまで古い答えのまま）
 */
export function withZones(shell: ShellState): ShellState {
  if (shell.net === null || shell.services === null) return shell;
  let dns = shell.net.dns;
  for (const s of shell.services.services.values()) {
    if (s.active !== 'active' || s.zone === undefined) continue;
    if (!exists(shell.vfs, s.zone) || isDir(shell.vfs, s.zone)) continue;
    dns = new Map([...dns, ...addressesOf(parseZone(readFile(shell.vfs, s.zone)))]);
  }
  return dns === shell.net.dns ? shell : { ...shell, net: { ...shell.net, dns } };
}
