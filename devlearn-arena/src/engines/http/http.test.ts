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

describe('メソッドと API（docs/lessons/web.md）', () => {
  const api = (): Site => ({
    host: 'api.example', port: 80, routes: {},
    api: { base: '/items', items: [{ id: 1, name: 'pen', stock: 3 }], fields: { name: 'string', stock: 'number' } },
  });

  it('道の答えは GET と HEAD で返し、ほかのメソッドは 405（受け付けるメソッドを Allow で示す）', () => {
    const e = env([shop({ routes: { '/': { status: 200, body: 'top' }, 'POST /orders': { status: 201, body: 'made' } } })]);
    const head = request(e, 'https://shop.example/', { method: 'HEAD' });
    expect(head.ok && [head.response.status, head.response.body]).toEqual([200, '']);
    const del = request(e, 'https://shop.example/', { method: 'DELETE' });
    expect(del.ok && [del.response.status, del.response.headers.Allow]).toEqual([405, 'GET, HEAD']);
    const post = request(e, 'https://shop.example/orders', { data: 'x' });
    expect(post.ok && post.response.status).toBe(201);
  });

  it('作る（201 と Location）・取る・置き換える・消す（204）で、資源の集まりが変わる', () => {
    let e = env([api()]);
    const step = (u: string, method: string, data?: string) => {
      const r = request(e, u, { method, ...(data !== undefined ? { data } : {}) });
      if (!r.ok) throw new Error('つながらない');
      if (r.sites) e = { ...e, sites: r.sites };
      return r.response;
    };
    const made = step('http://api.example/items', 'POST', '{"name":"cup","stock":0}');
    expect([made.status, made.headers.Location, made.headers['Content-Type']]).toEqual([201, '/items/2', 'application/json']);
    expect(JSON.parse(step('http://api.example/items/2', 'GET').body)).toEqual({ id: 2, name: 'cup', stock: 0 });
    expect(step('http://api.example/items/2', 'PUT', '{"name":"cup","stock":5}').status).toBe(200);
    expect(JSON.parse(step('http://api.example/items', 'GET').body)).toEqual([{ id: 1, name: 'pen', stock: 3 }, { id: 2, name: 'cup', stock: 5 }]);
    expect(step('http://api.example/items/2', 'DELETE').status).toBe(204);
    expect(step('http://api.example/items/2', 'GET').status).toBe(404);
  });

  it('形の違う中身は 400（理由を返す）。集まりを消そうとすると 405', () => {
    const e = env([api()]);
    const bad = (data: string): string | null => {
      const r = request(e, 'http://api.example/items/1', { method: 'PUT', data });
      return r.ok && r.response.status === 400 ? (JSON.parse(r.response.body) as { error: string }).error : null;
    };
    expect(bad("{'name':'pen','stock':1}")).toBe('invalid JSON in request body');
    expect(bad('{"name":"pen","stock":"1"}')).toBe('field "stock" must be a number');
    expect(bad('{"name":"pen"}')).toBe('field "stock" is required');
    const r = request(e, 'http://api.example/items', { method: 'DELETE' });
    expect(r.ok && r.response.status).toBe(405);
  });

  it('https で HTTP/2 に対応したサイトとは HTTP/2 で話し、--http1.1 なら 1.1。HTTP/3 は alt-svc で知らせる', () => {
    const e = env([shop({ versions: ['1.1', '2', '3'] })]);
    const v = (o: Parameters<typeof request>[2]) => {
      const r = request(e, 'https://shop.example/', o);
      return r.ok ? r.response.version : null;
    };
    expect([v({}), v({ version: '1.1' }), v({ version: '3' })]).toEqual(['2', '1.1', '3']);
    const r = request(e, 'https://shop.example/');
    expect(r.ok && r.response.headers['alt-svc']).toBe('h3=":443"; ma=86400');
    const old = request(env([shop()]), 'https://shop.example/');
    expect(old.ok && old.response.version).toBe('1.1');
  });

  it('curl -i は HTTP/2 の頭を本物と同じ形（理由の語なし・見出しは小文字）で出す。-X と -d で API を変える', () => {
    const s = createSession({ web: { sites: [shop({ versions: ['1.1', '2'] }), api()], roots: [DEMO_ROOT], today: '2026-10-03', hostname: 'client' } });
    let state = s.state;
    const run = (line: string): string => {
      const out = execute(state, line, s.registry, s.clock);
      state = out.state;
      return out.chunks.map((c) => c.text).join('');
    };
    expect(run('curl -I https://shop.example/')).toMatch(/^HTTP\/2 200\nserver: nginx\ncontent-type: text\/html\n/);
    run(`curl -X POST -d '{"name":"cup","stock":0}' http://api.example/items`);
    run('curl -X DELETE http://api.example/items/1');
    expect(JSON.parse(run('curl -s http://api.example/items'))).toEqual([{ id: 2, name: 'cup', stock: 0 }]);
    expect(run('curl -s -o /dev/null -w "%{http_code}\\n" http://api.example/items/9')).toBe('404\n');
  });
});
