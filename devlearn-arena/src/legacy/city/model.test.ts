import { describe, expect, it } from 'vitest';
import { createSession, type Session } from '@/engines/kernel/session';
import { execute } from '@/engines/kernel/shell';
import { advanceCluster } from '@/engines/k8s/controllers';
import { container, emptyCluster, node, pod } from '@/engines/k8s/factory';
import { tickPods } from '@/engines/k8s/kubelet';
import type { ClusterState, Pod } from '@/engines/k8s/types';
import { key } from '@/engines/k8s/types';
import { buildCity, whereabouts, type CityInput } from './model';
import { DISTRICT_IDS, unlockedDistricts } from './growth';

/** 全区域を開いた街。区域ごとの解放そのものは growth.test.ts で調べる */
const ALL = DISTRICT_IDS;

function shell(files: Record<string, string | null> = { '/home/learner': null }) {
  let session: Session = createSession({ files });
  return {
    run(line: string) {
      session = { ...session, state: execute(session.state, line, session.registry, session.clock).state };
      return this;
    },
    get state() {
      return session.state;
    },
  };
}

/** あとから加わったノード（kubeadm join）。最初からあるノードは建ち上がり済みとして扱う */
function joined(name: string, at: number) {
  const n = node(name, 4000, 8192);
  return { ...n, metadata: { ...n.metadata, createdAt: at } };
}

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

describe('更地から始まる', () => {
  it('何も無い状態からは建物が 1 つも建たない', () => {
    const city = buildCity({});
    expect(city.buildings).toEqual([]);
    expect(city.plots).toEqual([]);
  });

  it('OS のディレクトリだけがある状態でも建物は建たない。建つのは学習者が作ったものだけ', () => {
    const sh = shell({ '/etc': null, '/home/learner': null, '/etc/hosts': '127.0.0.1 localhost\n' });
    const city = buildCity({ vfs: sh.state.vfs, unlocked: ALL });
    expect(city.buildings).toEqual([]);
    expect(city.plots).toEqual([]);
  });

  it('開いていない区域には、資源があっても何も建たない', () => {
    const sh = shell().run('mkdir /home/learner/work');
    expect(buildCity({ vfs: sh.state.vfs }).plots).toEqual([]);
    expect(buildCity({ vfs: sh.state.vfs, unlocked: ['center', 'kernel'] }).plots).toHaveLength(1);
  });
});

describe('ファイルとディレクトリ', () => {
  it('mkdir でディレクトリを作ると、更地に区画が 1 つ引かれる', () => {
    const sh = shell().run('mkdir /home/learner/work');
    const city = buildCity({ vfs: sh.state.vfs, unlocked: ALL });
    expect(city.plots.map((p) => p.label)).toEqual(['work']);
    // 区画の地面は舗装される
    const tile = city.tiles.find((t) => t.x === city.plots[0]?.x && t.y === city.plots[0]?.y);
    expect(tile?.kind).toBe('plot');
  });

  it('ファイルは小屋になり、中身が増えると育つ', () => {
    const sh = shell().run('echo hi > /home/learner/memo.txt');
    const small = buildCity({ vfs: sh.state.vfs, unlocked: ALL }).buildings[0];
    expect(small).toMatchObject({ kind: 'hut', label: 'memo.txt' });

    sh.run('seq 1 200 >> /home/learner/memo.txt');
    const big = buildCity({ vfs: sh.state.vfs, unlocked: ALL }).buildings[0];
    expect(big?.level).toBeGreaterThan(small?.level ?? 0);
  });
});

