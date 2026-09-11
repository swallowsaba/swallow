import { describe, expect, it } from 'vitest';
import { createSession, type Session } from '@/engines/kernel/session';
import { execute } from '@/engines/kernel/shell';
import { emptyCluster, node } from '@/engines/k8s/factory';
import type { ClusterState } from '@/engines/k8s/types';
import { activeComponents, ownershipGraph, podLook } from './clusterModel';

function start() {
  let session: Session = createSession({
    cluster: emptyCluster([node('node-1', 4000, 8192), node('node-2', 4000, 8192)]),
    files: { '/home/learner': null },
  });
  return {
    run(line: string): { before: ClusterState | null; after: ClusterState | null } {
      const before = session.state.cluster;
      session = { ...session, state: execute(session.state, line, session.registry, session.clock).state };
      return { before, after: session.state.cluster };
    },
    get cluster(): ClusterState {
      const c = session.state.cluster;
      if (c === null) throw new Error('クラスタがありません');
      return c;
    },
  };
}

describe('どの部品が動いたかを光らせる', () => {
  it('見るだけのコマンドでは何も光らない', () => {
    const sh = start();
    const { before, after } = sh.run('kubectl get pods');
    expect([...activeComponents(before, after)]).toEqual([]);
  });

  it('Deployment を作ると、受付と記録帳が動く（まだ配置も数合わせもしない）', () => {
    const sh = start();
    const { before, after } = sh.run('kubectl create deployment web --image=nginx --replicas=2');
    expect(activeComponents(before, after)).toEqual(new Set(['apiserver', 'etcd']));
  });

  it('時間を進めると、見張り係が Pod を作り、配置係がノードを決める', () => {
    const sh = start();
    sh.run('kubectl create deployment web --image=nginx --replicas=2');
    const { before, after } = sh.run('kubectl wait 5');
    const active = activeComponents(before, after);
    expect(active.has('controller')).toBe(true);
    expect(active.has('scheduler')).toBe(true);
    expect(active.has('apiserver')).toBe(true);
  });

  it('持ち主のいない Pod を作っても、見張り係は動かない', () => {
    const sh = start();
    sh.run('kubectl run web --image=nginx');
    const { before, after } = sh.run('kubectl wait 5');
    const active = activeComponents(before, after);
    expect(active.has('scheduler')).toBe(true);
    expect(active.has('controller')).toBe(false);
  });
});

describe('Pod の状態は色と文字の両方で出す', () => {
  it('Pending → Creating → Running と移る', () => {
    const sh = start();
    sh.run('kubectl run web --image=nginx');
    const pod = () => {
      const found = sh.cluster.pods.get('default/web');
      if (!found) throw new Error('Pod がありません');
      return found;
    };
    expect(podLook(pod()).look).toBe('Pending');
    sh.run('kubectl wait 1');
    expect(['Creating', 'Running']).toContain(podLook(pod()).look);
    sh.run('kubectl wait 10');
    expect(podLook(pod()).look).toBe('Running');
  });
});

describe('持ち主の系図と Service の線', () => {
  it('Deployment → ReplicaSet → Pod と線で結ばれる', () => {
    const sh = start();
    sh.run('kubectl create deployment web --image=nginx --replicas=2');
    sh.run('kubectl wait 10');
    const graph = ownershipGraph(sh.cluster);
    const rs = graph.nodes.find((n) => n.kind === 'ReplicaSet');
    expect(rs).toBeDefined();
    expect(graph.edges).toContainEqual({ from: 'Deployment/web', to: `ReplicaSet/${rs?.name ?? ''}`, type: 'own' });
    const pods = graph.nodes.filter((n) => n.kind === 'Pod');
    expect(pods.length).toBe(2);
    for (const pod of pods) {
      expect(graph.edges).toContainEqual({ from: `ReplicaSet/${rs?.name ?? ''}`, to: pod.id, type: 'own' });
      expect(pod.look).toBe('Running');
    }
    // 左から Deployment → ReplicaSet → Pod の順に並ぶ
    const deploy = graph.nodes.find((n) => n.kind === 'Deployment');
    expect((deploy?.x ?? 0) < (rs?.x ?? 0)).toBe(true);
    expect((rs?.x ?? 0) < (pods[0]?.x ?? 0)).toBe(true);
  });

  it('Service からは Endpoints に載っている Pod にだけ線が伸びる', () => {
    const sh = start();
    sh.run('kubectl create deployment web --image=nginx --replicas=2');
    sh.run('kubectl run lone --image=nginx');
    sh.run('kubectl expose deployment web --port=80');
    sh.run('kubectl wait 15');
    const graph = ownershipGraph(sh.cluster);
    const served = graph.edges.filter((e) => e.type === 'serve');
    expect(served.length).toBe(2);
    expect(served.every((e) => e.from === 'Service/web' && e.to.startsWith('Pod/web-'))).toBe(true);
    expect(served.some((e) => e.to === 'Pod/lone')).toBe(false);
  });

  it('持ち主のいない Pod は、線の無い単独の Pod として出る', () => {
    const sh = start();
    sh.run('kubectl run lone --image=nginx');
    const graph = ownershipGraph(sh.cluster);
    expect(graph.nodes.map((n) => n.id)).toEqual(['Pod/lone']);
    expect(graph.edges).toEqual([]);
  });
});
