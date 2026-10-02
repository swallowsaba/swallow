import { describe, expect, it } from 'vitest';
import { STAGE_THRESHOLDS, stageOf } from '@/game/stage';
import { advance, statsOf } from './growth';
import { newCity } from './newCity';
import { checkFacility, checkZone, placeFacility, placeZone } from './place';
import { CAPACITY, constructionStage, revealedFor } from './rules';
import { generateTerrain } from './terrain';
import type { City, FacilityType, Point } from './types';

const base = newCity();
const terrain = generateTerrain(base.seed);

function zone(city: City, kind: 'residential' | 'commercial' | 'office', a: Point, b: Point): City {
  return placeZone(city, kind, checkZone(city, terrain, kind, a, b));
}
function facility(city: City, type: FacilityType, origin: Point, rotation: 0 | 90 | 180 | 270 = 0): City {
  const check = checkFacility(city, terrain, type, origin, rotation);
  if (!check.ok) throw new Error(`${type} を置けない: ${check.reasons.map((r) => r.text).join(' / ')}`);
  return placeFacility(city, type, origin, rotation, check);
}

describe('建設の 3 段階', () => {
  it('基礎 → 骨組み → 完成と、1 日ごとに進む', () => {
    expect(constructionStage(3, 3)).toBe('foundation');
    expect(constructionStage(3, 3.9)).toBe('foundation');
    expect(constructionStage(3, 4)).toBe('frame');
    expect(constructionStage(3, 5)).toBe('done');
  });

  it('施設は置いた日から 2 日たつと稼働する', () => {
    const city = facility(base, 'server', { x: 40, y: 45 });
    expect(advance(city, 1.5).facilities[0]?.state).toBe('constructing');
    expect(advance(city, 2).facilities[0]?.state).toBe('active');
  });
});

describe('区画の建物が建つ', () => {
  const homes = zone(base, 'residential', { x: 38, y: 46 }, { x: 56, y: 46 });

  it('道路に面した住宅の区画に、需要の分だけ建物が建つ', () => {
    const after = advance(homes, 1);
    expect(after.buildings.length).toBeGreaterThan(0);
    for (const b of after.buildings) {
      expect(b.cell.y).toBe(46);
      expect(b.level).toBe(1);
      expect(b.builtDay).toBe(1);
    }
  });

  it('建ち終わるまで都市規模に数えない。建ち終わると数える', () => {
    const after = advance(homes, 2.5);
    expect(after.population).toBe(0);
    const done = advance(homes, 3);
    expect(done.population).toBe(done.buildings.filter((b) => b.builtDay <= 1).length * CAPACITY.residential[0]);
  });

  it('同じ状態と同じ日付からは、同じ都市になる', () => {
    expect(advance(homes, 12)).toEqual(advance(homes, 12));
    // 途中で区切って進めても同じ
    expect(advance(advance(homes, 5.3), 12)).toEqual(advance(homes, 12));
  });

  it('雇用が無ければ住宅は少しで止まり、オフィスと施設が仕事を生むと増える', () => {
    const alone = advance(homes, 30);
    const withJobs = advance(facility(zone(homes, 'office', { x: 38, y: 48 }, { x: 44, y: 48 }), 'server', { x: 50, y: 48 }, 180), 30);
    expect(alone.population).toBeLessThanOrEqual(40);
    expect(withJobs.population).toBeGreaterThan(alone.population);
    expect(statsOf(withJobs).jobs).toBeGreaterThan(0);
  });

  it('道路に面していない区画のマスには建たない', () => {
    const lonely: City = { ...base, zones: [{ id: 'z1', kind: 'residential', cells: [{ x: 40, y: 40 }] }] };
    expect(advance(lonely, 10).buildings).toHaveLength(0);
  });

  it('霧の中の区画のマスには建たない', () => {
    const foggy: City = { ...base, zones: [{ id: 'z1', kind: 'residential', cells: [{ x: 38, y: 34 }] }], roads: [{ id: 'r1', kind: 'lane', path: [{ x: 30.5, y: 35.5 }, { x: 45.5, y: 35.5 }] }] };
    expect(advance(foggy, 10).buildings).toHaveLength(0);
  });
});

