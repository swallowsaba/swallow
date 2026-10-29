import { describe, expect, it } from 'vitest';
import { FACILITY_DEFS } from '@/city/facilities';
import type { Facility, Road } from '@/city/types';
import { NAME_PARTS, POLITICS_RULES } from '@/content/politics';
import { applyOp } from './commands';
import { factorIndex } from './layers';
import { DEFICIT_OUTPUT, facilityPowerDistrict, outageOf, plantOutput, powerGridOf, powerUse, stepPower, type PowerGrid } from './power';
import { spaceOf } from './space';
import type { World } from './types';
import { previewOf, weekStep } from './week';
import { stepDay, worldFromCity } from './world';
import { grownVillage } from './__fixtures__/cities';

/**
 * 電力（docs/game-design.md 24.1・docs/testing-strategy.md 10 章「需要・電力・公共サービス」）:
 * 道路網に沿う送電・陸揚げ所と外からの電気・輪番の停電の順・止まった建物（住宅の満足・事業者の売上・施設の技術力と雇用）・
 * 赤字の間の出力 7 割・移行した都市の上限
 */

const GROWN = grownVillage(120);
const T = GROWN.terrain;
const days = (world: World, n: number): World => {
  let w = world;
  for (let i = 0; i < n; i += 1) w = stepDay(w, T, POLITICS_RULES);
  return w;
};
const toWeekEnd = (w: World): World => days(w, 7 - (Math.floor(w.city.day) % 7));
/** 完成した施設（一般道の南に置く物は、入口を北の道路へ向ける） */
const active = (id: string, type: Facility['type'], x: number, y: number, level: Facility['level'] = 1): Facility => ({
  id, type, origin: { x, y }, rotation: 180, level, state: 'active', builtDay: 0, ...(FACILITY_DEFS[type].domain ? { domain: FACILITY_DEFS[type].domain } : {}),
});
const withFacilities = (w: World, ...fs: Facility[]): World => ({ ...w, city: { ...w.city, facilities: [...w.city.facilities, ...fs] } });
const withRoads = (w: World, ...rs: Road[]): World => ({ ...w, city: { ...w.city, roads: [...w.city.roads, ...rs] } });
const withCap = (w: World, mw: number): World => ({ ...w, sim: { ...w.sim, power: { ...w.sim.power, externalCapMW: mw } } });
const gridOf = (w: World): PowerGrid => powerGridOf(w, spaceOf(w.city, T), POLITICS_RULES);
/** 村から離れた、どこにもつながらない細い道（x 38〜43、y 40） */
const ISLAND: Road = { id: 'r-island', kind: 'lane', path: [{ x: 38.5, y: 40.5 }, { x: 43.5, y: 40.5 }] };

