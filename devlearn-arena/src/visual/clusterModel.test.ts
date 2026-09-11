import { describe, expect, it } from 'vitest';
import { createSession, type Session } from '@/engines/kernel/session';
import { execute } from '@/engines/kernel/shell';
import { emptyCluster, node } from '@/engines/k8s/factory';
import type { ClusterState } from '@/engines/k8s/types';
import {
  activationOrder, activeComponents, ownershipGraph, podGeneration, podLabel, podLook, rollingDeployments,
} from './clusterModel';

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

describe('命令が伝わる順に光らせる', () => {
  it('受付 → 記録帳 → 見張り係 → 配置係 の順に並べる', () => {
    expect(activationOrder(new Set(['scheduler', 'apiserver', 'controller', 'etcd']))).toEqual([
      'apiserver', 'etcd', 'controller', 'scheduler',
    ]);
    expect(activationOrder(new Set(['scheduler', 'apiserver']))).toEqual(['apiserver', 'scheduler']);
  });
});

describe('落ち続ける Pod は本物と同じ理由を文字で出す', () => {
  it('CrashLoopBackOff', () => {
    const sh = start();
    sh.run('kubectl run bad --image=crash-app');
    sh.run('kubectl wait 30');
    const pod = sh.cluster.pods.get('default/bad');
    if (!pod) throw new Error('Pod がありません');
    expect(podLabel(pod)).toBe('CrashLoopBackOff');
  });
});

describe('ローリングアップデートの新旧', () => {
  it('イメージを変えた直後は、新しい型と前の型の Pod が並び、色分けの対象になる', () => {
    const sh = start();
    sh.run('kubectl create deployment web --image=nginx:1.25 --replicas=3');
    sh.run('kubectl wait 15');
    expect(rollingDeployments(sh.cluster).size).toBe(0);
    sh.run('kubectl set image deployment/web web=nginx:1.26');
    sh.run('kubectl wait 1');
    const gens = [...sh.cluster.pods.values()].map((p) => podGeneration(sh.cluster, p));
    expect(gens).toContain('old');
    expect(gens).toContain('new');
    expect(rollingDeployments(sh.cluster)).toEqual(new Set(['web']));
    // 系図でも ReplicaSet が新旧に分かれる
    const rsGens = ownershipGraph(sh.cluster).nodes.filter((n) => n.kind === 'ReplicaSet').map((n) => n.generation);
    expect(new Set(rsGens)).toEqual(new Set(['new', 'old']));
    sh.run('kubectl wait 60');
    expect(rollingDeployments(sh.cluster).size).toBe(0);
  });

  it('Deployment の持ち物でない Pod には新旧が無い', () => {
    const sh = start();
    sh.run('kubectl run lone --image=nginx');
    const pod = sh.cluster.pods.get('default/lone');
    if (!pod) throw new Error('Pod がありません');
    expect(podGeneration(sh.cluster, pod)).toBeNull();
  });
});
