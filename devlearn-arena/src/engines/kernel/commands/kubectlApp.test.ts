import { describe, expect, it } from 'vitest';
import { initialShell } from '@/engines/environments';
import { checkState } from '@/learning/practice';
import { createClock } from '../clock';
import type { ShellState } from '../registry';
import { execute } from '../shell';
import { createDefaultRegistry } from './index';

/** k8s の上級の実戦で使う模擬: 3 層のアプリ（k8s.a.01）・kubectl set env（k8s.a.02） */

const registry = createDefaultRegistry();
const clock = createClock();

function session(setup: unknown) {
  let shell: ShellState = initialShell('k8s-cluster', setup);
  return {
    run(line: string) {
      const o = execute(shell, line, registry, clock);
      shell = o.state;
      const pick = (s: string) => o.chunks.filter((c) => c.stream === s).map((c) => c.text).join('');
      return { out: pick('stdout'), err: pick('stderr'), code: o.exitCode };
    },
    k8s: (expr: string) => checkState({ kind: 'k8s', expr }, { shell }),
  };
}

const dep = (name: string, image: string, port: number, extra = ''): string => `apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: ${name}\nspec:\n  replicas: 1\n  selector:\n    matchLabels:\n      app: ${name}\n  template:\n    metadata:\n      labels:\n        app: ${name}\n    spec:\n      containers:\n      - name: ${name}\n        image: ${image}\n        ports:\n        - containerPort: ${String(port)}\n${extra}`;
const svc = (name: string, port: number, target = port): string => `apiVersion: v1\nkind: Service\nmetadata:\n  name: ${name}\nspec:\n  selector:\n    app: ${name}\n  ports:\n  - port: ${String(port)}\n    targetPort: ${String(target)}\n`;
const ing = 'apiVersion: networking.k8s.io/v1\nkind: Ingress\nmetadata:\n  name: city\nspec:\n  ingressClassName: nginx\n  rules:\n  - host: city.example\n    http:\n      paths:\n      - path: /api\n        pathType: Prefix\n        backend:\n          service:\n            name: api\n            port:\n              number: 3000\n';
const env = (url: string): string => `        env:\n        - name: DATABASE_URL\n          value: ${url}\n`;

const cluster = (url: string, db: boolean) => ({
  hostname: 'console',
  files: { '/etc/hosts': '127.0.0.1 localhost\n203.0.113.10 city.example\n' },
  cluster: { nodes: 2, ageDays: 3, ingress: { address: '203.0.113.10' }, manifests: [dep('api', 'city-store-api:1.0', 3000, env(url)), svc('api', 3000), ing, ...(db ? [dep('db', 'city-db:1.0', 5432), svc('db', 5432)] : [])].join('---\n') },
});

describe('DB の Service に届く API', () => {
  it('DB の Service が動いていれば 200。名前が違えば 500 で理由を答える', () => {
    const s = session(cluster('postgres://app@db:5432/reserve', true));
    s.run('kubectl get pods');
    const ok = s.run('curl -s http://city.example/api/items');
    expect(ok.out).toContain('"items"');
    const bad = session(cluster('postgres://app@database:5432/reserve', true));
    bad.run('kubectl get pods');
    const no = bad.run('curl -s -o /dev/null -w "%{http_code}" http://city.example/api/items');
    expect(no.out).toBe('500');
    expect(bad.run('curl -s http://city.example/api/items').out).toContain('getaddrinfo ENOTFOUND database');
  });

  it('ConfigMap から受け取った場所でも届き、POST /api/login に答える', () => {
    const cm = 'apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: api-config\ndata:\n  DATABASE_URL: postgres://app@db:5432/reserve\n';
    const from = '        envFrom:\n        - configMapRef:\n            name: api-config\n';
    const s = session({
      hostname: 'console',
      files: { '/etc/hosts': '127.0.0.1 localhost\n203.0.113.10 city.example\n' },
      cluster: { nodes: 2, ageDays: 3, ingress: { address: '203.0.113.10' }, manifests: [cm, dep('api', 'city-store-api:1.0', 3000, from), svc('api', 3000), ing, dep('db', 'city-db:1.0', 5432), svc('db', 5432)].join('---\n') },
    });
    s.run('kubectl get pods');
    expect(s.run('curl -s http://city.example/api/items').out).toContain('灯台の模型');
    expect(s.run('curl -s -X POST http://city.example/api/login').out).toContain('"loggedIn":true');
    expect(s.run('curl -s -o /dev/null -w "%{http_code}" http://city.example/api/login').out).toBe('405');
  });

  it('DB の Service が無ければ 500', () => {
    const s = session(cluster('postgres://app@db:5432/reserve', false));
    s.run('kubectl get pods');
    expect(s.run('curl -s -o /dev/null -w "%{http_code}" http://city.example/api/items').out).toBe('500');
  });

  it('環境変数が無ければ CrashLoopBackOff で、ログに理由がある', () => {
    const s = session({ hostname: 'console', cluster: { nodes: 2, ageDays: 3, manifests: dep('api', 'city-store-api:1.0', 3000) } });
    s.run('kubectl get pods');
    s.run('kubectl get pods');
    expect(s.run('kubectl get pods').out).toMatch(/CrashLoopBackOff|Error/);
    expect(s.run('kubectl logs deployment/api').out).toContain('missing environment variable DATABASE_URL');
  });
});

