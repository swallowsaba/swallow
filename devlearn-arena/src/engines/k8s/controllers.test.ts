import { describe, expect, it } from 'vitest';
import { container, deployment, emptyCluster, node, service } from './factory';
import { advanceCluster, matches, reconcile, templateHash } from './controllers';
import { tickPods } from './kubelet';
import type { ClusterState } from './types';
import { key } from './types';

function withDeployment(state: ClusterState, d: ReturnType<typeof deployment>): ClusterState {
  return { ...state, deployments: new Map([[key(d.metadata.namespace, d.metadata.name), d]]) };
}

function run(state: ClusterState, times: number): ClusterState {
  let current = state;
  for (let i = 0; i < times; i += 1) current = advanceCluster(current, tickPods);
  return current;
}

const cluster = emptyCluster([node('n1', 4000, 8192), node('n2', 4000, 8192)]);

describe('セレクタ', () => {
  it('全て一致すれば真', () => {
    expect(matches({ app: 'web', tier: 'front' }, { app: 'web' })).toBe(true);
  });
  it('1つでも違えば偽', () => {
    expect(matches({ app: 'web' }, { app: 'api' })).toBe(false);
  });
  it('空のセレクタは何にも一致しない', () => {
    expect(matches({ app: 'web' }, {})).toBe(false);
  });
});

describe('テンプレートの識別子', () => {
  it('同じ内容なら同じ（決定論）', () => {
    const a = deployment('web', 1, [container('c', 'nginx:1.24')]);
    const b = deployment('web', 1, [container('c', 'nginx:1.24')]);
    expect(templateHash(a.spec.template)).toBe(templateHash(b.spec.template));
  });
  it('イメージが変われば変わる', () => {
    const a = deployment('web', 1, [container('c', 'nginx:1.24')]);
    const b = deployment('web', 1, [container('c', 'nginx:1.25')]);
    expect(templateHash(a.spec.template)).not.toBe(templateHash(b.spec.template));
  });
});

describe('Deployment の収束', () => {
  it('ReplicaSet が作られる', () => {
    const state = reconcile(withDeployment(cluster, deployment('web', 3, [container('c', 'nginx')])));
    expect(state.state.replicaSets.size).toBe(1);
  });

  it('replicas の数まで Pod が増える', () => {
    const state = run(withDeployment(cluster, deployment('web', 3, [container('c', 'nginx')])), 10);
    expect(state.pods.size).toBe(3);
  });

  it('やがて全てが Ready になる', () => {
    const state = run(withDeployment(cluster, deployment('web', 3, [container('c', 'nginx')])), 12);
    const target = state.deployments.get('default/web');
    expect(target?.status.readyReplicas).toBe(3);
  });

  it('Pod を消すと作り直される（特別扱いをしていない）', () => {
    let state = run(withDeployment(cluster, deployment('web', 2, [container('c', 'nginx')])), 10);
    const victim = [...state.pods.keys()][0] ?? '';
    const pods = new Map(state.pods);
    pods.delete(victim);
    state = { ...state, pods };
    expect(state.pods.size).toBe(1);
    state = run(state, 6);
    expect(state.pods.size).toBe(2);
  });

  it('replicas を減らすと Pod も減る', () => {
    let state = run(withDeployment(cluster, deployment('web', 3, [container('c', 'nginx')])), 10);
    const current = state.deployments.get('default/web');
    if (!current) throw new Error('missing');
    state = {
      ...state,
      deployments: new Map([['default/web', { ...current, spec: { ...current.spec, replicas: 1 } }]]),
    };
    state = run(state, 6);
    expect(state.pods.size).toBe(1);
  });

  it('容量が足りなければ配置されずに理由が残る', () => {
    const small = emptyCluster([node('n1', 150, 256)]);
    const state = run(withDeployment(small, deployment('web', 3, [container('c', 'nginx')])), 6);
    const pending = [...state.pods.values()].filter((p) => p.status.nodeName === null);
    expect(pending.length).toBeGreaterThan(0);
    expect(pending[0]?.status.message).toContain('Insufficient');
  });
});

