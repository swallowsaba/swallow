import { describe, expect, it } from 'vitest';
import { initialShell } from '@/engines/environments';
import { checkState } from '@/learning/practice';
import { createClock } from '../clock';
import type { ShellState } from '../registry';
import { execute } from '../shell';
import { createDefaultRegistry } from './index';

/** net の上級の実戦で使う模擬: MTU（net.a.02）・ロードバランサ（net.a.03）・IPv6（net.a.04） */

const registry = createDefaultRegistry();
const clock = createClock();

function session(environment: string, setup: unknown) {
  let shell: ShellState = initialShell(environment, setup);
  return {
    run(line: string) {
      const o = execute(shell, line, registry, clock);
      shell = o.state;
      const pick = (s: string) => o.chunks.filter((c) => c.stream === s).map((c) => c.text).join('');
      return { out: pick('stdout'), err: pick('stderr'), code: o.exitCode };
    },
    get shell() {
      return shell;
    },
  };
}

const tunnel = {
  network: {
    self: 'pc',
    devices: [
      { name: 'pc', addrs: ['10.0.1.10/24'], gateway: '10.0.1.1' },
      { name: 'vpn-a', kind: 'router', addrs: ['10.0.1.1/24', '172.16.0.1/30'], mtus: { eth1: 1400 }, gateway: '172.16.0.2' },
      { name: 'vpn-b', kind: 'router', addrs: ['172.16.0.2/30', '192.0.2.1/24'], mtus: { eth0: 1400 }, gateway: '172.16.0.1' },
      { name: 'files', addrs: ['192.0.2.10/24'], gateway: '192.0.2.1', listen: [80], body: '<h1>入口</h1>', pages: { '/big.html': { body: '<h1>大きな報告書</h1>', bytes: 6000 } } },
    ],
    links: [['pc', 'vpn-a'], ['vpn-a', 'vpn-b'], ['vpn-b', 'files']],
    dns: { 'files.example': '192.0.2.10' },
  },
};

describe('MTU（net.a.02）', () => {
  it('小さな頁は届き、大きな頁は時間切れになる', () => {
    const s = session('net-client', tunnel);
    expect(s.run('curl http://files.example/').out).toContain('入口');
    const big = s.run('curl http://files.example/big.html');
    expect(big.code).toBe(28);
    expect(big.err).toContain('curl: (28)');
  });

  it('分割を禁じた ping は、上限の小さい区間で断られ、その上限を知らせる。小さければ通る', () => {
    const s = session('net-client', tunnel);
    const bad = s.run('ping -c 1 -M do -s 1472 files.example');
    expect(bad.code).toBe(1);
    expect(bad.out).toContain('From 10.0.1.1 icmp_seq=1 Frag needed and DF set (mtu = 1400)');
    const good = s.run('ping -c 1 -M do -s 1372 files.example');
    expect(good.code).toBe(0);
    expect(good.out).toContain('1380 bytes from 192.0.2.10');
  });

  it('分割を禁じない ping は、大きくても分割されて届く', () => {
    const s = session('net-client', tunnel);
    expect(s.run('ping -c 1 -s 3000 files.example').code).toBe(0);
  });

  it('tracepath は、区間ごとの上限と、道の全体の上限を出す', () => {
    const s = session('net-client', tunnel);
    const t = s.run('tracepath files.example');
    expect(t.out).toContain('pmtu 1500');
    expect(t.out).toContain('pmtu 1400');
    expect(t.out).toContain('Resume: pmtu 1400 hops 3 back 3');
  });

  it('自分の口の上限を下げると、大きな頁が届き、大きすぎる ping は手元で断られる', () => {
    const s = session('net-client', tunnel);
    expect(s.run('ip link set eth0 mtu 1400').code).toBe(0);
    expect(s.run('curl http://files.example/big.html').out).toContain('大きな報告書');
    const local = s.run('ping -c 1 -M do -s 1472 files.example');
    expect(local.code).toBe(1);
    expect(local.err).toContain('ping: local error: message too long, mtu=1400');
    expect(s.run('ping -c 1 -M do -s 1372 files.example').code).toBe(0);
  });

  it('サーバ側の口の上限を下げても届く', () => {
    const s = session('net-client', tunnel);
    expect(s.run('ip netns exec files ip link set eth0 mtu 1400').code).toBe(0);
    expect(s.run('curl http://files.example/big.html').out).toContain('大きな報告書');
  });

  it('ip link は、口の上限を出す', () => {
    const s = session('net-client', tunnel);
    expect(s.run('ip netns exec vpn-a ip link').out).toContain('eth1: <UP,LOWER_UP> mtu 1400');
  });
});

const lbConf = (body: string, extra = ''): string => `upstream shop {\n${body}}\nserver {\n  listen 80;\n  server_name shop.example;\n  location / {\n    proxy_pass http://shop;\n${extra}  }\n}\n`;
const three = '  server 127.0.0.1:8081;\n  server 127.0.0.1:8082;\n  server 127.0.0.1:8083;\n';

