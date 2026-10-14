import { describe, expect, it } from 'vitest';
import { initialShell } from '@/engines/environments';
import { createClock } from '@/engines/kernel/clock';
import { createDefaultRegistry } from '@/engines/kernel/commands';
import type { ShellState } from '@/engines/kernel/registry';
import { execute } from '@/engines/kernel/shell';
import { checkState } from '@/learning/practice';
import { decide, emptyIptables, runIptables, type Flow, type Iptables } from './firewall';

const apply = (lines: string[]): Iptables => lines.reduce((t, line) => {
  const r = runIptables(t, line.split(' '));
  if (!r.ok) throw new Error(r.stderr);
  return r.table;
}, emptyIptables());

const flow = (over: Partial<Flow> = {}): Flow => ({ proto: 'tcp', src: '198.51.100.7', dst: '203.0.113.10', dport: 443, inIf: 'eth0', outIf: null, established: false, ...over });

describe('iptables の模型', () => {
  it('規則は上から順に見て、最初に当たった物で決まる。どれにも当たらなければ方針', () => {
    const t = apply(['-A INPUT -p tcp --dport 80 -j ACCEPT', '-A INPUT -j DROP', '-A INPUT -p tcp --dport 443 -j ACCEPT']);
    expect(decide(t.filter.INPUT, flow({ dport: 80 }))).toEqual({ verdict: 'ACCEPT', rule: 1 });
    expect(decide(t.filter.INPUT, flow({ dport: 443 }))).toEqual({ verdict: 'DROP', rule: 2 });
    expect(decide(apply(['-P INPUT DROP']).filter.INPUT, flow())).toEqual({ verdict: 'DROP', rule: 0 });
  });

  it('送り元の網・口で当てる。返事（ESTABLISHED）は状態の規則に当たり、ポートを書いた規則には当たらない', () => {
    const t = apply(['-P FORWARD DROP', '-A FORWARD -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT', '-A FORWARD -s 10.0.0.0/8 -p tcp --dport 22 -j ACCEPT']);
    expect(decide(t.filter.FORWARD, flow({ src: '10.0.5.20', dport: 22 })).verdict).toBe('ACCEPT');
    expect(decide(t.filter.FORWARD, flow({ src: '198.51.100.7', dport: 22 })).verdict).toBe('DROP');
    expect(decide(t.filter.FORWARD, flow({ proto: 'icmp', dport: null, established: true })).verdict).toBe('ACCEPT');
    const noState = apply(['-P INPUT DROP', '-A INPUT -p tcp --dport 22 -j ACCEPT']);
    expect(decide(noState.filter.INPUT, flow({ proto: 'icmp', dport: null, established: true })).verdict).toBe('DROP');
  });

  it('-L は本物の欄と番号、-S は作る時の書き方。状態は RELATED,ESTABLISHED の順に並べる', () => {
    const t = apply(['-P INPUT DROP', '-A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT', '-A INPUT -s 10.0.0.0/8 -p tcp --dport 22 -j ACCEPT']);
    const list = runIptables(t, ['-L', 'INPUT', '--line-numbers']);
    expect(list.ok && list.stdout).toBe([
      'Chain INPUT (policy DROP)',
      'num  target     prot opt source               destination',
      '1    ACCEPT     all  --  0.0.0.0/0            0.0.0.0/0            ctstate RELATED,ESTABLISHED',
      '2    ACCEPT     tcp  --  10.0.0.0/8           0.0.0.0/0            tcp dpt:22',
      '',
    ].join('\n'));
    const spec = runIptables(t, ['-S', 'INPUT']);
    expect(spec.ok && spec.stdout).toBe('-P INPUT DROP\n-A INPUT -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT\n-A INPUT -s 10.0.0.0/8 -p tcp -m tcp --dport 22 -j ACCEPT\n');
  });

  it('-I は番号の所に差し込み、-D は番号か同じ規則で消す。誤りは本物と同じ言い方', () => {
    let t = apply(['-A INPUT -p tcp --dport 80 -j ACCEPT', '-A INPUT -j DROP']);
    const ins = runIptables(t, ['-I', 'INPUT', '2', '-p', 'tcp', '--dport', '443', '-j', 'ACCEPT']);
    if (!ins.ok) throw new Error('差し込めない');
    t = ins.table;
    expect(t.filter.INPUT.rules.map((r) => r.dport ?? r.target)).toEqual([80, 443, 'DROP']);
    const del = runIptables(t, ['-D', 'INPUT', '-p', 'tcp', '--dport', '80', '-j', 'ACCEPT']);
    expect(del.ok && del.table.filter.INPUT.rules.length).toBe(2);
    expect(runIptables(t, ['-D', 'INPUT', '9'])).toMatchObject({ ok: false, stderr: 'iptables: Index of deletion too big.\n' });
    const noProto = runIptables(t, ['-A', 'INPUT', '--dport', '22', '-j', 'ACCEPT']);
    expect(!noProto.ok && noProto.stderr).toContain('unknown option "--dport"');
    expect(runIptables(t, ['-A', 'INPUTS', '-j', 'DROP'])).toMatchObject({ ok: false, stderr: 'iptables: No chain/target/match by that name.\n' });
  });
});

