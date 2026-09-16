import { describe, expect, it } from 'vitest';
import { allMissions } from './registry';
import { buildTown, FLOORS_PER_BUILDING, growthOf, rankOf, RESIDENTS, type TownMissionInput } from './town';

function missions(chapters: readonly number[], boss: readonly string[] = []): TownMissionInput[] {
  let order = 0;
  return chapters.flatMap((count, c) =>
    Array.from({ length: count }, (_, i) => {
      const chapterId = `git/${String(c + 1).padStart(2, '0')}`;
      const id = `${chapterId}/m${String(i)}`;
      return {
        id,
        title: id,
        track: 'git' as const,
        chapterId,
        lessonKind: boss.includes(id) ? ('boss' as const) : ('drill' as const),
        order: order++,
      };
    }),
  );
}

describe('町の組み立て', () => {
  it('章が地区になり、推奨順に決まった本数ずつ 1 棟の建物になる', () => {
    const town = buildTown('git', missions([FLOORS_PER_BUILDING + 2, 3]), new Set());
    expect(town.districts.map((d) => d.chapterId)).toEqual(['git/01', 'git/02']);
    expect(town.districts[0]?.buildings.map((b) => b.floors.length)).toEqual([FLOORS_PER_BUILDING, 2]);
    expect(town.stats.floors).toBe(FLOORS_PER_BUILDING + 5);
    expect(town.stats.population).toBe(0);
    expect(town.districts[0]?.buildings[0]?.state).toBe('lot');
  });

  it('任務を終えるごとに 1 階ずつ建ち、全部終えると完成して人が増える', () => {
    const list = missions([3]);
    const one = buildTown('git', list, new Set(['git/01/m0']));
    expect(one.districts[0]?.buildings[0]?.state).toBe('construction');
    expect(one.districts[0]?.buildings[0]?.built).toBe(1);
    expect(one.stats.population).toBe(RESIDENTS.perFloor);
    const all = buildTown('git', list, new Set(list.map((m) => m.id)));
    expect(all.districts[0]?.buildings[0]?.state).toBe('complete');
    expect(all.stats.population).toBe(3 * RESIDENTS.perFloor + RESIDENTS.perBuilding);
    expect(all.nextMissionId).toBeNull();
  });

  it('手を付けただけの任務がある建物は工事中になる', () => {
    const town = buildTown('git', missions([3]), new Set(), new Set(['git/01/m1']));
    expect(town.districts[0]?.buildings[0]?.state).toBe('construction');
    expect(town.districts[0]?.buildings[0]?.floors[1]?.started).toBe(true);
  });

  it('障害対応を含む建物は名所。完成すると多く人が増える', () => {
    const list = missions([2], ['git/01/m1']);
    const town = buildTown('git', list, new Set(list.map((m) => m.id)));
    expect(town.districts[0]?.buildings[0]?.landmark).toBe(true);
    expect(town.stats.landmarks).toBe(1);
    expect(town.stats.population).toBe(2 * RESIDENTS.perFloor + RESIDENTS.perLandmark);
  });

  it('次にやる任務のある建物に印が付き、前の地区で 1 本終えると次の地区が開拓される', () => {
    const list = missions([2, 2, 2]);
    const before = buildTown('git', list, new Set());
    expect(before.districts.map((d) => d.opened)).toEqual([true, false, false]);
    expect(before.districts[0]?.buildings[0]?.next).toBe(true);
    const after = buildTown('git', list, new Set(['git/01/m0']));
    expect(after.districts.map((d) => d.opened)).toEqual([true, true, false]);
  });

  it('ほかの世界の任務は混ざらない', () => {
    const other: TownMissionInput = { id: 'k8s/01/a', title: 'a', track: 'k8s', chapterId: 'k8s/01', lessonKind: 'drill', order: 99 };
    expect(buildTown('git', [...missions([2]), other], new Set()).stats.floors).toBe(2);
  });

  it('格は人口で上がり、祝いの画面に出す育ち方が分かる', () => {
    expect(rankOf(0).rank).toBe('hamlet');
    expect(rankOf(30).rank).toBe('village');
    expect(rankOf(999999).next).toBeNull();
    const list = missions([FLOORS_PER_BUILDING * 2]);
    const cleared = new Set(list.slice(0, FLOORS_PER_BUILDING - 1).map((m) => m.id));
    const before = buildTown('git', list, cleared);
    const last = list[FLOORS_PER_BUILDING - 1]?.id ?? '';
    const after = buildTown('git', list, new Set([...cleared, last]));
    const growth = growthOf(before, after, last);
    expect(growth?.completed).toBe(true);
    expect(growth?.built).toBe(FLOORS_PER_BUILDING);
    expect(growth?.populationGain).toBe(RESIDENTS.perFloor + RESIDENTS.perBuilding);
    expect(growth?.rankUp).toBeNull();

    // 1 棟完成（人口 28）のあと、次の建物に 1 階建つと 30 を超えて村になる
    const firstNext = list[FLOORS_PER_BUILDING]?.id ?? '';
    const grown = buildTown('git', list, new Set([...cleared, last, firstNext]));
    const second = growthOf(after, grown, firstNext);
    expect(second?.completed).toBe(false);
    expect(second?.rankUp).toBe('village');
  });

  it('実際の全任務で、どの世界にも町ができ、全任務がどこかの建物に入る', () => {
    const all = allMissions();
    for (const track of ['kernel', 'git', 'k8s', 'net', 'github'] as const) {
      const town = buildTown(track, all, new Set());
      const floors = town.districts.flatMap((d) => d.buildings.flatMap((b) => b.floors));
      expect(floors.length).toBe(all.filter((m) => m.track === track).length);
      expect(town.districts.length).toBeGreaterThan(0);
    }
  });
});
