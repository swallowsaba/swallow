import { describe, expect, it } from 'vitest';
import { addressesOf, checkZone, parseZone } from './zone';

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
    // 名前を省いた行は、前の行と同じ名前。MX の受け取り先も、相対の名前なら $ORIGIN を補う（本物の BIND と同じ）
    expect(r[3]).toMatchObject({ name: 'mail.shop.example', type: 'MX', value: '10 mail.shop.example' });
  });

  it('A と、別名（CNAME）の先の A を、名前 → アドレスの表にする', () => {
    expect([...addressesOf(parseZone(zone))]).toEqual([
      ['shop.example', '203.0.113.10'],
      ['mail.shop.example', '203.0.113.25'],
      ['www.shop.example', '203.0.113.10'],
    ]);
  });

  it('named-checkzone と同じ確かめ: 通れば SOA の serial、誤りは本物と同じ言い方', () => {
    const head = [
      '$TTL 300',
      '$ORIGIN shop.example.',
      '@ IN SOA ns1.shop.example. admin.shop.example. ( 2026101401 3600 900 604800 300 )',
      '@ IN NS ns1.shop.example.',
      'ns1 IN A 203.0.113.53',
      '',
    ].join('\n');
    expect(checkZone(`${head}@ IN MX 10 mail.shop.example.\n`, 'shop.example', 'db.shop.example')).toEqual({ ok: true, serial: '2026101401' });
    expect(checkZone(`${head}@ IN MX mail.shop.example.\n`, 'shop.example', 'db.shop.example')).toEqual({
      ok: false,
      lines: [
        "dns_rdata_fromtext: db.shop.example:6: near 'mail.shop.example.': not a valid number",
        'zone shop.example/IN: loading from master file db.shop.example failed: not a valid number',
        'zone shop.example/IN: not loaded due to errors.',
      ],
    });
    expect(checkZone(`${head}www IN CNAM shop.example.\n`, 'shop.example', 'db').ok).toBe(false);
    expect(checkZone(`${head}www IN CNAME shop.example.\nwww IN A 203.0.113.20\n`, 'shop.example', 'db')).toEqual({
      ok: false,
      lines: ['zone shop.example/IN: www.shop.example: CNAME and other data', 'zone shop.example/IN: not loaded due to errors.'],
    });
    // SOA の無いゾーンは読み込まない
    expect(checkZone('$ORIGIN shop.example.\n@ IN A 203.0.113.10\n', 'shop.example', 'db').ok).toBe(false);
  });
});
