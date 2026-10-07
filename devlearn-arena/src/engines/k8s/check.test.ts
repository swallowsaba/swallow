import { describe, expect, it } from 'vitest';
import { initialShell } from '@/engines/environments';
import { createClock } from '@/engines/kernel/clock';
import { createDefaultRegistry } from '@/engines/kernel/commands';
import type { ShellState } from '@/engines/kernel/registry';
import { execute } from '@/engines/kernel/shell';
import { clusterHolds } from './check';

function cluster() {
  let shell: ShellState = initialShell('k8s-cluster', { cluster: { nodes: 2 } });
  const registry = createDefaultRegistry();
  const clock = createClock();
  const run = (line: string) => {
    const out = execute(shell, line, registry, clock);
    shell = out.state;
    return { out: out.chunks.map((c) => c.text).join(''), code: out.exitCode };
  };
  return { run, holds: (expr: string) => clusterHolds(shell.cluster, expr) };
}

describe('Kubernetes の達成条件（クラスタの状態で判定する）', () => {
  it('作った直後は数だけ揃い、Pod が動き出すまでは Ready にならない', () => {
    const c = cluster();
    expect(c.holds('deployment/web')).toBe(false);
    c.run('kubectl create deployment web --image=nginx:1.27 --replicas=3');
    expect(c.holds('deployment/web replicas>=3')).toBe(true);
    expect(c.holds('deployment/web readyReplicas>=3')).toBe(false);
  });

  it('kubectl wait --for=condition=available は、揃うまで時間を進めて「condition met」と言う', () => {
    const c = cluster();
    c.run('kubectl create deployment web --image=nginx:1.27 --replicas=3');
    const r = c.run('kubectl wait --for=condition=available deployment/web');
    expect(r).toEqual({ out: 'deployment.apps/web condition met\n', code: 0 });
    expect(c.holds('deployment/web readyReplicas>=3')).toBe(true);
  });

  it('動かないイメージでは揃わず、wait は打ち切りのエラーで終わる', () => {
    const c = cluster();
    c.run('kubectl create deployment web --image=nginx-does-not-exist --replicas=2');
    const r = c.run('kubectl wait --for=condition=available deployment/web');
    expect(r.code).toBe(1);
    expect(r.out).toContain('timed out waiting for the condition');
  });

  it('Service の宛先（endpoints）は、Ready の Pod の数', () => {
    const c = cluster();
    c.run('kubectl create deployment web --image=nginx:1.27 --replicas=3');
    c.run('kubectl expose deployment web --port=80');
    c.run('kubectl wait --for=condition=available deployment/web');
    expect(c.holds('service/web endpoints>=3')).toBe(true);
    expect(c.holds('service/web endpoints>=4')).toBe(false);
    expect(() => c.holds('service/web color=3')).toThrow();
  });
});
