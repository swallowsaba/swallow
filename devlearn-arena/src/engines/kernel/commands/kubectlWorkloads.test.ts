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
