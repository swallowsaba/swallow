import { describe, expect, it } from 'vitest';
import { curlTlsError, DEMO_INTERMEDIATE, DEMO_ROOT, leafFor, nameMatches, verify } from './tls';

const TODAY = '2026-10-03';
const roots = [DEMO_ROOT];

describe('TLS の証明書の連鎖', () => {
  it('葉 → 中間 → 信頼するルート とたどれれば信頼する', () => {
    const v = verify('shop.example', [leafFor('shop.example'), DEMO_INTERMEDIATE], roots, TODAY);
    expect(v.trusted).toBe(true);
    if (v.trusted) expect(v.path.map((c) => c.subject)).toEqual(['shop.example', 'Minato Issuing CA', 'Minato Root CA']);
  });

  it('期限切れ・まだ有効でない（葉でも中間でも）', () => {
    expect(verify('shop.example', [leafFor('shop.example', { notAfter: '2026-09-30' }), DEMO_INTERMEDIATE], roots, TODAY)).toMatchObject({ trusted: false, reason: 'expired' });
    expect(verify('shop.example', [leafFor('shop.example', { notBefore: '2026-12-01' }), DEMO_INTERMEDIATE], roots, TODAY)).toMatchObject({ trusted: false, reason: 'not-yet-valid' });
    expect(verify('shop.example', [leafFor('shop.example'), { ...DEMO_INTERMEDIATE, notAfter: '2026-01-01' }], roots, TODAY)).toMatchObject({ trusted: false, reason: 'expired', cert: { subject: 'Minato Issuing CA' } });
  });

  it('名前が合わない。*. は 1 段だけに合う', () => {
    expect(verify('www.shop.example', [leafFor('shop.example'), DEMO_INTERMEDIATE], roots, TODAY)).toMatchObject({ trusted: false, reason: 'name-mismatch' });
    expect(nameMatches('www.shop.example', '*.shop.example')).toBe(true);
    expect(nameMatches('a.b.shop.example', '*.shop.example')).toBe(false);
    expect(nameMatches('shop.example', '*.shop.example')).toBe(false);
    expect(nameMatches('SHOP.example', 'shop.EXAMPLE')).toBe(true);
  });

  it('中間を送っていない時と、知らない発行者・自己署名', () => {
    expect(verify('shop.example', [leafFor('shop.example')], roots, TODAY)).toMatchObject({ trusted: false, reason: 'incomplete-chain' });
    expect(verify('shop.example', [leafFor('shop.example', { issuer: 'Unknown CA' }), DEMO_INTERMEDIATE], roots, TODAY)).toMatchObject({ trusted: false, reason: 'unknown-issuer' });
    expect(verify('shop.example', [leafFor('shop.example', { issuer: 'shop.example' })], roots, TODAY)).toMatchObject({ trusted: false, reason: 'self-signed' });
  });

  it('自己署名でも、手元が信頼するルートとして持っていれば信頼する', () => {
    const self = { ...leafFor('lab.local', { issuer: 'lab.local' }), ca: true };
    expect(verify('lab.local', [self], [self], TODAY).trusted).toBe(true);
  });

  it('curl と同じ言い方のエラー', () => {
    const v = verify('shop.example', [leafFor('shop.example', { notAfter: '2026-09-30' }), DEMO_INTERMEDIATE], roots, TODAY);
    if (v.trusted) throw new Error('信頼してしまった');
    expect(curlTlsError('shop.example', v)).toEqual({ code: 60, message: 'SSL certificate problem: certificate has expired' });
    const m = verify('www.x', [leafFor('x')], roots, TODAY);
    if (m.trusted) throw new Error('信頼してしまった');
    expect(curlTlsError('www.x', m).message).toBe("SSL: no alternative certificate subject name matches target host name 'www.x'");
  });
});
