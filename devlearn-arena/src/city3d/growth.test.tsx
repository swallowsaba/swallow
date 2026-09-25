import { describe, expect, it } from 'vitest';
import { buildCity } from '@/city/model';
import { DISTRICT_IDS } from '@/city/growth';
import { createSession, type Session } from '@/engines/kernel/session';
import { execute } from '@/engines/kernel/shell';
import { emptyCluster, node } from '@/engines/k8s/factory';
import { growCity, growthOf } from '@/features/citymap/cityStore';
import { useStore } from '@/store';
import { layoutCity, paramsFor } from './model';
import { buildCityScene, DRAW_CALL_LIMIT } from './scene';

const ALL = DISTRICT_IDS;

function learnerCity(growth: { houses: number; floors: number }) {
  let session: Session = createSession({ files: { '/home/learner': null } });
  for (const line of ['mkdir work', 'echo hi > work/a.txt']) {
    session = { ...session, state: execute(session.state, line, session.registry, session.clock).state };
  }
  return buildCity({
    vfs: session.state.vfs,
    cluster: { ...emptyCluster([node('n1', 4000, 8192)]), tick: 9 },
    unlocked: ALL,
    growth,
  });
}

describe('街は学習者が設計する', () => {
  it('学習者が何も作っていなければ、街には何も建たない', () => {
    const city = buildCity({ unlocked: ALL });
    expect(city.buildings).toEqual([]);
    expect(layoutCity(city).buildings).toEqual([]);
  });

  it('OS が最初から持っているディレクトリでは建物が建たない', () => {
    const session = createSession({ files: { '/home/learner': null } });
    const city = buildCity({ vfs: session.state.vfs, unlocked: ALL });
    expect(city.buildings).toEqual([]);
  });

  it('学習者が資源を作った所にだけ建つ。ほかに建つのは、クラスタの管制だけ', () => {
    const city = learnerCity({ houses: 0, floors: 0 });
    expect(city.buildings.map((b) => b.id).sort()).toEqual([
      // 管制の 4 施設。ノードがある＝Kubernetes が動いているので、これは飾りではない
      'cp:api', 'cp:controller', 'cp:scheduler', 'cp:store',
      'file:/home/learner/work/a.txt',
      'node:n1',
    ]);
  });

  it('クラスタが無ければ管制も建たない', () => {
    const session = createSession({ files: { '/home/learner': null } });
    const city = buildCity({ vfs: session.state.vfs, unlocked: ALL });
    expect(city.buildings.filter((b) => b.id.startsWith('cp:'))).toEqual([]);
  });
});

describe('街はコマンドの成功でもクイズの正解でも育つ', () => {
  it('コマンドの手順を通すと、建物の階が増える', () => {
    const before = learnerCity({ houses: 0, floors: 0 });
    const after = learnerCity({ houses: 0, floors: 4 });
    const tall = (city: ReturnType<typeof buildCity>) =>
      city.buildings.reduce((sum, b) => sum + paramsFor(b).floors, 0);
    expect(tall(after)).toBe(tall(before) + 4);
  });

  it('階は建てた順に 1 つずつ配られる（1 本通せば必ずどこかが伸びる）', () => {
    for (let floors = 1; floors <= 3; floors += 1) {
      const city = learnerCity({ houses: 0, floors });
      const sum = city.buildings.reduce((total, b) => total + (b.bonusFloors ?? 0), 0);
      expect({ floors, sum }).toEqual({ floors, sum: floors });
    }
  });

  it('理解度の問題に正解すると、住民の家が増える', () => {
    const none = learnerCity({ houses: 0, floors: 0 });
    const three = learnerCity({ houses: 3, floors: 0 });
    expect(three.buildings.length).toBe(none.buildings.length + 3);
    expect(three.buildings.filter((b) => b.id.startsWith('home:'))).toHaveLength(3);
  });

  it('家は毎回同じ所に並ぶ（決定論）', () => {
    expect(learnerCity({ houses: 4, floors: 2 })).toEqual(learnerCity({ houses: 4, floors: 2 }));
  });

  it('育ちは 3D の街にも出る。窓も増える', () => {
    const small = buildCityScene(layoutCity(learnerCity({ houses: 0, floors: 0 })));
    const grown = buildCityScene(layoutCity(learnerCity({ houses: 6, floors: 12 })));
    expect(grown.windows.total).toBeGreaterThan(small.windows.total);
    small.dispose();
    grown.dispose();
  });

  it('街が育っても描画呼び出しは増えない（材質ごとにまとめているため）', () => {
    const few = buildCityScene(layoutCity(learnerCity({ houses: 6, floors: 12 })));
    const many = buildCityScene(layoutCity(learnerCity({ houses: 24, floors: 60 })));
    expect(many.windows.total).toBeGreaterThan(few.windows.total);
    expect(many.drawCalls).toBe(few.drawCalls);
    expect(many.drawCalls).toBeLessThanOrEqual(DRAW_CALL_LIMIT);
    few.dispose();
    many.dispose();
  });

  it('更地のままでも家が増えれば街ができる（クイズだけでも育つ）', () => {
    const city = buildCity({ unlocked: ALL, growth: { houses: 2, floors: 5 } });
    expect(city.buildings).toHaveLength(2);
    expect(layoutCity(city).buildings).toHaveLength(2);
  });
});

describe('育ちの数え方', () => {
  it('コマンドの手順では階、正解では家が増える', () => {
    useStore.getState().resetProgress(0);
    expect(growthOf(useStore.getState().growth, 'git')).toEqual({ houses: 0, floors: 0 });
    growCity('git', 'floors', 2);
    growCity('git', 'houses');
    expect(growthOf(useStore.getState().growth, 'git')).toEqual({ houses: 1, floors: 2 });
    // 別のカテゴリの街は別に数える
    expect(growthOf(useStore.getState().growth, 'k8s')).toEqual({ houses: 0, floors: 0 });
    useStore.getState().resetProgress(0);
  });
});
