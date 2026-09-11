import { beforeEach, describe, expect, it } from 'vitest';
import { advanceCluster } from '@/engines/k8s/controllers';
import { emptyCluster, node } from '@/engines/k8s/factory';
import { tickPods } from '@/engines/k8s/kubelet';
import type { ClusterState } from '@/engines/k8s/types';
import { createSession, type Session } from '../session';
import { execute } from '../shell';

function settled(times: number): ClusterState {
  let state: ClusterState = emptyCluster([node('n1', 4000, 8192), node('n2', 4000, 8192)]);
  for (let i = 0; i < times; i += 1) state = advanceCluster(state, tickPods);
  return state;
}

let session: Session;

beforeEach(() => {
  session = createSession({ cluster: settled(2), files: { '/home/learner': null } });
});

function run(line: string): { out: string; err: string; code: number } {
  const outcome = execute(session.state, line, session.registry, session.clock);
  session = { ...session, state: outcome.state };
  const pick = (s: 'stdout' | 'stderr') =>
    outcome.chunks.filter((c) => c.stream === s).map((c) => c.text).join('');
  return { out: pick('stdout'), err: pick('stderr'), code: outcome.exitCode };
}

describe('kubectl create deployment', () => {
  it('作れて、時間を進めると Pod が立つ', () => {
    const made = run('kubectl create deploy web --image=nginx:1.27 --replicas=2');
    expect(made.code).toBe(0);
    expect(made.out).toContain('deployment.apps/web created');
    run('kubectl wait 20');
    const pods = run('kubectl get pods').out;
    expect(pods.match(/web-/g)?.length).toBe(2);
  });

  it('既にあれば断る', () => {
    run('kubectl create deploy web --image=nginx:1.27');
    const again = run('kubectl create deploy web --image=nginx:1.27');
    expect(again.code).toBe(1);
    expect(again.err).toContain('AlreadyExists');
  });

  it('--image が無ければ断る', () => {
    const made = run('kubectl create deploy web');
    expect(made.code).toBe(1);
    expect(made.err).toContain('required flag(s) "image" not set');
  });

  it('replicas は既定で 1', () => {
    run('kubectl create deploy solo --image=nginx:1.27');
    expect(run('kubectl get deploy').out).toContain('0/1');
  });
});

describe('kubectl create のほかの資源', () => {
  it('configmap を作れる', () => {
    const made = run('kubectl create configmap app-config --from-literal=LEVEL=warn');
    expect(made.out).toContain('configmap/app-config created');
    expect(run('kubectl get cm app-config -o yaml').out).toContain('warn');
  });

  it('secret は base64 で入る（暗号化ではない）', () => {
    run('kubectl create secret app-secret --from-literal=TOKEN=hunter2');
    const shown = run('kubectl get secret app-secret -o yaml').out;
    expect(shown).not.toContain('hunter2');
    expect(shown).toContain(btoa('hunter2'));
  });

  it('serviceaccount を作れる', () => {
    expect(run('kubectl create sa ci').out).toContain('serviceaccount/ci created');
  });

  it('service を作れる', () => {
    run('kubectl create deploy web --image=nginx:1.27');
    expect(run('kubectl create svc web').out).toContain('service/web created');
  });

  it('知らない種類は断る', () => {
    const made = run('kubectl create widget thing');
    expect(made.code).toBe(1);
    expect(made.err).toContain('unknown resource type');
  });
});

describe('kubectl run', () => {
  it('Pod を1つ作り、時間を進めると Running になる', () => {
    const made = run('kubectl run web --image=nginx');
    expect(made.out).toBe('pod/web created\n');
    run('kubectl wait 10');
    expect(run('kubectl get pods').out).toMatch(/web\s+1\/1\s+Running/);
  });

  it('持ち主がいないので、消したら作り直されない', () => {
    run('kubectl run web --image=nginx');
    run('kubectl wait 10');
    run('kubectl delete pod web');
    run('kubectl wait 10');
    expect(run('kubectl get pods').out).toContain('No resources found');
  });

  it('run=<名前> のラベルが付く', () => {
    run('kubectl run web --image=nginx');
    expect(run('kubectl get pods --show-labels').out).toContain('run=web');
  });

  it('--image が無ければ断る', () => {
    expect(run('kubectl run web').code).toBe(1);
  });
});

describe('kubectl expose', () => {
  it('Deployment のセレクタを写した Service を作り、Pod が Endpoints に載る', () => {
    run('kubectl create deployment web --image=nginx --replicas=2');
    const made = run('kubectl expose deployment web --port=80');
    expect(made.out).toBe('service/web exposed\n');
    run('kubectl wait 15');
    const svc = session.state.cluster?.services.get('default/web');
    expect(svc?.spec.selector).toEqual({ app: 'web' });
    expect(svc?.status.endpoints.length).toBe(2);
  });

  it('--type=NodePort で種類を変えられる', () => {
    run('kubectl create deployment web --image=nginx');
    run('kubectl expose deploy/web --port=80 --type=NodePort');
    expect(session.state.cluster?.services.get('default/web')?.spec.type).toBe('NodePort');
  });

  it('相手が無ければ本物と同じく NotFound', () => {
    const r = run('kubectl expose deployment nope --port=80');
    expect(r.code).toBe(1);
    expect(r.err).toContain('NotFound');
  });
});

