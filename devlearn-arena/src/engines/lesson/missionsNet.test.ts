import { describe, expect, it } from 'vitest';
import { createDefaultRegistry } from '@/engines/kernel/commands';
import { createClock } from '@/engines/kernel/clock';
import { createShellState } from '@/engines/kernel/session';
import { execute } from '@/engines/kernel/shell';
import type { ShellState } from '@/engines/kernel/registry';
import { findMission } from './missions';
import { createProgress, evaluate } from './runner';

const registry = createDefaultRegistry();

function solve(id: string, lines: readonly string[]): { cleared: boolean; stoppedAt: number } {
  const mission = findMission(id);
  if (!mission) throw new Error(`任務が見つかりません: ${id}`);
  const clock = createClock();
  const timeline: ShellState[] = [createShellState(mission.initial)];
  let progress = createProgress(mission);
  for (const line of lines) {
    const last = timeline[timeline.length - 1];
    if (!last) break;
    timeline.push(execute(last, line, registry, clock).state);
    progress = evaluate(mission, progress, timeline);
  }
  return { cleared: progress.cleared, stoppedAt: progress.stepIndex };
}

function expectCleared(id: string, lines: readonly string[]): void {
  const result = solve(id, lines);
  expect(result.cleared, `${id} が手順 ${String(result.stoppedAt + 1)} で止まりました`).toBe(true);
}

describe('ネットワークの任務が実際に解ける', () => {
  it('層ごとに包まれていることを見る', () => {
    expectCleared('net/01/encapsulation', [
      'ip addr',
      'ping 192.168.1.20',
      'traceroute 192.168.1.20',
      'curl -v http://192.168.1.20:8080/',
    ]);
  });

  it('IP から MAC を引く', () => {
    expectCleared('net/02/arp-resolve', ['arp', 'arp 192.168.1.20', 'arp 192.168.1.99']);
  });

  it('スイッチは通ったフレームを覚える', () => {
    expectCleared('net/02/switch-learning', [
      'bridge fdb sw1',
      'arp 192.168.1.20',
      'ping 192.168.1.20',
      'bridge fdb sw1',
    ]);
  });

  it('アドレス設計を計算で決める', () => {
    expectCleared('net/03/subnet-drill', [
      'ipcalc 10.0.0.0/22 > hosts.txt',
      'ipcalc 172.16.5.130/26 > net.txt',
    ]);
  });

  it('IPv6 の書き方に慣れる', () => {
    expectCleared('net/04/ipv6-format', [
      'ip6calc 2001:db8::1 > v6.txt',
      'ip6calc fe80::1',
      'ip6calc 2001:db8::/64 00:1a:2b:3c:4d:5e > slaac.txt',
    ]);
  });

  it('経路をたどる', () => {
    expectCleared('net/05/ttl-hop', [
      'ip addr',
      'ip route',
      'ping web.internal',
      'traceroute web.internal',
      'ipcalc 192.168.1.10/26 > subnet.txt',
    ]);
  });

  it('1つの外側アドレスを分け合う', () => {
    expectCleared('net/06/pat-ports', [
      'nat gw',
      'curl http://203.0.113.2/',
      'nat gw',
      'curl http://203.0.113.2:443/',
      'nat gw',
    ]);
  });

  it('接続を張って、閉じる', () => {
    expectCleared('net/07/handshake', [
      'tcp reset',
      'tcp send',
      'tcp connect',
      'tcp send 200',
      'tcp close',
      'tcp tick 8',
      'tcp state',
    ]);
  });

  it('ルートから順に聞いていく', () => {
    expectCleared('net/08/dns-recursion', [
      'dnstrace www.example.com',
      'dnstrace www.example.com',
      'dnstrace shop.example.com',
    ]);
  });

  it('アドレスを借りる', () => {
    expectCleared('net/09/dora', ['dhclient', 'dhclient']);
  });

  it('証明書が通らない理由を見分ける', () => {
    expectCleared('net/10/tls-handshake', [
      'tlscheck shop.example.com',
      'tlscheck old.example.com',
      'tlscheck self.example.com',
      'echo "expired: 期限切れ / issuer: 発行者が信用されていない" > tls.txt',
    ]);
  });

  it('振り分け先が生きているかを確かめる', () => {
    expectCleared('net/11/health-check', [
      'curl http://10.0.0.21/',
      'curl http://10.0.0.22/',
      'curl http://10.0.0.23/',
      'echo 10.0.0.22 > down.txt',
    ]);
  });

  it('落とし方の違いを見分ける', () => {
    expectCleared('net/12/drop-vs-reject', [
      'curl http://10.0.0.20/',
      'curl http://10.0.0.20:9001/',
      'curl http://10.0.0.20:9000/',
      'echo "refused=待ち受けなし / firewall=塞がれている" > diag.txt',
    ]);
  });

  it('重ならないアドレス設計をする', () => {
    expectCleared('net/13/vpc-design', [
      'ipcalc 10.0.16.0/20 > plan.txt',
      'echo 172.16.0.0/16 >> plan.txt',
    ]);
  });

  it('ping は通るのに curl が失敗する', () => {
    const mission = findMission('net/14/boss-final');
    expect(mission).toBeDefined();
  });
});
