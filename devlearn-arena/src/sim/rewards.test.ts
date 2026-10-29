import { describe, expect, it } from 'vitest';
import { FACILITY_DEFS } from '@/city/facilities';
import { checkFacility } from '@/city/place';
import type { Facility, FacilityType, Point } from '@/city/types';
import { POLITICS_RULES } from '@/content/politics';
import { applyOp } from './commands';
import { AWARD_TYPES, CAPITAL_CAP, capitalCapOf, CITY_HALL, CIVIC_HALL_TRUST, HIGH_APPROVAL, persuadeCostOf, PERSUADE_CAPITAL } from './awards';
import { CONDITION_WORDS, parseCondition } from './conditions';
import { creditMission } from './election';
import { parkAt } from './land';
import { oppositionOf, targetOf } from './opposition';
import { permitProblems } from './permits';
import { employersOf } from './businesses';
import { awardStatus, milestoneParts, stepRewards } from './rewards';
import { DEMAND_AWARD, LAND_AWARD } from './rules';
import type { World } from './types';
import { previewOf, weekStep } from './week';
import { grownVillage } from './__fixtures__/cities';

/**
 * 褒賞（docs/game-design.md 25 章・docs/testing-strategy.md 10 章「褒賞・始め方」）:
 * 節目の判定（下がっても残る）・各 1 つまで・効き（政治資本の上限と説得・地価と商業の需要・信頼・緑地）・学習にロックが無い
 */

const GROWN = grownVillage(120, true);
const T = GROWN.terrain;
const active = (id: string, type: FacilityType, x: number, y: number): Facility => ({ id, type, origin: { x, y }, rotation: 0, level: 1, state: 'active', builtDay: 0 });
const withFacilities = (w: World, ...fs: Facility[]): World => ({ ...w, city: { ...w.city, facilities: [...w.city.facilities, ...fs] } });
/** 人口と支持率を決めた世界（週の終わりの値） */
const at = (w: World, population: number, approval = 50): World => ({ ...w, city: { ...w.city, population }, sim: { ...w.sim, lastWeek: { ...w.sim.lastWeek, approval } } });
/** 道路に面して置ける、一番北西の場所（見本の村の空き地） */
function siteFor(w: World, type: FacilityType): Point {
  for (let y = 30; y < 66; y += 1) for (let x = 30; x < 66; x += 1) if (checkFacility(w.city, T, type, { x, y }, 0, 1e9).ok) return { x, y };
  throw new Error(`${type} を置ける場所が無い`);
}
const placed = (w: World, id: string, type: FacilityType): Facility => {
  const p = siteFor(w, type);
  return active(id, type, p.x, p.y);
};
/** 週の終わりの日（7 の倍数） */
const weekEnd = (w: World): number => (Math.floor(w.city.day / 7) + 1) * 7;

describe('定義の値（docs/content-spec.md 7.9: facilities.json が 25 章の表と docs/decisions.md U-13 の判断と一致する）', () => {
  it('5 つの大きさ・費用（財政）・維持費は無い・節目の式', () => {
    const pick = (t: FacilityType) => {
      const d = FACILITY_DEFS[t];
      return [d.name, d.w, d.d, d.cost, d.wallet, d.upkeep, d.unlock];
    };
    expect(AWARD_TYPES).toEqual(['city-hall', 'memorial', 'stadium', 'civic-hall', 'central-park']);
    expect(pick('city-hall')).toEqual(['新しい市庁舎', 2, 2, 1000, 'treasury', undefined, 'population >= 1000']);
    expect(pick('memorial')).toEqual(['市民記念館', 2, 2, 900, 'treasury', undefined, 'population >= 5000 && approval >= 55']);
    expect(pick('stadium')).toEqual(['競技場', 3, 3, 2000, 'treasury', undefined, 'population >= 15000']);
    expect(pick('civic-hall')).toEqual(['市民ホール', 2, 2, 900, 'treasury', undefined, 'highApprovalWeeks >= 8']);
    expect(pick('central-park')).toEqual(['中央公園', 4, 4, 1200, 'treasury', undefined, 'population >= 30000']);
    expect(FACILITY_DEFS['central-park'].coverage).toEqual({ kind: 'park', distance: 12 });
    expect([CITY_HALL.capital, CITY_HALL.persuade, CIVIC_HALL_TRUST, HIGH_APPROVAL]).toEqual([5, 2, 2, 65]);
    expect(LAND_AWARD.memorial).toEqual({ value: 20, radius: 6 });
    expect(DEMAND_AWARD.memorial).toBe(10);
  });

  it('節目の式は模擬の語だけで読める（レッスンの修了・XP・スキルの語が無い。学習にロックを掛けない）', () => {
    for (const t of AWARD_TYPES) {
      const clauses = parseCondition(FACILITY_DEFS[t].unlock ?? '');
      expect(clauses, t).not.toBeNull();
      for (const c of clauses ?? []) expect(CONDITION_WORDS as readonly string[]).toContain(c.word);
    }
    expect(CONDITION_WORDS.some((w) => /lesson|xp|skill|stage/i.test(w))).toBe(false);
  });
});

