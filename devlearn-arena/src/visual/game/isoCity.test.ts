import { describe, expect, it } from 'vitest';
import { CITIES, type FacilityState, type FacilityStatus } from '@/content/city';
import { BLOCK, buildIsoCity, INNER, landmarkFloors } from './isoCity';

const plan = CITIES.git;

function statuses(states: readonly FacilityState[], ratio = 0): FacilityStatus[] {
  return plan.facilities.map((facility, i) => ({
    facility,
    state: states[i] ?? 'locked',
    missionsCleared: 0,
    missionsTotal: 10,
    ratio: states[i] === 'operating' || states[i] === 'complete' ? ratio : 0,
  }));
}

describe('アイソメトリックの街の配置', () => {
  it('道路が一定間隔で街を区切り、施設ごとに 1 つの地区ができる', () => {
    const city = buildIsoCity(statuses([]));
    expect(city.districts).toHaveLength(plan.facilities.length);
    const road = city.tiles.filter((t) => t.kind === 'road');
    expect(road.every((t) => t.gx % BLOCK === 0 || t.gy % BLOCK === 0)).toBe(true);
    for (const d of city.districts) {
      const inside = city.tiles.filter((t) => t.gx >= d.gx && t.gx < d.gx + INNER && t.gy >= d.gy && t.gy < d.gy + INNER);
      expect(inside).toHaveLength(INNER * INNER);
      expect(inside.some((t) => t.kind === 'road')).toBe(false);
    }
  });

  it('未開拓の地区は森で建物が無く、建設できる地区は区画割りだけ', () => {
    const city = buildIsoCity(statuses(['available']));
    const first = city.districts[0];
    const second = city.districts[1];
    const kinds = (d: typeof first) =>
      new Set(city.tiles.filter((t) => d && t.gx >= d.gx && t.gx < d.gx + INNER && t.gy >= d.gy && t.gy < d.gy + INNER).map((t) => t.kind));
    expect(kinds(first)).toEqual(new Set(['plan']));
    expect(kinds(second)).toEqual(new Set(['forest']));
    expect(city.buildings).toHaveLength(0);
    expect(city.trees.length).toBeGreaterThan(0);
    expect(city.cars).toHaveLength(0);
  });

  it('施設を建てると名所が建ち、車が走り始める', () => {
    const city = buildIsoCity(statuses(['built']));
    const landmark = city.buildings.find((b) => b.facilityId === plan.facilities[0]?.id);
    expect(landmark).toMatchObject({ w: 2, d: 2, kind: plan.facilities[0]?.building });
    expect(city.cars.length).toBeGreaterThan(0);
  });

  it('稼働が進むほど、地区のビルが増え、高くなる', () => {
    const count = (ratio: number) => {
      const city = buildIsoCity(statuses(['operating'], ratio));
      const lots = city.buildings.filter((b) => b.facilityId === undefined);
      return { n: lots.length, tallest: Math.max(0, ...lots.map((b) => b.floors)) };
    };
    const low = count(0.1);
    const high = count(0.9);
    expect(high.n).toBeGreaterThan(low.n);
    expect(high.tallest).toBeGreaterThan(low.tallest);
    const full = buildIsoCity(statuses(['complete'], 1));
    expect(full.districts[0]?.built).toBe(full.districts[0]?.lots);
  });

  it('何度作っても同じ街になる', () => {
    const states: FacilityState[] = ['complete', 'operating', 'built', 'available'];
    expect(buildIsoCity(statuses(states, 0.5))).toEqual(buildIsoCity(statuses(states, 0.5)));
  });

  it('建物は奥から手前の順に並ぶ（重なりが正しく見える）', () => {
    const city = buildIsoCity(statuses(['complete', 'complete', 'operating'], 1));
    const depth = city.buildings.map((b) => b.gx + b.w + b.gy + b.d);
    expect([...depth].sort((a, b) => a - b)).toEqual(depth);
  });

  it('名所は種類で高さが違い、稼働すると伸びる', () => {
    expect(landmarkFloors('tower', 0)).toBeGreaterThan(landmarkFloors('house', 0));
    expect(landmarkFloors('hall', 1)).toBeGreaterThan(landmarkFloors('hall', 0));
  });
});
