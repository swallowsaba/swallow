import { describe, expect, it } from 'vitest';
import { initialShell } from '@/engines/environments';
import { clusterHolds } from '@/engines/k8s/check';
import type { ShellState } from '../registry';
import { createClock } from '../clock';
import { execute } from '../shell';
import { createDefaultRegistry } from '.';

/** クラスタを操作する機械（k8s.b.07 の実戦と同じ形） */
function console_() {
  let shell: ShellState = initialShell('k8s-cluster', { cluster: { nodes: 2, ageDays: 30 } });
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

describe('Namespace（区画）', () => {
  it('初めは決まった 4 つの区画があり、作った区画が一覧に加わる', () => {
    const c = console_();
    expect(c.run('kubectl get ns').out).toBe([
      'NAME              STATUS   AGE',
      'default           Active   30d',
      'kube-node-lease   Active   30d',
      'kube-public       Active   30d',
      'kube-system       Active   30d',
      '',
    ].join('\n'));
    expect(c.run('kubectl create namespace dev').out).toBe('namespace/dev created\n');
    expect(c.run('kubectl create ns dev').err).toBe('Error from server (AlreadyExists): namespaces "dev" already exists\n');
    expect(c.run('kubectl get namespaces').out).toMatch(/^dev +Active +\d+s$/m);
    expect(c.holds('namespace/dev')).toBe(true);
    expect(c.holds('namespace/prod')).toBe(false);
  });

  it('無い区画には作れない（本物と同じ断り方）', () => {
    const c = console_();
    expect(c.run('kubectl create deployment web --image=nginx -n dev').err).toBe('error: failed to create deployment: namespaces "dev" not found\n');
    expect(c.run('kubectl run web --image=nginx -n dev').err).toBe('Error from server (NotFound): namespaces "dev" not found\n');
  });

  it('区画が違えば同じ名前を使え、-A は区画の欄を足して全てを並べる。-n を省くと default', () => {
    const c = console_();
    c.run('kubectl create namespace dev');
    c.run('kubectl create namespace prod');
    c.run('kubectl create deployment web --image=nginx -n dev');
    expect(c.run('kubectl create deployment web --image=nginx --namespace prod').out).toBe('deployment.apps/web created\n');
    expect(c.run('kubectl get deployments').out).toBe('No resources found in default namespace.\n');
    c.run('kubectl get pods -A');
    const all = c.run('kubectl get deployments -A').out;
    expect(all).toMatch(/^NAMESPACE +NAME +READY +UP-TO-DATE +AVAILABLE +AGE$/m);
    expect(all).toMatch(/^dev +web +1\/1 +1 +1 +\d+s$/m);
    expect(all).toMatch(/^prod +web +1\/1 +1 +1 +\d+s$/m);
    expect(c.holds('deployment/web@dev readyReplicas=1 && deployment/web@prod readyReplicas=1')).toBe(true);
    expect(c.holds('deployment/web')).toBe(false);
  });

  it('区画ごとに数を合わせ、消すのもその区画の物だけ。区画を消すと中の物も消える', () => {
    const c = console_();
    c.run('kubectl create namespace dev');
    c.run('kubectl create deployment web --image=nginx --replicas=2');
    c.run('kubectl create deployment web --image=nginx -n dev');
    c.run('kubectl get pods -A');
    expect(c.run('kubectl delete deployment web -n dev').out).toBe('deployment.apps "web" deleted\n');
    expect(c.run('kubectl get pods -A').out.trimEnd().split('\n').slice(1).map((l) => l.split(/\s+/)[0])).toEqual(['default', 'default']);
    c.run('kubectl create deployment api --image=nginx -n dev');
    expect(c.run('kubectl delete namespace dev').out).toBe('namespace "dev" deleted\n');
    expect(c.run('kubectl get deployments -A').out).not.toMatch(/^dev /m);
    expect(c.run('kubectl delete namespace default').err).toContain('may not be deleted');
  });
});
