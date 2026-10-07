import { describe, expect, it } from 'vitest';
import { initialShell } from '@/engines/environments';
import { clusterHolds } from '@/engines/k8s/check';
import { writeFile } from '../vfs';
import type { ShellState } from '../registry';
import { createClock } from '../clock';
import { execute } from '../shell';
import { createDefaultRegistry } from '.';

/** 予約の窓口 web。接続先を env に直書きしている（k8s.i.01 の実戦の初めと同じ形） */
const DEPLOY = (env: string): string => [
  'apiVersion: apps/v1',
  'kind: Deployment',
  'metadata:',
  '  name: web',
  'spec:',
  '  replicas: 2',
  '  selector:',
  '    matchLabels:',
  '      app: web',
  '  template:',
  '    metadata:',
  '      labels:',
  '        app: web',
  '    spec:',
  '      containers:',
  '      - name: web',
  '        image: city-reserve:2.0',
  env,
  '',
].join('\n');
const DIRECT = '        env:\n        - name: DB_HOST\n          value: db-staging';
const FROM = (name: string): string => `        envFrom:\n        - configMapRef:\n            name: ${name}`;
const CONFIG = (name: string, host: string): string => `apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: ${name}\ndata:\n  DB_HOST: ${host}\n---\n`;

/** クラスタを操作する機械。web は前から動いている */
function console_() {
  let shell: ShellState = initialShell('k8s-cluster', { cluster: { nodes: 2, ageDays: 3, manifests: DEPLOY(DIRECT) } });
  const registry = createDefaultRegistry();
  const clock = createClock();
  const run = (line: string) => {
    const r = execute(shell, line, registry, clock);
    shell = r.state;
    const pick = (s: 'stdout' | 'stderr'): string => r.chunks.filter((c) => c.stream === s).map((c) => c.text).join('');
    return { out: pick('stdout'), err: pick('stderr'), code: r.exitCode };
  };
  const apply = (text: string) => {
    shell = { ...shell, vfs: writeFile(shell.vfs, '/home/learner/web.yaml', text, true) };
    return run('kubectl apply -f web.yaml');
  };
  return { run, apply, holds: (expr: string) => clusterHolds(shell.cluster, expr) };
}

