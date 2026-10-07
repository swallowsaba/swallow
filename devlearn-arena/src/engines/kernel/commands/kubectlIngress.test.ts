import { describe, expect, it } from 'vitest';
import { initialShell } from '@/engines/environments';
import { writeFile } from '../vfs';
import type { ShellState } from '../registry';
import { createClock } from '../clock';
import { execute } from '../shell';
import { createDefaultRegistry } from '.';

/** 売店（city-shop。80 番）と API（city-api。3000 番）の Deployment と Service */
const app = (name: string, image: string, port: number): string => [
  'apiVersion: apps/v1', 'kind: Deployment', 'metadata:', `  name: ${name}`, 'spec:', '  replicas: 1', '  selector:', '    matchLabels:', `      app: ${name}`,
  '  template:', '    metadata:', '      labels:', `        app: ${name}`, '    spec:', '      containers:', `      - name: ${name}`, `        image: ${image}`, '        ports:', `        - containerPort: ${String(port)}`,
  '---', 'apiVersion: v1', 'kind: Service', 'metadata:', `  name: ${name}`, 'spec:', '  selector:', `    app: ${name}`, '  ports:', '  - port: 80', `    targetPort: ${String(port)}`, '',
].join('\n');
const APPS = `${app('shop', 'city-shop:1.0', 80)}---\n${app('api', 'city-api:1.0', 3000)}`;

/** 入口の規則（名前 city.example。/ は shop、/api は api） */
const INGRESS = (o: { host?: string; shop?: string; pathType?: string; className?: string } = {}): string => [
  'apiVersion: networking.k8s.io/v1', 'kind: Ingress', 'metadata:', '  name: city', 'spec:', `  ingressClassName: ${o.className ?? 'nginx'}`, '  rules:', `  - host: ${o.host ?? 'city.example'}`, '    http:', '      paths:',
  '      - path: /', ...(o.pathType === '' ? [] : [`        pathType: ${o.pathType ?? 'Prefix'}`]), '        backend:', '          service:', `            name: ${o.shop ?? 'shop'}`, '            port:', '              number: 80',
  '      - path: /api', '        pathType: Prefix', '        backend:', '          service:', '            name: api', '            port:', '              number: 80', '',
].join('\n');

function console_() {
  let shell: ShellState = initialShell('k8s-cluster', {
    files: { '/etc/hosts': '127.0.0.1 localhost\n203.0.113.10 city.example\n' },
    cluster: { nodes: 2, ageDays: 3, ingress: { address: '203.0.113.10' }, manifests: APPS },
  });
  const registry = createDefaultRegistry();
  const clock = createClock();
  const run = (line: string) => {
    const r = execute(shell, line, registry, clock);
    shell = r.state;
    const pick = (s: 'stdout' | 'stderr'): string => r.chunks.filter((c) => c.stream === s).map((c) => c.text).join('');
    return { out: pick('stdout'), err: pick('stderr'), code: r.exitCode };
  };
  const apply = (text: string) => {
    shell = { ...shell, vfs: writeFile(shell.vfs, '/home/learner/ingress.yaml', text, true) };
    return run('kubectl apply -f ingress.yaml');
  };
  return { run, apply };
}

