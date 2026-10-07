import { describe, expect, it } from 'vitest';
import { initialShell } from '@/engines/environments';
import { clusterHolds } from '@/engines/k8s/check';
import type { ShellState } from '../registry';
import { createClock } from '../clock';
import { execute } from '../shell';
import { createDefaultRegistry } from '.';

/** クラスタを操作する機械（k8s.b.05 の実戦と同じ形）で kubectl を順に打つ */
function console_() {
  let shell: ShellState = initialShell('k8s-cluster', { cluster: { nodes: 2 } });
  const registry = createDefaultRegistry();
  const clock = createClock();
  const run = (line: string) => {
    const r = execute(shell, line, registry, clock);
    shell = r.state;
    const pick = (s: 'stdout' | 'stderr'): string => r.chunks.filter((c) => c.stream === s).map((c) => c.text).join('');
    return { out: pick('stdout'), err: pick('stderr'), code: r.exitCode };
  };
  return { run, holds: (expr: string) => clusterHolds(shell.cluster, expr) };
}

const podNames = (out: string): string[] => out.trimEnd().split('\n').slice(1).map((l) => l.split(/\s+/)[0] ?? '');

describe('Deployment（本物と同じ名前と数の合わせ方）', () => {
  it('作るとあるべき数の Pod を一度に作り、名前は 名前-印-5 字 の形', () => {
    const c = console_();
    c.run('kubectl create deployment web --image=nginx --replicas=3');
    const names = podNames(c.run('kubectl get pods').out);
    expect(names).toHaveLength(3);
    for (const n of names) expect(n).toMatch(/^web-[4-9bcdf]{8,10}-[bcdfghjklmnpqrstvwxz2456789]{5}$/);
    expect(new Set(names.map((n) => n.split('-')[1])).size).toBe(1);
    expect(c.holds('deployment/web made=3')).toBe(true);
  });

  it('Pod を 1 つ消すと、別の名前で作り直して 3 つに戻る', () => {
    const c = console_();
    c.run('kubectl create deployment web --image=nginx --replicas=3');
    const before = podNames(c.run('kubectl get pods').out);
    expect(c.run(`kubectl delete pod ${before[0] ?? ''}`).out).toBe(`pod "${before[0] ?? ''}" deleted\n`);
    const after = podNames(c.run('kubectl get pods -w').out);
    expect(after).not.toContain(before[0]);
    expect(c.holds('deployment/web readyReplicas=3 made>=4')).toBe(true);
    expect(c.run('kubectl get deployment web').out).toMatch(/^web +3\/3 +3 +3 +/m);
  });

  it('Deployment の名前で Pod を消そうとすると、本物と同じく見つからない', () => {
    const c = console_();
    c.run('kubectl create deployment web --image=nginx --replicas=3');
    expect(c.run('kubectl delete pod web').err).toBe('Error from server (NotFound): pods "web" not found\n');
  });

  it('describe deployment は本物の形（Replicas の内訳・コンテナの名前はイメージの名前・NewReplicaSet・Scaled up の知らせ）', () => {
    const c = console_();
    c.run('kubectl create deployment web --image=nginx --replicas=3');
    c.run('kubectl get pods');
    c.run('kubectl scale deployment web --replicas=5');
    const out = c.run('kubectl describe deployment web').out;
    expect(out).toMatch(/^Replicas: +5 desired \| 5 updated \| 5 total \| 3 available \| 2 unavailable$/m);
    expect(out).toMatch(/^ {3}nginx:$/m);
    expect(out).toMatch(/^ {4}Port: +<none>$/m);
    expect(out).toMatch(/^NewReplicaSet: +web-\w+ \(5\/5 replicas created\)$/m);
    expect(out).toMatch(/Normal +ScalingReplicaSet +\S+ +deployment-controller +Scaled up replica set web-\w+ from 0 to 3$/m);
    expect(out).toMatch(/Scaled up replica set web-\w+ from 3 to 5$/m);
  });

  it('describe replicaset は持ち主と Pod の内訳、作った Pod の知らせを出す', () => {
    const c = console_();
    c.run('kubectl create deployment web --image=nginx --replicas=3');
    const rs = (c.run('kubectl get rs').out.split('\n')[1] ?? '').split(/\s+/)[0] ?? '';
    const out = c.run(`kubectl describe rs ${rs}`).out;
    expect(out).toMatch(/^Controlled By: +Deployment\/web$/m);
    expect(out).toMatch(/^Replicas: +3 current \/ 3 desired$/m);
    expect(out).toMatch(/Normal +SuccessfulCreate +\S+ +replicaset-controller +Created pod: web-/m);
  });
});
