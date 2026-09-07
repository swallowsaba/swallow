import { beforeEach, describe, expect, it } from 'vitest';
import { advanceCluster } from '@/engines/k8s/controllers';
import { container, deployment, emptyCluster, node, service } from '@/engines/k8s/factory';
import { tickPods } from '@/engines/k8s/kubelet';
import type { ClusterState } from '@/engines/k8s/types';
import { createSession, type Session } from '../session';
import { execute } from '../shell';

function ready(times: number): ClusterState {
  let state: ClusterState = {
    ...emptyCluster([node('n1', 4000, 8192), node('n2', 4000, 8192)]),
    deployments: new Map([['default/web', deployment('web', 2, [container('c', 'nginx:1.24')])]]),
    services: new Map([['default/web', service('web', { app: 'web' })]]),
  };
  for (let i = 0; i < times; i += 1) state = advanceCluster(state, tickPods);
  return state;
}

let session: Session;

beforeEach(() => {
  session = createSession({ cluster: ready(12) });
});

function run(line: string): { out: string; err: string; code: number } {
  const outcome = execute(session.state, line, session.registry, session.clock);
  session = { ...session, state: outcome.state };
  const pick = (s: 'stdout' | 'stderr') =>
    outcome.chunks.filter((c) => c.stream === s).map((c) => c.text).join('');
  return { out: pick('stdout'), err: pick('stderr'), code: outcome.exitCode };
}

describe('クラスタが無い場合', () => {
  it('本物と同じ接続エラーになる', () => {
    session = createSession();
    const r = run('kubectl get pods');
    expect(r.code).toBe(1);
    expect(r.err).toContain('connection to the server');
  });
});

describe('kubectl get', () => {
  it('Pod が一覧になる', () => {
    const out = run('kubectl get pods').out;
    expect(out).toContain('NAME');
    expect(out).toContain('READY');
    expect(out).toContain('Running');
  });

  it('省略形 po も使える', () => {
    expect(run('kubectl get po').out).toContain('READY');
  });

  it('-o wide で IP とノードが出る', () => {
    const out = run('kubectl get pods -o wide').out;
    expect(out).toContain('IP');
    expect(out).toContain('10.244.0.');
    expect(out).toContain('n1');
  });

  it('Deployment の Ready 数が出る', () => {
    expect(run('kubectl get deploy').out).toContain('2/2');
  });

  it('Service の Endpoints が出る', () => {
    expect(run('kubectl get svc').out).toContain('10.244.0.');
  });

  it('ノードが一覧になる', () => {
    expect(run('kubectl get nodes').out).toContain('Ready');
  });

  it('未知の種別は本物風に断る', () => {
    const r = run('kubectl get frobs');
    expect(r.code).toBe(1);
    expect(r.err).toContain("doesn't have a resource type");
  });

  it('該当が無ければそう言う', () => {
    expect(run('kubectl get pods -n other').out).toContain('No resources found');
  });
});

describe('kubectl describe', () => {
  it('イベントが時系列で出る', () => {
    const name = run('kubectl get pods').out.split('\n')[1]?.split(' ')[0] ?? '';
    const out = run(`kubectl describe pod ${name}`).out;
    expect(out).toContain('Events:');
    expect(out).toContain('Scheduled');
    expect(out).toContain('Requests:');
  });

  it('無い Pod は NotFound', () => {
    const r = run('kubectl describe pod nope');
    expect(r.code).toBe(1);
    expect(r.err).toBe('Error from server (NotFound): pods "nope" not found\n');
  });
});

describe('操作', () => {
  it('Pod を消しても作り直される', () => {
    const name = run('kubectl get pods').out.split('\n')[1]?.split(' ')[0] ?? '';
    expect(run(`kubectl delete pod ${name}`).out).toContain('deleted');
    run('kubectl wait 6');
    const out = run('kubectl get pods').out;
    expect(out.trim().split('\n')).toHaveLength(3);
  });

  it('scale で数が変わる', () => {
    run('kubectl scale deploy web --replicas=4');
    run('kubectl wait 10');
    expect(run('kubectl get deploy').out).toContain('4/4');
  });

  it('replicas を指定しないと促す', () => {
    expect(run('kubectl scale deploy web').code).toBe(1);
  });

  it('cordon するとノードが SchedulingDisabled になる', () => {
    run('kubectl cordon n1');
    expect(run('kubectl get nodes').out).toContain('SchedulingDisabled');
  });

  it('Deployment を消すと Pod も消える', () => {
    run('kubectl delete deploy web');
    run('kubectl wait 3');
    expect(run('kubectl get pods').out).toContain('No resources found');
  });
});

describe('なぜ繋がらないかを調べる', () => {
  it('endpoints でセレクタと Ready の対応が見える', () => {
    const out = run('kubectl endpoints web').out;
    expect(out).toContain('IN ENDPOINTS');
    expect(out).toContain('app=web');
    expect(out).toContain('yes');
  });

  it('一致する Pod が無ければそう言う', () => {
    const cluster = session.state.cluster;
    if (!cluster) throw new Error('missing');
    const services = new Map(cluster.services);
    services.set('default/api', service('api', { app: 'api' }));
    session = { ...session, state: { ...session.state, cluster: { ...cluster, services } } };
    expect(run('kubectl endpoints api').out).toContain('一致する Pod がありません');
  });
});

describe('セレクタとラベルの修正', () => {
  it('セレクタを変えると Endpoints が埋まる', () => {
    const cluster = session.state.cluster;
    if (!cluster) throw new Error('missing');
    const services = new Map(cluster.services);
    const svc = services.get('default/web');
    if (!svc) throw new Error('missing');
    services.set('default/web', { ...svc, spec: { ...svc.spec, selector: { app: 'frontend' } }, status: { endpoints: [] } });
    session = { ...session, state: { ...session.state, cluster: { ...cluster, services } } };

    run('kubectl wait 2');
    expect(run('kubectl get svc').out).toContain('<none>');
    run('kubectl set selector svc web app=web');
    run('kubectl wait 2');
    expect(run('kubectl get svc').out).toContain('10.244.0.');
  });

  it('無い Service には設定できない', () => {
    expect(run('kubectl set selector svc nope app=x').code).toBe(1);
  });

  it('Pod にラベルを足せる', () => {
    const name = run('kubectl get pods').out.split('\n')[1]?.split(' ')[0] ?? '';
    expect(run(`kubectl label pod ${name} tier=front`).out).toContain('labeled');
    expect(run(`kubectl describe pod ${name}`).out).toContain('tier=front');
  });
});
