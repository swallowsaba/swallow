import { beforeEach, describe, expect, it } from 'vitest';
import { emptyTopology } from '@/engines/net/build';
import { createSession, type Session } from '../session';
import { execute } from '../shell';

let session: Session;

beforeEach(() => {
  session = createSession({ net: emptyTopology(), vars: { NET_SELF: 'pc1' } });
});

function run(line: string): { out: string; err: string; code: number } {
  const outcome = execute(session.state, line, session.registry, session.clock);
  session = { ...session, state: outcome.state };
  const pick = (s: 'stdout' | 'stderr') =>
    outcome.chunks.filter((c) => c.stream === s).map((c) => c.text).join('');
  return { out: pick('stdout'), err: pick('stderr'), code: outcome.exitCode };
}

function runAll(lines: readonly string[]): void {
  for (const line of lines) {
    const result = run(line);
    if (result.code !== 0) throw new Error(`${line} -> ${result.err}`);
  }
}

describe('何も無いところから同じ網を作る', () => {
  const build = [
    'netlab add host pc1',
    'netlab add host pc2',
    'netlab add switch sw1',
    'netlab link pc1:eth0 sw1:p1',
    'netlab link pc2:eth0 sw1:p2',
    'ip addr add 10.0.0.1/24 dev eth0',
    'export NET_SELF=pc2',
    'ip addr add 10.0.0.2/24 dev eth0',
    'export NET_SELF=pc1',
  ];

  it('作る前は誰にも届かない', () => {
    expect(run('ping pc2').code).not.toBe(0);
  });

  it('作れば届く', () => {
    runAll(build);
    const ping = run('ping 10.0.0.2');
    expect(ping.code).toBe(0);
    expect(ping.out).toContain('10.0.0.2');
  });

  it('アドレスを付けるまでは届かない', () => {
    runAll(build.slice(0, 5));
    expect(run('ping 10.0.0.2').code).not.toBe(0);
  });

  it('ケーブルを抜くと届かなくなり、挿せば戻る', () => {
    runAll(build);
    run('netlab cable down pc2:eth0 sw1:p2');
    expect(run('ping 10.0.0.2').code).not.toBe(0);
    run('netlab cable up pc2:eth0 sw1:p2');
    expect(run('ping 10.0.0.2').code).toBe(0);
  });

  it('口を落としても届かなくなる', () => {
    runAll(build);
    run('ip link set eth0 down');
    expect(run('ping 10.0.0.2').code).not.toBe(0);
  });

  it('ip -n <機器> で、その機器の口を外から落とし、戻せる', () => {
    runAll(build);
    expect(run('ip -n pc2 link set eth0 down').code).toBe(0);
    expect(run('ping 10.0.0.2').code).not.toBe(0);
    expect(run('ip -n pc2 link').out).toContain('DOWN');
    // 自分の機器の口はそのまま
    expect(run('ip link').out).toContain('UP');
    expect(run('ip -n pc2 link set eth0 up').code).toBe(0);
    expect(run('ping 10.0.0.2').code).toBe(0);
  });

  it('ip -n で無い機器を指すと、本物と同じ言い方で失敗する', () => {
    runAll(build);
    const result = run('ip -n nope link set eth0 down');
    expect(result.code).toBe(1);
    expect(result.err).toContain('Cannot open network namespace "nope"');
    expect(run('ip -n').code).toBe(255);
  });

  it('list で構成が読める', () => {
    runAll(build);
    const list = run('netlab list').out;
    expect(list).toContain('pc1');
    expect(list).toContain('sw1');
    expect(list).toContain('cable  pc1:eth0 <-> sw1:p1');
  });
});

