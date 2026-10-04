import { describe, expect, it } from 'vitest';
import { addressesOf, parseZone } from './zone';

describe('ゾーンファイルを読む', () => {
  const zone = [
    '$TTL 300',
    '$ORIGIN shop.example.',
    '@        IN  A      203.0.113.10   ; 店の Web サーバ',
    'www      IN  CNAME  @',
    'mail 60  IN  A      203.0.113.25',
    '         IN  MX     10 mail',
  ].join('\n');

  it('@ と相対の名前に $ORIGIN を付け、TTL と種類と値を読む', () => {
    const r = parseZone(zone);
    expect(r[0]).toEqual({ name: 'shop.example', ttl: 300, type: 'A', value: '203.0.113.10' });
    expect(r[1]).toEqual({ name: 'www.shop.example', ttl: 300, type: 'CNAME', value: 'shop.example' });
    expect(r[2]).toEqual({ name: 'mail.shop.example', ttl: 60, type: 'A', value: '203.0.113.25' });
    // 名前を省いた行は、前の行と同じ名前
    expect(r[3]).toMatchObject({ name: 'mail.shop.example', type: 'MX', value: '10 mail' });
  });

  it('A と、別名（CNAME）の先の A を、名前 → アドレスの表にする', () => {
    expect([...addressesOf(parseZone(zone))]).toEqual([
      ['shop.example', '203.0.113.10'],
      ['mail.shop.example', '203.0.113.25'],
      ['www.shop.example', '203.0.113.10'],
    ]);
  });
});