const lb = (conf: string) => ({
  run: ['systemctl restart nginx'],
  hostname: 'lb',
  files: { '/etc/hosts': '127.0.0.1 localhost shop.example\n', '/etc/nginx/conf.d/lb.conf': conf },
  services: {
    nginx: { description: 'nginx', enabled: true, active: true, config: '/etc/nginx/conf.d/lb.conf' },
    'web-1': { description: 'web-1', enabled: true, active: true, port: 8081, body: 'web-1' },
    'web-2': { description: 'web-2', enabled: true, active: true, port: 8082, body: 'web-2' },
    'web-3': { description: 'web-3', enabled: true, active: true, port: 8083, body: 'web-3' },
  },
});

describe('ロードバランサ（net.a.03）', () => {
  it('upstream の server を順に使う', () => {
    const s = session('linux-basic', lb(lbConf(three)));
    const got = [1, 2, 3, 4].map(() => s.run('curl -s http://shop.example/').out.trim());
    expect(got).toEqual(['web-1', 'web-2', 'web-3', 'web-1']);
  });

  it('止めた台に当たると次の台へ送り直す（既定の proxy_next_upstream）', () => {
    const s = session('linux-basic', lb(lbConf(three)));
    s.run('systemctl stop web-2');
    const got = [1, 2, 3].map(() => s.run('curl -s -o /dev/null -w "%{http_code}" http://shop.example/').out);
    expect(got).toEqual(['200', '200', '200']);
  });

  it('proxy_next_upstream off なら、止めた台に当たった頼みは 502', () => {
    const s = session('linux-basic', lb(lbConf(three, '    proxy_next_upstream off;\n')));
    s.run('systemctl stop web-2');
    const got = [1, 2, 3].map(() => s.run('curl -s -o /dev/null -w "%{http_code}" http://shop.example/').out);
    expect(got).toEqual(['200', '502', '200']);
  });

  it('全ての台が止まると 502', () => {
    const s = session('linux-basic', lb(lbConf(three)));
    s.run('systemctl stop web-1');
    s.run('systemctl stop web-2');
    s.run('systemctl stop web-3');
    expect(s.run('curl -s -o /dev/null -w "%{http_code}" http://shop.example/').out).toBe('502');
  });

  it('weight の分だけ多く送り、down の台には送らない', () => {
    const s = session('linux-basic', lb(lbConf('  server 127.0.0.1:8081 weight=2;\n  server 127.0.0.1:8082;\n  server 127.0.0.1:8083 down;\n')));
    const got = [1, 2, 3].map(() => s.run('curl -s http://shop.example/').out.trim());
    expect(got.filter((x) => x === 'web-1').length).toBe(2);
    expect(got).toContain('web-2');
    expect(got).not.toContain('web-3');
  });

  it('ip_hash は同じ送り元を同じ台へ送る', () => {
    const s = session('linux-basic', lb(lbConf(`  ip_hash;\n${three}`)));
    const got = new Set([1, 2, 3].map(() => s.run('curl -s http://shop.example/').out.trim()));
    expect(got.size).toBe(1);
  });

  it('upstream の中に server が無いと、本物と同じ文で断る。知らない名前の proxy_pass は host not found', () => {
    const s = session('linux-basic', { ...lb('upstream shop {\n}\nserver {\n  listen 80;\n  location / {\n    proxy_pass http://shop;\n  }\n}\n'), run: [] });
    expect(s.run('nginx -t').err).toContain('no servers are inside upstream');
    const t = session('linux-basic', { ...lb('server {\n  listen 80;\n  location / {\n    proxy_pass http://shop;\n  }\n}\n'), run: [] });
    expect(t.run('nginx -t').err).toContain('host not found in upstream "shop"');
  });

  it('判定の http の turns は、振り分けの全ての台を確かめる。seen はその答えが全て出たこと', () => {
    const s = session('linux-basic', lb(lbConf(three, '    proxy_next_upstream off;\n')));
    const all200 = { kind: 'http', url: 'http://shop.example/', status: 200, turns: 3 } as const;
    expect(checkState(all200, { shell: s.shell })).toBe(true);
    expect(checkState({ ...all200, seen: ['web-1', 'web-2', 'web-3'] }, { shell: s.shell })).toBe(true);
    expect(checkState({ ...all200, seen: ['web-1', 'web-9'] }, { shell: s.shell })).toBe(false);
    s.run('systemctl stop web-2');
    expect(checkState(all200, { shell: s.shell })).toBe(false);
  });
});

const dual = {
  user: 'root',
  dirs: ['/etc/bind'],
  files: { '/etc/bind/db.shop.example': '$TTL 300\n$ORIGIN shop.example.\n@ IN SOA ns1.shop.example. admin.shop.example. ( 2026103101 3600 900 604800 300 )\n@ IN NS ns1.shop.example.\nns1 IN A 203.0.113.53\n@ IN A 203.0.113.20\n' },
  services: { named: { description: 'BIND', active: true, enabled: true, port: 53, zone: '/etc/bind/db.shop.example' } },
  network: {
    self: 'web',
    devices: [
      { name: 'sw', kind: 'switch', ports: 4 },
      { name: 'web', addrs: ['203.0.113.20/24'], listen: [80], body: '<h1>港の店</h1>' },
      { name: 'visitor', addrs: ['203.0.113.77/24'], addrs6: ['2001:db8:10::77/64'] },
    ],
    links: [['web', 'sw'], ['visitor', 'sw']],
  },
};

