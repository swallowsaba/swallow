import { describe, expect, it } from 'vitest';
import { container, emptyCluster, node, pod, service } from '@/engines/k8s/factory';
import { key, type ClusterState, type Pod } from '@/engines/k8s/types';
import { createSession, type Session } from '@/engines/kernel/session';
import { execute } from '@/engines/kernel/shell';
import { buildCity } from './model';
import { DISTRICT_IDS } from './growth';
import { tourOf } from './tour';

const ALL = DISTRICT_IDS;

function place(state: ClusterState, pods: Pod[], nodeName: string): ClusterState {
  const map = new Map(state.pods);
  for (const p of pods) {
    map.set(key(p.metadata.namespace, p.metadata.name), {
      ...p,
      status: { ...p.status, nodeName, phase: 'Running' as const },
    });
  }
  return { ...state, pods: map };
}

/** バス停（Service）を 1 つ置いた街。ツアーの最後の停留所になる */
function withService(state: ClusterState): ClusterState {
  const svc = service('web', { app: 'web' });
  return { ...state, services: new Map([[key(svc.metadata.namespace, svc.metadata.name), svc]]) };
}

function k8sCity(state: ClusterState) {
  return buildCity({ cluster: state, unlocked: ALL });
}

describe('案内ツアー', () => {
  it('Kubernetes の街は、頼みごとが流れる順に巡る', () => {
    const cluster = withService(
      place(emptyCluster([node('n1', 4000, 8192)]), [pod('web', [container('c', 'nginx')])], 'n1'),
    );
    const titles = tourOf(k8sCity(cluster), 'k8s').map((s) => s.title);
    expect(titles).toEqual([
      '窓口（API サーバ）',
      '台帳（etcd）',
      '監督（コントローラ）',
      '配置係（スケジューラ）',
      'ビル（ノード）',
      '住人（Pod）',
      'バス停（Service）',
    ]);
  });

  it('住人がいなければ、住人の説明には寄らない', () => {
    const titles = tourOf(k8sCity(emptyCluster([node('n1', 4000, 8192)])), 'k8s').map((s) => s.title);
    expect(titles).not.toContain('住人（Pod）');
    expect(titles).toContain('ビル（ノード）');
  });

  it('何も建っていなければツアーは組めない', () => {
    expect(tourOf(buildCity({ unlocked: ALL }), 'k8s')).toEqual([]);
  });

  it('寄る先は、その区域に実際に建っている建物', () => {
    const city = k8sCity(emptyCluster([node('n1', 4000, 8192)]));
    const ids = new Set(city.buildings.filter((b) => b.district === 'k8s').map((b) => b.id));
    for (const stop of tourOf(city, 'k8s')) expect(ids.has(stop.building)).toBe(true);
  });

  it('同じ街からは必ず同じ道のりになる', () => {
    const city = k8sCity(emptyCluster([node('n1', 4000, 8192), node('n2', 4000, 8192)]));
    expect(tourOf(city, 'k8s')).toEqual(tourOf(city, 'k8s'));
  });

  it('Git の街は、倉庫 → 記念碑 → 旗 の順に巡る', () => {
    let session: Session = createSession({ files: { '/home/learner': null } });
    const run = (line: string) => {
      session = { ...session, state: execute(session.state, line, session.registry, session.clock).state };
    };
    run('git init');
    run('echo hello > /home/learner/a.txt');
    run('git add a.txt');
    run('git commit -m "first"');
    const city = buildCity({ vfs: session.state.vfs, git: session.state.git, unlocked: ALL });
    expect(tourOf(city, 'git').map((s) => s.title)).toEqual([
      '倉庫（インデックス）',
      '記念碑（コミット）',
      '旗（ブランチ）',
    ]);
  });

  it('どの停留所にも、これは何かと何のためにあるかが書いてある', () => {
    const cluster = place(
      emptyCluster([node('n1', 4000, 8192)]),
      [pod('web', [container('c', 'nginx')])],
      'n1',
    );
    for (const stop of tourOf(k8sCity(cluster), 'k8s')) {
      expect(stop.title.length).toBeGreaterThan(2);
      // 2〜3 行ぶん。用語だけを置いて済ませない
      expect(stop.body.length).toBeGreaterThan(40);
    }
  });
});
