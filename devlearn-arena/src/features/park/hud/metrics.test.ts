import { describe, expect, it } from 'vitest';
import type { Building, City, Occupant } from '@/city/model';
import { CITIES } from '@/content/city';
import {
  buildRights, cityMetrics, clockOf, earnedRights, healthOf, milestoneOf, residentsOf, SPEED_RATE,
} from './metrics';

/** 指標を確かめるための、いちばん小さい街 */
function town(buildings: readonly Partial<Building>[]): City {
  return {
    width: 10,
    height: 10,
    tiles: [],
    roads: [],
    districts: [],
    plots: [],
    carts: [],
    sites: [],
    buildings: buildings.map((b, i) => ({
      id: b.id ?? `b${String(i)}`,
      kind: 'tower',
      x: 0, y: 0, w: 2, h: 2,
      level: 1,
      label: b.label ?? `b${String(i)}`,
      occupants: b.occupants ?? [],
      state: b.state ?? 'normal',
      phase: 'done',
      district: 'center',
    })),
  };
}

const who = (state: Occupant['state'], id: string): Occupant => ({ id, label: id, state });

describe('住人の数', () => {
  it('落ち着いて住んでいる人だけを数える', () => {
    const city = town([
      { occupants: [who('settled', 'a'), who('settled', 'b'), who('moving', 'c')] },
      { occupants: [who('sick', 'd'), who('gone', 'e')] },
    ]);
    expect(residentsOf(city)).toBe(2);
  });

  it('誰も住んでいなければ 0', () => {
    expect(residentsOf(town([{}]))).toBe(0);
  });
});

describe('健全度', () => {
  it('誰も住んでいない街は減点する材料が無いので 100', () => {
    expect(healthOf(town([]))).toBe(100);
    expect(healthOf(town([{}]))).toBe(100);
  });

  it('落ち着いている人の割合を百分率で返す', () => {
    const city = town([{ occupants: [who('settled', 'a'), who('settled', 'b'), who('sick', 'c'), who('moving', 'd')] }]);
    expect(healthOf(city)).toBe(50);
  });

  it('出て行った人は数えない', () => {
    const city = town([{ occupants: [who('settled', 'a'), who('gone', 'b')] }]);
    expect(healthOf(city)).toBe(100);
  });

  it('壊れた建物は住人 1 人ぶんの重さで引く', () => {
    const city = town([{ occupants: [who('settled', 'a')], state: 'broken' }]);
    expect(healthOf(city)).toBe(50);
  });
});

describe('建築権', () => {
  it('手順の通過と理解度の正解で増える', () => {
    expect(earnedRights({ floors: 3, houses: 2 })).toBe(5);
  });

  it('置いた分だけ減る。足りなくなっても負にはならない', () => {
    expect(buildRights({ floors: 3, houses: 2 }, 2)).toBe(3);
    expect(buildRights({ floors: 0, houses: 0 }, 4)).toBe(0);
  });
});

describe('指標をまとめて出す', () => {
  it('街・経験値・育ち・置いた数から導く', () => {
    const city = town([{ occupants: [who('settled', 'a'), who('sick', 'b')] }]);
    expect(cityMetrics({ city, xp: 1200, growth: { floors: 4, houses: 1 }, placed: 2 })).toEqual({
      residents: 1,
      xp: 1200,
      health: 50,
      rights: 3,
    });
  });
});

describe('街の段', () => {
  const missions = CITIES.git.facilities.flatMap((f, i) => [
    { id: `${f.id}/a`, chapterId: f.id },
    ...(i === 0 ? [{ id: `${f.id}/b`, chapterId: f.id }] : []),
  ]);

  it('何も終えていなければ 1 段目で、進みは 0', () => {
    const at = milestoneOf(CITIES.git, missions, new Set());
    expect(at.n).toBe(1);
    expect(at.ratio).toBe(0);
    expect(at.name).toBe(CITIES.git.facilities[0]?.name);
    expect(at.total).toBe(CITIES.git.facilities.length);
  });

  it('途中まで終えると、その段の進みが上がる', () => {
    const first = CITIES.git.facilities[0]?.id ?? '';
    const at = milestoneOf(CITIES.git, missions, new Set([`${first}/a`]));
    expect(at.n).toBe(1);
    expect(at.ratio).toBeCloseTo(0.5);
  });

  it('その段を終えると次の段へ進む', () => {
    const first = CITIES.git.facilities[0]?.id ?? '';
    const at = milestoneOf(CITIES.git, missions, new Set([`${first}/a`, `${first}/b`]));
    expect(at.n).toBe(2);
    expect(at.name).toBe(CITIES.git.facilities[1]?.name);
  });

  it('全部終えたら最後の段のまま、進みは 1', () => {
    const at = milestoneOf(CITIES.git, missions, new Set(missions.map((m) => m.id)));
    expect(at.n).toBe(CITIES.git.facilities.length);
    expect(at.ratio).toBe(1);
  });
});

describe('速さと時計', () => {
  it('止めると街は進まない。早送りは通常より速い', () => {
    expect(SPEED_RATE.pause).toBe(0);
    expect(SPEED_RATE.fast).toBeGreaterThan(SPEED_RATE.normal);
  });

  it('コマンドの数を分と秒に写す。日は取り組んだ日の数', () => {
    expect(clockOf(3, 18)).toEqual({ day: 3, tick: '00:18' });
    expect(clockOf(0, 0)).toEqual({ day: 1, tick: '00:00' });
    expect(clockOf(1, 125)).toEqual({ day: 1, tick: '02:05' });
  });
});
