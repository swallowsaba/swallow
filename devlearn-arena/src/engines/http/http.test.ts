import { describe, expect, it } from 'vitest';
import { createSession } from '@/engines/kernel/session';
import { execute } from '@/engines/kernel/shell';
import { DEMO_INTERMEDIATE, DEMO_ROOT, leafFor } from '@/engines/tls/tls';
import { curlError, parseUrl, request, type HttpEnv, type Site } from './http';

const shop = (over: Partial<Site> = {}): Site => ({
  host: 'shop.example', port: 443, chain: [leafFor('shop.example'), DEMO_INTERMEDIATE],
  routes: { '/': { status: 200, body: 'shop' }, '/admin': { status: 403, body: 'forbidden' }, '/old': { status: 301, body: '', headers: { Location: '/' } } },
  ...over,
});

const env = (sites: Site[], today = '2026-10-03'): HttpEnv => ({ sites, roots: [DEMO_ROOT], today, localNames: ['localhost'], local: () => null });

describe('HTTP の模型', () => {
  it('URL を読む（既定のポートは http 80・https 443）', () => {
    expect(parseUrl('https://Shop.example/a?b=1')).toEqual({ scheme: 'https', host: 'shop.example', port: 443, path: '/a?b=1' });
    expect(parseUrl('localhost:8080')).toEqual({ scheme: 'http', host: 'localhost', port: 8080, path: '/' });
    expect(parseUrl('http://')).toBeNull();
  });

  it('道ごとの状態の番号（200・403・301・無い道は 404）', () => {
    const e = env([shop()]);
    const status = (u: string): number | null => {
      const r = request(e, u);
      return r.ok ? r.response.status : null;
    };
    expect([status('https://shop.example/'), status('https://shop.example/admin'), status('https://shop.example/old'), status('https://shop.example/nope')]).toEqual([200, 403, 301, 404]);
    const moved = request(e, 'https://shop.example/old');
    expect(moved.ok && moved.response.headers.Location).toBe('/');
  });

  it('名前が引けない・ポートで待ち受けていない', () => {
    const e = env([shop()]);
    expect(request(e, 'https://shoop.example/')).toMatchObject({ ok: false, error: { kind: 'resolve' } });
    expect(request(e, 'http://shop.example/')).toMatchObject({ ok: false, error: { kind: 'refused', port: 80 } });
  });

  it('https は証明書の連鎖を検証し、信頼できなければつながない（-k で飛ばせる）', () => {
    const expired = env([shop({ chain: [leafFor('shop.example', { notAfter: '2026-09-30' }), DEMO_INTERMEDIATE] })]);
    const r = request(expired, 'https://shop.example/');
    expect(r).toMatchObject({ ok: false, error: { kind: 'tls', verdict: { reason: 'expired' } } });
    if (r.ok) throw new Error('つながってしまった');
    expect(curlError(r.error, 'shop.example')).toEqual({ code: 60, message: 'SSL certificate problem: certificate has expired' });
    expect(request(expired, 'https://shop.example/', { insecure: true }).ok).toBe(true);
    const noIntermediate = env([shop({ chain: [leafFor('shop.example')] })]);
    expect(request(noIntermediate, 'https://shop.example/')).toMatchObject({ ok: false, error: { verdict: { reason: 'incomplete-chain' } } });
  });

  it('curl から使う（名前で引けるサイト）', () => {
    const s = createSession({ web: { sites: [shop()], roots: [DEMO_ROOT], today: '2026-10-03', hostname: 'server' } });
    const out = execute(s.state, 'curl -v https://shop.example/', s.registry, s.clock);
    expect(out.exitCode).toBe(0);
    expect(out.chunks.find((c) => c.stream === 'stdout')?.text).toBe('shop\n');
    expect(out.chunks.find((c) => c.stream === 'stderr')?.text).toContain('SSL certificate verify ok.');
  });
});