describe('来る電気と使う量（24.1）', () => {
  it('発電所の出力: 火力 40・太陽光 15。財政が赤字の間は 7 割。IT 施設は使う側（データセンターは 3 × Lv）', () => {
    expect(plantOutput({ type: 'power-thermal' }, false)).toBe(40);
    expect(plantOutput({ type: 'power-solar' }, false)).toBe(15);
    expect(plantOutput({ type: 'power-thermal' }, true)).toBeCloseTo(40 * DEFICIT_OUTPUT, 9);
    expect(plantOutput({ type: 'datacenter' }, false)).toBe(0);
    const dc = withFacilities(GROWN.world, active('dc', 'datacenter', 53, 48, 3));
    expect(powerUse(dc.city, POLITICS_RULES) - powerUse(GROWN.world.city, POLITICS_RULES)).toBeCloseTo(9, 9);
  });

  it('電気は道路に沿って届く: 陸揚げ所は一番大きい道路網へつながり、つながらない道路網の建物には外の電気が来ない', () => {
    const g = gridOf(GROWN.world);
    expect(g.nets).toHaveLength(1);
    expect(g.nets[0]?.landing).toBe(true);
    expect(g.nets[0]?.supply).toBe(GROWN.world.sim.power.externalCapMW);
    expect(g.nets[0]?.use).toBeCloseTo(powerUse(GROWN.world.city, POLITICS_RULES), 6);
    // 離れた道路に発電所を置くと、その網には発電所の電気だけが来る（村の網には足されない）
    const apart = withFacilities(withRoads(GROWN.world, ISLAND), active('p', 'power-solar', 39, 41));
    const g2 = gridOf(apart);
    expect(g2.nets).toHaveLength(2);
    const island = g2.nets.find((n) => !n.landing);
    const main = g2.nets.find((n) => n.landing);
    expect(island?.supply).toBe(15);
    expect(main?.supply).toBe(GROWN.world.sim.power.externalCapMW);
  });

  it('外から買う量は、陸揚げ所の網で発電所で足りない分（上限まで）', () => {
    const big = withFacilities(GROWN.world, active('dc', 'datacenter', 53, 48, 3));
    const use = gridOf(big).nets[0]?.use ?? 0;
    expect(gridOf(big).external).toBeCloseTo(Math.min(big.sim.power.externalCapMW, use), 6);
    // 発電所を足すと、外から買う量が減る
    const plant = withFacilities(big, active('p', 'power-thermal', 56, 48));
    expect(gridOf(plant).external).toBeCloseTo(Math.max(0, use - 40), 6);
  });
});

describe('輪番の停電（24.1）', () => {
  const grid = (use: number, supply: number, districts: [number, number][]): PowerGrid => ({
    net: new Int32Array(0), external: 0, nets: [{ use, supply, plants: 0, landing: true, districts: new Map(districts) }],
  });

  it('足りない分に届くまで、地区を番号の順に止める。止める始めの地区は回る（乱数でない）', () => {
    const g = grid(10, 6, [[5, 2], [7, 3], [9, 5]]);
    // 足りない 4: 5（2）と 7（3）で届く
    expect(outageOf(g, 0)).toEqual({ stopped: [5, 7], rotation: 8 });
    // 次の週は 8 から: 9（5）で届く
    expect(outageOf(g, 8)).toEqual({ stopped: [9], rotation: 10 });
    // 10 から回ると、番号の大きい方から一周して 5 へ
    expect(outageOf(g, 10)).toEqual({ stopped: [5, 7], rotation: 8 });
    // 足りていれば止めない
    expect(outageOf(grid(5, 6, [[5, 5]]), 3)).toEqual({ stopped: [], rotation: 3 });
  });

  it('週の終わりに次の週の停電を決め、直近 4 週の止まった地区から、地区ごとの止まった日を数える', () => {
    const dark = withCap(GROWN.world, 0);
    const space = spaceOf(dark.city, T);
    const w1 = stepPower(dark, space, POLITICS_RULES);
    const stopped = w1.sim.power.recent?.at(-1) ?? [];
    expect(stopped.length).toBeGreaterThan(0);
    for (const d of stopped) expect(w1.sim.power.outageDays[d]).toBe(7);
    let w = w1;
    for (let i = 0; i < 5; i += 1) w = stepPower(w, space, POLITICS_RULES);
    expect(w.sim.power.recent).toHaveLength(4);
    expect(Math.max(...w.sim.power.outageDays)).toBeLessThanOrEqual(28);
  });

  it('止まった地区の住宅は満足の電力の点が下がり、施設は技術力に数えない。学習の記録は変わらない', () => {
    const server = GROWN.world.city.facilities.find((f) => f.type === 'server') as Facility;
    const d = facilityPowerDistrict(server);
    const all = Array.from({ length: 144 }, (_, i) => i);
    const out: World = { ...GROWN.world, sim: { ...GROWN.world.sim, power: { ...GROWN.world.sim.power, recent: [all], outageDays: all.map(() => 7) } } };
    const next = stepDay(out, T, POLITICS_RULES);
    expect(next.city.techPower).toBe(GROWN.world.city.techPower - server.level);
    expect(stepDay({ ...out, sim: { ...out.sim, power: { ...out.sim.power, recent: [all.filter((x) => x !== d)] } } }, T, POLITICS_RULES).city.techPower).toBe(GROWN.world.city.techPower);
    const week = weekStep(out, T, false, POLITICS_RULES).world;
    const power = factorIndex('power');
    const pts = (week.history.breakdown.at(-1)?.factors[power] ?? []).reduce((a, b) => a + b, 0);
    expect(pts).toBeLessThan(0);
    expect((weekStep(GROWN.world, T, false, POLITICS_RULES).world.history.breakdown.at(-1)?.factors[power] ?? []).reduce((a, b) => a + b, 0)).toBe(0);
  });
});