describe('IPv6（net.a.04）', () => {
  it('ip -6 addr は、リンクローカルと足した住所を出す', () => {
    const s = session('net-client', dual);
    expect(s.run('ip -6 addr show').out).toMatch(/inet6 fe80::\S+\/64 scope link/);
    expect(s.run('ip -6 addr add 2001:db8:10::20/64 dev eth0').code).toBe(0);
    const shown = s.run('ip -6 addr show dev eth0').out;
    expect(shown).toContain('inet6 2001:db8:10::20/64 scope global');
    // 4 の住所は変えない
    expect(s.run('ip -4 addr show').out).toContain('inet 203.0.113.20/24');
    expect(s.run('ip addr').out).toContain('inet 203.0.113.20/24');
  });

  it('ping -6 は住所が付くまで届かず、付けば届く', () => {
    const s = session('net-client', dual);
    expect(s.run('ip netns exec visitor ping -6 -c 1 2001:db8:10::20').code).toBe(1);
    s.run('ip -6 addr add 2001:db8:10::20/64 dev eth0');
    const ok = s.run('ip netns exec visitor ping -6 -c 1 2001:db8:10::20');
    expect(ok.code).toBe(0);
    expect(ok.out).toContain('PING 2001:db8:10::20(2001:db8:10::20) 56 data bytes');
    expect(ok.out).toContain('64 bytes from 2001:db8:10::20: icmp_seq=1');
  });

  it('自分に住所の無い機械の ping -6 は、経路が無いと断られる', () => {
    const s = session('net-client', dual);
    const r = s.run('ping -6 -c 1 2001:db8:10::77');
    expect(r.code).toBe(2);
    expect(r.err).toContain('connect: Network is unreachable');
  });

  it('省略の無い書き方でも同じ住所に届く', () => {
    const s = session('net-client', dual);
    s.run('ip -6 addr add 2001:db8:10::20/64 dev eth0');
    expect(s.run('ip netns exec visitor ping6 -c 1 2001:0db8:0010:0000:0000:0000:0000:0020').code).toBe(0);
  });

  it('AAAA のレコードを足すまで curl -6 は名前を引けない。足すと届く。住所を [ ] で書いても届く', () => {
    const s = session('net-client', dual);
    s.run('ip -6 addr add 2001:db8:10::20/64 dev eth0');
    expect(s.run('ip netns exec visitor curl -6 http://shop.example/').code).toBe(6);
    s.run("echo '@ IN AAAA 2001:db8:10::20' >> /etc/bind/db.shop.example");
    expect(s.run('named-checkzone shop.example /etc/bind/db.shop.example').code).toBe(0);
    s.run('systemctl reload named');
    expect(s.run('dig +short AAAA shop.example').out.trim()).toBe('2001:db8:10::20');
    expect(s.run('ip netns exec visitor curl -6 http://shop.example/').out).toContain('港の店');
    expect(s.run('ip netns exec visitor curl -6 http://[2001:db8:10::20]/').out).toContain('港の店');
    // -6 を書かなければ 4 で届く（4 の住所は残っている）
    expect(s.run('ip netns exec visitor curl http://shop.example/').out).toContain('港の店');
  });

  it('読めない AAAA は named-checkzone が断る', () => {
    const s = session('net-client', dual);
    s.run("echo '@ IN AAAA 203.0.113.20' >> /etc/bind/db.shop.example");
    const r = s.run('named-checkzone shop.example /etc/bind/db.shop.example');
    expect(r.code).toBe(1);
    expect(r.err).toContain('bad IPv6 address');
  });

  it('判定の net: reach6 と addr6', () => {
    const s = session('net-client', dual);
    const reach = { kind: 'net', expr: 'reach6 shop.example:80 from visitor' } as const;
    const addr = { kind: 'net', expr: 'addr6 web 2001:db8:10::20' } as const;
    expect(checkState(reach, { shell: s.shell })).toBe(false);
    expect(checkState(addr, { shell: s.shell })).toBe(false);
    s.run('ip -6 addr add 2001:db8:10::20/64 dev eth0');
    expect(checkState(addr, { shell: s.shell })).toBe(true);
    s.run("echo '@ IN AAAA 2001:db8:10::20' >> /etc/bind/db.shop.example");
    s.run('systemctl reload named');
    expect(checkState(reach, { shell: s.shell })).toBe(true);
  });
});

describe('網の curl（net.a.01）', () => {
  it('-s・-o・-w を受け、道ごとの頁を返す', () => {
    const s = session('net-client', tunnel);
    expect(s.run('curl -s -o /dev/null -w "%{http_code}" http://files.example/').out).toBe('200');
  });
});
