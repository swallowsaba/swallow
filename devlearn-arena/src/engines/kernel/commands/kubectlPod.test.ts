import { describe, expect, it } from 'vitest';
import { initialShell } from '@/engines/environments';
import { clusterHolds } from '@/engines/k8s/check';
import type { ShellState } from '../registry';
import { createClock } from '../clock';
import { execute } from '../shell';
import { createDefaultRegistry } from '.';

/** クラスタを操作する機械（k8s.b.04 の実戦と同じ形）で kubectl を順に打つ */
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

const statusOf = (out: string, name: string): string | undefined => out.split('\n').find((l) => l.startsWith(`${name} `))?.split(/\s+/)[2];

describe('クラスタを操作する機械では、打つたびに時間が流れる', () => {
  it('作った Pod は ContainerCreating を経て Running になる', () => {
    const c = console_();
    expect(c.run('kubectl run web --image=nginx').out).toBe('pod/web created\n');
    expect(c.holds('pod/web ready=1')).toBe(false);
    expect(statusOf(c.run('kubectl get pods').out, 'web')).toBe('ContainerCreating');
    expect(statusOf(c.run('kubectl get pods').out, 'web')).toBe('Running');
    expect(c.holds('pod/web ready=1 status=Running')).toBe(true);
  });

  it('get pods -w は、状態が変わるたびに 1 行ずつ足し、落ち着いたら終える', () => {
    const c = console_();
    c.run('kubectl run web --image=nginx');
    const lines = c.run('kubectl get pods -w').out.trimEnd().split('\n');
    expect(lines[0]).toMatch(/^NAME +READY +STATUS +RESTARTS +AGE$/);
    expect(lines.slice(1).map((l) => l.split(/\s+/)[2])).toEqual(['ContainerCreating', 'Running']);
    expect(c.holds('pod/web status=Running')).toBe(true);
  });
});

describe('取れないイメージ（本物と同じ ErrImagePull → ImagePullBackOff）', () => {
  it('綴りの違う名前は断られ、取り直すたびに間隔が伸びる。再起動の回数には数えない', () => {
    const c = console_();
    c.run('kubectl run web --image=ngnix');
    expect(statusOf(c.run('kubectl get pods').out, 'web')).toBe('ErrImagePull');
    const row = c.run('kubectl get pods').out.split('\n')[1] ?? '';
    expect(row).toMatch(/^web +0\/1 +ImagePullBackOff +0 +/);
    const out = c.run('kubectl describe pod web').out;
    expect(out).toMatch(/^ {4}State: +Waiting$/m);
    expect(out).toMatch(/^ {6}Reason: +ImagePullBackOff$/m);
    expect(out).toContain('Failed to pull image "ngnix": failed to pull and unpack image "docker.io/library/ngnix:latest": failed to resolve reference "docker.io/library/ngnix:latest": pull access denied, repository does not exist or may require authorization');
    expect(out).toMatch(/Error: ErrImagePull$/m);
    expect(out).toMatch(/Back-off pulling image "ngnix"$/m);
  });

  it('名前はあるがタグが無ければ not found。置き場にある版は取れる', () => {
    const c = console_();
    c.run('kubectl run old --image=nginx:1.99');
    c.run('kubectl run web --image=nginx:1.27');
    c.run('kubectl get pods');
    expect(c.run('kubectl describe pod old').out).toContain('failed to resolve reference "docker.io/library/nginx:1.99": docker.io/library/nginx:1.99: not found');
    expect(c.holds('pod/web status=Running')).toBe(true);
  });
});

describe('describe pod（本物と同じ形）', () => {
  it('Node と住所・コンテナの状態・Conditions・繰り返しをまとめた Events', () => {
    const c = console_();
    c.run('kubectl run web --image=nginx');
    c.run('kubectl get pods');
    const out = c.run('kubectl describe pod web').out;
    expect(out).toMatch(/^Name: +web$/m);
    expect(out).toMatch(/^Node: +node-\d\/10\.0\.0\.1\d$/m);
    expect(out).toMatch(/^Status: +Running$/m);
    expect(out).toMatch(/^ {4}Port: +<none>$/m);
    expect(out).toMatch(/^ {4}Restart Count: +0$/m);
    expect(out).toMatch(/^ {2}Ready +True$/m);
    expect(out).toMatch(/^ {2}Type +Reason +Age +From +Message$/m);
    expect(out).toMatch(/Normal +Scheduled +\S+ +default-scheduler +Successfully assigned default\/web to node-\d$/m);
    expect(out).toMatch(/Normal +Pulling +\S+ +kubelet +Pulling image "nginx"$/m);
    expect(out).toMatch(/Normal +Started +\S+ +kubelet +Started container web$/m);
  });

  it('作った直後は Pending で、コンテナは ContainerCreating を待つ', () => {
    const c = console_();
    c.run('kubectl run web --image=nginx');
    const out = c.run('kubectl describe pod web').out;
    expect(out).toMatch(/^Status: +Pending$/m);
    expect(out).toMatch(/^ {6}Reason: +ContainerCreating$/m);
  });

  it('同じ知らせの繰り返しは 1 行にまとめ、回数と最初からの時間を出す', () => {
    const c = console_();
    c.run('kubectl run web --image=ngnix');
    c.run('kubectl get pods -w');
    expect(c.run('kubectl describe pod web').out).toMatch(/Normal +BackOff +\d+s \(x\d+ over \d+s\) +kubelet +Back-off pulling image "ngnix"$/m);
  });
});
