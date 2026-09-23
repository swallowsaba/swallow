import { describe, expect, it } from 'vitest';
import { buildCity, whereabouts } from '@/city/model';
import { DISTRICT_IDS } from '@/city/growth';
import { createSession, type Session } from '@/engines/kernel/session';
import { execute } from '@/engines/kernel/shell';
import { container, emptyCluster, node, pod } from '@/engines/k8s/factory';
import { key, type ClusterState, type Pod } from '@/engines/k8s/types';
import { layoutCity, paramsFor } from './model';
import { TILE_METERS } from './palette';
import { between, hashString, intBetween, pick, stream, unit } from './seed';

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

function place(state: ClusterState, pods: Pod[], nodeName: string): ClusterState {
  const map = new Map(state.pods);
  for (const p of pods) {
    map.set(key(p.metadata.namespace, p.metadata.name), { ...p, status: { ...p.status, nodeName, phase: 'Running' as const } });
  }
  return { ...state, pods: map };
}

const cluster = (nodeName: string, tick = 9): ClusterState => ({
  ...place(emptyCluster([node('n1', 4000, 8192), node('n2', 4000, 8192)]), [pod('web', [container('c', 'nginx')])], nodeName),
  tick,
});

describe('seed から決める', () => {
  it('同じ seed と番号からは必ず同じ数が出る', () => {
    expect(unit(7, 3)).toBe(unit(7, 3));
    expect(unit(7, 3)).not.toBe(unit(7, 4));
    expect(unit(7, 3)).not.toBe(unit(8, 3));
  });

  it('0 以上 1 未満に収まる', () => {
    for (let i = 0; i < 500; i += 1) {
      const value = unit(hashString('tree'), i);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('範囲を指定して取れる', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(between(3, i, -2, 5)).toBeGreaterThanOrEqual(-2);
      expect(between(3, i, -2, 5)).toBeLessThan(5);
      const n = intBetween(3, i, 1, 4);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(4);
    }
  });

  it('選ぶものは必ず候補の中から出る', () => {
    const items = ['a', 'b', 'c'];
    for (let i = 0; i < 100; i += 1) expect(items).toContain(pick(items, 11, i));
  });

  it('引き出しは作った順に同じ数を出す。枝分かれさせても決定論', () => {
    const take = (n: number) => {
      const rng = stream(42);
      return Array.from({ length: n }, () => rng.unit());
    };
    expect(take(8)).toEqual(take(8));
    expect(stream(42).fork('trees').unit()).toBe(stream(42).fork('trees').unit());
    expect(stream(42).fork('trees').unit()).not.toBe(stream(42).fork('lamps').unit());
  });
});

describe('3D の街の配置', () => {
  it('更地では建物が 1 つも建たない', () => {
    const layout = layoutCity(buildCity({ unlocked: ALL }));
    expect(layout.buildings).toEqual([]);
  });

  it('街の広さはタイル 8m ぶん', () => {
    const city = buildCity({ unlocked: ALL });
    const layout = layoutCity(city);
    expect(layout.size).toEqual({ w: city.width * TILE_METERS, d: city.height * TILE_METERS });
  });

  it('同じ状態からは必ず同じ街になる', () => {
    const city = buildCity({ cluster: cluster('n1'), unlocked: ALL });
    expect(layoutCity(city)).toEqual(layoutCity(city));
  });

  it('seed を変えると見た目の振れ方が変わる', () => {
    const city = buildCity({ cluster: cluster('n1'), unlocked: ALL });
    const a = layoutCity(city, { seed: 1 });
    const b = layoutCity(city, { seed: 2 });
    expect(a.buildings.map((x) => x.rotation)).not.toEqual(b.buildings.map((x) => x.rotation));
    // 建つ場所は学習者が決めたもの。seed では動かない
    expect(a.buildings.map((x) => x.at)).toEqual(b.buildings.map((x) => x.at));
  });

  it('ノードは高層ビルになり、街の真ん中を原点にしたメートルで置かれる', () => {
    const city = buildCity({ cluster: cluster('n1'), unlocked: ALL });
    const towers = layoutCity(city).buildings.filter((b) => b.kind === 'tower');
    expect(towers).toHaveLength(2);
    for (const tower of towers) {
      expect(tower.params.kind).toBe('tower');
      expect(tower.params.floors).toBeGreaterThanOrEqual(10);
      expect(Math.abs(tower.at.x)).toBeLessThanOrEqual((city.width / 2) * TILE_METERS);
      expect(Math.abs(tower.at.z)).toBeLessThanOrEqual((city.height / 2) * TILE_METERS);
    }
  });

  it('住人は階に住む。階は 1 以上、その建物の階数以下', () => {
    const city = buildCity({ cluster: cluster('n1'), unlocked: ALL });
    const tower = layoutCity(city).buildings.find((b) => b.id === 'node:n1');
    expect(tower?.occupants).toHaveLength(1);
    const occupant = tower?.occupants[0];
    expect(occupant?.floor).toBeGreaterThanOrEqual(1);
    expect(occupant?.floor).toBeLessThanOrEqual(tower?.params.floors ?? 0);
  });

  it('引っ越してきた住人は、元の建物の場所を持つ', () => {
    const before = buildCity({ cluster: cluster('n1'), unlocked: ALL });
    const after = buildCity({ cluster: cluster('n2'), unlocked: ALL, before: whereabouts(before) });
    const layout = layoutCity(after);
    const moved = layout.buildings.find((b) => b.id === 'node:n2')?.occupants[0];
    const n1 = layout.buildings.find((b) => b.id === 'node:n1');
    expect(moved?.from).toEqual(n1?.at);
  });

  it('建設中の建物は建ち上がりが 1 に満たない', () => {
    const young = buildCity({ cluster: { ...emptyCluster([node('n1', 4000, 8192)]), tick: 0 }, unlocked: ALL });
    const done = buildCity({ cluster: { ...emptyCluster([node('n1', 4000, 8192)]), tick: 9 }, unlocked: ALL });
    expect(layoutCity(young).buildings[0]?.progress).toBeLessThan(1);
    expect(layoutCity(done).buildings[0]?.progress).toBe(1);
  });

  it('高い建物ほど上で細くなる（セットバック）。小屋には付かない', () => {
    const city = buildCity({ cluster: cluster('n1'), unlocked: ALL });
    const tower = layoutCity(city).buildings.find((b) => b.kind === 'tower');
    expect(tower?.params.setbacks.length).toBeGreaterThan(0);
    const sh = shell().run('mkdir /home/learner/work').run('touch /home/learner/work/a.txt');
    const hut = layoutCity(buildCity({ vfs: sh.state.vfs, unlocked: ALL })).buildings.find((b) => b.kind === 'hut');
    expect(hut?.params.setbacks).toEqual([]);
    expect(hut?.params.roof).toBe('gable');
  });

  it('区域は解放されているかどうかを持ち、メートルの広さになる', () => {
    const layout = layoutCity(buildCity({ unlocked: ['center'] }));
    expect(layout.districts.filter((d) => d.unlocked).map((d) => d.id)).toEqual(['center']);
    for (const district of layout.districts) {
      expect(district.w).toBeGreaterThan(0);
      expect(district.d).toBeGreaterThan(0);
    }
  });

  it('同じ id の建物は、街が変わっても同じ顔になる。使われると階が増える', () => {
    const empty = buildCity({ cluster: cluster('n1'), unlocked: ALL });
    const used = buildCity({ cluster: cluster('n2'), unlocked: ALL });
    const one = empty.buildings.find((x) => x.id === 'node:n2');
    const two = used.buildings.find((x) => x.id === 'node:n2');
    if (one === undefined || two === undefined) throw new Error('ビルが無い');
    const face = (b: typeof one) => {
      const { kind, shape, roof, seed, footprint } = paramsFor(b);
      return { kind, shape, roof, seed, footprint };
    };
    expect(face(one)).toEqual(face(two));
    // 住人が入ったぶんだけ高くなる
    expect(paramsFor(two).floors).toBeGreaterThan(paramsFor(one).floors);
  });
});
