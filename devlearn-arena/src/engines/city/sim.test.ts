import { describe, expect, it } from 'vitest';
import {
  advise, analyze, applyTool, COST, createCity, facilityRadius, grant, HIGHWAY_LENGTH, HIGHWAY_ROW, idx, isValidCity,
  roadPath, SIZE, START_MONEY, terrainOf, tick, type CitySave, type FacilityInfo,
} from './sim';

/** 水も林も無い平らな土地 */
const FLAT = 'g'.repeat(SIZE * SIZE);
const NONE: FacilityInfo[] = [];

/** 幹線から東へ道路を伸ばし、その北側に住宅を塗った街 */
function starter(): CitySave {
  let save = createCity();
  save = applyTool(save, FLAT, 'road', { x: HIGHWAY_LENGTH, y: HIGHWAY_ROW }, { x: 15, y: HIGHWAY_ROW }, NONE).save;
  save = applyTool(save, FLAT, 'res', { x: 2, y: HIGHWAY_ROW - 3 }, { x: 15, y: HIGHWAY_ROW - 1 }, NONE).save;
  // 働き口
  save = applyTool(save, FLAT, 'com', { x: 2, y: HIGHWAY_ROW + 1 }, { x: 5, y: HIGHWAY_ROW + 2 }, NONE).save;
  save = applyTool(save, FLAT, 'ind', { x: 11, y: HIGHWAY_ROW + 1 }, { x: 15, y: HIGHWAY_ROW + 3 }, NONE).save;
  return save;
}

function days(save: CitySave, count: number, facilities: readonly FacilityInfo[] = NONE, terrain = FLAT): CitySave {
  let s = save;
  for (let d = 0; d < count; d += 1) s = tick(s, terrain, facilities);
  return s;
}

describe('土地', () => {
  it('同じカテゴリからは同じ土地ができ、川と林があり、幹線の行は水以外', () => {
    const git = terrainOf('git');
    expect(terrainOf('git')).toBe(git);
    expect(terrainOf('k8s')).not.toBe(git);
    expect(git).toHaveLength(SIZE * SIZE);
    expect(git).toContain('w');
    expect(git).toContain('t');
    for (let x = 0; x < HIGHWAY_LENGTH; x += 1) expect(git[idx(x, HIGHWAY_ROW)]).not.toBe('w');
  });

  it('新しい街は、幹線道路と開始資金だけがある', () => {
    const save = createCity();
    expect(isValidCity(save)).toBe(true);
    expect(save.money).toBe(START_MONEY);
    expect([...save.tiles].filter((t) => t === 'r')).toHaveLength(HIGHWAY_LENGTH);
  });
});

describe('道具', () => {
  it('道路は L 字に引け、1 マスごとに費用がかかり、橋は高い', () => {
    expect(roadPath({ x: 0, y: 0 }, { x: 2, y: 2 })).toEqual([
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 2, y: 2 },
    ]);
    const r = applyTool(createCity(), FLAT, 'road', { x: 6, y: HIGHWAY_ROW }, { x: 9, y: HIGHWAY_ROW }, NONE);
    expect(r.changed).toBe(4);
    expect(r.save.money).toBe(START_MONEY - 4 * COST.road);
    const wet = FLAT.split('');
    wet[idx(6, HIGHWAY_ROW)] = 'w';
    const bridge = applyTool(createCity(), wet.join(''), 'road', { x: 6, y: HIGHWAY_ROW }, { x: 6, y: HIGHWAY_ROW }, NONE);
    expect(bridge.cost).toBe(COST.bridge);
  });

  it('予算が足りなければ何も変わらない', () => {
    const poor = { ...createCity(), money: 5 };
    const r = applyTool(poor, FLAT, 'road', { x: 6, y: 3 }, { x: 9, y: 3 }, NONE);
    expect(r.error).toBe('money');
    expect(r.save).toBe(poor);
  });

  it('区画は道路の近くにだけ塗れる', () => {
    const near = applyTool(createCity(), FLAT, 'res', { x: 0, y: HIGHWAY_ROW - 3 }, { x: 2, y: HIGHWAY_ROW - 1 }, NONE);
    expect(near.changed).toBe(9);
    expect(near.cost).toBe(0);
    const far = applyTool(createCity(), FLAT, 'res', { x: 20, y: 2 }, { x: 22, y: 4 }, NONE);
    expect(far.error).toBe('reach');
  });

  it('施設は学んで建設を決めたものだけを、道路に接する場所に一度だけ置ける', () => {
    const info: FacilityInfo[] = [{ id: 'git/01', learned: true, ratio: 0 }, { id: 'git/02', learned: false, ratio: 0 }];
    const save = createCity();
    expect(applyTool(save, FLAT, 'facility', { x: 2, y: 16 }, { x: 2, y: 16 }, info, 'git/02').error).toBe('notLearned');
    expect(applyTool(save, FLAT, 'facility', { x: 2, y: 5 }, { x: 2, y: 5 }, info, 'git/01').error).toBe('road');
    const ok = applyTool(save, FLAT, 'facility', { x: 2, y: 16 }, { x: 2, y: 16 }, info, 'git/01');
    expect(ok.error).toBeUndefined();
    expect(ok.save.facilities).toEqual([{ id: 'git/01', x: 2, y: 16 }]);
    expect(ok.save.money).toBe(START_MONEY - COST.facility);
    expect(applyTool(ok.save, FLAT, 'facility', { x: 8, y: 16 }, { x: 8, y: 16 }, info, 'git/01').error).toBe('placed');
    // 撤去すると置き直せる。幹線の入口は消せない
    const cleared = applyTool(ok.save, FLAT, 'bulldoze', { x: 0, y: 16 }, { x: 3, y: HIGHWAY_ROW }, info);
    expect(cleared.save.facilities).toEqual([]);
    expect(cleared.save.tiles[idx(0, HIGHWAY_ROW)]).toBe('r');
    expect(cleared.save.tiles[idx(1, HIGHWAY_ROW)]).toBe('.');
  });
});

