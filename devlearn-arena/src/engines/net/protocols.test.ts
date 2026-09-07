import { describe, expect, it } from 'vitest';
import { advanceDns, createWorld, resolve, updateRecord, type Zone } from './dns';
import {
  advanceDhcp, dhcpRequest, dhcpServer, runHttp, tlsHandshake, type Certificate,
} from './services';
import {
  advance, clientAction, openConnection, retransmit, retransmitTimeout, TIME_WAIT_TICKS,
} from './tcp';

describe('TCP の状態遷移', () => {
  it('3ウェイで ESTABLISHED になる', () => {
    const result = clientAction(openConnection(), 'connect');
    expect(result.connection.client.state).toBe('ESTABLISHED');
    expect(result.connection.segments.map((s) => s.flags.join('+'))).toEqual([
      'SYN', 'SYN+ACK', 'ACK',
    ]);
  });

  it('CLOSED のままではデータを送れない', () => {
    const result = clientAction(openConnection(), 'send');
    expect(result.error).toContain('ESTABLISHED');
  });

  it('ACK 番号は受け取った長さぶん進む', () => {
    const connected = clientAction(openConnection(), 'connect').connection;
    const sent = clientAction(connected, 'send', { length: 120 }).connection;
    const ack = sent.segments[sent.segments.length - 1];
    expect(ack?.from).toBe('server');
    expect(ack?.ack).toBe(connected.client.seq + 120);
  });

  it('閉じると TIME_WAIT に入り、時間が経つと CLOSED になる', () => {
    const connected = clientAction(openConnection(), 'connect').connection;
    const closed = clientAction(connected, 'close').connection;
    expect(closed.client.state).toBe('TIME_WAIT');
    expect(advance(closed, TIME_WAIT_TICKS - 1).client.state).toBe('TIME_WAIT');
    expect(advance(closed, TIME_WAIT_TICKS).client.state).toBe('CLOSED');
  });

  it('落ちた SYN は再送すると通る', () => {
    const dropping = { ...openConnection(), dropped: [0] };
    const first = clientAction(dropping, 'connect');
    expect(first.connection.client.state).toBe('SYN_SENT');
    const again = retransmit(first.connection);
    expect(again.connection.client.state).toBe('ESTABLISHED');
    expect(again.connection.retransmits).toBe(1);
  });

  it('再送の待ち時間は倍々に伸びる', () => {
    expect(retransmitTimeout(1)).toBe(1);
    expect(retransmitTimeout(2)).toBe(2);
    expect(retransmitTimeout(3)).toBe(4);
    expect(retransmitTimeout(4)).toBe(8);
  });
});

function world() {
  const zones: Zone[] = [
    {
      origin: '.',
      server: 'a.root-servers.net',
      records: [{ name: 'com.', type: 'NS', value: 'a.gtld-servers.net', ttl: 172800 }],
    },
    {
      origin: 'com.',
      server: 'a.gtld-servers.net',
      records: [{ name: 'example.com.', type: 'NS', value: 'ns1.example.com', ttl: 172800 }],
    },
    {
      origin: 'example.com.',
      server: 'ns1.example.com',
      records: [
        { name: 'www.example.com.', type: 'A', value: '93.184.216.34', ttl: 30 },
        { name: 'shop.example.com.', type: 'CNAME', value: 'www.example.com.', ttl: 30 },
      ],
    },
  ];
  return createWorld(zones);
}

describe('DNS の再帰解決', () => {
  it('ルートから権威まで辿って答えにたどり着く', () => {
    const result = resolve(world(), 'www.example.com');
    expect(result.record?.value).toBe('93.184.216.34');
    expect(result.steps.map((s) => s.server)).toEqual([
      'a.root-servers.net',
      'a.gtld-servers.net',
      'ns1.example.com',
    ]);
  });

  it('2回目はキャッシュから返る', () => {
    const first = resolve(world(), 'www.example.com');
    const second = resolve(first.world, 'www.example.com');
    expect(second.fromCache).toBe(true);
    expect(second.steps).toHaveLength(1);
  });

  it('TTL が切れたら、また辿り直す', () => {
    const first = resolve(world(), 'www.example.com');
    const later = advanceDns(first.world, 31);
    expect(resolve(later, 'www.example.com').fromCache).toBe(false);
  });

  it('CNAME はその先まで辿る', () => {
    const result = resolve(world(), 'shop.example.com');
    expect(result.record?.value).toBe('93.184.216.34');
  });

  it('無い名前は NXDOMAIN', () => {
    const result = resolve(world(), 'nope.example.com');
    expect(result.record).toBeNull();
    expect(result.error).toContain('NXDOMAIN');
  });

  it('レコードを変えても、TTL の間はキャッシュが古い答えを返す', () => {
    const first = resolve(world(), 'www.example.com');
    const changed = updateRecord(first.world, 'example.com.', {
      name: 'www.example.com.',
      type: 'A',
      value: '203.0.113.9',
      ttl: 30,
    });
    expect(resolve(changed, 'www.example.com').record?.value).toBe('93.184.216.34');
    expect(resolve(advanceDns(changed, 31), 'www.example.com').record?.value).toBe('203.0.113.9');
  });
});

