import { describe, expect, it } from 'vitest';
import { initialShell } from '@/engines/environments';
import { clusterHolds } from '@/engines/k8s/check';
import { writeFile } from '../vfs';
import type { ShellState } from '../registry';
import { createClock } from '../clock';
import { execute } from '../shell';
import { createDefaultRegistry } from '.';

/** DB の Deployment（postgres:16）。env の部分を差し替える */
const DB = (env: string): string => [
  'apiVersion: apps/v1',
  'kind: Deployment',
  'metadata:',
  '  name: db',
  'spec:',
  '  replicas: 1',
  '  selector:',
  '    matchLabels:',
  '      app: db',
  '  template:',
  '    metadata:',
  '      labels:',
  '        app: db',
  '    spec:',
  '      containers:',
  '      - name: postgres',
  '        image: postgres:16',
  env,
  '',
].join('\n');
const SECRET = 'apiVersion: v1\nkind: Secret\nmetadata:\n  name: db-secret\ntype: Opaque\nstringData:\n  password: Reserve-Pass-2026\n---\n';
const KEY_REF = (k: string): string => `        env:\n        - name: POSTGRES_PASSWORD\n          valueFrom:\n            secretKeyRef:\n              name: db-secret\n              key: ${k}`;

/** クラスタを操作する機械 */
function console_(manifests?: string) {
  let shell: ShellState = initialShell('k8s-cluster', { cluster: { nodes: 2, ageDays: 3, ...(manifests === undefined ? {} : { manifests }) } });
  const registry = createDefaultRegistry();
  const clock = createClock();
  const run = (line: string) => {
    const r = execute(shell, line, registry, clock);
    shell = r.state;
    const pick = (s: 'stdout' | 'stderr'): string => r.chunks.filter((c) => c.stream === s).map((c) => c.text).join('');
    return { out: pick('stdout'), err: pick('stderr'), code: r.exitCode };
  };
  const apply = (text: string) => {
    shell = { ...shell, vfs: writeFile(shell.vfs, '/home/learner/db.yaml', text, true) };
    return run('kubectl apply -f db.yaml');
  };
  return { run, apply, holds: (expr: string) => clusterHolds(shell.cluster, expr) };
}