describe('街の成長', () => {
  it('道路につながった住宅区画は、日がたつと育って住民が住む', () => {
    const grown = days(starter(), 20);
    const a = analyze(grown, FLAT, NONE);
    expect(a.population).toBeGreaterThan(0);
    expect(grown.day).toBe(20);
  });

  it('道路につながっていない区画は育たず、住民の声で知らせる', () => {
    let save = starter();
    // 幹線とのつながりを切る
    save = applyTool(save, FLAT, 'bulldoze', { x: HIGHWAY_LENGTH, y: HIGHWAY_ROW }, { x: HIGHWAY_LENGTH, y: HIGHWAY_ROW }, NONE).save;
    const cut = save;
    const later = days(cut, 30);
    for (let x = 12; x <= 14; x += 1) expect(later.levels[idx(x, HIGHWAY_ROW - 1)]).toBe('0');
    const a = analyze(later, FLAT, NONE);
    expect(a.unconnected).toBeGreaterThan(0);
    expect(advise(later, a, NONE, []).some((v) => v.kind === 'unconnected')).toBe(true);
  });

  it('施設が無いと建物は低いまま。施設を置いて稼働させるほど高く育つ', () => {
    const idle = days(starter(), 40);
    expect(Math.max(...[...idle.levels].map(Number))).toBe(1);

    const learned: FacilityInfo[] = [{ id: 'f', learned: true, ratio: 0 }];
    const withFacility = applyTool(starter(), FLAT, 'facility', { x: 7, y: HIGHWAY_ROW + 1 }, { x: 7, y: HIGHWAY_ROW + 1 }, learned, 'f').save;
    const built = days(withFacility, 40, learned);
    expect(Math.max(...[...built.levels].map(Number))).toBe(2);

    const running: FacilityInfo[] = [{ id: 'f', learned: true, ratio: 1 }];
    const complete = days(withFacility, 60, running);
    expect(Math.max(...[...complete.levels].map(Number))).toBeGreaterThanOrEqual(3);
    expect(analyze(complete, FLAT, running).population).toBeGreaterThan(analyze(built, FLAT, learned).population);
  });

  it('稼働率が上がると施設の範囲が広がる', () => {
    expect(facilityRadius(1)).toBeGreaterThan(facilityRadius(0.5));
    expect(facilityRadius(0.5)).toBeGreaterThan(facilityRadius(0));
  });

  it('同じ操作からは同じ街になる（決定論）', () => {
    expect(days(starter(), 25)).toEqual(days(starter(), 25));
  });

  it('住民が増えると働き口の需要が出て、住宅の需要は下がる', () => {
    const empty = analyze(starter(), FLAT, NONE);
    const grown = analyze(days(starter(), 30), FLAT, NONE);
    expect(grown.demand.r).toBeLessThan(empty.demand.r);
    expect(grown.demand.c).toBeGreaterThan(empty.demand.c);
  });
});

describe('予算の報酬', () => {
  it('同じ報酬は一度だけ受け取れる', () => {
    const once = grant(createCity(), 'quiz:git/01:0', 200);
    expect(once.money).toBe(START_MONEY + 200);
    expect(grant(once, 'quiz:git/01:0', 200)).toBe(once);
  });
});

describe('住民の声', () => {
  it('はじめは道路を、道路を引いたら区画を求め、学んだ施設は配置を、未学習の施設は困りごとを伝える', () => {
    const info: FacilityInfo[] = [{ id: 'a', learned: true, ratio: 0 }, { id: 'b', learned: false, ratio: 0 }];
    const fresh = createCity();
    const kinds = advise(fresh, analyze(fresh, FLAT, info), info, ['a', 'b']).map((v) => v.kind);
    expect(kinds).toContain('noRoad');
    expect(kinds).toContain('place');
    expect(advise(fresh, analyze(fresh, FLAT, info), info, ['a', 'b'])).toContainEqual({ kind: 'trouble', facilityId: 'b' });
    const roads = applyTool(fresh, FLAT, 'road', { x: 6, y: HIGHWAY_ROW }, { x: 10, y: HIGHWAY_ROW }, info).save;
    expect(advise(roads, analyze(roads, FLAT, info), info, ['a', 'b']).map((v) => v.kind)).toContain('noZone');
  });
});
