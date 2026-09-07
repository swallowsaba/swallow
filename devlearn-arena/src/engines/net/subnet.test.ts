import { describe, expect, it } from 'vitest';
import { contains, intToIp, ipToInt, parseCidr, prefixLength, sameNetwork, split } from './subnet';

describe('アドレスの変換', () => {
  it('往復して同じになる', () => {
    for (const ip of ['0.0.0.0', '10.0.0.1', '192.168.1.255', '255.255.255.255']) {
      expect(intToIp(ipToInt(ip))).toBe(ip);
    }
  });
  it('不正な値は弾く', () => {
    expect(() => ipToInt('10.0.0')).toThrow();
    expect(() => ipToInt('300.0.0.1')).toThrow();
  });
});

describe('CIDR の計算', () => {
  it('/24 の各値', () => {
    const c = parseCidr('192.168.1.10/24');
    expect(c.network).toBe('192.168.1.0');
    expect(c.broadcast).toBe('192.168.1.255');
    expect(c.mask).toBe('255.255.255.0');
    expect(c.firstHost).toBe('192.168.1.1');
    expect(c.lastHost).toBe('192.168.1.254');
    expect(c.hosts).toBe(254);
  });

  it('/26 は 62 台', () => {
    const c = parseCidr('10.0.0.70/26');
    expect(c.network).toBe('10.0.0.64');
    expect(c.broadcast).toBe('10.0.0.127');
    expect(c.hosts).toBe(62);
  });

  it('/30 は 2 台（点対点）', () => {
    expect(parseCidr('172.16.0.5/30').hosts).toBe(2);
  });

  it('/32 は 1 台', () => {
    expect(parseCidr('8.8.8.8/32').hosts).toBe(1);
  });

  it('/16 のマスク', () => {
    expect(parseCidr('172.16.5.4/16').mask).toBe('255.255.0.0');
  });

  it('/0 は全体', () => {
    const c = parseCidr('0.0.0.0/0');
    expect(c.network).toBe('0.0.0.0');
    expect(c.broadcast).toBe('255.255.255.255');
  });

  it('形式が違えば弾く', () => {
    expect(() => parseCidr('10.0.0.1')).toThrow();
    expect(() => parseCidr('10.0.0.1/33')).toThrow();
  });
});

describe('範囲の判定', () => {
  it('含まれるかを判定する', () => {
    expect(contains('192.168.1.0/24', '192.168.1.42')).toBe(true);
    expect(contains('192.168.1.0/24', '192.168.2.1')).toBe(false);
  });

  it('境界も含む', () => {
    expect(contains('10.0.0.0/30', '10.0.0.0')).toBe(true);
    expect(contains('10.0.0.0/30', '10.0.0.3')).toBe(true);
    expect(contains('10.0.0.0/30', '10.0.0.4')).toBe(false);
  });

  it('同一セグメントかを判定する', () => {
    expect(sameNetwork('192.168.1.5', '192.168.1.200', 24)).toBe(true);
    expect(sameNetwork('192.168.1.5', '192.168.2.5', 24)).toBe(false);
    expect(sameNetwork('192.168.1.5', '192.168.2.5', 16)).toBe(true);
  });

  it('プレフィックス長を取り出せる', () => {
    expect(prefixLength('10.0.0.0/8')).toBe(8);
  });
});

describe('分割', () => {
  it('/24 を 4 つに割る', () => {
    expect(split('192.168.1.0/24', 4)).toEqual([
      '192.168.1.0/26',
      '192.168.1.64/26',
      '192.168.1.128/26',
      '192.168.1.192/26',
    ]);
  });

  it('/16 を 2 つに割る', () => {
    expect(split('10.0.0.0/16', 2)).toEqual(['10.0.0.0/17', '10.0.128.0/17']);
  });

  it('割りきれない大きさは弾く', () => {
    expect(() => split('10.0.0.0/32', 4)).toThrow();
  });
});
