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
        ...session.state.vfs,
        nodes: new Map(session.state.vfs.nodes).set(`/home/learner/${name}`, {
          kind: 'file',
          content: yaml,
        }),
      },
    },
  };
  return run(`kubectl apply -f ${name}`);
}

describe('probe と CrashLoopBackOff', () => {
  it('readinessProbe が通らない Pod は Endpoints に載らない', () => {
    apply(
      'probe.yaml',
      [
        'kind: Pod',
        'metadata:',
        '  name: notready',
        '  labels:',
        '    app: web',
        'spec:',
        '  containers:',
        '    - name: main',
        '      image: nginx',
        '      readinessProbe:',
        '        succeedsAfter: null',
        '',
      ].join('\n'),
    );
    run('kubectl wait 8');
    expect(run('kubectl get pods notready').out).toContain('NotReady');
    expect(run('kubectl get svc web').out).not.toContain('notready');
  });

  it('落ち続けるコンテナは CrashLoopBackOff になる', () => {
    apply(
      'crash.yaml',
      [
        'kind: Pod',
        'metadata:',
        '  name: crasher',
        'spec:',
        '  containers:',
        '    - name: main',
        '      image: crash-app',
        '',
      ].join('\n'),
    );
    run('kubectl wait 10');
    const out = run('kubectl get pods crasher').out;
    expect(out).toContain('CrashLoopBackOff');
    expect(run('kubectl logs crasher').out).toContain('起動直後に終了');
  });

  it('再起動のたびに待ち時間が伸びる', () => {
    apply(
      'crash2.yaml',
      'kind: Pod\nmetadata:\n  name: c2\nspec:\n  containers:\n    - name: main\n      image: crash-app\n',
    );
    run('kubectl wait 6');
    const first = Number(run('kubectl get pods c2 -o jsonpath={.status.containerStatuses[0].restartCount}').out.trim());
    run('kubectl wait 6');
    const second = Number(run('kubectl get pods c2 -o jsonpath={.status.containerStatuses[0].restartCount}').out.trim());
    // 待ち時間が伸びるので、同じ tick 数でも増え方は鈍る
    expect(second).toBeGreaterThan(first);
    expect(second - first).toBeLessThan(first);
  });

  it('startupProbe が通るまで Ready にならない', () => {
    apply(
      'startup.yaml',
      [
        'kind: Pod',
        'metadata:',
        '  name: slow',
        'spec:',
        '  containers:',
        '    - name: main',
        '      image: slowapp',
        '      startupProbe:',
        '        succeedsAfter: 8',
        '',
      ].join('\n'),
    );
    run('kubectl wait 4');
    expect(run('kubectl get pods slow').out).toContain('0/1');
    run('kubectl wait 10');
    expect(run('kubectl get pods slow').out).toContain('1/1');
  });
});

describe('rollout', () => {
  it('history に世代が並ぶ', () => {
    run('kubectl set image deployment web c=nginx:1.25');
    run('kubectl wait 12');
    const out = run('kubectl rollout history deployment/web').out;
    expect(out).toContain('REVISION');
    expect(out).toContain('nginx:1.24');
    expect(out).toContain('nginx:1.25');
  });

  it('status は揃うまで 1 を返す', () => {
    run('kubectl set image deployment web c=nginx:1.25');
    expect(run('kubectl rollout status deployment/web').code).toBe(1);
    run('kubectl wait 20');
    expect(run('kubectl rollout status deployment/web').code).toBe(0);
  });

  it('undo で1つ前のイメージに戻る', () => {
    run('kubectl set image deployment web c=nginx:1.25');
    run('kubectl wait 20');
    expect(run('kubectl rollout undo deployment/web').out).toContain('rolled back');
    run('kubectl wait 20');
    expect(run('kubectl get deploy web -o jsonpath={.spec.template.spec.containers[0].image}').out.trim())
      .toBe('nginx:1.24');
  });

  it('無いコンテナ名で set image すると、本物と同じく失敗して何も変えない', () => {
    const result = run('kubectl set image deployment web nope=nginx:1.25');
    expect(result.code).toBe(1);
    expect(result.err).toContain('unable to find container named "nope"');
    expect(run('kubectl get deploy web -o jsonpath={.spec.template.spec.containers[0].image}').out.trim())
      .toBe('nginx:1.24');
  });

  it('無い世代を指すと理由が出る', () => {
    expect(run('kubectl rollout undo deployment/web --to-revision=99').code).toBe(1);
  });
});

