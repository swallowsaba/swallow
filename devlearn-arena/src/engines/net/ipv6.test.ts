import { describe, expect, it } from 'vitest';
import { compress, expand, fromInt, parseIpv6Cidr, scopeOf, slaac, toInt } from './ipv6';

describe('IPv6 の表記', () => {
  it('省略記法を展開できる', () => {
    expect(expand('2001:db8::1')).toBe('2001:0db8:0000:0000:0000:0000:0000:0001');
    expect(expand('::1')).toBe('0000:0000:0000:0000:0000:0000:0000:0001');
    expect(expand('::')).toBe('0000:0000:0000:0000:0000:0000:0000:0000');
  });

  it('一番長い 0 の並びだけを縮める', () => {
    expect(compress('2001:0db8:0000:0000:0000:0000:0000:0001')).toBe('2001:db8::1');
    expect(compress('2001:0db8:0000:0001:0000:0000:0000:0001')).toBe('2001:db8:0:1::1');
  });

  it('0 が1つだけなら縮めない', () => {
    expect(compress('2001:db8:0:1:1:1:1:1')).toBe('2001:db8:0:1:1:1:1:1');
  });

  it('展開と圧縮は往復する', () => {
    for (const address of ['2001:db8::1', 'fe80::1', 'ff02::2', '::1']) {
      expect(compress(expand(address))).toBe(compress(address));
    }
  });

  it('数値との往復ができる', () => {
    expect(fromInt(toInt('2001:db8::1'))).toBe('2001:db8::1');
    expect(toInt('::1')).toBe(1n);
  });

  it('不正な表記は断る', () => {
    expect(() => expand('2001:db8')).toThrow();
  });
});

describe('IPv6 のプレフィックス', () => {
  it('ネットワークと範囲を出せる', () => {
    const c = parseIpv6Cidr('2001:db8:abcd:1234::5/64');
    expect(c.network).toBe('2001:db8:abcd:1234::');
    expect(c.last).toBe('2001:db8:abcd:1234:ffff:ffff:ffff:ffff');
    expect(c.size).toBe(1n << 64n);
  });

  it('/48 から /64 を 65536 個切り出せる大きさになる', () => {
    expect(parseIpv6Cidr('2001:db8::/48').size / parseIpv6Cidr('2001:db8::/64').size).toBe(65536n);
  });
});

describe('アドレスの種類', () => {
  it('用途ごとに見分けられる', () => {
    expect(scopeOf('::1')).toContain('ループバック');
    expect(scopeOf('fe80::1')).toContain('リンクローカル');
    expect(scopeOf('fd00::1')).toContain('ユニークローカル');
    expect(scopeOf('ff02::1')).toContain('マルチキャスト');
    expect(scopeOf('2001:db8::1')).toContain('グローバル');
  });
});

describe('SLAAC', () => {
  it('MAC から EUI-64 でアドレスを作る（U/L ビットが反転する）', () => {
    expect(slaac('2001:db8::/64', '00:1a:2b:3c:4d:5e')).toBe('2001:db8::21a:2bff:fe3c:4d5e');
  });

  it('プレフィックスが変われば前半だけ変わる', () => {
    const a = slaac('2001:db8::/64', '00:1a:2b:3c:4d:5e');
    const b = slaac('2001:db8:1::/64', '00:1a:2b:3c:4d:5e');
    expect(a.split('::')[1]).toBe(b.split(':').slice(-4).join(':'));
  });

  it('不正な MAC は断る', () => {
    expect(() => slaac('2001:db8::/64', 'zz')).toThrow();
  });
});