describe('網の中の iptables（DNAT・FORWARD・nmap）', () => {
  const setup = {
    user: 'root',
    network: {
      self: 'gw',
      devices: [
        { name: 'outside', addrs: ['203.0.113.77/24'], gateway: '203.0.113.5' },
        { name: 'gw', kind: 'router', addrs: ['203.0.113.5/24', '192.168.1.1/24'], firewall: ['-P FORWARD DROP', '-A FORWARD -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT', '-t nat -A PREROUTING -i eth0 -p tcp --dport 443 -j DNAT --to-destination 192.168.1.11:443'] },
        { name: 'web', addrs: ['192.168.1.10/24'], gateway: '192.168.1.1', listen: [443], body: '<h1>店</h1>' },
        { name: 'keiri', addrs: ['192.168.1.11/24'], gateway: '192.168.1.1' },
        { name: 'sw', kind: 'switch', ports: 3 },
      ],
      links: [['outside', 'gw'], ['gw', 'sw'], ['web', 'sw'], ['keiri', 'sw']],
    },
  };
  const registry = createDefaultRegistry();
  const clock = createClock();

  it('DNAT で転送し、FORWARD で通り抜けを許すと、外から中の Web サーバに届く。nmap は open・closed・filtered を見分ける', () => {
    let shell: ShellState = initialShell('net-client', setup);
    const run = (line: string): { out: string; err: string } => {
      const o = execute(shell, line, registry, clock);
      shell = o.state;
      const of = (k: string): string => o.chunks.filter((c) => c.stream === k).map((c) => c.text).join('');
      return { out: of('stdout'), err: of('stderr') };
    };
    expect(run('ip netns exec outside nmap -p 443 203.0.113.5').out).toMatch(/443\/tcp +filtered +https/);
    // FORWARD を開けても、転送先（経理のパソコン）は待ち受けていないので closed
    run('iptables -I FORWARD 2 -p tcp --dport 443 -j ACCEPT');
    expect(run('ip netns exec outside nmap -p 443 203.0.113.5').out).toMatch(/443\/tcp +closed/);
    expect(checkState({ kind: 'net', expr: 'dnat gw 443 192.168.1.11:443' }, { shell })).toBe(true);
    run('iptables -t nat -D PREROUTING 1');
    run('iptables -t nat -A PREROUTING -i eth0 -p tcp --dport 443 -j DNAT --to-destination 192.168.1.10:443');
    expect(checkState({ kind: 'net', expr: 'dnat gw 443 192.168.1.10:443' }, { shell })).toBe(true);
    expect(run('ip netns exec outside nmap -p 443 203.0.113.5').out).toMatch(/443\/tcp +open/);
    // curl は、転送の先で答えた機械の中身を返す
    expect(run('ip netns exec outside curl https://203.0.113.5/').out).toBe('<h1>店</h1>\n');
    expect(checkState({ kind: 'net', expr: 'reach 203.0.113.5:443 from outside' }, { shell })).toBe(true);
  });

  it('root でなければ iptables は断る', () => {
    const shell = initialShell('net-client', { ...setup, user: 'learner' });
    const o = execute(shell, 'iptables -L', registry, clock);
    expect(o.chunks.map((c) => c.text).join('')).toContain('Permission denied (you must be root)');
  });
});

describe('VLAN を絞るスイッチ（bridge vlan）', () => {
  const setup = {
    network: {
      self: 'pc1',
      devices: [
        { name: 'sw', kind: 'switch', ports: 3, vlans: { port1: 10, port2: 10, port3: 20 } },
        { name: 'pc1', addrs: ['10.0.0.1/24'] },
        { name: 'pc2', addrs: ['10.0.0.2/24'] },
        { name: 'pc3', addrs: ['10.0.0.3/24'] },
      ],
      links: [['pc1', 'sw'], ['pc2', 'sw'], ['pc3', 'sw']],
    },
  };
  const registry = createDefaultRegistry();
  const clock = createClock();

  it('違う VLAN の口には届かない。pvid untagged で足して前の VLAN を外すと移る。show は本物の形', () => {
    let shell: ShellState = initialShell('net-client', setup);
    const run = (line: string): string => {
      const o = execute(shell, line, registry, clock);
      shell = o.state;
      return o.chunks.map((c) => c.text).join('');
    };
    expect(checkState({ kind: 'net', expr: 'reach 10.0.0.2 && !reach 10.0.0.3' }, { shell })).toBe(true);
    run('ip netns exec sw bridge vlan add dev port3 vid 10 pvid untagged');
    expect(run('ip netns exec sw bridge vlan show dev port3')).toBe('port              vlan-id\nport3             10 PVID Egress Untagged\n                  20 Egress Untagged\n');
    expect(checkState({ kind: 'net', expr: 'reach 10.0.0.3' }, { shell })).toBe(true);
    run('ip netns exec sw bridge vlan del dev port2 vid 10');
    expect(checkState({ kind: 'net', expr: 'reach 10.0.0.2' }, { shell })).toBe(false);
    expect(run('ip netns exec sw bridge vlan add dev port9 vid 10')).toBe('Cannot find device "port9"\n');
  });
});