describe('Kubernetes', () => {
  it('ノードを 2 つ足すと高層ビルが 2 棟建つ', () => {
    const cluster = emptyCluster([node('n1', 4000, 8192), node('n2', 4000, 8192)]);
    const towers = buildCity({ cluster, unlocked: ALL }).buildings.filter((b) => b.kind === 'tower');
    expect(towers.map((b) => b.label)).toEqual(['n1', 'n2']);
  });

  it('あとから加わったビルは工事中で、数 tick かけて建ち上がる', () => {
    const cluster = { ...emptyCluster([joined('n1', 1)]), tick: 1 };
    const towerAt = (state: ClusterState) =>
      buildCity({ cluster: state, unlocked: ALL }).buildings.find((b) => b.kind === 'tower');
    expect(towerAt(cluster)?.state).toBe('building');
    expect(towerAt({ ...cluster, tick: 6 })?.state).toBe('normal');
  });

  it('学習者が来る前からあるビルは、最初から建ち上がっている', () => {
    const cluster = emptyCluster([node('n1', 4000, 8192)]);
    const tower = buildCity({ cluster, unlocked: ALL }).buildings.find((b) => b.kind === 'tower');
    expect(tower?.state).toBe('normal');
    expect(tower?.phase).toBe('done');
  });

  it('Pod を配置すると、そのノードのビルの住人になる', () => {
    const cluster = place(
      emptyCluster([node('n1', 4000, 8192), node('n2', 4000, 8192)]),
      [pod('web', [container('c', 'nginx')])],
      'n1',
    );
    const city = buildCity({ cluster: { ...cluster, tick: 9 }, unlocked: ALL });
    const n1 = city.buildings.find((b) => b.id === 'node:n1');
    const n2 = city.buildings.find((b) => b.id === 'node:n2');
    expect(n1?.occupants.map((o) => o.label)).toEqual(['web']);
    expect(n1?.occupants[0]?.state).toBe('settled');
    expect(n2?.occupants).toEqual([]);
  });

  it('Pod を別ノードへ移すと、住人が移り、どこから来たかが残る', () => {
    const base = emptyCluster([node('n1', 4000, 8192), node('n2', 4000, 8192)]);
    const before = buildCity({
      cluster: { ...place(base, [pod('web', [container('c', 'nginx')])], 'n1'), tick: 9 },
      unlocked: ALL,
    });
    const after = buildCity({
      cluster: { ...place(base, [pod('web', [container('c', 'nginx')])], 'n2'), tick: 9 },
      unlocked: ALL,
      before: whereabouts(before),
    });
    expect(after.buildings.find((b) => b.id === 'node:n1')?.occupants).toEqual([]);
    const moved = after.buildings.find((b) => b.id === 'node:n2')?.occupants[0];
    expect(moved?.label).toBe('web');
    expect(moved?.from).toBe('node:n1');
  });

  it('Pod を消すと住人が消える', () => {
    const base = emptyCluster([node('n1', 4000, 8192)]);
    const withPod = buildCity({
      cluster: { ...place(base, [pod('web', [container('c', 'nginx')])], 'n1'), tick: 9 },
      unlocked: ALL,
    });
    expect(withPod.buildings.find((b) => b.id === 'node:n1')?.occupants).toHaveLength(1);
    const gone = buildCity({ cluster: { ...base, tick: 9 }, unlocked: ALL });
    expect(gone.buildings.find((b) => b.id === 'node:n1')?.occupants).toEqual([]);
  });

  it('消された住人は、次の街で 1 度だけビルから出ていく姿になり、その次には消えている（REWORK 7-3）', () => {
    const base = emptyCluster([node('n1', 4000, 8192)]);
    const withPod = buildCity({
      cluster: { ...place(base, [pod('web', [container('c', 'nginx')])], 'n1'), tick: 9 },
      unlocked: ALL,
    });
    const leaving = buildCity({ cluster: { ...base, tick: 9 }, unlocked: ALL, before: whereabouts(withPod) });
    const out = leaving.buildings.find((b) => b.id === 'node:n1')?.occupants;
    expect(out?.map((o) => [o.label, o.state])).toEqual([['web', 'gone']]);
    // 出ていった住人は、居場所の記録に残さない。次の街ではもういない
    expect(whereabouts(leaving).has('pod:default/web')).toBe(false);
    const later = buildCity({ cluster: { ...base, tick: 10 }, unlocked: ALL, before: whereabouts(leaving) });
    expect(later.buildings.find((b) => b.id === 'node:n1')?.occupants).toEqual([]);
  });

  it('倒れ続ける住人は、倒れた姿になる', () => {
    let cluster = place(
      emptyCluster([node('n1', 4000, 8192)]),
      [pod('boom', [container('c', 'crash-app')])],
      'n1',
    );
    for (let i = 0; i < 12; i += 1) cluster = advanceCluster(cluster, tickPods);
    const city = buildCity({ cluster, unlocked: ALL });
    const resident = city.buildings.find((b) => b.id === 'node:n1')?.occupants[0];
    expect(resident?.state).toBe('sick');
  });
});