describe('クラスタの Pod は、置き場のイメージの振る舞いのとおりに動く', () => {
  it('postgres:16 は POSTGRES_PASSWORD が無いと、本物と同じ文を出して止まり、作り直しを繰り返す', () => {
    const c = console_();
    c.apply(DB('        ports:\n        - containerPort: 5432'));
    c.run('kubectl get pods -w');
    expect(c.run('kubectl get pods').out).toMatch(/^db-\S+ +0\/1 +(CrashLoopBackOff|Error) +\d+ /m);
    const logs = c.run('kubectl logs deploy/db').out;
    expect(logs).toContain('Error: Database is uninitialized and superuser password is not specified.');
    expect(logs).toContain('You must specify POSTGRES_PASSWORD to a non-empty value for the');
    expect(c.holds('deployment/db readyReplicas=1')).toBe(false);
  });

  it('Secret の値を受け取ると動き出し、ログに受け付けの準備ができたと出る。中の環境変数には復号した値が入る', () => {
    const c = console_();
    c.apply(SECRET + DB(KEY_REF('password')));
    expect(c.run('kubectl rollout status deployment/db').code).toBe(0);
    expect(c.run('kubectl logs deploy/db').out).toContain('database system is ready to accept connections');
    expect(c.run('kubectl exec deploy/db -- printenv POSTGRES_PASSWORD').out).toBe('Reserve-Pass-2026\n');
    expect(c.holds('deployment/db readyReplicas=1 from.POSTGRES_PASSWORD=db-secret')).toBe(true);
    // 保存は base64 の符号にすぎない（-o yaml で見え、元に戻せる）
    expect(c.run('kubectl get secret db-secret -o yaml').out).toContain('password: UmVzZXJ2ZS1QYXNzLTIwMjY=');
  });

  it('Secret の data: に base64 でない値を書くと、本物と同じく何バイト目が読めないかを言って断る', () => {
    const c = console_();
    const plain = c.apply(SECRET.replace('stringData:', 'data:') + DB(KEY_REF('password')));
    expect(plain.err).toBe('Error from server (BadRequest): error when creating "db.yaml": Secret in version "v1" cannot be handled as a Secret: illegal base64 data at input byte 7\n');
    expect(plain.code).toBe(1);
    expect(c.run('kubectl get secrets').out).toBe('No resources found in default namespace.\n');
    expect(c.apply(SECRET.replace('stringData:', 'data:').replace('Reserve-Pass-2026', 'UmVzZXJ2ZS1QYXNzLTIwMjY=') + DB(KEY_REF('password'))).code).toBe(0);
  });

  it('Secret に無いキーを指すと CreateContainerConfigError で待ち、ログは待っていると断る', () => {
    const c = console_();
    c.apply(SECRET + DB(KEY_REF('POSTGRES_PASSWORD')));
    c.run('kubectl get pods');
    expect(c.run('kubectl get pods').out).toMatch(/^db-\S+ +0\/1 +CreateContainerConfigError /m);
    const logs = c.run('kubectl logs deploy/db');
    expect(logs.err).toMatch(/^Error from server \(BadRequest\): container "postgres" in pod "db-\S+" is waiting to start: CreateContainerConfigError\n$/);
    expect(logs.code).toBe(1);
  });

  it('判定の env.名前 は今の設計図の Pod だけで見る。入れ替えの途中で古い Pod が同じ値を持っていても、新しい Pod が動くまでは満たさない', () => {
    const c = console_(DB('        env:\n        - name: POSTGRES_PASSWORD\n          value: Reserve-Pass-2026'));
    expect(c.holds('deployment/db readyReplicas=1 env.POSTGRES_PASSWORD=Reserve-Pass-2026')).toBe(true);
    c.apply(SECRET + DB(KEY_REF('POSTGRES_PASSWORD')));
    c.run('kubectl rollout status deployment/db');
    // 古い Pod は動き続けている（Ready は 1）が、新しい Pod はキーが無くて動けない
    expect(c.holds('deployment/db readyReplicas=1')).toBe(true);
    expect(c.holds('deployment/db env.POSTGRES_PASSWORD=Reserve-Pass-2026')).toBe(false);
    // 無いキーを指していれば、受け取る先とは言わない
    expect(c.holds('deployment/db from.POSTGRES_PASSWORD')).toBe(false);
    c.apply(SECRET + DB(KEY_REF('password')));
    c.run('kubectl rollout status deployment/db');
    expect(c.holds('deployment/db readyReplicas=1 env.POSTGRES_PASSWORD=Reserve-Pass-2026 from.POSTGRES_PASSWORD=db-secret')).toBe(true);
  });

  it('logs -l は札の合う Pod のログを全て並べ、--prefix で行の頭に Pod とコンテナの名前を付ける', () => {
    const c = console_(DB('        env:\n        - name: POSTGRES_PASSWORD\n          value: Reserve-Pass-2026'));
    c.apply(`${SECRET}${DB('        envFrom:\n        - secretRef:\n            name: db-secret')}`);
    c.run('kubectl get pods -w');
    const pods = [...c.run('kubectl get pods').out.matchAll(/^(db-\S+)/gm)].map((m) => m[1] ?? '').sort();
    expect(pods).toHaveLength(2);
    const logs = c.run('kubectl logs -l app=db --prefix');
    expect(logs.out).toContain(`[pod/${pods[0] ?? ''}/postgres] `);
    expect(logs.out).toMatch(/^\[pod\/db-\S+\/postgres\] database system is ready to accept connections$/m);
    expect(logs.out).toMatch(/^\[pod\/db-\S+\/postgres\] Error: Database is uninitialized and superuser password is not specified\.$/m);
    expect(c.run('kubectl logs -l app=db').out).toMatch(/^Error: Database is uninitialized/m);
    expect(c.run('kubectl logs -l app=nope').out).toBe('No resources found in default namespace.\n');
  });

  it('Secret を丸ごと受け取ると、キーの名前（password）がそのまま変数の名前になり、POSTGRES_PASSWORD は空のまま', () => {
    const c = console_();
    c.apply(`${SECRET}${DB('        envFrom:\n        - secretRef:\n            name: db-secret')}`);
    c.run('kubectl get pods -w');
    expect(c.run('kubectl logs deploy/db').out).toContain('superuser password is not specified');
    expect(c.holds('deployment/db from.POSTGRES_PASSWORD')).toBe(false);
  });

  it('city-reserve は起動の行を出して待ち受ける。DATABASE_URL が無ければ、本物のアプリと同じく止まる', () => {
    const app = (env: string): string => DB(env).replace(/db/g, 'web').replace('postgres:16', 'city-reserve:2.0').replace('name: postgres', 'name: web');
    const c = console_(app('        env:\n        - name: DATABASE_URL\n          value: postgres://reserve@db-staging:5432/reserve'));
    expect(c.run('kubectl logs deploy/web').out).toBe([
      '',
      '> reserve@2.0.0 start',
      '> node server.js',
      '',
      'reserve: version 2.0.0',
      'reserve: reading settings from the environment',
      'reserve: listening on :3000',
      '',
    ].join('\n'));
    c.apply(app('        ports:\n        - containerPort: 3000'));
    c.run('kubectl get pods -w');
    expect(c.run('kubectl get pods').out).toMatch(/^web-\S+ +0\/1 +(CrashLoopBackOff|Error) /m);
  });
});
