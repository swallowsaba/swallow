import { describe, expect, it } from 'vitest';
import { initialShell } from '@/engines/environments';
import { clusterHolds } from '@/engines/k8s/check';
import { writeFile } from '../vfs';
import type { ShellState } from '../registry';
import { createClock } from '../clock';
import { execute } from '../shell';
import { createDefaultRegistry } from '.';

/** 掲示板 board（CPU を cpu だけ求める）と、夜の集計 report（メモリの上限 mem。アプリは 182Mi ほど使う） */
const CITY = (cpu: string, mem: string): string => [
  'apiVersion: apps/v1', 'kind: Deployment', 'metadata:', '  name: board', 'spec:', '  replicas: 1', '  selector:', '    matchLabels:', '      app: board',
  '  template:', '    metadata:', '      labels:', '        app: board', '    spec:', '      containers:', '      - name: board', '        image: city-board:1.0',
  '        resources:', '          requests:', `            cpu: "${cpu}"`, '            memory: 64Mi', '---',
  'apiVersion: apps/v1', 'kind: Deployment', 'metadata:', '  name: report', 'spec:', '  replicas: 1', '  selector:', '    matchLabels:', '      app: report',
  '  template:', '    metadata:', '      labels:', '        app: report', '    spec:', '      containers:', '      - name: report', '        image: city-report:1.0',
  '        resources:', '          requests:', `            memory: ${mem}`, '          limits:', `            memory: ${mem}`, '',
].join('\n');

/** 1 分前に、要求の大きすぎる board と上限の小さすぎる report を入れたクラスタ */
function console_() {
  let shell: ShellState = initialShell('k8s-cluster', { cluster: { nodes: 2, ageDays: 3, recent: CITY('6', '128Mi') } });
  const registry = createDefaultRegistry();
  const clock = createClock();
  const run = (line: string) => {
    const r = execute(shell, line, registry, clock);
    shell = r.state;
    const pick = (s: 'stdout' | 'stderr'): string => r.chunks.filter((c) => c.stream === s).map((c) => c.text).join('');
    return { out: pick('stdout'), err: pick('stderr'), code: r.exitCode };
  };
  const apply = (text: string) => {
    shell = { ...shell, vfs: writeFile(shell.vfs, '/home/learner/city.yaml', text, true) };
    return run('kubectl apply -f city.yaml');
  };
  return { run, apply, holds: (expr: string) => clusterHolds(shell.cluster, expr) };
}

describe('資源の要求と上限（本物の置き方と止め方）', () => {
  it('どの Node の空きにも入らない要求の Pod は Pending のまま。本物と同じ文で知らせる（preemption の見立ても）', () => {
    const c = console_();
    expect(c.run('kubectl get pods').out).toMatch(/^board-\S+ +0\/1 +Pending +0 +6\ds$/m);
    const described = c.run('kubectl describe pod -l app=board').out;
    // 置き場所の決まらない Pod には、コンテナの状態の欄が無い
    expect(described).not.toContain('State:');
    expect(described).toMatch(/Warning +FailedScheduling +\S+ +default-scheduler +0\/2 nodes are available: 2 Insufficient cpu\. preemption: 0\/2 nodes are available: 2 No preemption victims found for incoming pod\./);
  });

  it('メモリの上限より多く使うアプリは、カーネルに止められ（OOMKilled・137）、作り直しを 10 秒・20 秒…と延ばしながら繰り返す', () => {
    const c = console_();
    // 1 分の間に、すぐ・10 秒後・20 秒後に作り直した（4 回目は 40 秒待つ）
    expect(c.run('kubectl get pods').out).toMatch(/^report-\S+ +0\/1 +CrashLoopBackOff +3 \(\d+s ago\) +6\ds$/m);
    const described = c.run('kubectl describe pod -l app=report').out;
    expect(described).toMatch(/^Status: +Running$/m);
    expect(described).toMatch(/ +State: +Waiting\n +Reason: +CrashLoopBackOff\n +Last State: +Terminated\n +Reason: +OOMKilled\n +Exit Code: +137\n/);
    // 読み込みの途中で止められるので、待ち受けの行は出ない
    expect(c.run('kubectl logs deploy/report').out).toBe('report: loading 1,240 reservations into memory\n');
  });

  it('get events は本物の欄で、同じ知らせをまとめ、--field-selector で絞れる', () => {
    const c = console_();
    const warnings = c.run('kubectl get events --field-selector type=Warning').out;
    expect(warnings).toMatch(/^LAST SEEN +TYPE +REASON +OBJECT +MESSAGE\n/);
    expect(warnings).toMatch(/Warning +FailedScheduling +pod\/board-/);
    expect(warnings).toMatch(/Warning +BackOff +pod\/report-\S+ +Back-off restarting failed container report\n/);
    expect(warnings).not.toContain('Normal');
    expect(c.run('kubectl get events --field-selector type=Warning,reason=BackOff').out).not.toContain('FailedScheduling');
  });

  it('要求を Node に入る量に、上限を使う量より大きくすると、両方とも動き続ける。describe node に配った量が出る', () => {
    const c = console_();
    expect(c.apply(CITY('100m', '256Mi')).out).toBe('deployment.apps/board configured\ndeployment.apps/report configured\n');
    c.run('kubectl get pods -w');
    for (let i = 0; i < 20; i += 1) c.run('kubectl get pods');
    expect(c.holds('deployment/board readyUpdated=1 && deployment/report readyUpdated=1 restarts=0')).toBe(true);
    expect(c.run('kubectl top pods -l app=report').out).toMatch(/^report-\S+ +\d+m +182Mi\n$/m);
    const node = c.run('kubectl describe nodes').out;
    expect(node).toMatch(/Allocatable:\n +cpu: +4\n +memory: +8192Mi\n/);
    expect(node).toMatch(/Allocated resources:\n +\(Total limits may be over 100 percent, i\.e\., overcommitted\.\)\n +Resource +Requests +Limits\n/);
  });
});
