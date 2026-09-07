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

describe('ストレージ', () => {
  it('動的provisioning なら PVC が自動で束ねられる', () => {
    apply(
      'sc.yaml',
      [
        'kind: StorageClass',
        'metadata:',
        '  name: fast',
        'provisioner: devlearn.io/local',
        'dynamic: true',
        '---',
        'kind: PersistentVolumeClaim',
        'metadata:',
        '  name: data',
        'spec:',
        '  storageClassName: fast',
        '  accessModes: [ReadWriteOnce]',
        '  resources:',
        '    requests:',
        '      storage: 5',
        '',
      ].join('\n'),
    );
    run('kubectl wait 3');
    expect(run('kubectl get pvc data').out).toContain('Bound');
  });

  it('動的でなく PV も無ければ Pending のまま理由が残る', () => {
    apply(
      'sc2.yaml',
      [
        'kind: StorageClass',
        'metadata:',
        '  name: manual',
        'provisioner: none',
        'dynamic: false',
        '---',
        'kind: PersistentVolumeClaim',
        'metadata:',
        '  name: needs-pv',
        'spec:',
        '  storageClassName: manual',
        '  accessModes: [ReadWriteOnce]',
        '  resources:',
        '    requests:',
        '      storage: 5',
        '',
      ].join('\n'),
    );
    run('kubectl wait 3');
    const out = run('kubectl get pvc needs-pv').out;
    expect(out).toContain('Pending');
    expect(run('kubectl get pvc needs-pv -o json').out).toContain('no persistent volumes available');
  });

  it('容量が足りない PV は選ばれない', () => {
    apply(
      'pv.yaml',
      [
        'kind: StorageClass',
        'metadata:',
        '  name: manual',
        'provisioner: none',
        'dynamic: false',
        '---',
        'kind: PersistentVolume',
        'metadata:',
        '  name: small',
        'spec:',
        '  capacity:',
        '    storage: 1',
        '  accessModes: [ReadWriteOnce]',
        '  storageClassName: manual',
        '---',
        'kind: PersistentVolume',
        'metadata:',
        '  name: big',
        'spec:',
        '  capacity:',
        '    storage: 10',
        '  accessModes: [ReadWriteOnce]',
        '  storageClassName: manual',
        '---',
        'kind: PersistentVolumeClaim',
        'metadata:',
        '  name: want5',
        'spec:',
        '  storageClassName: manual',
        '  accessModes: [ReadWriteOnce]',
        '  resources:',
        '    requests:',
        '      storage: 5',
        '',
      ].join('\n'),
    );
    run('kubectl wait 3');
    expect(run('kubectl get pvc want5').out).toContain('big');
    expect(run('kubectl get pv small').out).toContain('Available');
  });

  it('PVC が Bound になるまで Pod は配置されない', () => {
    apply(
      'app.yaml',
      [
        'kind: StorageClass',
        'metadata:',
        '  name: manual',
        'provisioner: none',
        'dynamic: false',
        '---',
        'kind: PersistentVolumeClaim',
        'metadata:',
        '  name: db-data',
        'spec:',
        '  storageClassName: manual',
        '  accessModes: [ReadWriteOnce]',
        '  resources:',
        '    requests:',
        '      storage: 2',
        '---',
        'kind: Pod',
        'metadata:',
        '  name: db',
        'spec:',
        '  volumes:',
        '    - name: data',
        '      persistentVolumeClaim:',
        '        claimName: db-data',
        '  containers:',
        '    - name: main',
        '      image: postgres',
        '',
      ].join('\n'),
    );
    run('kubectl wait 4');
    expect(run('kubectl describe pod db').out).toContain('unbound');
  });
});

describe('StatefulSet と DaemonSet', () => {
  it('StatefulSet は 0 から順に、前が Ready になってから増える', () => {
    apply(
      'sts.yaml',
      [
        'kind: StatefulSet',
        'metadata:',
        '  name: db',
        'spec:',
        '  replicas: 3',
        '  serviceName: db',
        '  template:',
        '    metadata:',
        '      labels:',
        '        app: db',
        '    spec:',
        '      containers:',
        '        - name: main',
        '          image: postgres',
        '',
      ].join('\n'),
    );
    run('kubectl wait 3');
    const early = run('kubectl get pods').out;
    expect(early).toContain('db-0');
    expect(early).not.toContain('db-2');
    run('kubectl wait 12');
    const later = run('kubectl get pods').out;
    expect(later).toContain('db-2');
  });

  it('DaemonSet はノード1台につき1つ', () => {
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
    run('kubectl wait 6');
    expect(run('kubectl get ds agent').out).toContain('2');
    const pods = run('kubectl get pods').out;
    expect(pods).toContain('agent-n1');
    expect(pods).toContain('agent-n2');
  });
});

describe('Job と CronJob', () => {
  it('Job は completions に届いたら Complete になる', () => {
    apply(
      'job.yaml',
      [
        'kind: Job',
        'metadata:',
        '  name: migrate',
        'spec:',
        '  completions: 2',
        '  parallelism: 1',
        '  template:',
        '    metadata:',
        '      labels:',
        '        job: migrate',
        '    spec:',
        '      containers:',
        '        - name: main',
        '          image: migrator',
        '',
      ].join('\n'),
    );
    run('kubectl wait 20');
    expect(run('kubectl get jobs').out).toContain('Complete');
    expect(run('kubectl get jobs').out).toContain('2/2');
  });

  it('CronJob は周期が来たら Job を作る', () => {
    apply(
      'cron.yaml',
      [
        'kind: CronJob',
        'metadata:',
        '  name: nightly',
        'spec:',
        '  everyTicks: 3',
        '  jobTemplate:',
        '    spec:',
        '      completions: 1',
        '      template:',
        '        metadata:',
        '          labels:',
        '            job: nightly',
        '        spec:',
        '          containers:',
        '            - name: main',
        '              image: batch',
        '',
      ].join('\n'),
    );
    run('kubectl wait 10');
    expect(run('kubectl get jobs').out).toContain('nightly-1');
  });

  it('suspend されていれば作られない', () => {
    apply(
      'cron2.yaml',
      [
        'kind: CronJob',
        'metadata:',
        '  name: paused',
        'spec:',
        '  everyTicks: 2',
        '  suspend: true',
        '  jobTemplate:',
        '    spec:',
        '      template:',
        '        spec:',
        '          containers:',
        '            - name: main',
        '              image: batch',
        '',
      ].join('\n'),
    );
    run('kubectl wait 10');
    expect(run('kubectl get jobs').out).not.toContain('paused-1');
  });
});

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
    expect(run('kubectl get deploy web -o jsonpath={.spec.template.containers[0].image}').out.trim())
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
