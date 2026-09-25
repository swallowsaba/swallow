import { describe, expect, it } from 'vitest';
import { buildCity, type City } from '@/city/model';
import { createSession, type Session } from '@/engines/kernel/session';
import { execute } from '@/engines/kernel/shell';
import { emptyCluster, node } from '@/engines/k8s/factory';
import type { ClusterState } from '@/engines/k8s/types';
import { layoutCity } from './model';
import { countProps } from './props';
import { severed } from './scene';

/** 空のクラスタから始めて、行を順に打った結果のクラスタ */
function afterCommands(lines: readonly string[]): ClusterState {
  let session: Session = createSession({
    cluster: emptyCluster([node('node-1', 2000, 4096)]),
    files: { '/home/learner': null },
  });
  for (const line of lines) {
    session = { ...session, state: execute(session.state, line, session.registry, session.clock).state };
  }
  const cluster = session.state.cluster;
  if (cluster === null) throw new Error('クラスタが無い');
  return cluster;
}

function cityOf(cluster: ClusterState): City {
  return buildCity({ cluster, unlocked: ['k8s'] });
}

const counts = (cluster: ClusterState) => countProps(layoutCity(cityOf(cluster)).props);

describe('街を歩く住人', () => {
  it('入居を待っている住人は、道からビルへ歩いている', () => {
    // 置き場所は決まったが、まだ起動していない（Pending のまま）
    const cluster = afterCommands(['kubectl run web --image=nginx', 'kubectl wait 1']);
    const pod = cluster.pods.get('default/web');
    expect(pod?.status.nodeName).not.toBeNull();
    expect(pod?.status.phase).not.toBe('Running');
    expect(counts(cluster).resident).toBeGreaterThan(0);
  });

  it('入居できた住人は歩くのをやめる。姿ではなく窓の灯りで表す', () => {
    const cluster = afterCommands(['kubectl run web --image=nginx', 'kubectl wait 20']);
    expect(cluster.pods.get('default/web')?.status.phase).toBe('Running');
    expect(counts(cluster).resident).toBe(0);
  });

  it('倒れた住人は伏せ、担架が運び出す', () => {
    // 取れないイメージ。何度やり直しても起動できず、待たされ続ける
    const cluster = afterCommands(['kubectl run web --image=does-not-exist', 'kubectl wait 30']);
    const got = counts(cluster);
    expect(got.fallen).toBeGreaterThan(0);
    expect(got.carrier).toBe(got.fallen);
  });

  it('住人が 1 人もいなければ、歩く人も担架も置かない', () => {
    const got = counts(afterCommands([]));
    expect({ resident: got.resident, fallen: got.fallen, carrier: got.carrier }).toEqual({
      resident: 0,
      fallen: 0,
      carrier: 0,
    });
  });

  it('住人は建物の足元の外に立つ（壁にめり込ませない）', () => {
    const cluster = afterCommands(['kubectl run web --image=nginx', 'kubectl wait 1']);
    const layout = layoutCity(cityOf(cluster));
    const walkers = layout.props.filter((p) => p.kind === 'resident' || p.kind === 'fallen' || p.kind === 'carrier');
    expect(walkers.length).toBeGreaterThan(0);
    for (const walker of walkers) {
      const start = walker.path?.points[0];
      expect(start).toBeDefined();
      for (const building of layout.buildings) {
        const half = Math.max(building.params.footprint.w, building.params.footprint.d) / 2;
        const gap = Math.hypot((start?.x ?? 0) - building.at.x, (start?.z ?? 0) - building.at.z);
        expect({ id: building.id, outside: gap > half }).toEqual({ id: building.id, outside: true });
      }
    }
  });
});

describe('塞がれた道', () => {
  it('真ん中を空けて 2 本に断ち、切り口を 2 か所返す', () => {
    const cut = severed([{ x: 0, z: 0 }, { x: 100, z: 0 }]);
    expect(cut.runs).toHaveLength(2);
    expect(cut.ends).toHaveLength(2);
    // 断ち切った所に隙間がある
    const nearEnd = cut.runs[0]?.[(cut.runs[0]?.length ?? 1) - 1];
    const farStart = cut.runs[1]?.[0];
    expect((farStart?.x ?? 0) - (nearEnd?.x ?? 0)).toBeGreaterThan(5);
  });

  it('断っても、道の端は元のまま残る', () => {
    const cut = severed([{ x: -40, z: 0 }, { x: 40, z: 0 }]);
    expect(cut.runs[0]?.[0]).toEqual({ x: -40, z: 0 });
    expect(cut.runs[1]?.[(cut.runs[1]?.length ?? 1) - 1]).toEqual({ x: 40, z: 0 });
  });
});