describe('drain', () => {
  it('cordon して Pod を追い出す', () => {
    const out = run('kubectl drain n1').out;
    expect(out).toContain('cordoned');
    expect(out).toContain('drained');
    expect(run('kubectl get nodes').out).toContain('SchedulingDisabled');
  });

  it('追い出された Pod は別のノードで作り直される', () => {
    run('kubectl drain n1');
    run('kubectl wait 20');
    const out = run('kubectl get pods -o wide').out;
    expect(out).not.toContain('n1');
    expect(out).toContain('n2');
  });

  it('DaemonSet の Pod は追い出さない', () => {
    apply(
      'ds.yaml',
      [
        'kind: DaemonSet',
        'metadata:',
        '  name: agent',
        'spec:',
        '  template:',
        '    metadata:',
        '      labels:',
        '        app: agent',
        '    spec:',
        '      containers:',
        '        - name: main',
        '          image: agent',
        '',
      ].join('\n'),
    );
    run('kubectl wait 8');
    expect(run('kubectl drain n1').out).toContain('ignoring pod default/agent-n1');
  });
});

describe('RBAC', () => {
  beforeEach(() => {
    apply(
      'rbac.yaml',
      [
        'kind: ServiceAccount',
        'metadata:',
        '  name: reader',
        '---',
        'kind: Role',
        'metadata:',
        '  name: pod-reader',
        'rules:',
        '  - apiGroups: [""]',
        '    resources: ["pods"]',
        '    verbs: ["get", "list"]',
        '---',
        'kind: RoleBinding',
        'metadata:',
        '  name: read-pods',
        'roleRef:',
        '  kind: Role',
        '  name: pod-reader',
        'subjects:',
        '  - kind: ServiceAccount',
        '    name: reader',
        '    namespace: default',
        '',
      ].join('\n'),
    );
  });

  it('許可されている操作は yes', () => {
    const out = run('kubectl auth can-i list pods --as=system:serviceaccount:default:reader');
    expect(out.code).toBe(0);
    expect(out.out).toContain('yes');
  });

  it('許可されていない操作は no と理由', () => {
    const out = run('kubectl auth can-i delete pods --as=system:serviceaccount:default:reader');
    expect(out.code).toBe(1);
    expect(out.out).toContain('no');
    expect(out.out).toContain('許可がありません');
  });

  it('結び付いていない主体は理由が違う', () => {
    const out = run('kubectl auth can-i list pods --as=system:serviceaccount:default:nobody');
    expect(out.out).toContain('RoleBinding がありません');
  });
});

describe('HPA', () => {
  beforeEach(() => {
    apply(
      'hpa.yaml',
      [
        'kind: HorizontalPodAutoscaler',
        'metadata:',
        '  name: web',
        'spec:',
        '  scaleTargetRef:',
        '    name: web',
        '  minReplicas: 2',
        '  maxReplicas: 8',
        '  metrics:',
        '    - resource:',
        '        target:',
        '          averageUtilization: 50',
        '',
      ].join('\n'),
    );
  });

  it('負荷が目標を超えると増える', () => {
    run('kubectl load web 100');
    run('kubectl wait 20');
    const replicas = Number(run('kubectl get deploy web -o jsonpath={.spec.replicas}').out.trim());
    expect(replicas).toBeGreaterThan(2);
  });

  it('上限を超えない', () => {
    run('kubectl load web 1000');
    run('kubectl wait 30');
    const replicas = Number(run('kubectl get deploy web -o jsonpath={.spec.replicas}').out.trim());
    expect(replicas).toBeLessThanOrEqual(8);
  });

  it('負荷が下がれば下限まで戻る', () => {
    run('kubectl load web 100');
    run('kubectl wait 20');
    run('kubectl load web 0');
    run('kubectl wait 30');
    expect(Number(run('kubectl get deploy web -o jsonpath={.spec.replicas}').out.trim())).toBe(2);
  });
});

describe('Ingress と NetworkPolicy', () => {
  it('Ingress の一覧にホストとバックエンドが出る', () => {
    apply(
      'ing.yaml',
      [
        'kind: Ingress',
        'metadata:',
        '  name: site',
        'spec:',
        '  ingressClassName: nginx',
        '  rules:',
        '    - host: shop.example',
        '      http:',
        '        paths:',
        '          - path: /',
        '            backend:',
        '              service:',
        '                name: web',
        '                port:',
        '                  number: 80',
        '',
      ].join('\n'),
    );
    const out = run('kubectl get ing').out;
    expect(out).toContain('shop.example');
    expect(out).toContain('web:80');
  });

  it('NetworkPolicy の一覧に対象と種別が出る', () => {
    apply(
      'np.yaml',
      [
        'kind: NetworkPolicy',
        'metadata:',
        '  name: web-allow',
        'spec:',
        '  podSelector:',
        '    matchLabels:',
        '      app: web',
        '  policyTypes: [Ingress]',
        '  ingress:',
        '    - from:',
        '        - podSelector:',
        '            matchLabels:',
        '              app: front',
        '      ports:',
        '        - port: 80',
        '',
      ].join('\n'),
    );
    const out = run('kubectl get netpol').out;
    expect(out).toContain('web-allow');
    expect(out).toContain('app=web');
  });
});
