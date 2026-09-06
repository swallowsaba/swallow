import { describe, expect, it } from 'vitest';
import { container, emptyCluster, node, pod, quantity } from './factory';
import { requestOf, schedule, usedOn } from './scheduler';
import type { ClusterState } from './types';

function withPods(state: ClusterState, pods: ReturnType<typeof pod>[]): ClusterState {
  return { ...state, pods: new Map(pods.map((p) => [`${p.metadata.namespace}/${p.metadata.name}`, p])) };
}

describe('配置の判断', () => {
  it('ノードが無ければ配置できない', () => {
    const result = schedule(emptyCluster(), pod('a', [container('c', 'nginx')]));
    expect(result.nodeName).toBeNull();
    expect(result.reason).toContain('no nodes available');
  });

  it('余裕があるノードに置く', () => {
    const state = emptyCluster([node('n1', 1000, 2048)]);
    expect(schedule(state, pod('a', [container('c', 'nginx')])).nodeName).toBe('n1');
  });

  it('CPU が足りなければ理由を返す', () => {
    const state = emptyCluster([node('n1', 100, 4096)]);
    const big = pod('a', [container('c', 'nginx', { requests: quantity(500, 128) })]);
    const result = schedule(state, big);
    expect(result.nodeName).toBeNull();
    expect(result.reason).toContain('Insufficient cpu');
  });

  it('メモリが足りなければ理由を返す', () => {
    const state = emptyCluster([node('n1', 4000, 128)]);
    const big = pod('a', [container('c', 'nginx', { requests: quantity(100, 512) })]);
    expect(schedule(state, big).reason).toContain('Insufficient memory');
  });

  it('既に載っている Pod の分を差し引く', () => {
    let state = emptyCluster([node('n1', 300, 1024)]);
    const running = pod('busy', [container('c', 'nginx', { requests: quantity(250, 128) })]);
    running.status.nodeName = 'n1';
    state = withPods(state, [running]);
    expect(usedOn(state, 'n1').cpu).toBe(250);
    const next = pod('a', [container('c', 'nginx', { requests: quantity(100, 128) })]);
    expect(schedule(state, next).nodeName).toBeNull();
  });

  it('終了した Pod は容量を占めない', () => {
    let state = emptyCluster([node('n1', 300, 1024)]);
    const done = pod('done', [container('c', 'nginx', { requests: quantity(250, 128) })]);
    done.status.nodeName = 'n1';
    done.status.phase = 'Succeeded';
    state = withPods(state, [done]);
    expect(usedOn(state, 'n1').cpu).toBe(0);
  });

  it('nodeSelector に合わないノードは外す', () => {
    const state = emptyCluster([node('n1', 1000, 2048), node('n2', 1000, 2048, { disk: 'ssd' })]);
    const target = pod('a', [container('c', 'nginx')], { nodeSelector: { disk: 'ssd' } });
    expect(schedule(state, target).nodeName).toBe('n2');
  });

  it('合うノードが無ければ selector の理由を返す', () => {
    const state = emptyCluster([node('n1', 1000, 2048)]);
    const target = pod('a', [container('c', 'nginx')], { nodeSelector: { disk: 'ssd' } });
    expect(schedule(state, target).reason).toContain("node affinity/selector");
  });

  it('taint を許容しない Pod は置かれない', () => {
    const tainted = node('n1', 1000, 2048);
    tainted.spec.taints = [{ key: 'gpu', value: 'true', effect: 'NoSchedule' }];
    const state = emptyCluster([tainted]);
    expect(schedule(state, pod('a', [container('c', 'nginx')])).reason).toContain('untolerated taint');
  });

  it('toleration があれば置ける', () => {
    const tainted = node('n1', 1000, 2048);
    tainted.spec.taints = [{ key: 'gpu', value: 'true', effect: 'NoSchedule' }];
    const state = emptyCluster([tainted]);
    const target = pod('a', [container('c', 'nginx')]);
    target.spec.tolerations = [{ key: 'gpu', effect: 'NoSchedule' }];
    expect(schedule(state, target).nodeName).toBe('n1');
  });

  it('cordon したノードには置かない', () => {
    const drained = node('n1', 1000, 2048);
    drained.spec.unschedulable = true;
    expect(schedule(emptyCluster([drained]), pod('a', [container('c', 'nginx')])).reason).toContain(
      'unschedulable',
    );
  });

  it('空きが多いノードを選ぶ', () => {
    let state = emptyCluster([node('n1', 1000, 2048), node('n2', 4000, 8192)]);
    state = withPods(state, []);
    expect(schedule(state, pod('a', [container('c', 'nginx')])).nodeName).toBe('n2');
  });

  it('同じ条件なら名前順（決定論）', () => {
    const state = emptyCluster([node('b', 1000, 2048), node('a', 1000, 2048)]);
    expect(schedule(state, pod('x', [container('c', 'nginx')])).nodeName).toBe('a');
  });

  it('要求量は全コンテナの合計', () => {
    const target = pod('a', [
      container('c1', 'nginx', { requests: quantity(100, 128) }),
      container('c2', 'sidecar', { requests: quantity(50, 64) }),
    ]);
    expect(requestOf(target)).toEqual({ cpu: 150, memory: 192 });
  });
});
