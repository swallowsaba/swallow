import { beforeEach, describe, expect, it } from 'vitest';
import { host, iface, link, resetMac, router, topology } from '@/engines/net/factory';
import type { Topology } from '@/engines/net/types';
import { createSession, type Session } from '../session';
import { execute } from '../shell';

function build(options: { listening?: number[]; linkUp?: boolean; dns?: Record<string, string> } = {}): Topology {
  resetMac();
  const pc1 = host('pc1', [iface('eth0', '192.168.1.10', 24)], {
    routes: [{ destination: '0.0.0.0/0', via: '192.168.1.1', dev: 'eth0' }],
  });
  const r1 = router('r1', [iface('eth0', '192.168.1.1', 24), iface('eth1', '10.0.0.1', 24)]);
  const web = host('web', [iface('eth0', '10.0.0.20', 24)], {
    routes: [{ destination: '0.0.0.0/0', via: '10.0.0.1', dev: 'eth0' }],
    listening: options.listening ?? [80],
  });
  return topology(
    [pc1, r1, web],
    [link('pc1:eth0', 'r1:eth0'), link('r1:eth1', 'web:eth0', options.linkUp !== false)],
    options.dns ?? { 'web.example': '10.0.0.20' },
  );
}

let session: Session;
beforeEach(() => {
  session = createSession({ net: build(), vars: { NET_SELF: 'pc1' } });
});

function run(line: string): { out: string; err: string; code: number } {
  const outcome = execute(session.state, line, session.registry, session.clock);
  session = { ...session, state: outcome.state };
  const pick = (s: 'stdout' | 'stderr') =>
    outcome.chunks.filter((c) => c.stream === s).map((c) => c.text).join('');
  return { out: pick('stdout'), err: pick('stderr'), code: outcome.exitCode };
}

describe('ネットワークが無い場合', () => {
  it('その旨を伝える', () => {
    session = createSession();
    expect(run('ping web.example').code).toBe(1);
  });
});

describe('ping', () => {
  it('届けば統計が出る', () => {
    const r = run('ping web.example');
    expect(r.code).toBe(0);
    expect(r.out).toContain('1 packets transmitted, 1 received');
  });

  it('IP でも打てる', () => {
    expect(run('ping 10.0.0.20').code).toBe(0);
  });

  it('名前が引けなければエラー', () => {
    const r = run('ping nope.example');
    expect(r.code).toBe(2);
    expect(r.err).toContain('Name or service not known');
  });

  it('リンクが切れていれば失敗する', () => {
    session = createSession({ net: build({ linkUp: false }), vars: { NET_SELF: 'pc1' } });
    const r = run('ping web.example');
    expect(r.code).toBe(1);
    expect(r.err).toContain('リンクが切れています');
  });
});

describe('traceroute', () => {
  it('経路がホップごとに出る', () => {
    const out = run('traceroute web.example').out;
    expect(out).toContain('pc1');
    expect(out).toContain('r1');
    expect(out).toContain('web');
  });
});

describe('curl', () => {
  it('取得できる', () => {
    expect(run('curl http://web.example/').out).toContain('It works');
  });

  it('-v で経路とやり取りが見える', () => {
    const out = run('curl -v http://web.example/').out;
    expect(out).toContain('Trying 10.0.0.20:80');
    expect(out).toContain('> GET / HTTP/1.1');
    expect(out).toContain('< HTTP/1.1 200 OK');
  });

  it('名前が引けなければ (6)', () => {
    const r = run('curl http://nope.example/');
    expect(r.code).toBe(6);
    expect(r.err).toContain('Could not resolve host');
  });

  it('待ち受けが無ければ拒否される', () => {
    session = createSession({ net: build({ listening: [] }), vars: { NET_SELF: 'pc1' } });
    const r = run('curl http://web.example/');
    expect(r.code).toBe(7);
    expect(r.err).toContain('Connection refused');
  });

  it('ping は通るのに curl が失敗する状況を再現できる', () => {
    session = createSession({ net: build({ listening: [] }), vars: { NET_SELF: 'pc1' } });
    expect(run('ping web.example').code).toBe(0);
    expect(run('curl http://web.example/').code).toBe(7);
  });
});

describe('dig', () => {
  it('答えが返る', () => {
    expect(run('dig web.example').out).toContain('IN\tA\t10.0.0.20');
  });
  it('無い名前は NXDOMAIN', () => {
    expect(run('dig nope.example').out).toContain('NXDOMAIN');
  });
});

describe('ip', () => {
  it('アドレスが出る', () => {
    const out = run('ip addr').out;
    expect(out).toContain('eth0');
    expect(out).toContain('inet 192.168.1.10/24');
    expect(out).toContain('link/ether');
  });

  it('経路が出る', () => {
    const out = run('ip route').out;
    expect(out).toContain('default via 192.168.1.1');
    expect(out).toContain('192.168.1.0/24');
  });
});

describe('ipcalc', () => {
  it('CIDR を分解する', () => {
    const out = run('ipcalc 192.168.1.10/26').out;
    expect(out).toContain('Network:   192.168.1.0/26');
    expect(out).toContain('HostMax:   192.168.1.62');
    expect(out).toContain('Hosts:     62');
  });

  it('不正な入力は弾く', () => {
    expect(run('ipcalc 10.0.0.1').code).toBe(1);
  });
});

describe('netstat', () => {
  it('待ち受けが出る', () => {
    session = createSession({ net: build({ listening: [80, 443] }), vars: { NET_SELF: 'web' } });
    const out = run('netstat').out;
    expect(out).toContain('0.0.0.0:80');
    expect(out).toContain('LISTEN');
  });
});