describe('ローリングアップデート', () => {
  it('イメージを変えると新しい ReplicaSet ができる', () => {
    let state = run(withDeployment(cluster, deployment('web', 3, [container('c', 'nginx:1.24')])), 12);
    const current = state.deployments.get('default/web');
    if (!current) throw new Error('missing');
    state = {
      ...state,
      deployments: new Map([
        ['default/web', {
          ...current,
          spec: {
            ...current.spec,
            template: { ...current.spec.template, containers: [container('c', 'nginx:1.25')] },
          },
        }],
      ]),
    };
    state = run(state, 2);
    expect(state.replicaSets.size).toBe(2);
  });

  it('maxUnavailable: 0 なら可用性が落ちない', () => {
    const spec = deployment('web', 3, [container('c', 'nginx:1.24')], { maxSurge: 1, maxUnavailable: 0 });
    let state = run(withDeployment(cluster, spec), 14);
    expect(state.deployments.get('default/web')?.status.readyReplicas).toBe(3);

    const current = state.deployments.get('default/web');
    if (!current) throw new Error('missing');
    state = {
      ...state,
      deployments: new Map([
        ['default/web', {
          ...current,
          spec: {
            ...current.spec,
            template: { ...current.spec.template, containers: [container('c', 'nginx:1.25')] },
          },
        }],
      ]),
    };

    const readyHistory: number[] = [];
    for (let i = 0; i < 25; i += 1) {
      state = run(state, 1);
      readyHistory.push(
        [...state.pods.values()].filter(
          (p) => p.status.phase === 'Running' && p.status.containerStatuses.every((c) => c.ready),
        ).length,
      );
    }
    // 全 tick で最低 3 - maxUnavailable = 3 を割らない
    expect(Math.min(...readyHistory)).toBeGreaterThanOrEqual(3);
  });

  it('入れ替わると新しいイメージの Pod だけになる', () => {
    let state = run(withDeployment(cluster, deployment('web', 2, [container('c', 'nginx:1.24')])), 12);
    const current = state.deployments.get('default/web');
    if (!current) throw new Error('missing');
    state = {
      ...state,
      deployments: new Map([
        ['default/web', {
          ...current,
          spec: {
            ...current.spec,
            template: { ...current.spec.template, containers: [container('c', 'nginx:1.25')] },
          },
        }],
      ]),
    };
    state = run(state, 30);
    const images = new Set([...state.pods.values()].map((p) => p.spec.containers[0]?.image));
    expect([...images]).toEqual(['nginx:1.25']);
  });
});

describe('Service の Endpoints', () => {
  it('Ready な Pod だけが載る', () => {
    let state = withDeployment(cluster, deployment('web', 2, [container('c', 'nginx', { readyAfter: 3 })]));
    state = { ...state, services: new Map([['default/web', service('web', { app: 'web' })]]) };
    const early = run(state, 2);
    expect(early.services.get('default/web')?.status.endpoints).toEqual([]);
    const later = run(early, 10);
    expect(later.services.get('default/web')?.status.endpoints.length).toBe(2);
  });

  it('セレクタが一致しなければ空のまま', () => {
    let state = withDeployment(cluster, deployment('web', 2, [container('c', 'nginx')]));
    state = { ...state, services: new Map([['default/api', service('api', { app: 'api' })]]) };
    const later = run(state, 12);
    expect(later.services.get('default/api')?.status.endpoints).toEqual([]);
  });
});

describe('イベント', () => {
  it('作成が記録される', () => {
    const state = run(withDeployment(cluster, deployment('web', 1, [container('c', 'nginx')])), 4);
    expect(state.events.some((e) => e.reason === 'SuccessfulCreate')).toBe(true);
    expect(state.events.some((e) => e.reason === 'ScalingReplicaSet')).toBe(true);
  });
});