describe('Git', () => {
  function repo() {
    return shell({ '/home/learner': null, '/home/learner/a.txt': 'A\n', '/home/learner/b.txt': 'B\n' })
      .run('cd /home/learner')
      .run('git init');
  }
  const input = (sh: ReturnType<typeof repo>): CityInput => ({ git: sh.state.git, unlocked: ALL });

  it('commit を 2 回すると、記念碑が 2 つ、歴史通りに沿って並ぶ', () => {
    const sh = repo().run('git add a.txt').run('git commit -m first').run('git add b.txt').run('git commit -m second');
    const monuments = buildCity(input(sh)).buildings.filter((b) => b.kind === 'monument');
    expect(monuments).toHaveLength(2);
    // 同じ通り沿い（同じ行）に、左から順に並ぶ
    expect(monuments[0]?.y).toBe(monuments[1]?.y);
    expect(monuments[0]?.x).toBeLessThan(monuments[1]?.x ?? 0);
    expect(monuments.every((m) => m.district === 'git')).toBe(true);
  });

  it('コミットのたびに通りが伸び、ブランチを分けると通りが分岐する', () => {
    const sh = repo().run('git add a.txt').run('git commit -m first');
    const before = buildCity(input(sh)).roads.length;
    sh.run('git switch -c feature');
    expect(buildCity(input(sh)).roads.length).toBeGreaterThan(before);
    expect(buildCity(input(sh)).buildings.filter((b) => b.kind === 'flag').map((b) => b.label).sort()).toEqual([
      'feature',
      'main',
    ]);
  });

  it('add したファイルは倉庫に運ばれ、どの小屋から来たかが残る', () => {
    const sh = repo().run('git add a.txt');
    const depot = buildCity(input(sh)).buildings.find((b) => b.kind === 'depot');
    expect(depot?.occupants.map((o) => o.label)).toEqual(['a.txt']);
    expect(depot?.occupants[0]?.from).toBe('file:/home/learner/a.txt');
    expect(depot?.state).toBe('busy');
  });
});

describe('決まりごと', () => {
  it('同じ状態からは必ず同じ街になる', () => {
    const sh = shell().run('mkdir /home/learner/work').run('echo hi > /home/learner/work/a.txt').run('cd /home/learner').run('git init').run('git add .').run('git commit -m first');
    const cluster = place(emptyCluster([node('n1', 4000, 8192)]), [pod('web', [container('c', 'nginx')])], 'n1');
    const make = () =>
      buildCity({ vfs: sh.state.vfs, git: sh.state.git, cluster: { ...cluster, tick: 9 }, unlocked: ALL });
    expect(JSON.stringify(make())).toBe(JSON.stringify(make()));
  });

  it('解放した区域だけが開き、区域の数は変わらない', () => {
    const city = buildCity({ unlocked: unlockedDistricts([]) });
    expect(city.districts).toHaveLength(DISTRICT_IDS.length);
    expect(city.districts.filter((d) => d.unlocked).map((d) => d.track)).toEqual(['center']);
  });
});