describe('Node の判定', () => {
  it('cordon で置かない印が付き、uncordon で戻る。drain で Pod が他へ移る', () => {
    const s = session({ hostname: 'console', cluster: { nodes: 3, ageDays: 3, manifests: dep('web', 'city-shop:1.0', 80) } });
    expect(s.k8s('node/node-1 schedulable')).toBe(true);
    expect(s.k8s('node/node-1 cordoned')).toBe(false);
    s.run('kubectl scale deployment web --replicas=3');
    s.run('kubectl rollout status deployment/web');
    s.run('kubectl drain node-1 --ignore-daemonsets');
    expect(s.k8s('node/node-1 cordoned pods=0')).toBe(true);
    expect(s.k8s('node/node-1 schedulable')).toBe(false);
    s.run('kubectl rollout status deployment/web');
    expect(s.k8s('deployment/web readyUpdated=3')).toBe(true);
    s.run('kubectl uncordon node-1');
    expect(s.k8s('node/node-1 schedulable')).toBe(true);
  });
});

describe('kubectl set selector', () => {
  it('service/名前 の形でも札を変える', () => {
    const s = session({ hostname: 'console', cluster: { nodes: 2, ageDays: 3, manifests: [dep('shop', 'city-shop:1.0', 80), svc('shop', 80).replace('app: shop', 'app: store')].join('---\n') } });
    s.run('kubectl get pods');
    expect(s.k8s('service/shop endpoints=0')).toBe(true);
    const r = s.run('kubectl set selector service/shop app=shop');
    expect(r.code).toBe(0);
    expect(s.k8s('service/shop endpoints=1 selector.app=shop')).toBe(true);
  });
});

describe('kubectl set env', () => {
  it('環境変数を足すと、Pod が作り直されて動く', () => {
    const s = session({ hostname: 'console', cluster: { nodes: 2, ageDays: 3, manifests: dep('api', 'city-store-api:1.0', 3000) } });
    s.run('kubectl get pods');
    const r = s.run('kubectl set env deployment/api DATABASE_URL=postgres://app@db:5432/reserve');
    expect(r.code).toBe(0);
    expect(r.out).toContain('deployment.apps/api env updated');
    s.run('kubectl rollout status deployment/api');
    expect(s.k8s('deployment/api readyUpdated=1 env.DATABASE_URL=postgres://app@db:5432/reserve')).toBe(true);
  });

  it('値の無い書き方は断り、名前- で消す', () => {
    const s = session({ hostname: 'console', cluster: { nodes: 2, ageDays: 3, manifests: dep('api', 'city-store-api:1.0', 3000, env('x')) } });
    expect(s.run('kubectl set env deployment/api').code).toBe(1);
    expect(s.run('kubectl set env deployment/nothing A=1').code).toBe(1);
    expect(s.run('kubectl set env deployment/api DATABASE_URL-').code).toBe(0);
  });
});
