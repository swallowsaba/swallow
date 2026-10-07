import { describe, expect, it } from 'vitest';
import { initialShell } from '@/engines/environments';
import { clusterHolds } from '@/engines/k8s/check';
import { writeFile } from '../vfs';
import type { ShellState } from '../registry';
import { createClock } from '../clock';
import { execute } from '../shell';
import { createDefaultRegistry } from '.';

/** 市の案内（city-guide:1.0。動き出してから 20 秒、地図を読み込んでから 8080 番で待ち受ける）。probes に確かめの行を書く */
const GUIDE = (probes: readonly string[] = []): string => [
  'apiVersion: apps/v1', 'kind: Deployment', 'metadata:', '  name: guide', 'spec:', '  replicas: 2', '  selector:', '    matchLabels:', '      app: guide',
  '  template:', '    metadata:', '      labels:', '        app: guide', '    spec:', '      containers:', '      - name: guide', '        image: city-guide:1.0',
  '        ports:', '        - containerPort: 8080', ...probes, '',
].join('\n');
const READY = (path = '/ready'): string[] => ['        readinessProbe:', '          httpGet:', `            path: ${path}`, '            port: 8080', '          periodSeconds: 5'];
const LIVE = (delay: number, period = 10): string[] => ['        livenessProbe:', '          httpGet:', '            path: /healthz', '            port: 8080', `          initialDelaySeconds: ${String(delay)}`, `          periodSeconds: ${String(period)}`];

function console_() {
  let shell: ShellState = initialShell('k8s-cluster', { cluster: { nodes: 2, ageDays: 3, manifests: GUIDE() } });
  const registry = createDefaultRegistry();
  const clock = createClock();
  const run = (line: string) => {
    const r = execute(shell, line, registry, clock);
    shell = r.state;
    const pick = (s: 'stdout' | 'stderr'): string => r.chunks.filter((c) => c.stream === s).map((c) => c.text).join('');
    // all: 端末に出る順（標準出力と標準エラーを混ぜた物）
    return { out: pick('stdout'), err: pick('stderr'), all: r.chunks.map((c) => c.text).join(''), code: r.exitCode };
  };
  const apply = (text: string) => {
    shell = { ...shell, vfs: writeFile(shell.vfs, '/home/learner/guide.yaml', text, true) };
    return run('kubectl apply -f guide.yaml');
  };
  /** 1 つの Pod のアプリを止め（kill -STOP 1）、落ち着くまで見る */
  const freeze = (): string => {
    run('kubectl exec deploy/guide -- kill -STOP 1');
    return run('kubectl get pods -w').out;
  };
  return { run, apply, freeze, holds: (expr: string) => clusterHolds(shell.cluster, expr) };
}

describe('liveness と readiness（本物の httpGet の確かめ）', () => {
  it('readiness を付けると、読み込みの 20 秒が過ぎるまで Ready にならない。liveness は止まったアプリを作り直す', () => {
    const c = console_();
    c.apply(GUIDE([...READY(), ...LIVE(30)]));
    expect(c.run('kubectl rollout status deployment/guide').code).toBe(0);
    expect(c.run('kubectl get pods').out).toMatch(/^guide-\S+ +1\/1 +Running +0 +\d{2,}s$/m);
    const watched = c.freeze();
    // 止まった Pod は、まず Ready でなくなり（宛先から外れ）、liveness で作り直され、読み込み後にまた Ready になる
    expect(watched).toMatch(/^(guide-\S+) +0\/1 +Running +0 +\S+\n\1 +0\/1 +Running +1 \(0s ago\) +\S+\n\1 +1\/1 +Running +1 \(2\d+s ago\) +\S+\n$/m);
    expect(c.holds('deployment/guide readyReplicas=2 restarts>=1 early=0')).toBe(true);
    const events = c.run('kubectl describe pod -l app=guide').out;
    expect(events).toMatch(/Warning +Unhealthy +\S+ \(x3 over \S+\) +kubelet +Liveness probe failed: Get "http:\/\/10\.244\.\d+\.\d+:8080\/healthz": context deadline exceeded \(Client\.Timeout exceeded while awaiting headers\)/);
    expect(events).toContain('Container guide failed liveness probe, will be restarted');
    expect(events).toContain('Liveness:       http-get http://:8080/healthz delay=30s timeout=1s period=10s #success=1 #failure=3');
  });

  it('readiness が無いと、待ち受ける前から Ready になり、頼みが送られる（early）', () => {
    const c = console_();
    c.apply(GUIDE(LIVE(30)));
    c.run('kubectl rollout status deployment/guide');
    expect(c.run('kubectl get pods').out).toMatch(/^guide-\S+ +1\/1 +Running +0 +\ds$/m);
    expect(c.holds('deployment/guide early=0')).toBe(false);
  });

  it('liveness の待つ時間が読み込みより短いと、読み込みの途中で作り直され続ける（CrashLoopBackOff）', () => {
    const c = console_();
    c.apply(GUIDE([...READY(), ...LIVE(0, 5)]));
    // 本物と同じく、進みの行（標準出力）の後に、期限を過ぎた断り（標準エラー）が出る
    expect(c.run('kubectl rollout status deployment/guide').all).toMatch(/^Waiting for deployment "guide" rollout to finish: .*\nerror: deployment "guide" exceeded its progress deadline\n$/s);
    expect(c.run('kubectl get pods').out).toMatch(/^guide-\S+ +0\/1 +CrashLoopBackOff +\d+ \(\S+ ago\) +\S+$/m);
    expect(c.run('kubectl describe pod -l app=guide').out).toMatch(/Liveness probe failed: Get "http:\/\/\S+:8080\/healthz": dial tcp \S+:8080: connect: connection refused/);
  });

  it('liveness が無いと、止まったアプリは Ready でないまま作り直されない', () => {
    const c = console_();
    c.apply(GUIDE(READY()));
    c.run('kubectl rollout status deployment/guide');
    expect(c.freeze()).toMatch(/0\/1 +Running +0 +\S+\n$/);
    expect(c.holds('deployment/guide readyReplicas=1 restarts=0')).toBe(true);
  });

  it('確かめの道を間違えると 404 で通らず、Ready にならない', () => {
    const c = console_();
    c.apply(GUIDE(READY('/readyz')));
    expect(c.run('kubectl rollout status deployment/guide').code).toBe(1);
    expect(c.run('kubectl describe pod -l app=guide').out).toContain('Readiness probe failed: HTTP probe failed with statuscode: 404');
  });

  it('読み込みの途中のログは、起動の行だけ', () => {
    const c = console_();
    c.apply(GUIDE([...READY(), ...LIVE(30)]));
    c.run('kubectl get pods');
    const pod = /^(guide-\S+) +0\/1 +Running/m.exec(c.run('kubectl get pods').out)?.[1] ?? '';
    expect(c.run(`kubectl logs ${pod}`).out).toBe('guide: version 1.0.0\nguide: loading map data (about 20s)\n');
  });
});