describe('節目の判定（25 章）', () => {
  it('人口 1,000 に届いた週の終わりに新しい市庁舎が建てられるようになり、届いた後に人口が下がっても残る', () => {
    const w0 = at(GROWN.world, 999);
    const d = weekEnd(w0);
    expect(stepRewards(w0, d).rewards.unlocked['city-hall']).toBeUndefined();
    const w1 = stepRewards(at(GROWN.world, 1000), d);
    expect(w1.rewards.unlocked['city-hall']).toBe(d);
    expect(awardStatus(w1, 'city-hall')).toBe('open');
    // 人口が下がっても、届いた日は残り、申請を出せる
    const w2 = stepRewards(at(w1, 300), d + 7);
    expect(w2.rewards.unlocked['city-hall']).toBe(d);
    const draft = { kind: 'facility' as const, target: { type: 'city-hall' as const, origin: { x: 40, y: 50 }, rotation: 0 as const } };
    expect(permitProblems(w2, draft, d + 7)).not.toContain('award-locked');
    expect(permitProblems(at(GROWN.world, 300), draft, d + 7)).toContain('award-locked');
  });

  it('節目は週の終わりにだけ確かめる（週の途中の日は数えない）', () => {
    const w = at(GROWN.world, 2000);
    expect(stepRewards(w, weekEnd(w) + 3).rewards.unlocked['city-hall']).toBeUndefined();
  });

  it('市民記念館は人口 5,000 かつ支持率 55%（どちらかが足りなければ届かない）', () => {
    const d = weekEnd(GROWN.world);
    expect(stepRewards(at(GROWN.world, 5000, 54.9), d).rewards.unlocked.memorial).toBeUndefined();
    expect(stepRewards(at(GROWN.world, 4999, 70), d).rewards.unlocked.memorial).toBeUndefined();
    const w = stepRewards(at(GROWN.world, 5000, 55), d);
    expect(w.rewards.unlocked.memorial).toBe(d);
    expect(milestoneParts(at(GROWN.world, 3420, 60), 'memorial')).toEqual([
      { word: 'population', value: 3420, target: 5000, met: false },
      { word: 'approval', value: 60, target: 55, met: true },
    ]);
  });

  it('市民ホールは支持率 65% 以上を 8 週続けた時。途中で下がると数え直す', () => {
    let w = GROWN.world;
    let d = weekEnd(w);
    for (let i = 0; i < 7; i += 1, d += 7) w = stepRewards(at(w, 500, 66), d);
    expect(w.rewards.highApprovalWeeks).toBe(7);
    w = stepRewards(at(w, 500, 64.9), d);
    expect(w.rewards.highApprovalWeeks).toBe(0);
    d += 7;
    for (let i = 0; i < 8; i += 1, d += 7) w = stepRewards(at(w, 500, 65), d);
    expect(w.rewards.highApprovalWeeks).toBe(8);
    expect(w.rewards.unlocked['civic-hall']).toBe(d - 7);
    // 届いた後に支持率が下がっても残る
    w = stepRewards(at(w, 500, 30), d);
    expect(w.rewards.unlocked['civic-hall']).toBe(d - 7);
  });

  it('同じ世界と日からは同じ結果（乱数を使わない）', () => {
    const w = at(GROWN.world, 16000, 70);
    expect(stepRewards(w, weekEnd(w))).toEqual(stepRewards(w, weekEnd(w)));
  });
});

