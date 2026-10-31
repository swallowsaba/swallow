import { describe, expect, it } from 'vitest';
import { initialShell } from '@/engines/environments';
import { checkState } from '@/learning/practice';
import { createClock } from '../kernel/clock';
import type { ShellState } from '../kernel/registry';
import { execute } from '../kernel/shell';
import { createDefaultRegistry } from '../kernel/commands/index';

/** 自分で作って置き場へ push したイメージを、クラスタが取って動かす（lab.a.01） */

const registry = createDefaultRegistry();
const clock = createClock();
const IMAGE = 'registry.city.example/city/shop';

const MANIFEST = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: shop
spec:
  replicas: 2
  selector:
    matchLabels:
      app: shop
  template:
    metadata:
      labels:
        app: shop
    spec:
      containers:
      - name: shop
        image: ${IMAGE}:1.0
        ports:
        - containerPort: 80
---
apiVersion: v1
kind: Service
metadata:
  name: shop
spec:
  selector:
    app: shop
  ports:
  - port: 80
    targetPort: 80
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: shop
spec:
  ingressClassName: nginx
  rules:
  - host: city.example
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: shop
            port:
              number: 80
`;

function session() {
  let shell: ShellState = initialShell('k8s-cluster', {
    hostname: 'console', cwd: '/home/learner/shop', dirs: ['/home/learner/shop/site'],
    files: {
      '/etc/hosts': '127.0.0.1 localhost\n203.0.113.10 city.example\n',
      '/home/learner/shop/Dockerfile': 'FROM nginx:1.27-alpine\nCOPY site /usr/share/nginx/html\n',
      '/home/learner/shop/site/index.html': '<h1>港の店 1 号</h1>\n',
      '/home/learner/shop/all.yaml': MANIFEST,
    },
    images: ['nginx:1.27-alpine'],
    registries: [{ server: 'registry.city.example', user: 'learner' }],
    cluster: { nodes: 2, ageDays: 3, ingress: { address: '203.0.113.10' } },
  });
  return {
    run(line: string) {
      const o = execute(shell, line, registry, clock);
      shell = o.state;
      const pick = (s: string) => o.chunks.filter((c) => c.stream === s).map((c) => c.text).join('');
      return { out: pick('stdout'), err: pick('stderr'), code: o.exitCode };
    },
    k8s: (expr: string) => checkState({ kind: 'k8s', expr }, { shell }),
    container: (expr: string) => checkState({ kind: 'container', expr }, { shell }),
  };
}


describe('置き場へ push したイメージ', () => {
  it('push する前は取れず、push すると動き、写した頁を答える', () => {
    const s = session();
    expect(s.run(`docker build -t ${IMAGE}:1.0 .`).code).toBe(0);
    expect(s.run(`kubectl create deployment early --image=${IMAGE}:1.0`).code).toBe(0);
    s.run('kubectl get pods');
    s.run('kubectl get pods');
    expect(s.run('kubectl get pods').out).toMatch(/ErrImagePull|ImagePullBackOff/);
    expect(s.run('docker login registry.city.example').code).toBe(0);
    expect(s.run(`docker push ${IMAGE}:1.0`).code).toBe(0);
    expect(s.container(`pushed:${IMAGE}:1.0`)).toBe(true);
    expect(s.run('kubectl apply -f all.yaml').code).toBe(0);
    expect(s.run('kubectl rollout status deployment/shop').code).toBe(0);
    expect(s.k8s('deployment/shop readyUpdated=2')).toBe(true);
    expect(s.run('curl -s http://city.example/').out).toContain('港の店 1 号');
  });

  it('次の版を push して set image すると、止めずに新しい頁に変わる', () => {
    const s = session();
    s.run(`docker build -t ${IMAGE}:1.0 .`);
    s.run('docker login registry.city.example');
    s.run(`docker push ${IMAGE}:1.0`);
    s.run('kubectl apply -f all.yaml');
    s.run('kubectl rollout status deployment/shop');
    s.run("sed -i 's/1 号/2 号/' site/index.html");
    s.run(`docker build -t ${IMAGE}:2.0 .`);
    // 手元で作っただけの版は、置き場に無いので取れない
    s.run(`kubectl set image deployment/shop shop=${IMAGE}:2.0`);
    s.run('kubectl get pods');
    s.run('kubectl get pods');
    expect(s.run('kubectl get pods').out).toMatch(/ErrImagePull|ImagePullBackOff/);
    expect(s.run('curl -s http://city.example/').out).toContain('1 号');
    s.run(`docker push ${IMAGE}:2.0`);
    expect(s.run('kubectl rollout status deployment/shop').code).toBe(0);
    expect(s.k8s(`deployment/shop readyUpdated=2 image=${IMAGE}:2.0`)).toBe(true);
    expect(s.run('curl -s http://city.example/').out).toContain('2 号');
  });
});
