import { describe, expect, it } from 'vitest';
import {
  advanceDays, autoPlace, complaintDay, complaintPopulation, moveFacility, nextComplaint, unrestOf, voicesOf,
  type CivicFacility,
} from './civic';
import { analyze, applyTool, COST, createCity, HIGHWAY_LENGTH, HIGHWAY_ROW, SIZE, START_MONEY, type FacilityInfo } from './sim';

const FLAT = 'g'.repeat(SIZE * SIZE);

const facilities = (states: string[], ratios: number[] = []): CivicFacility[] =>
  states.map((state, i) => ({ id: `f${String(i)}`, state, ratio: ratios[i] ?? 0 }));

describe('住民の声', () => {
  it('街ができる前は苦情が来ない。住民が住むか日がたつと、次の施設の苦情が届く', () => {
    const list = facilities(['available', 'locked']);
    expect(voicesOf(list, 0, 0)).toEqual([]);
    expect(voicesOf(list, 1, 0)).toEqual([{ kind: 'complaint', facilityId: 'f0' }]);
    expect(voicesOf(list, 0, complaintDay(0))).toEqual([{ kind: 'complaint', facilityId: 'f0' }]);
    expect(nextComplaint(list, 0, 0)).toEqual({ facilityId: 'f0', population: complaintPopulation(0), day: complaintDay(0) });
  });

  it('後の施設ほど、苦情が届くのに大きな街が要る', () => {
    expect(complaintPopulation(3)).toBeGreaterThan(complaintPopulation(1));
    expect(complaintDay(3)).toBeGreaterThan(complaintDay(1));
  });

  it('建設を決めた施設は対応待ち、フル稼働すると評価になり、苦情だけが不満になる', () => {
    const voices = voicesOf(facilities(['complete', 'operating', 'available'], [1, 0.5]), 500, 100);
    expect(voices.map((v) => v.kind)).toEqual(['complaint', 'waiting', 'praise']);
    expect(unrestOf(voices)).toBe(1);
  });

  it('放置した苦情は満足度と住宅の需要を下げる', () => {
    const save = createCity();
    expect(analyze(save, FLAT, [], 2).happiness).toBeLessThan(analyze(save, FLAT, []).happiness);
    expect(analyze(save, FLAT, [], 2).demand.r).toBeLessThan(analyze(save, FLAT, []).demand.r);
  });
});

describe('施設の仮置きと移設', () => {
  const infos: FacilityInfo[] = [{ id: 'a', learned: true, ratio: 0 }];

  it('建設を決めた施設は、道路に接する空き地に自動で置かれる', () => {
    const placed = autoPlace(createCity(), FLAT, infos, 'a');
    expect(placed.facilities).toHaveLength(1);
    expect(placed.money).toBe(START_MONEY - COST.facility);
    // もう置いてあれば何もしない
    expect(autoPlace(placed, FLAT, infos, 'a')).toBe(placed);
  });

  it('予算が足りなくても、仮置きはできる', () => {
    const placed = autoPlace({ ...createCity(), money: 10 }, FLAT, infos, 'a');
    expect(placed.facilities).toHaveLength(1);
    expect(placed.money).toBe(10);
  });

  it('移設は費用がかからず、置けない場所なら元のまま', () => {
    let save = applyTool(createCity(), FLAT, 'road', { x: HIGHWAY_LENGTH, y: HIGHWAY_ROW }, { x: 20, y: HIGHWAY_ROW }, infos).save;
    save = autoPlace(save, FLAT, infos, 'a');
    const moved = moveFacility(save, FLAT, infos, 'a', { x: 15, y: HIGHWAY_ROW + 1 });
    expect(moved.error).toBeUndefined();
    expect(moved.save.facilities).toEqual([{ id: 'a', x: 15, y: HIGHWAY_ROW + 1 }]);
    expect(moved.save.money).toBe(save.money);
    const bad = moveFacility(save, FLAT, infos, 'a', { x: 30, y: 2 });
    expect(bad.error).toBe('road');
    expect(bad.save).toBe(save);
  });

  it('出来事で日を進めると、つながった区画が育つ', () => {
    let save = applyTool(createCity(), FLAT, 'road', { x: HIGHWAY_LENGTH, y: HIGHWAY_ROW }, { x: 15, y: HIGHWAY_ROW }, []).save;
    save = applyTool(save, FLAT, 'res', { x: 6, y: HIGHWAY_ROW - 2 }, { x: 15, y: HIGHWAY_ROW - 1 }, []).save;
    const later = advanceDays(save, FLAT, [], 5);
    expect(later.day).toBe(5);
    expect(analyze(later, FLAT, []).population).toBeGreaterThan(0);
  });
});
