import { describe, expect, it } from 'vitest';
import { initialShell } from '@/engines/environments';
import { clusterHolds } from '@/engines/k8s/check';
import type { ShellState } from '../registry';
import { createClock } from '../clock';
import { execute } from '../shell';
import { createDefaultRegistry } from '.';

/** 売店の web（要求を書いていない）と Service、利用者の波を作る crowd（初めは 0） */
const WEB = (requests = ''): string => [
  'apiVersion: apps/v1', 'kind: Deployment', 'metadata:', '  name: web', 'spec:', '  replicas: 2', '  selector:', '    matchLabels:', '      app: web',
  '  template:', '    metadata:', '      labels:', '        app: web', '    spec:', '      containers:', '      - name: web', '        image: city-shop:1.0',
  '        ports:', '        - containerPort: 80', ...(requests === '' ? [] : ['        resources:', '          requests:', `            cpu: ${requests}`]), '---',
  'apiVersion: v1', 'kind: Service', 'metadata:', '  name: web', 'spec:', '  selector:', '    app: web', '  ports:', '  - port: 80', '---',
  'apiVersion: apps/v1', 'kind: Deployment', 'metadata:', '  name: crowd', 'spec:', '  replicas: 0', '  selector:', '    matchLabels:', '      app: crowd',
  '  template:', '    metadata:', '      labels:', '        app: crowd', '    spec:', '      containers:', '      - name: crowd', '        image: city-crowd:1.0',
  '        env:', '        - name: TARGET_URL', '          value: http://web', '',
].join('\n');