describe('各 1 つまで', () => {
  it('建っている・申請中の褒賞の建物は、もう 1 つ出せない', () => {
    const d = weekEnd(GROWN.world);
    const open = stepRewards(at({ ...GROWN.world, budget: { ...GROWN.world.budget, treasury: 9000 } }, 1200), d);
    const draft = (x: number) => ({ kind: 'facility' as const, target: { type: 'city-hall' as const, origin: { x, y: 50 }, rotation: 0 as const } });
    expect(permitProblems(open, draft(40), d)).not.toContain('award-once');
    const built = withFacilities(open, active('h1', 'city-hall', 60, 60));
    expect(permitProblems(built, draft(40), d)).toContain('award-once');
    expect(awardStatus(built, 'city-hall')).toBe('built');
    const pending = { ...open, applications: [{ ...draftApp('a1', 'city-hall', { x: 60, y: 60 }), stage: 'zoning' as const }] };
    expect(permitProblems(pending, draft(40), d)).toContain('award-once');
    expect(awardStatus(pending, 'city-hall')).toBe('pending');
  });
});

describe('効き（25 章）', () => {
  it('新しい市庁舎が建つと、政治資本の上限が 30 から 35 になり、議員の説得が 3 から 2 で済む', () => {
    const plain = { ...GROWN.world, politics: { ...GROWN.world.politics, capital: 29 } };
    expect([capitalCapOf(plain.city), persuadeCostOf(plain.city)]).toEqual([CAPITAL_CAP, PERSUADE_CAPITAL]);
    expect(creditMission(plain, 'm1', 10).politics.capital).toBe(30);
    const hall = withFacilities(plain, active('h1', 'city-hall', 60, 60));
    expect([capitalCapOf(hall.city), persuadeCostOf(hall.city)]).toEqual([35, 2]);
    expect(creditMission(hall, 'm1', 10).politics.capital).toBe(32);
    // 工事中は効かない
    const building = withFacilities(plain, { ...active('h1', 'city-hall', 60, 60), state: 'constructing' });
    expect(capitalCapOf(building.city)).toBe(30);
  });

  it('市民記念館: 中心で地価 +20、半径 6 で 0 へ薄まる。商業の需要の項に +10', () => {
    const memorial = placed(GROWN.world, 'm1', 'memorial');
    const before = previewOf(GROWN.world, T).field.land;
    const view = previewOf(withFacilities(GROWN.world, memorial), T);
    expect(view.space.awards.map((a) => a.facility.id)).toEqual(['m1']);
    const c = view.space.awards[0]?.center as { x: number; y: number };
    const i = (x: number, y: number) => y * 96 + x;
    // 中心のマス（45.5 の中心から 0.71）・遠いマス（半径の外）
    const near = i(Math.floor(c.x), Math.floor(c.y));
    const far = i(Math.floor(c.x) + 7, Math.floor(c.y));
    expect((view.field.land[near] as number) - (before[near] as number)).toBeCloseTo(20 * (1 - Math.SQRT1_2 / 6), 3);
    expect((view.field.land[far] as number) - (before[far] as number)).toBeCloseTo(0, 6);
    const week = weekStep(withFacilities(GROWN.world, memorial), T, false, POLITICS_RULES).world.sim.lastWeek.demand;
    expect(week?.commercial[2]).toBe(10);
    expect(weekStep(GROWN.world, T, false, POLITICS_RULES).world.sim.lastWeek.demand?.commercial[2]).toBe(0);
  });

  it('市民ホール: 初めて建った日に全ての層の信頼 +2。1 回だけ', () => {
    const hall = withFacilities(GROWN.world, active('ch', 'civic-hall', 60, 60));
    const d = weekEnd(hall) + 1;
    const once = stepRewards(hall, d);
    expect(once.sim.trust.map((v, l) => v - (hall.sim.trust[l] as number))).toEqual(new Array(12).fill(2));
    expect(once.rewards.built['civic-hall']).toBe('ch');
    const twice = stepRewards(once, d + 1);
    expect(twice.sim.trust).toEqual(once.sim.trust);
  });

  it('中央公園: 緑地の行き届きが道路で 12 マス（公園の 6 マスより遠くへ届く）', () => {
    const park = placed(GROWN.world, 'cp', 'central-park');
    const view = previewOf(withFacilities(GROWN.world, park), T);
    const af = view.space.parks.find((p) => p.facility.id === 'cp');
    expect(af).toBeDefined();
    let farthest = 0;
    for (let i = 0; i < view.field.parkRoad.length; i += 1) {
      if ((view.field.parkRoadSrc[i] as number) !== view.space.parks.indexOf(af as never)) continue;
      farthest = Math.max(farthest, 1 - (view.field.parkRoad[i] as number));
    }
    // 1 − 行き届き = 距離 ÷ 12。届いた一番遠いマスは 6 マスより遠い
    expect(farthest * 12).toBeGreaterThan(6);
    expect(parkAt(view.field, park.origin.x, park.origin.y - 1).value + parkAt(view.field, park.origin.x, park.origin.y + 4).value).toBeGreaterThan(0);
  });
});

