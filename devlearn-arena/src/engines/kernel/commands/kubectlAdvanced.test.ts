import { beforeEach, describe, expect, it } from 'vitest';
import { advanceCluster } from '@/engines/k8s/controllers';
import { container, deployment, emptyCluster, node, service } from '@/engines/k8s/factory';
import { tickPods } from '@/engines/k8s/kubelet';
import type { ClusterState } from '@/engines/k8s/types';
import { createSession, type Session } from '../session';
import { execute } from '../shell';

function base(): ClusterState {
  return {
    ...emptyCluster([node('n1', 4000, 8192), node('n2', 4000, 8192)]),
    deployments: new Map([['default/web', deployment('web', 2, [container('c', 'nginx:1.24')])]]),
    services: new Map([['default/web', service('web', { app: 'web' })]]),
  };
}

function settled(state: ClusterState, times: number): ClusterState {
  let next = state;
  for (let i = 0; i < times; i += 1) next = advanceCluster(next, tickPods);
  return next;
}

let session: Session;

beforeEach(() => {
  session = createSession({ cluster: settled(base(), 12), files: { '/home/learner': null } });
});

function run(line: string): { out: string; err: string; code: number } {
  const outcome = execute(session.state, line, session.registry, session.clock);
  session = { ...session, state: outcome.state };
  const pick = (s: 'stdout' | 'stderr') =>
    outcome.chunks.filter((c) => c.stream === s).map((c) => c.text).join('');
  return { out: pick('stdout'), err: pick('stderr'), code: outcome.exitCode };
}

/** マニフェストを書いて apply する */
function apply(name: string, yaml: string): { out: string; err: string; code: number } {
  session = {
    ...session,
    state: {
      ...session.state,
      vfs: {
        nodes: new Map(session.state.vfs.nodes).set(`/home/learner/${name}`, {
          kind: 'file',
          content: yaml,
        }),
      },
    },
  };
  return run(`kubectl apply -f ${name}`);
}

describe('kubectl apply と YAML', () => {
  it('複数文書をまとめて作れる', () => {
    const result = apply(
      'app.yaml',
      [
        'apiVersion: v1',
        'kind: ConfigMap',
        'metadata:',
        '  name: app-config',
        'data:',
        '  GREETING: hello',
        '---',
        'apiVersion: v1',
        'kind: Secret',
        'metadata:',
        '  name: app-secret',
        'stringData:',
        '  TOKEN: s3cret',
        '',
      ].join('\n'),
    );
    expect(result.code).toBe(0);
    expect(result.out).toContain('configmap/app-config created');
    expect(result.out).toContain('secret/app-secret created');
    expect(run('kubectl get cm').out).toContain('app-config');
  });

  it('2回目は configured になる', () => {
    const yaml = 'kind: ConfigMap\nmetadata:\n  name: c1\ndata:\n  A: "1"\n';
    apply('c.yaml', yaml);
    expect(apply('c.yaml', yaml).out).toContain('configured');
  });

  it('壊れた YAML は読めないと言う', () => {
    const result = apply('bad.yaml', 'kind: [Pod\n');
    expect(result.code).toBe(1);
    expect(result.err).toContain('YAML');
  });

  it('未対応の kind は理由を返す', () => {
    const result = apply('x.yaml', 'kind: Nope\nmetadata:\n  name: x\n');
    expect(result.code).toBe(1);
    expect(result.err).toContain('未対応の kind');
  });

  it('--dry-run では状態が変わらない', () => {
    apply('d.yaml', 'kind: ConfigMap\nmetadata:\n  name: dry\ndata: {}\n');
    run('kubectl delete cm dry');
    const result = apply('d.yaml', 'kind: ConfigMap\nmetadata:\n  name: dry\ndata: {}\n');
    expect(result.out).toContain('created');
    run('kubectl delete cm dry');
    session = {
      ...session,
      state: {
        ...session.state,
        vfs: {
          nodes: new Map(session.state.vfs.nodes).set('/home/learner/d.yaml', {
            kind: 'file',
            content: 'kind: ConfigMap\nmetadata:\n  name: dry\ndata: {}\n',
          }),
        },
      },
    };
    expect(run('kubectl apply -f d.yaml --dry-run').out).toContain('dry run');
    expect(run('kubectl get cm dry').code).toBe(1);
  });
});

describe('出力形式', () => {
  it('-o yaml は資源そのものを出す', () => {
    const out = run('kubectl get deploy web -o yaml').out;
    expect(out).toContain('apiVersion: apps/v1');
    expect(out).toContain('kind: Deployment');
    expect(out).toContain('name: web');
  });

  it('-o json は JSON として読める', () => {
    const out = run('kubectl get deploy web -o json').out;
    const parsed = JSON.parse(out) as { kind: string; spec: { replicas: number } };
    expect(parsed.kind).toBe('Deployment');
    expect(parsed.spec.replicas).toBe(2);
  });

  it('-o name は種別/名前だけ', () => {
    expect(run('kubectl get deploy -o name').out.trim()).toBe('deployment/web');
  });

  it('-o jsonpath でフィールドを取り出せる', () => {
    expect(run('kubectl get deploy web -o jsonpath={.spec.replicas}').out.trim()).toBe('2');
  });

  it('jsonpath で配列を辿れる', () => {
    const out = run('kubectl get pods -o jsonpath={.items[*].metadata.name}').out.trim();
    expect(out.split(' ').length).toBe(2);
  });
});

describe('ConfigMap と Secret', () => {
  beforeEach(() => {
    apply(
      'cfg.yaml',
      [
        'kind: ConfigMap',
        'metadata:',
        '  name: app-config',
        'data:',
        '  GREETING: hello',
        '---',
        'kind: Secret',
        'metadata:',
        '  name: app-secret',
        'stringData:',
        '  TOKEN: s3cret',
        '---',
        'kind: Pod',
        'metadata:',
        '  name: reader',
        '  labels:',
        '    app: reader',
        'spec:',
        '  containers:',
        '    - name: main',
        '      image: busybox',
        '      envFrom:',
        '        - configMapRef:',
        '            name: app-config',
        '        - secretRef:',
        '            name: app-secret',
        '',
      ].join('\n'),
    );
    run('kubectl wait 6');
  });

  it('Secret の値は base64 で保管される（暗号化ではない）', () => {
    const out = run('kubectl get secret app-secret -o json').out;
    const parsed = JSON.parse(out) as { data: Record<string, string> };
    expect(parsed.data['TOKEN']).toBe(btoa('s3cret'));
  });

  it('envFrom が実際に解決されて Pod に届く', () => {
    const out = run('kubectl exec reader -- env').out;
    expect(out).toContain('GREETING=hello');
    expect(out).toContain('TOKEN=s3cret');
  });

  it('無い ConfigMap をマウントすると配置できない', () => {
    apply(
      'missing.yaml',
      [
        'kind: Pod',
        'metadata:',
        '  name: broken',
        'spec:',
        '  volumes:',
        '    - name: cfg',
        '      configMap:',
        '        name: nope',
        '  containers:',
        '    - name: main',
        '      image: busybox',
        '',
      ].join('\n'),
    );
    run('kubectl wait 4');
    expect(run('kubectl describe pod broken').out).toContain('configmap "nope" not found');
  });
});