function console_(manifests = WEB()) {
  let shell: ShellState = initialShell('k8s-cluster', { cluster: { nodes: 2, ageDays: 3, manifests } });
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

/** -w の出力の REPLICAS の欄を順に */
const replicasIn = (watched: string): number[] => watched.trim().split('\n').slice(1).map((l) => Number(l.split(/ {3,}/)[5]));

describe('kubectl autoscale と HPA（本物の計算の仕方）', () => {
  it('autoscale は本物と同じ文で HPA を作り、作った直後は測っていない（<unknown>）。--cpu-percent を省くと目標は 80%', () => {
    const c = console_();
    expect(c.run('kubectl autoscale deployment web --min=2 --max=10').out).toBe('horizontalpodautoscaler.autoscaling/web autoscaled\n');
    expect(c.run('kubectl get hpa').out).toMatch(/^NAME +REFERENCE +TARGETS +MINPODS +MAXPODS +REPLICAS +AGE\nweb +Deployment\/web +cpu: <unknown>\/80% +2 +10 +\d+ +\ds\n$/);
    expect(c.run('kubectl autoscale deploy/web --max=5').err).toBe('Error from server (AlreadyExists): horizontalpodautoscalers.autoscaling "web" already exists\n');
    expect(c.run('kubectl delete hpa web').out).toBe('horizontalpodautoscaler.autoscaling "web" deleted\n');
  });

  it('--max を書かない・min より小さい・無い Deployment は、本物と同じく断る', () => {
    const c = console_();
    expect(c.run('kubectl autoscale deployment web --cpu-percent=50').err).toBe('error: --max=MAXPODS is required and must be at least 1, max: -1\n');
    expect(c.run('kubectl autoscale deployment web --min=3 --max=2').err).toBe('error: --max=MAXPODS must be larger or equal to --min=MINPODS, max: 2, min: 3\n');
    expect(c.run('kubectl autoscale deployment webb --max=3').err).toBe('Error from server (NotFound): deployments.apps "webb" not found\n');
  });

  it('要求（requests）が無いと、負荷を掛けても測れず（<unknown>）増えない。describe に理由が出る', () => {
    const c = console_();
    c.run('kubectl autoscale deployment web --cpu-percent=50 --min=2 --max=10');
    c.run('kubectl scale deployment crowd --replicas=1');
    const watched = c.run('kubectl get hpa web -w').out;
    expect(watched).toContain('cpu: <unknown>/50%');
    expect(replicasIn(watched).every((n) => n === 2)).toBe(true);
    const described = c.run('kubectl describe hpa web').out;
    expect(described).toMatch(/^ {2}resource cpu on pods {2}\(as a percentage of request\): {2}<unknown> \/ 50%$/m);
    expect(described).toMatch(/ScalingActive +False +FailedGetResourceMetric +the HPA was unable to compute the replica count: failed to get cpu utilization: missing request for cpu in container web of Pod web-\S+/);
    expect(described).toMatch(/Warning +FailedGetResourceMetric +.+horizontal-pod-autoscaler +failed to get cpu utilization: missing request for cpu in container web of Pod web-/);
    expect(c.holds('deployment/web replicas=2')).toBe(true);
    // 達成条件: 測れない間は cpu の欄が無い
    expect(c.holds('hpa/web min=2 max=10 target=50')).toBe(true);
    expect(c.holds('hpa/web cpu')).toBe(false);
  });

  it('要求があれば、負荷で使用率が目標を超えると増やす（1 回に 2 倍か 4 つまで）。目標の近くで止まる', () => {
    const c = console_(WEB('200m'));
    c.run('kubectl autoscale deployment web --cpu-percent=50 --min=2 --max=10');
    c.run('kubectl scale deployment crowd --replicas=1');
    const watched = c.run('kubectl get hpa web -w').out;
    expect(watched).toMatch(/cpu: 175%\/50% +2 +10 +2 /);
    expect(replicasIn(watched)).toContain(6);
    expect(replicasIn(watched).at(-1)).toBe(8);
    expect(c.holds('hpa/web replicas=8 cpu=44')).toBe(true);
    const described = c.run('kubectl describe hpa web').out;
    expect(described).toMatch(/Normal +SuccessfulRescale +\S+ +horizontal-pod-autoscaler +New size: 6; reason: cpu resource utilization \(percentage of request\) above target/);
    expect(described).toMatch(/: {2}44% \(89m\) \/ 50%$/m);
    expect(c.run('kubectl top pods -l app=web').out).toMatch(/^NAME +CPU\(cores\) +MEMORY\(bytes\)\n(web-\S+ +89m +3Mi\n){8}$/);
  });

  it('負荷が止むと、過去 5 分の計算の一番大きい数を保ってから、min まで減らす', () => {
    const c = console_(WEB('200m'));
    c.run('kubectl autoscale deployment web --cpu-percent=50 --min=2 --max=10');
    c.run('kubectl scale deployment crowd --replicas=1');
    c.run('kubectl get hpa web -w');
    c.run('kubectl scale deployment crowd --replicas=0');
    for (let i = 0; i < 20; i += 1) c.run('kubectl get pods');
    // 止んですぐは、使用率が下がっても数は保つ（ScaleDownStabilized）
    expect(c.run('kubectl describe hpa web').out).toMatch(/AbleToScale +True +ScaleDownStabilized +recent recommendations were higher than current one, applying the highest recent recommendation/);
    const watched = c.run('kubectl get hpa web -w').out;
    expect(replicasIn(watched).at(-1)).toBe(2);
    expect(c.run('kubectl describe hpa web').out).toContain('New size: 2; reason: All metrics below target');
    expect(c.holds('deployment/web replicas=2 made>=6')).toBe(true);
  });

  it('kubectl top は、まだ測っていない Pod を出さず、全く無ければ本物と同じく断る', () => {
    const c = console_(WEB('200m').replace('replicas: 0', 'replicas: 1'));
    c.run('kubectl scale deployment web --replicas=3');
    expect(c.run('kubectl top pods').err).toBe('');
    c.run('kubectl delete deployment web');
    c.run('kubectl delete deployment crowd');
    c.run('kubectl create deployment fresh --image=nginx:1.27');
    expect(c.run('kubectl top pods').err).toBe('error: metrics not available yet\n');
  });
});