describe('施設の職員（13.3）', () => {
  it('褒賞の建物も市の施設として職員 15 人を雇う（中 60%・高 40%）。譲歩の jobs が効く', () => {
    const hall = placed(GROWN.world, 'h1', 'city-hall');
    const staff = (f: Facility) => {
      const view = previewOf(withFacilities(GROWN.world, f), T);
      return employersOf(view.space, {}, {}, 0, new Set()).employers.find((e) => e.id === f.id)?.slots;
    };
    expect(staff(hall)).toEqual([0, 9, 6]);
    expect(staff({ ...hall, mods: { jobs: 2 } })).toEqual([0, 18, 12]);
  });
});

describe('申請（15 章）: 褒賞の建物も申請になり、費用は財政', () => {
  it('節目に届いた市庁舎を置くと、財政から 1,000 を取り分けた申請になる', () => {
    const d = weekEnd(GROWN.world);
    const open = stepRewards(at({ ...GROWN.world, budget: { ...GROWN.world.budget, treasury: 5000 } }, 1200), d);
    const origin = siteFor(open, 'city-hall');
    const w = applyOp(open, { kind: 'facility', type: 'city-hall', origin, rotation: 0 }, T, POLITICS_RULES);
    const app = w.applications.at(-1);
    expect(app?.target.type).toBe('city-hall');
    expect([app?.wallet, app?.reserved]).toEqual(['treasury', 1000]);
    expect(w.budget.treasury).toBe(4000);
    // 反対の理由は褒賞の建物の物（建て替えの費用）。費用の強さは、財政から取り分けた額の割合
    expect(app && targetOf(app, w.city)).toBe('reward:city-hall');
    const opp = app ? oppositionOf(w, T, app, POLITICS_RULES) : null;
    expect(opp?.objections.map((o) => o.reasonId)).toContain('rw-hall-cost');
    expect(opp?.objections.find((o) => o.reasonId === 'rw-hall-cost')?.basis).toEqual({ value: 1000, ref: 5000 });
    // 届いていなければ置けない
    const locked = applyOp(at({ ...GROWN.world, budget: { ...GROWN.world.budget, treasury: 5000 } }, 1200), { kind: 'facility', type: 'city-hall', origin, rotation: 0 }, T, POLITICS_RULES);
    expect(locked.applications.length).toBe(GROWN.world.applications.length);
  });
});

function draftApp(id: string, type: FacilityType, origin: { x: number; y: number }): World['applications'][number] {
  return {
    id, kind: 'facility', target: { type, origin, rotation: 0 }, stage: 'filed', stageDay: 0, filedDay: 0, wallet: 'treasury', reserved: FACILITY_DEFS[type].cost,
    exception: false, objections: [], opposition: 0, mods: {},
  };
}