describe('ConfigMap を環境変数で渡す', () => {
  it('apply は変わった物だけ configured、同じ物は unchanged と言い、apps の仲間は deployment.apps と書く', () => {
    const c = console_();
    expect(c.apply(DEPLOY(DIRECT)).out).toBe('deployment.apps/web unchanged\n');
    expect(c.apply(CONFIG('web-config', 'db-staging') + DEPLOY(FROM('web-config'))).out).toBe('configmap/web-config created\ndeployment.apps/web configured\n');
    expect(c.apply(CONFIG('web-config', 'db-staging-2') + DEPLOY(FROM('web-config'))).out).toBe('configmap/web-config configured\ndeployment.apps/web unchanged\n');
  });

  it('rollout status は入れ替わりが終わるまで待ち、Pod は ConfigMap の値を環境変数に持つ', () => {
    const c = console_();
    expect(c.run('kubectl exec deploy/web -- printenv DB_HOST').out).toBe('db-staging\n');
    expect(c.holds('deployment/web env.DB_HOST=db-staging')).toBe(true);
    expect(c.holds('deployment/web from.DB_HOST')).toBe(false);
    c.apply(CONFIG('web-config', 'db-staging') + DEPLOY(FROM('web-config')));
    const status = c.run('kubectl rollout status deployment/web');
    expect(status.out).toMatch(/^Waiting for deployment "web" rollout to finish: /m);
    expect(status.out).toMatch(/^deployment "web" successfully rolled out\n$/m);
    expect(status.code).toBe(0);
    expect(c.holds('deployment/web readyReplicas=2 env.DB_HOST=db-staging from.DB_HOST=web-config')).toBe(true);
    expect(c.run('kubectl exec deploy/web -- printenv DB_HOST').out).toBe('db-staging\n');
  });

  it('ConfigMap の値だけを変えても、動いている Pod の環境変数は変わらない。参照を変えて作り直すと変わる', () => {
    const c = console_();
    c.apply(CONFIG('web-config', 'db-staging') + DEPLOY(FROM('web-config')));
    c.run('kubectl rollout status deployment/web');
    c.apply(CONFIG('web-config', 'db-staging-2') + DEPLOY(FROM('web-config')));
    expect(c.run('kubectl rollout status deployment/web').out).toBe('deployment "web" successfully rolled out\n');
    expect(c.run('kubectl exec deploy/web -- printenv DB_HOST').out).toBe('db-staging\n');
    expect(c.holds('deployment/web env.DB_HOST=db-staging-2')).toBe(false);

    c.apply(CONFIG('web-config-2', 'db-staging-2') + DEPLOY(FROM('web-config-2')));
    c.run('kubectl rollout status deployment/web');
    expect(c.run('kubectl exec deploy/web -- printenv DB_HOST').out).toBe('db-staging-2\n');
    expect(c.holds('deployment/web readyReplicas=2 env.DB_HOST=db-staging-2 from.DB_HOST')).toBe(true);
  });

  it('直接書いた env は ConfigMap より勝つ', () => {
    const c = console_();
    c.apply(CONFIG('web-config', 'db-prod') + DEPLOY(`${DIRECT}\n${FROM('web-config')}`));
    c.run('kubectl rollout status deployment/web');
    expect(c.run('kubectl exec deploy/web -- printenv DB_HOST').out).toBe('db-staging\n');
    expect(c.holds('deployment/web from.DB_HOST')).toBe(false);
  });

  it('参照した ConfigMap が無いと CreateContainerConfigError で止まり、rollout status は期限を過ぎて失敗する。作れば動き出す', () => {
    const c = console_();
    c.apply(CONFIG('web-conf', 'db-staging') + DEPLOY(FROM('web-config')));
    const status = c.run('kubectl rollout status deployment/web');
    expect(status.err).toBe('error: deployment "web" exceeded its progress deadline\n');
    expect(status.code).toBe(1);
    expect(c.run('kubectl get pods').out).toMatch(/^web-\S+ +0\/1 +CreateContainerConfigError +0 +\S+$/m);
    // 古い Pod は残って動き続ける（止まらずに済む）
    expect(c.run('kubectl exec deploy/web -- printenv DB_HOST').out).toBe('db-staging\n');
    const pod = /^(web-\S+) +0\/1/m.exec(c.run('kubectl get pods').out)?.[1] ?? '';
    expect(c.run(`kubectl describe pod ${pod}`).out).toMatch(/Warning +Failed +.*Error: configmap "web-config" not found/);

    c.apply(CONFIG('web-config', 'db-staging') + DEPLOY(FROM('web-config')));
    expect(c.run('kubectl rollout status deployment/web').code).toBe(0);
    expect(c.holds('deployment/web readyReplicas=2 from.DB_HOST=web-config')).toBe(true);
  });

  it('ConfigMap に無いキーを指すと、そのキーが無いと言う', () => {
    const c = console_();
    const ref = '        env:\n        - name: DB_HOST\n          valueFrom:\n            configMapKeyRef:\n              name: web-config\n              key: DB_NAME';
    c.apply(CONFIG('web-config', 'db-staging') + DEPLOY(ref));
    c.run('kubectl get pods');
    const pod = /^(web-\S+) +0\/1 +CreateContainerConfigError/m.exec(c.run('kubectl get pods').out)?.[1] ?? '';
    expect(c.run(`kubectl describe pod ${pod}`).out).toContain("Error: couldn't find key DB_NAME in ConfigMap default/web-config");
  });

  it('describe は環境変数を書いた形で見せる（受け取る ConfigMap の名前と、直接書いた値）', () => {
    const c = console_();
    expect(c.run('kubectl describe deployment web').out).toMatch(/^ {4}Environment:\n {6}DB_HOST: {2}db-staging$/m);
    c.apply(CONFIG('web-config', 'db-staging') + DEPLOY(FROM('web-config')));
    c.run('kubectl rollout status deployment/web');
    const pod = /^(web-\S+) +1\/1/m.exec(c.run('kubectl get pods').out)?.[1] ?? '';
    expect(c.run(`kubectl describe pod ${pod}`).out).toContain([
      '    Environment Variables from:',
      '      web-config  ConfigMap  Optional: false',
      '    Environment:  <none>',
    ].join('\n'));
    const ref = '        env:\n        - name: DB_HOST\n          valueFrom:\n            configMapKeyRef:\n              name: web-config\n              key: DB_HOST';
    c.apply(CONFIG('web-config', 'db-staging') + DEPLOY(ref));
    expect(c.run('kubectl describe deployment web').out).toContain("      DB_HOST:  <set to the key 'DB_HOST' of config map 'web-config'>  Optional: false");
  });

  it('YAML として読めないファイルは、本物と同じく読めなくなった行を言い、何も変えない', () => {
    const c = console_();
    const broken = c.apply(`${CONFIG('web-config', 'db-staging')}${DEPLOY(FROM('web-config')).replace('      - name: web', '     - name: web')}`);
    expect(broken.err).toMatch(/^error: error parsing web\.yaml: error converting YAML to JSON: yaml: line \d+: \S/);
    expect(broken.code).toBe(1);
    expect(c.run('kubectl get configmaps').out).not.toContain('web-config');
    // --- を忘れると、2 つの物の項目が 1 つに混ざる
    const mixed = c.apply(CONFIG('web-config', 'db-staging').replace('---\n', '') + DEPLOY(FROM('web-config')));
    expect(mixed.err).toMatch(/yaml: line \d+: duplicated mapping key/);
  });

  it('printenv は名前を省くと全てを、無い名前は何も出さずに 1 で終わる', () => {
    const c = console_();
    expect(c.run('kubectl exec deploy/web -- printenv').out).toMatch(/^DB_HOST=db-staging$/m);
    const none = c.run('kubectl exec deploy/web -- printenv NOPE');
    expect(none.out).toBe('');
    expect(none.code).toBe(1);
  });
});
