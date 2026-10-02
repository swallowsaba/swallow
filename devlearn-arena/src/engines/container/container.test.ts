import { describe, expect, it } from 'vitest';
import { createContainerHost, findContainer, normalizeRef, pull, remove, removeImage, run, servedAt, start, stop, type ContainerHost } from './container';

/** コンテナの模型（イメージ・コンテナ・ポートの公開・環境変数）。CLI の docker は src/engines/docker のテスト */

const ok = <T>(r: { ok: true; host: ContainerHost; value: T } | { ok: false }): { host: ContainerHost; value: T } => {
  if (!r.ok) throw new Error('失敗した');
  return r;
};

describe('コンテナの模型', () => {
  it('同じイメージから、別々のコンテナを何個でも作れる（イメージは型、コンテナは実体）', () => {
    let h = createContainerHost();
    h = ok(run(h, { image: 'nginx', name: 'a' })).host;
    h = ok(run(h, { image: 'nginx', name: 'b' })).host;
    expect(h.images.map((i) => i.ref)).toEqual(['nginx:1.27']);
    expect(h.containers.map((c) => [c.name, c.image, c.state])).toEqual([['a', 'nginx:1.27', 'running'], ['b', 'nginx:1.27', 'running']]);
    expect(new Set(h.containers.map((c) => c.id)).size).toBe(2);
  });

  it('タグを省くと最新のタグ。置き場に無いイメージは取れない', () => {
    expect(normalizeRef('redis')).toBe('redis:7');
    expect(pull(createContainerHost(), 'no-such-image')).toMatchObject({ ok: false, error: { kind: 'image-not-found', ref: 'no-such-image:latest' } });
  });

  it('ポートを公開すると、手元のポートに中の Web サーバが応える。中のポートが違えば応えない', () => {
    const right = ok(run(createContainerHost(), { image: 'nginx', ports: [{ host: 8080, container: 80 }] })).host;
    expect(servedAt(right, 8080)?.body).toContain('Welcome to nginx!');
    const wrong = ok(run(createContainerHost(), { image: 'nginx', ports: [{ host: 8080, container: 8080 }] })).host;
    expect(servedAt(wrong, 8080)).toBeNull();
  });

  it('同じ手元のポートは 2 つに使えない。名前も重ねられない', () => {
    const h = ok(run(createContainerHost(), { image: 'nginx', name: 'web', ports: [{ host: 8080, container: 80 }] })).host;
    expect(run(h, { image: 'httpd', ports: [{ host: 8080, container: 80 }] })).toMatchObject({ ok: false, error: { kind: 'port-in-use', port: 8080 } });
    expect(run(h, { image: 'httpd', name: 'web' })).toMatchObject({ ok: false, error: { kind: 'name-in-use', name: 'web' } });
  });

  it('要る環境変数が無いとすぐ止まり、理由がログに残る。渡せば動く', () => {
    const bad = ok(run(createContainerHost(), { image: 'postgres:16', name: 'db' }));
    expect(bad.value).toMatchObject({ state: 'exited', exitCode: 1 });
    expect(bad.value.log.join('\n')).toContain('password is not specified');
    const good = ok(run(createContainerHost(), { image: 'postgres:16', env: { POSTGRES_PASSWORD: 'x' } }));
    expect(good.value.state).toBe('running');
  });

  it('止める・動かす・消す。動いているコンテナは force でなければ消せず、使われているイメージは消せない', () => {
    let h = ok(run(createContainerHost(), { image: 'nginx', name: 'web' })).host;
    expect(remove(h, 'web')).toMatchObject({ ok: false, error: { kind: 'container-running' } });
    expect(removeImage(h, 'nginx')).toMatchObject({ ok: false, error: { kind: 'image-in-use' } });
    h = ok(stop(h, 'web')).host;
    expect(findContainer(h, 'web')?.state).toBe('exited');
    h = ok(start(h, 'web')).host;
    expect(findContainer(h, 'web')?.state).toBe('running');
    h = ok(remove(h, 'web', true)).host;
    expect(h.containers).toEqual([]);
    expect(removeImage(h, 'nginx').ok).toBe(true);
  });

  it('同じ操作からは同じ ID と名前（乱数を使わない）', () => {
    const a = ok(run(createContainerHost(), { image: 'redis' })).value;
    const b = ok(run(createContainerHost(), { image: 'redis' })).value;
    expect([a.id, a.name]).toEqual([b.id, b.name]);
  });
});