describe('DHCP', () => {
  it('DORA の4段を踏む', () => {
    const result = dhcpRequest(dhcpServer(), '02:00:00:00:00:01');
    expect(result.steps.map((s) => s.kind)).toEqual(['DISCOVER', 'OFFER', 'REQUEST', 'ACK']);
    expect(result.lease?.ip).toBe('192.168.1.100');
  });

  it('別の相手には別のアドレスを配る', () => {
    const first = dhcpRequest(dhcpServer(), 'aa');
    const second = dhcpRequest(first.server, 'bb');
    expect(second.lease?.ip).toBe('192.168.1.101');
  });

  it('同じ相手には同じアドレスを返す', () => {
    const first = dhcpRequest(dhcpServer(), 'aa');
    const again = dhcpRequest(first.server, 'aa');
    expect(again.lease?.ip).toBe(first.lease?.ip);
  });

  it('プールが尽きたら NAK', () => {
    let server = dhcpServer({ poolStart: '10.0.0.2', poolEnd: '10.0.0.3' });
    server = dhcpRequest(server, 'a').server;
    server = dhcpRequest(server, 'b').server;
    const third = dhcpRequest(server, 'c');
    expect(third.lease).toBeNull();
    expect(third.error).toContain('尽きて');
  });

  it('期限が切れたリースは返る', () => {
    const first = dhcpRequest(dhcpServer({ leaseTicks: 5 }), 'a');
    const later = advanceDhcp(first.server, 6);
    expect(later.leases).toHaveLength(0);
  });
});

const CA = ['DevLearn CA'];
function cert(overrides: Partial<Certificate> = {}): Certificate {
  return {
    subject: 'shop.example.com',
    altNames: ['*.example.com'],
    issuer: 'DevLearn CA',
    notBefore: 0,
    notAfter: 100,
    ...overrides,
  };
}

describe('TLS ハンドシェイク', () => {
  it('有効な証明書なら成立する', () => {
    const result = tlsHandshake(cert(), 'shop.example.com', 50, CA);
    expect(result.established).toBe(true);
    expect(result.steps.map((s) => s.message)).toContain('Certificate');
  });

  it('期限切れは本物と同じ理由で止まる', () => {
    expect(tlsHandshake(cert(), 'shop.example.com', 200, CA).error).toBe('certificate has expired');
  });

  it('名前が違えば止まる', () => {
    const result = tlsHandshake(cert(), 'other.test', 50, CA);
    expect(result.error).toContain('does not match');
  });

  it('ワイルドカードは1段だけ一致する', () => {
    expect(tlsHandshake(cert(), 'api.example.com', 50, CA).established).toBe(true);
    expect(tlsHandshake(cert(), 'a.b.example.com', 50, CA).established).toBe(false);
  });

  it('知らない発行者は信用しない', () => {
    const result = tlsHandshake(cert({ issuer: 'Unknown CA' }), 'shop.example.com', 50, CA);
    expect(result.error).toContain('unable to get local issuer');
  });
});

describe('HTTP/1.1 と HTTP/2', () => {
  const requests = Array.from({ length: 12 }, (_, i) => ({ path: `/a${String(i)}.js`, cost: 2 }));

  it('1.1 は接続の本数ぶんしか同時に流せない', () => {
    const result = runHttp(requests, '1.1');
    expect(result.connections).toBe(6);
    expect(result.finishedAt).toBe(4);
    expect(result.blocked).toBe(6);
  });

  it('2 は1接続で全部を同時に流す', () => {
    const result = runHttp(requests, '2');
    expect(result.connections).toBe(1);
    expect(result.finishedAt).toBe(2);
    expect(result.blocked).toBe(0);
  });

  it('要求が増えるほど差が開く', () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ path: `/b${String(i)}.js`, cost: 1 }));
    expect(runHttp(many, '1.1').finishedAt).toBe(10);
    expect(runHttp(many, '2').finishedAt).toBe(1);
  });
});