describe('Ingress（名前と道で振り分ける入口）', () => {
  it('名前と道で、売店と API に振り分ける（/api は道を書き換えずに API に届く）', () => {
    const c = console_();
    expect(c.apply(INGRESS()).out).toBe('ingress.networking.k8s.io/city created\n');
    expect(c.run('curl -s http://city.example/').out).toContain('<h1>市の売店</h1>');
    expect(c.run('curl -s http://city.example/api/rooms').out).toContain('"name":"図書館の会議室"');
    // Prefix は / で区切った頭で合わせる。/apix は /api ではなく / の規則（売店）に行き、売店に無いので 404
    expect(c.run('curl -s -o /dev/null -w "%{http_code}" http://city.example/apix').out).toBe('404');
  });

  it('get ingress は本物の欄で、入口の係が受け持つと住所が入る。describe は規則と届く Pod を見せる', () => {
    const c = console_();
    c.apply(INGRESS());
    const got = c.run('kubectl get ingress').out;
    expect(got).toMatch(/^NAME +CLASS +HOSTS +ADDRESS +PORTS +AGE\ncity +nginx +city\.example +203\.0\.113\.10 +80 +\d+s\n$/);
    const d = c.run('kubectl describe ingress city').out;
    expect(d).toMatch(/^Address: +203\.0\.113\.10$/m);
    expect(d).toMatch(/^ {2}city\.example *\n +\/ +shop:80 \(10\.244\.\d+\.\d+:80\)\n +\/api +api:80 \(10\.244\.\d+\.\d+:3000\)$/m);
    expect(d).toMatch(/Normal +Sync +\S+ +nginx-ingress-controller +Scheduled for sync/);
  });

  it('名前の綴りが違うと、どの規則にも合わずに入口の係の 404 になる', () => {
    const c = console_();
    c.apply(INGRESS({ host: 'city.exmaple' }));
    const r = c.run('curl -si http://city.example/');
    expect(r.out).toMatch(/^HTTP\/1\.1 404 Not Found\nServer: nginx\n/);
    expect(r.out).toContain('<center>nginx</center>');
  });

  it('宛先の Service が無い・Ready の Pod が無いと 503 Service Temporarily Unavailable。describe に理由が出る', () => {
    const c = console_();
    c.apply(INGRESS({ shop: 'shopp' }));
    expect(c.run('curl -si http://city.example/').out).toMatch(/^HTTP\/1\.1 503 Service Temporarily Unavailable\n/);
    expect(c.run('kubectl describe ingress city').out).toContain('shopp:80 (<error: services "shopp" not found>)');
    const d = console_();
    d.apply(INGRESS());
    d.run('kubectl scale deployment shop --replicas=0');
    d.run('kubectl get pods');
    expect(d.run('curl -s -o /dev/null -w "%{http_code}" http://city.example/').out).toBe('503');
  });

  it('pathType を書かない・道が / で始まらない Ingress は、本物と同じく断られる', () => {
    const c = console_();
    expect(c.apply(INGRESS({ pathType: '' })).err).toBe('The Ingress "city" is invalid: spec.rules[0].http.paths[0].pathType: Required value: pathType must be specified\n');
    expect(c.apply(INGRESS().replace('- path: /api', '- path: api')).err).toBe('The Ingress "city" is invalid: spec.rules[0].http.paths[1].path: Invalid value: "api": must be an absolute path\n');
    expect(c.run('kubectl get ingress').out).toBe('No resources found in default namespace.\n');
  });

  it('入口の係の受け持たない種類は、住所が入らず、振り分けもされない', () => {
    const c = console_();
    c.apply(INGRESS({ className: 'traefik' }));
    expect(c.run('kubectl get ingress city').out).toMatch(/^city +traefik +city\.example +80 +\d+s$/m);
    expect(c.run('curl -s -o /dev/null -w "%{http_code}" http://city.example/').out).toBe('404');
  });

  it('住所に直に頼む時は、Host の見出しで名前を名乗る', () => {
    const c = console_();
    c.apply(INGRESS());
    expect(c.run('curl -s -o /dev/null -w "%{http_code}" http://203.0.113.10/').out).toBe('404');
    expect(c.run('curl -s -H "Host: city.example" http://203.0.113.10/').out).toContain('市の売店');
  });

  it('Express の API は、無い道に Cannot GET と答える', () => {
    const c = console_();
    c.apply(INGRESS());
    expect(c.run('curl -s http://city.example/api/nope').out).toContain('<pre>Cannot GET /api/nope</pre>');
  });

  it('Service の targetPort が、Pod の待ち受けるポートと違うと 502', () => {
    const c = console_();
    c.apply(INGRESS());
    c.apply(app('api', 'city-api:1.0', 3000).replace('targetPort: 3000', 'targetPort: 8080'));
    expect(c.run('curl -s -o /dev/null -w "%{http_code}" http://city.example/api/rooms').out).toBe('502');
  });
});
