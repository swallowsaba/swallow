import { describe, expect, it } from 'vitest';
import { initialShell } from '@/engines/environments';
import { clusterHolds } from '@/engines/k8s/check';
import type { ShellState } from '../registry';
import { createClock } from '../clock';
import { execute } from '../shell';
import { writeFile } from '../vfs';
import { createDefaultRegistry } from '.';

/** 市の売店 web（city-shop:1.0 を 4 つ。readiness は / を 5 秒ごと）と Service・Ingress（city.example） */
const SHOP = [
  'apiVersion: apps/v1', 'kind: Deployment', 'metadata:', '  name: web', 'spec:', '  replicas: 4', '  selector:', '    matchLabels:', '      app: web',
  '  template:', '    metadata:', '      labels:', '        app: web', '    spec:', '      containers:', '      - name: web', '        image: city-shop:1.0',
  '        ports:', '        - containerPort: 80', '        readinessProbe:', '          httpGet:', '            path: /', '            port: 80', '          periodSeconds: 5',
  '---', 'apiVersion: v1', 'kind: Service', 'metadata:', '  name: web', 'spec:', '  selector:', '    app: web', '  ports:', '  - port: 80',
  '---', 'apiVersion: networking.k8s.io/v1', 'kind: Ingress', 'metadata:', '  name: city', 'spec:', '  ingressClassName: nginx', '  rules:', '  - host: city.example',
  '    http:', '      paths:', '      - path: /', '        pathType: Prefix', '        backend:', '          service:', '            name: web', '            port:', '              number: 80', '',
].join('\n');

function console_(manifests = SHOP) {
  let shell: ShellState = initialShell('k8s-cluster', { cluster: { nodes: 2, ageDays: 3, manifests, ingress: { address: '203.0.113.10' } } });
  shell = { ...shell, vfs: writeFile(shell.vfs, '/etc/hosts', '127.0.0.1 localhost\n203.0.113.10 city.example\n', true) };
  const registry = createDefaultRegistry();
  const clock = createClock();
  const run = (line: string) => {
    const r = execute(shell, line, registry, clock);
    shell = r.state;
    const pick = (s: 'stdout' | 'stderr'): string => r.chunks.filter((c) => c.stream === s).map((c) => c.text).join('');
    return { out: pick('stdout'), err: pick('stderr'), all: r.chunks.map((c) => c.text).join(''), code: r.exitCode };
  };
  return { run, holds: (expr: string) => clusterHolds(shell.cluster, expr) };
}

/** get pods の行を、イメージの世代ごとに数える（READY の欄） */
function rows(out: string): string[] {
  return out.split('\n').slice(1).filter((l) => l !== '').map((l) => l.split(/ +/).slice(1, 3).join(' '));
}