describe('区画の建物が育つ', () => {
  const homes = zone(base, 'residential', { x: 38, y: 46 }, { x: 56, y: 46 });
  const jobs = facility(zone(homes, 'office', { x: 38, y: 48 }, { x: 46, y: 48 }), 'server', { x: 52, y: 48 }, 180);

  it('近くに公園や施設が無い戸建ては育たない', () => {
    const after = advance(jobs, 40);
    const far = after.buildings.filter((b) => b.cell.x < 44 && b.cell.y === 46);
    expect(far.length).toBeGreaterThan(0);
    expect(far.every((b) => b.level === 1)).toBe(true);
  });

  it('公園の近くの戸建ては、低層の集合住宅に建て替わる', () => {
    const withPark = facility(jobs, 'park', { x: 48, y: 48 });
    const after = advance(withPark, 40);
    const near = after.buildings.filter((b) => b.cell.y === 46 && b.cell.x >= 45 && b.cell.x <= 53);
    expect(near.some((b) => b.level === 2)).toBe(true);
  });

  it('村と町では、区画の建物は 2 段（低層）まで', () => {
    const many = facility(facility(jobs, 'park', { x: 48, y: 48 }), 'network', { x: 55, y: 48 }, 180);
    const after = advance(many, 80);
    expect(after.stage).toBeLessThanOrEqual(2);
    expect(Math.max(...after.buildings.map((b) => b.level))).toBeLessThanOrEqual(2);
  });
});

describe('発展段階と霧', () => {
  it('技術力と都市規模の両方を満たすと段階が上がる（docs/game-design.md 6 章の表）', () => {
    for (const s of [1, 2, 3, 4, 5] as const) {
      const t = STAGE_THRESHOLDS[s];
      expect(stageOf(t.techPower, t.population)).toBe(s);
      if (s > 1) {
        expect(stageOf(t.techPower - 1, t.population)).toBe(s - 1);
        expect(stageOf(t.techPower, t.population - 1)).toBe(s - 1);
      }
    }
    // 技術力 35 は、どの分野の組み合わせでも届く（7 施設 × Lv5 でも、12 施設 × Lv3 でも）
    expect(stageOf(7 * 5, 50000)).toBe(5);
    expect(stageOf(12 * 3, 50000)).toBe(5);
  });

  it('霧は段階ごとに外へ晴れる。初めは中央の 24×24', () => {
    expect(revealedFor(1)).toEqual([{ x: 36, y: 36, w: 24, h: 24 }]);
    const areas = ([1, 2, 3, 4, 5] as const).map((s) => (revealedFor(s)[0]?.w ?? 0) * (revealedFor(s)[0]?.h ?? 0));
    for (let i = 1; i < areas.length; i += 1) expect(areas[i]).toBeGreaterThan(areas[i - 1] as number);
  });

  it('村から町へ: 施設 5 つと人口 500 で町になり、霧が晴れる', () => {
    // 学習で開発資金を得た後の都市（施設 6 つと区画を買える）
    let city: City = { ...base, funds: 10000 };
    // 道路の北側に住宅、南側にオフィスと施設
    city = zone(city, 'residential', { x: 37, y: 46 }, { x: 58, y: 46 });
    const roadsSouth: City = { ...city, roads: [...city.roads, { id: 'r2', kind: 'street', path: [{ x: 37.5, y: 52.5 }, { x: 58.5, y: 52.5 }] }, { id: 'r3', kind: 'street', path: [{ x: 47.5, y: 37.5 }, { x: 47.5, y: 58.5 }] }] };
    city = zone(roadsSouth, 'residential', { x: 37, y: 51 }, { x: 58, y: 51 });
    city = zone(city, 'residential', { x: 42, y: 53 }, { x: 58, y: 53 });
    city = zone(city, 'office', { x: 46, y: 38 }, { x: 46, y: 45 });
    city = zone(city, 'residential', { x: 48, y: 38 }, { x: 48, y: 45 });
    city = facility(city, 'server', { x: 38, y: 48 }, 180);
    city = facility(city, 'network', { x: 41, y: 48 }, 180);
    city = facility(city, 'web', { x: 49, y: 48 }, 180);
    city = facility(city, 'park', { x: 52, y: 48 }, 180);
    city = facility(city, 'security', { x: 55, y: 48 }, 180);
    city = facility(city, 'academy', { x: 38, y: 53 }, 180);
    expect(city.stage).toBe(1);
    const after = advance(city, 120);
    expect(after.techPower).toBeGreaterThanOrEqual(5);
    expect(after.population).toBeGreaterThanOrEqual(500);
    expect(after.stage).toBe(2);
    expect(after.revealed).toEqual(revealedFor(2));
  });
});
