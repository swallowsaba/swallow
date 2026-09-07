import { describe, expect, it } from 'vitest';
import { container, emptyCluster, node, pod } from './factory';
import { isReady, tickPods } from './kubelet';
import type { ClusterState, Pod } from './types';

function place(state: ClusterState, pods: Pod[]): ClusterState {
  return { ...state, pods: new Map(pods.map((p) => [`${p.metadata.namespace}/${p.metadata.name}`, p])) };
}

function advance(state: ClusterState, times: number): ClusterState {
  let current = state;
  for (let i = 0; i < times; i += 1) {
    const result = tickPods(current);
    current = { ...current, tick: current.tick + 1, pods: result.pods, events: [...current.events, ...result.events], ipCounter: result.ipCounter };
  }
  return current;
}

const base = emptyCluster([node('n1', 4000, 8192)]);

describe('Pod のライフサイクル', () => {
  it('配置されるとノードと IP が決まる', () => {
    const state = advance(place(base, [pod('web', [container('c', 'nginx')])]), 1);
    const target = state.pods.get('default/web');
    expect(target?.status.nodeName).toBe('n1');
    expect(target?.status.podIP).toBe('10.244.0.1');
    expect(target?.status.phase).toBe('ContainerCreating');
  });

  it('時間が経つと Running になる', () => {
    const state = advance(place(base, [pod('web', [container('c', 'nginx', { readyAfter: 2 })])]), 4);
    expect(state.pods.get('default/web')?.status.phase).toBe('Running');
    expect(isReady(state.pods.get('default/web') as Pod)).toBe(true);
  });

  it('すぐには Ready にならない', () => {
    const state = advance(place(base, [pod('web', [container('c', 'nginx', { readyAfter: 3 })])]), 2);
    expect(state.pods.get('default/web')?.status.phase).not.toBe('Running');
  });

  it('配置できなければ理由が status に残る', () => {
    const state = advance(place(emptyCluster(), [pod('web', [container('c', 'nginx')])]), 2);
    expect(state.pods.get('default/web')?.status.message).toContain('no nodes available');
    expect(state.pods.get('default/web')?.status.phase).toBe('Pending');
  });

  it('配置の失敗がイベントに残る', () => {
    const state = advance(place(emptyCluster(), [pod('web', [container('c', 'nginx')])]), 1);
    expect(state.events.some((e) => e.reason === 'FailedScheduling')).toBe(true);
  });

  it('IP は連番で払い出される（乱数を使わない）', () => {
    const state = advance(
      place(base, [pod('a', [container('c', 'nginx')]), pod('b', [container('c', 'nginx')])]),
      1,
    );
    const ips = [...state.pods.values()].map((p) => p.status.podIP).sort();
    expect(ips).toEqual(['10.244.0.1', '10.244.0.2']);
  });

  it('同じ操作なら同じ結果になる（決定論）', () => {
    const a = advance(place(base, [pod('web', [container('c', 'nginx')])]), 5);
    const b = advance(place(base, [pod('web', [container('c', 'nginx')])]), 5);
    expect(a.pods.get('default/web')?.status).toEqual(b.pods.get('default/web')?.status);
  });
});

describe('取得に失敗するイメージ', () => {
  const broken = pod('bad', [container('c', 'registry/does-not-exist:1.0')]);

  it('Ready にならない', () => {
    const state = advance(place(base, [broken]), 6);
    expect(isReady(state.pods.get('default/bad') as Pod)).toBe(false);
  });

  it('ImagePullBackOff になる', () => {
    const state = advance(place(base, [broken]), 10);
    const status = state.pods.get('default/bad')?.status.containerStatuses[0];
    expect(status?.waitingReason).toBe('ImagePullBackOff');
    expect(status?.restartCount).toBeGreaterThan(1);
  });

  it('再試行の間隔が伸びる（指数バックオフ）', () => {
    let state = place(base, [broken]);
    const gaps: number[] = [];
    let lastCount = 0;
    for (let i = 0; i < 40; i += 1) {
      state = advance(state, 1);
      const count = state.pods.get('default/bad')?.status.containerStatuses[0]?.restartCount ?? 0;
      if (count !== lastCount) {
        gaps.push(state.tick);
        lastCount = count;
      }
    }
    expect(gaps.length).toBeGreaterThanOrEqual(3);
    const first = (gaps[1] ?? 0) - (gaps[0] ?? 0);
    const second = (gaps[2] ?? 0) - (gaps[1] ?? 0);
    expect(second).toBeGreaterThan(first);
  });

  it('失敗がイベントに残る', () => {
    const state = advance(place(base, [broken]), 3);
    expect(state.events.some((e) => e.reason === 'Failed' && e.message.includes('Failed to pull'))).toBe(true);
  });
});