describe('ローリングアップデート（本物の deployment controller の数え方）', () => {
  it('新しい版は、本物の既定（25%）で 1 つ多く作り、1 つ減らしながら入れ替える。rollout status は本物の文で進みを見せる', () => {
    const c = console_();
    expect(c.run('kubectl set image deployment/web web=city-shop:1.1').out).toBe('deployment.apps/web image updated\n');
    const status = c.run('kubectl rollout status deployment/web');
    expect(status.code).toBe(0);
    expect(status.out).toMatch(/^Waiting for deployment "web" rollout to finish: 2 out of 4 new replicas have been updated\.\.\.\n/);
    expect(status.out).toContain('Waiting for deployment "web" rollout to finish: 1 old replicas are pending termination...\n');
    expect(status.out).toMatch(/deployment "web" successfully rolled out\n$/);
    expect(c.holds('deployment/web image=city-shop:1.1 readyUpdated=4')).toBe(true);
    expect(c.run('curl -s http://city.example/').out).toContain('季節の品');
    // 知らせは本物の文（Scaled up/down replica set 名前 from 数 to 数）
    const described = c.run('kubectl describe deployment web').out;
    expect(described).toMatch(/Scaled up replica set web-\w+ from 0 to 1/);
    expect(described).toMatch(/Scaled down replica set web-\w+ from 4 to 3/);
    expect(described).toContain('RollingUpdateStrategy:  25% max unavailable, 25% max surge');
    expect(described).toMatch(/Readiness: +http-get http:\/\/:80\/ delay=0s timeout=1s period=5s #success=1 #failure=3/);
    expect(described).toMatch(/Progressing +True +NewReplicaSetAvailable/);
  });

  it('Ready にならない版では、古い Pod を 3 つ残して止まり、期限（600 秒）を過ぎると rollout status が失敗する。その間も頼みには古い版が答える', () => {
    const c = console_();
    c.run('kubectl set image deployment/web web=city-shop:1.2');
    const status = c.run('kubectl rollout status deployment/web');
    expect(status.code).toBe(1);
    expect(status.all).toBe('Waiting for deployment "web" rollout to finish: 2 out of 4 new replicas have been updated...\nerror: deployment "web" exceeded its progress deadline\n');
    const pods = rows(c.run('kubectl get pods').out);
    expect(pods.filter((r) => r === '1/1 Running')).toHaveLength(3);
    expect(pods.filter((r) => r === '0/1 Running')).toHaveLength(2);
    expect(c.run('curl -s http://city.example/').out).toContain('<h1>市の売店</h1>');
    expect(c.run('kubectl describe pod -l app=web').out).toContain('Readiness probe failed: HTTP probe failed with statuscode: 403');
    const described = c.run('kubectl describe deployment web').out;
    expect(described).toMatch(/Progressing +False +ProgressDeadlineExceeded/);
    // 確かめの失敗の知らせが 10 分続いても、本物と同じく 1 つにまとまり、入れ替えの初めの知らせが押し出されない
    expect(described).toMatch(/Scaled up replica set web-\w+ from 0 to 1\n/);
    expect(c.run('kubectl describe pod -l app=web').out).toMatch(/Warning +Unhealthy +\S+ \(x1\d\d over 1\dm\) +kubelet +Readiness probe failed: HTTP probe failed with statuscode: 403/);
    // もう一度見ても、期限を過ぎたとすぐ言う
    expect(c.run('kubectl rollout status deployment/web').all).toBe('error: deployment "web" exceeded its progress deadline\n');
  });

  it('rollout undo は 2 番目に新しい世代に戻し、その ReplicaSet を使い直して番号を付け替える。履歴は本物の形', () => {
    const c = console_();
    c.run('kubectl set image deployment/web web=city-shop:1.1');
    c.run('kubectl rollout status deployment/web');
    c.run('kubectl set image deployment/web web=city-shop:1.2');
    expect(c.run('kubectl rollout history deployment/web').out).toBe('deployment.apps/web \nREVISION  CHANGE-CAUSE\n1         <none>\n2         <none>\n3         <none>\n\n');
    expect(c.run('kubectl rollout undo deployment/web').out).toBe('deployment.apps/web rolled back\n');
    expect(c.run('kubectl rollout status deployment/web').code).toBe(0);
    expect(c.holds('deployment/web image=city-shop:1.1 readyUpdated=4 tried=city-shop:1.2')).toBe(true);
    expect(c.run('curl -s http://city.example/').out).toContain('季節の品');
    // 2 は使い直されて 4 になり、履歴から消える
    expect(c.run('kubectl rollout history deployment/web').out).toBe('deployment.apps/web \nREVISION  CHANGE-CAUSE\n1         <none>\n3         <none>\n4         <none>\n\n');
    const rev = c.run('kubectl rollout history deployment/web --revision=3').out;
    expect(rev).toMatch(/^deployment\.apps\/web with revision #3\nPod Template:\n {2}Labels:\tapp=web\n {2}\tpod-template-hash=\w+\n {2}Containers:\n {3}web:\n {4}Image:\tcity-shop:1\.2\n/);
    expect(rev).toMatch(/ {4}Readiness:\thttp-get http:\/\/:80\/ delay=0s timeout=1s period=5s #success=1 #failure=3\n/);
    expect(rev).toMatch(/ {2}Tolerations:\t<none>\n\n$/);
    expect(c.run('kubectl rollout history deployment/web --revision=2').err).toBe('error: unable to find the specified revision\n');
    // 今と同じ設計図の世代に戻すと、何もしない
    expect(c.run('kubectl rollout undo deployment/web --to-revision=4').out).toBe('deployment.apps/web skipped rollback (current template already matches revision 4)\n');
  });

  it('-o wide は本物と同じく、Deployment と ReplicaSet にコンテナの名前・イメージ・札の選び方を足す', () => {
    const c = console_();
    expect(c.run('kubectl get deployment web -o wide').out).toMatch(/^NAME +READY +UP-TO-DATE +AVAILABLE +AGE +CONTAINERS +IMAGES +SELECTOR\nweb +4\/4 +4 +4 +3d +web +city-shop:1\.0 +app=web\n$/);
    c.run('kubectl set image deployment/web web=city-shop:1.1');
    expect(c.run('kubectl get rs -o wide').out).toMatch(/^web-\w+ +2 +2 +0 +\S+ +web +city-shop:1\.1 +app=web,pod-template-hash=\w+$/m);
  });

  it('2 回続けて undo すると、壊れた版（2 番目に新しい世代）に戻る', () => {
    const c = console_();
    c.run('kubectl set image deployment/web web=city-shop:1.1');
    c.run('kubectl rollout status deployment/web');
    c.run('kubectl set image deployment/web web=city-shop:1.2');
    c.run('kubectl rollout undo deployment/web');
    c.run('kubectl rollout undo deployment/web');
    expect(c.holds('deployment/web image=city-shop:1.2')).toBe(true);
  });

  it('入れ替えが止まっている間に undo すると、Ready でない新しい Pod を先に片付けて、古い版を 4 つに戻す', () => {
    const c = console_();
    c.run('kubectl set image deployment/web web=city-shop:1.2');
    c.run('kubectl get pods');
    c.run('kubectl rollout undo deployment/web');
    c.run('kubectl rollout status deployment/web');
    expect(rows(c.run('kubectl get pods').out)).toEqual(['1/1 Running', '1/1 Running', '1/1 Running', '1/1 Running']);
    expect(c.holds('deployment/web image=city-shop:1.0 readyUpdated=4')).toBe(true);
  });

  it('readiness が無いと、壊れた版もすぐ Ready になって全て入れ替わり、頼みに 403 で答える', () => {
    const c = console_(SHOP.replace('        readinessProbe:\n          httpGet:\n            path: /\n            port: 80\n          periodSeconds: 5\n', ''));
    c.run('kubectl set image deployment/web web=city-shop:1.2');
    expect(c.run('kubectl rollout status deployment/web').out).toMatch(/successfully rolled out\n$/);
    expect(c.run('curl -s http://city.example/').out).toContain('<title>403 Forbidden</title>');
  });

  it('25% は数に合わせて丸める（2 つなら増やす側 1・減らす側 0）。減らす側が 0 なら、新しい版が Ready になるまで古い Pod を減らさない', () => {
    const c = console_(SHOP.replace('replicas: 4', 'replicas: 2'));
    c.run('kubectl set image deployment/web web=city-shop:1.2');
    c.run('kubectl get pods');
    const pods = rows(c.run('kubectl get pods').out);
    expect(pods.filter((r) => r === '1/1 Running')).toHaveLength(2);
    expect(pods.filter((r) => r === '0/1 Running')).toHaveLength(1);
  });
});
