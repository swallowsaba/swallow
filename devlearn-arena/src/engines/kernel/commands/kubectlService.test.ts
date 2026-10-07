import { describe, expect, it } from 'vitest';
import { initialShell } from '@/engines/environments';
import { clusterHolds } from '@/engines/k8s/check';
import type { ShellState } from '../registry';
import { createClock } from '../clock';
import { execute } from '../shell';
import { createDefaultRegistry } from '.';

const WEB = [
  'apiVersion: apps/v1',
  'kind: Deployment',
  'metadata:',
  '  name: web',
  '  labels:',
  '    app: web',
  'spec:',
  '  replicas: 3',
  '  selector:',
  '    matchLabels:',
  '      app: web',
  '  template:',
  '    metadata:',
  '      labels:',
  '        app: web',
  '    spec:',
  '      containers:',
  '      - name: nginx',
  '        image: nginx:1.27',
  '        ports:',
  '        - containerPort: 80',
  '',
].join('\n');

/** 3 日前から web（3 つ）が動いているクラスタ（k8s.b.06 の実戦と同じ形） */
function console_() {
  let shell: ShellState = initialShell('k8s-cluster', { cluster: { nodes: 2, ageDays: 3, manifests: WEB } });
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

describe('setup の cluster.manifests（前から動いている物）', () => {
  it('3 日前から Running で、Pod は 2 台の Node に散らばり、古い知らせは残らない', () => {
    const c = console_();
    const out = c.run('kubectl get pods -o wide').out;
    expect(out.trimEnd().split('\n').slice(1).every((l) => /\s1\/1\s+Running\s+0\s+3d\s/.test(l))).toBe(true);
    expect(out).toMatch(/node-1/);
    expect(out).toMatch(/node-2/);
    expect(out).toMatch(/10\.244\.2\.\d+/);
    expect(c.run('kubectl describe deployment web').out).toMatch(/^Events: +<none>$/m);
  });

  it('get all は Pod・Service・Deployment・ReplicaSet を、種類を前に付けた名前で並べる', () => {
    const out = console_().run('kubectl get all').out;
    expect(out).toMatch(/^pod\/web-\w+-\w{5} +1\/1 +Running/m);
    expect(out).toMatch(/^service\/kubernetes +ClusterIP +10\.96\.0\.1 +<none> +443\/TCP +3d$/m);
    expect(out).toMatch(/^deployment\.apps\/web +3\/3 +3 +3 +3d$/m);
    expect(out).toMatch(/^replicaset\.apps\/web-\w+ +3 +3 +3 +3d$/m);
  });
});

describe('Service（本物と同じ住所・宛先・表）', () => {
  it('expose は --port が無ければコンテナの番号を使い、札を写して住所を配る。kubernetes の Service は初めから在る', () => {
    const c = console_();
    expect(c.run('kubectl expose deployment web').out).toBe('service/web exposed\n');
    const svc = c.run('kubectl get svc').out;
    expect(svc).toMatch(/^NAME +TYPE +CLUSTER-IP +EXTERNAL-IP +PORT\(S\) +AGE$/m);
    expect(svc).toMatch(/^kubernetes +ClusterIP +10\.96\.0\.1 +<none> +443\/TCP +3d$/m);
    expect(svc).toMatch(/^web +ClusterIP +10\.(9[6-9]|10\d|11[01])\.\d+\.\d+ +<none> +80\/TCP +\d+s$/m);
    expect(c.holds('service/web endpoints=3')).toBe(true);
    const described = c.run('kubectl describe svc web').out;
    expect(described).toMatch(/^Labels: +app=web$/m);
    expect(described).toMatch(/^Selector: +app=web$/m);
    expect(described).toMatch(/^Endpoints: +10\.244\.\d\.\d+:80,10\.244\.\d\.\d+:80,10\.244\.\d\.\d+:80$/m);
  });

  it('get endpoints は 住所:番号 を並べ、窓口の宛先は制御の側の 6443 番', () => {
    const c = console_();
    c.run('kubectl expose deployment web --port=80');
    const out = c.run('kubectl get endpoints').out;
    expect(out).toMatch(/^NAME +ENDPOINTS +AGE$/m);
    expect(out).toMatch(/^kubernetes +10\.0\.0\.10:6443 +3d$/m);
    expect(out).toMatch(/^web +(10\.244\.\d\.\d+:80,?){3} +\d+s$/m);
  });

  it('Pod を全て消すと宛先は一度空になり、作り直された新しい住所に入れ替わる。Service の住所は変わらない', () => {
    const c = console_();
    c.run('kubectl expose deployment web');
    const ip = /^web +ClusterIP +(\S+)/m.exec(c.run('kubectl get svc web').out)?.[1];
    const before = c.run('kubectl get endpoints web').out;
    expect(c.run('kubectl delete pod -l app=web').out.trimEnd().split('\n')).toHaveLength(3);
    expect(c.run('kubectl get endpoints web').out).toMatch(/^web +<none> +/m);
    c.run('kubectl get pods -w');
    const after = c.run('kubectl get endpoints web').out;
    expect(after).not.toBe(before);
    expect(c.holds('service/web endpoints=3')).toBe(true);
    expect(c.holds('deployment/web made>=3')).toBe(true);
    expect(/^web +ClusterIP +(\S+)/m.exec(c.run('kubectl get svc web').out)?.[1]).toBe(ip);
  });

  it('待ち受けの番号の無いコンテナを --port 無しで expose すると、本物と同じく断る', () => {
    const c = console_();
    c.run('kubectl create deployment api --image=nginx');
    expect(c.run('kubectl expose deployment api').err).toBe("error: couldn't find port via --port flag or introspection\n");
  });
});