describe('データセンターを増やすと止まり、発電所を足すと止まらない（G10 の完成条件）', () => {
  it('Lv の高いデータセンターで足りなくなると地区が止まり、新しい申請に電力の逼迫が強く立つ。火力の発電所を足すと止まらない', () => {
    const dcs = withFacilities(GROWN.world, active('dc1', 'datacenter', 53, 48, 3));
    const w = toWeekEnd(toWeekEnd(dcs));
    expect(w.sim.power.recent?.at(-1)?.length ?? 0).toBeGreaterThan(0);
    // 新しい申請（データセンター）に立つ電力の逼迫の強さは、余りが 0 以下なら 1
    const filed = applyOp(w, { kind: 'facility', type: 'datacenter', origin: { x: 46, y: 36 }, rotation: 0 }, T, POLITICS_RULES);
    const id = filed.applications.at(-1)?.id ?? '';
    const assessed = days(filed, 8);
    const power = assessed.applications.find((a) => a.id === id)?.objections.find((o) => o.reasonId === 'dc-power');
    expect(power?.strength).toBe(1);
    // 発電所を足すと、次の週から止まらない
    const plant = withFacilities(w, active('p', 'power-thermal', 56, 48));
    const after = toWeekEnd(plant);
    expect(after.sim.power.recent?.at(-1)).toEqual([]);
  });
});

describe('移行した都市は、移行した瞬間に停電しない（docs/data-model.md 12 章）', () => {
  it('外からの電気の上限 = max(8, 今の使う量 × 1.2)。移行した次の週も止まらない', () => {
    const city = withFacilities(GROWN.world, active('dc1', 'datacenter', 53, 48, 5), active('dc2', 'datacenter', 56, 48, 5)).city;
    const use = powerUse(city, POLITICS_RULES);
    expect(use).toBeGreaterThan(8);
    const moved = worldFromCity(city, T, NAME_PARTS);
    expect(moved.sim.power.externalCapMW).toBeGreaterThanOrEqual(use * 1.2 - 0.01);
    expect(moved.sim.power.externalCapMW).toBeLessThan(use * 1.2 + 0.01);
    expect(toWeekEnd(moved).sim.power.recent?.at(-1)).toEqual([]);
    // 使う量の少ない都市は 8
    expect(worldFromCity(GROWN.world.city, T, NAME_PARTS).sim.power.externalCapMW).toBe(8);
  });
});

describe('予算の支出（22.2）', () => {
  it('完成した公共サービスは 1 つ 30、発電所は火力 40・太陽光 15。外の電気は買った量 × 2', () => {
    const w0 = withFacilities(GROWN.world, active('c1', 'police', 53, 48), active('c2', 'power-solar', 55, 48));
    const w = toWeekEnd(w0);
    const spend = w.budget.ledger.at(-1)?.spend;
    expect(spend).toMatchObject({ services: 30, power: 15 });
    expect(spend?.external).toBeCloseTo(0, 6);
    // 太陽光 15 で足りる村は、外の電気を買わない
    expect(previewOf(w, T).space.civic).toHaveLength(2);
  });
});