describe('網を分けてルータで繋ぐ', () => {
  const build = [
    'netlab add host pc1',
    'netlab add host pc2',
    'netlab add router r1',
    'netlab link pc1:eth0 r1:eth0',
    'netlab link pc2:eth0 r1:eth1',
    'ip addr add 10.0.0.1/24 dev eth0',
    'export NET_SELF=r1',
    'ip addr add 10.0.0.254/24 dev eth0',
    'ip addr add 10.0.1.254/24 dev eth1',
    'export NET_SELF=pc2',
    'ip addr add 10.0.1.1/24 dev eth0',
    'export NET_SELF=pc1',
  ];

  it('既定経路が無いうちは別の網へ出られない', () => {
    runAll(build);
    expect(run('ping 10.0.1.1').code).not.toBe(0);
  });

  it('両側に既定経路を置けば通る', () => {
    runAll([
      ...build,
      'ip route add default via 10.0.0.254 dev eth0',
      'export NET_SELF=pc2',
      'ip route add default via 10.0.1.254 dev eth0',
      'export NET_SELF=pc1',
    ]);
    expect(run('ping 10.0.1.1').code).toBe(0);
    expect(run('traceroute 10.0.1.1').out).toContain('r1');
  });

  it('経路表に直結の網と足した経路が並ぶ', () => {
    runAll([...build, 'ip route add default via 10.0.0.254 dev eth0']);
    const routes = run('ip route').out;
    expect(routes).toContain('default via 10.0.0.254 dev eth0');
    expect(routes).toContain('10.0.0.0/24 dev eth0 proto kernel');
  });

  it('同じ宛先は二度足せない', () => {
    runAll([...build, 'ip route add default via 10.0.0.254 dev eth0']);
    const twice = run('ip route add default via 10.0.0.254 dev eth0');
    expect(twice.code).not.toBe(0);
    expect(twice.err).toContain('File exists');
  });

  it('消せばまた届かなくなる', () => {
    runAll([
      ...build,
      'ip route add default via 10.0.0.254 dev eth0',
      'export NET_SELF=pc2',
      'ip route add default via 10.0.1.254 dev eth0',
      'export NET_SELF=pc1',
    ]);
    expect(run('ping 10.0.1.1').code).toBe(0);
    run('ip route del default via 10.0.0.254 dev eth0');
    expect(run('ping 10.0.1.1').code).not.toBe(0);
  });
});

describe('待ち受けと遮断', () => {
  const build = [
    'netlab add host pc1',
    'netlab add host web',
    'netlab link pc1:eth0 web:eth0',
    'ip addr add 10.0.0.1/24 dev eth0',
    'export NET_SELF=web',
    'ip addr add 10.0.0.2/24 dev eth0',
  ];

  it('開けたポートだけが繋がる', () => {
    runAll(build);
    run('service listen 80');
    run('export NET_SELF=pc1');
    expect(run('curl http://10.0.0.2/').code).toBe(0);
  });

  it('塞げば繋がらない', () => {
    runAll(build);
    run('service listen 80');
    run('service block 80');
    run('export NET_SELF=pc1');
    expect(run('curl http://10.0.0.2/').code).not.toBe(0);
  });

  it('名前を引けるようにできる', () => {
    runAll(build);
    run('service listen 80');
    run('export NET_SELF=pc1');
    run('hosts add web.example 10.0.0.2');
    expect(run('hosts list').out).toContain('web.example');
    expect(run('ping web.example').code).toBe(0);
  });
});

describe('VLAN と NAT の設定', () => {
  it('ポートを VLAN に分けると、違う VLAN には届かない', () => {
    runAll([
      'netlab add host pc1',
      'netlab add host pc2',
      'netlab add switch sw1',
      'netlab link pc1:eth0 sw1:p1',
      'netlab link pc2:eth0 sw1:p2',
      'ip addr add 10.0.0.1/24 dev eth0',
      'export NET_SELF=pc2',
      'ip addr add 10.0.0.2/24 dev eth0',
      'export NET_SELF=pc1',
    ]);
    expect(run('ping 10.0.0.2').code).toBe(0);
    run('bridge vlan add dev sw1:p1 vid 10');
    run('bridge vlan add dev sw1:p2 vid 20');
    expect(run('ping 10.0.0.2').code).not.toBe(0);
    run('bridge vlan add dev sw1:p2 vid 10');
    expect(run('ping 10.0.0.2').code).toBe(0);
  });

  it('ルータでなければ NAT は持てない', () => {
    runAll(['netlab add host pc1']);
    const result = run('nat enable --inside 10.0.0.0/24 --outside 203.0.113.1');
    expect(result.code).not.toBe(0);
    expect(result.err).toContain('ルータではありません');
  });
});
