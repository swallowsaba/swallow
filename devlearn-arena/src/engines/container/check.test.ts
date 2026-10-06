import { describe, expect, it } from 'vitest';
import { containerHolds } from './check';
import { createContainerHost, remove, run, stop, type ContainerHost } from './container';

/** 実戦の達成条件 `{ kind: 'container', expr }`（docs/content-spec.md 2.4）を、コンテナの模型の状態で判定する */

const ok = (r: { ok: true; host: ContainerHost } | { ok: false }): ContainerHost => {
  if (!r.ok) throw new Error('失敗した');
  return r.host;
};

describe('コンテナの達成条件', () => {
  it('image: は手元にあるイメージ。タグを省けば latest', () => {
    const h = createContainerHost(['nginx:1.27']);
    expect(containerHolds(h, 'image:nginx:1.27')).toBe(true);
    expect(containerHolds(h, 'image:nginx:1.27-alpine')).toBe(false);
    expect(containerHolds(h, 'image:nginx')).toBe(false);
    expect(containerHolds(createContainerHost(['nginx']), 'image:nginx:latest')).toBe(true);
    expect(containerHolds(h, '!image:redis:7')).toBe(true);
  });

  it('running: exited: exists: はコンテナの状態。名前で指す', () => {
    let h = ok(run(createContainerHost(), { image: 'nginx:1.27', name: 'web' }));
    expect(containerHolds(h, 'running:web exists:web')).toBe(true);
    expect(containerHolds(h, 'exited:web')).toBe(false);
    h = ok(stop(h, 'web'));
    expect(containerHolds(h, 'exited:web !running:web')).toBe(true);
    h = ok(remove(h, 'web'));
    expect(containerHolds(h, '!exists:web')).toBe(true);
    expect(containerHolds(h, 'exited:web')).toBe(false);
  });

  it('機械に Docker が無ければ満たさない。知らない形は内容の誤りとして投げる', () => {
    expect(containerHolds(null, 'image:nginx')).toBe(false);
    expect(() => containerHolds(createContainerHost(), 'alive:web')).toThrow(/知らない形/);
  });
});
