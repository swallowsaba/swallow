import { beforeEach, describe, expect, it } from 'vitest';
import { flannelManifest, metricsServerManifest } from '@/engines/k8s/addons';
import { emptyCluster, machine } from '@/engines/k8s/factory';
import { createSession, type Session } from '../session';
import { execute } from '../shell';

let session: Session;

beforeEach(() => {
  session = createSession({
    cluster: emptyCluster([], [
      machine('cp-1', 2000, 4096),
      machine('node-1', 4000, 8192),
      machine('node-2', 4000, 8192),
    ]),
    files: {
      '/home/learner': null,
      '/home/learner/flannel.yaml': flannelManifest(),
      '/home/learner/metrics.yaml': metricsServerManifest(),
    },
  });
});

function run(line: string): { out: string; err: string; code: number } {
  const outcome = execute(session.state, line, session.registry, session.clock);
  session = { ...session, state: outcome.state };
  const pick = (s: 'stdout' | 'stderr') =>
    outcome.chunks.filter((c) => c.stream === s).map((c) => c.text).join('');
  return { out: pick('stdout'), err: pick('stderr'), code: outcome.exitCode };
}

/** init が出力する join 行から token を拾う */
function tokenFrom(text: string): string {
  return /--token (\S+)/.exec(text)?.[1] ?? '';
}

describe('まだ何も無い状態', () => {
  it('kubectl get nodes は空で、計算機だけが見える', () => {
    expect(run('kubectl get nodes').out).toContain('No resources found');
    const machines = run('kubectl get machines');
    expect(machines.out).toContain('cp-1');
    expect(machines.out).toContain('false');
  });
});

describe('クラスタを組み立てる', () => {
  it('init → CNI → join の順で全ノードが Ready になる', () => {
    const init = run('kubeadm init --node-name cp-1 --pod-network-cidr 10.244.0.0/16');
    expect(init.code).toBe(0);
    expect(init.out).toContain('control-plane has initialized successfully');

    // CNI を入れるまでは NotReady のまま
    expect(run('kubectl get nodes').out).toContain('NotReady');

    const token = tokenFrom(init.out);
    expect(token).not.toBe('');
    expect(run(`kubeadm join cp-1:6443 --token ${token} --node-name node-1`).code).toBe(0);
    expect(run(`kubeadm join cp-1:6443 --token ${token} --node-name node-2`).code).toBe(0);
    expect(run('kubectl get nodes').out).not.toContain(' Ready');

    expect(run('kubectl apply -f flannel.yaml').out).toContain('daemonset/kube-flannel-ds created');
    const nodes = run('kubectl get nodes').out;
    expect(nodes).not.toContain('NotReady');
    expect(nodes.match(/Ready/g)?.length).toBe(3);
    expect(nodes).toContain('control-plane');
  });

  it('CNI でない DaemonSet を入れてもノードは Ready にならない', () => {
    run('kubeadm init --node-name cp-1');
    run('kubectl apply -f metrics.yaml');
    expect(run('kubectl get nodes').out).toContain('NotReady');
  });

  it('でたらめなトークンでは join できない', () => {
    run('kubeadm init --node-name cp-1');
    const joined = run('kubeadm join cp-1:6443 --token abcdef.0123456789abcdef --node-name node-1');
    expect(joined.code).toBe(1);
    expect(joined.err).toContain('invalid token');
  });

  it('token list に払い出したトークンが並ぶ', () => {
    const init = run('kubeadm init --node-name cp-1');
    expect(run('kubeadm token list').out).toContain(tokenFrom(init.out));
    const created = run('kubeadm token create');
    expect(created.out.trim()).toMatch(/^[a-z0-9]{6}\.[a-z0-9]{16}$/);
    expect(run('kubeadm token list').out).toContain(created.out.trim());
  });
});

describe('コントロールプレーンの taint', () => {
  function built(): void {
    const init = run('kubeadm init --node-name cp-1 --pod-network-cidr 10.244.0.0/16');
    run(`kubeadm join cp-1:6443 --token ${tokenFrom(init.out)} --node-name node-1`);
    run('kubectl apply -f flannel.yaml');
  }

  it('付いたままだとコントロールプレーンに Pod は載らない', () => {
    built();
    run('kubectl scale deploy web --replicas=1');
    expect(run('kubectl describe node cp-1').out).toContain('node-role.kubernetes.io/control-plane');
  });

  it('taint を剥がせる', () => {
    built();
    const off = run('kubectl taint nodes cp-1 node-role.kubernetes.io/control-plane:NoSchedule-');
    expect(off.code).toBe(0);
    expect(off.out).toContain('node/cp-1 untainted');
    expect(run('kubectl describe node cp-1').out).not.toContain('NoSchedule');
  });

  it('無い taint を剥がそうとすると断られる', () => {
    built();
    const off = run('kubectl taint nodes node-1 dedicated:NoSchedule-');
    expect(off.code).toBe(1);
    expect(off.err).toContain('not found');
  });

  it('taint を付けると新しい Pod がそのノードを避ける', () => {
    built();
    const on = run('kubectl taint nodes node-1 dedicated=db:NoSchedule');
    expect(on.out).toContain('node/node-1 tainted');
    expect(run('kubectl describe node node-1').out).toContain('dedicated=db:NoSchedule');
  });
});

describe('kubelet が落ちたノード', () => {
  it('NotReady になり、Ready に戻せる', () => {
    const init = run('kubeadm init --node-name cp-1 --pod-network-cidr 10.244.0.0/16');
    run(`kubeadm join cp-1:6443 --token ${tokenFrom(init.out)} --node-name node-1`);
    run('kubectl apply -f flannel.yaml');
    expect(run('kubectl get nodes').out).not.toContain('NotReady');

    run('kubectl node-down node-1');
    expect(run('kubectl get nodes').out).toContain('NotReady');
    run('kubectl node-up node-1');
    expect(run('kubectl get nodes').out).not.toContain('NotReady');
  });
});

describe('版を上げる', () => {
  it('plan で上げ先が示され、apply で上がる', () => {
    run('kubeadm init --node-name cp-1 --pod-network-cidr 10.244.0.0/16');
    run('kubectl apply -f flannel.yaml');
    const plan = run('kubeadm upgrade plan');
    expect(plan.out).toContain('kubeadm upgrade apply v1.32.1');
    const applied = run('kubeadm upgrade apply v1.32.1');
    expect(applied.code).toBe(0);
    expect(run('kubectl get nodes').out).toContain('v1.32.1');
  });
});
