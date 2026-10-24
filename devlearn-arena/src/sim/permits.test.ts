import { describe, expect, it } from 'vitest';
import { checkFacility } from '@/city/place';
import type { Facility, FacilityType, Point } from '@/city/types';
import type { Terrain } from '@/city/terrain';
import { applyOp, permitPreview, type Op } from './commands';
import {
  buildDaysOf, daysLeft, daysToComplete, MAX_PENDING, nextCouncilDay, occupiedSites, permitProblems, rezoneOf, STAGE_DAYS,
} from './permits';
import type { Application, World } from './types';
import { weekStep } from './week';
import { stepDay } from './world';
import { village } from './__fixtures__/cities';

/**
 * 許認可（docs/game-design.md 15 章・docs/testing-strategy.md 10.2「申請」）。
 * G3 では反対率を 0 として、全ての申請を議会で可決する（反対は G4、公聴会は G5、採決と申し立ては G6）。
 */

/** 資金を足した村（一般道 y = 47） */
function rich(): { world: World; terrain: Terrain } {
  const { world, terrain } = village();
  return { world: { ...world, city: { ...world.city, funds: 20000 } }, terrain };
}

/** その種類の施設を置ける場所（一般道の南と北を左から探す。申請中の敷地と重ならない所） */
function spot(world: World, terrain: Terrain, type: FacilityType): { origin: Point; rotation: Facility['rotation'] } {
  const sites = occupiedSites(world);
  for (const [y, rotation] of [[48, 180], [45, 0], [44, 0]] as const) {
    for (let x = 36; x < 60; x += 1) {
      const c = checkFacility(world.city, terrain, type, { x, y }, rotation);
      if (c.ok && !c.cells.some((m) => sites.has(`${String(m.x)},${String(m.y)}`))) return { origin: { x, y }, rotation };
    }
  }
  throw new Error(`${type} を置ける所が無い`);
}

function apply(world: World, terrain: Terrain, op: Op): World {
  return applyOp(world, op, terrain);
}

function place(world: World, terrain: Terrain, type: FacilityType): World {
  const s = spot(world, terrain, type);
  return apply(world, terrain, { kind: 'facility', type, origin: s.origin, rotation: s.rotation });
}

/** 日を進め、毎日の申請の段階を記録する */
function run(world: World, terrain: Terrain, days: number, id: string): { world: World; log: { day: number; stage: string }[] } {
  let w = world;
  const log: { day: number; stage: string }[] = [];
  for (let i = 0; i < days; i += 1) {
    w = stepDay(w, terrain);
    const a = w.applications.find((x) => x.id === id);
    const last = log.at(-1);
    if (a && last?.stage !== a.stage) log.push({ day: Math.floor(w.city.day), stage: a.stage });
  }
  return { world: w, log };
}

describe('申請の対象（15.1）', () => {
  it('IT 施設を置くと申請になる。費用は取り分け、施設はまだ都市に無い', () => {
    const { world, terrain } = rich();
    const w = place(world, terrain, 'server');
    expect(w.applications).toHaveLength(1);
    expect(w.applications[0]).toMatchObject({ kind: 'facility', stage: 'zoning', reserved: 400, wallet: 'funds', opposition: 0 });
    expect(w.city.funds).toBe(20000 - 400);
    expect(w.city.facilities).toHaveLength(0);
  });

  it('公園の類は申請にならず、今までどおり置ける', () => {
    const { world, terrain } = rich();
    const w = place(world, terrain, 'park');
    expect(w.applications).toHaveLength(0);
    expect(w.city.facilities.map((f) => f.type)).toEqual(['park']);
  });

  it('用途地域の変更: 人の住む住宅から 3 マス以内に工業を塗る時・区画の種類を変える時だけ申請になる', () => {
    const { world, terrain } = rich();
    // 空き地に住宅を塗って 1 週たつと、人が住む
    let w = apply(world, terrain, { kind: 'zone', zone: 'residential', a: { x: 40, y: 48 }, b: { x: 42, y: 48 } });
    expect(w.applications).toHaveLength(0);
    for (let i = 0; i < 14; i += 1) w = stepDay(w, terrain);
    expect(Object.values(w.sim.households).some((h) => h.some((v) => v > 0))).toBe(true);
    // (1) 住宅の向かい（2 マス）に工業 → 申請
    expect(rezoneOf(w, 'industrial', [{ x: 41, y: 46 }]).needed).toBe(true);
    // 住宅から離れた所の工業 → 即時
    expect(rezoneOf(w, 'industrial', [{ x: 55, y: 46 }]).needed).toBe(false);
    // 住宅の隣に住宅 → 即時
    expect(rezoneOf(w, 'residential', [{ x: 43, y: 48 }]).needed).toBe(false);
    // (2) 住宅の区画を工業に変える → 申請（変える前は住宅）
    expect(rezoneOf(w, 'industrial', [{ x: 40, y: 48 }])).toEqual({ needed: true, from: 'residential' });
    const before = w.city.zones.length;
    const w2 = apply(w, terrain, { kind: 'zone', zone: 'industrial', a: { x: 40, y: 46 }, b: { x: 42, y: 46 } });
    expect(w2.applications.at(-1)).toMatchObject({ kind: 'rezone', target: { zone: { kind: 'industrial' } } });
    // 申請中は塗らない（可決で塗りが決まる）
    expect(w2.city.zones.length).toBe(before);
    const w3 = apply(w, terrain, { kind: 'zone', zone: 'industrial', a: { x: 55, y: 46 }, b: { x: 56, y: 46 } });
    expect(w3.applications).toHaveLength(w.applications.length);
    expect(w3.city.zones.length).toBe(before + 1);
  });
});

describe('段階と日数（15.2）', () => {
  it('2×2 の施設: 用途地域の審査 7 日 → 反対の受付 14 日 → 同意の案件で次の議会の日に可決 → 工事 28 日 → 完成', () => {
    const { world, terrain } = rich();
    const day0 = Math.floor(world.city.day);
    const w = place(world, terrain, 'server');
    const id = (w.applications[0] as Application).id;
    expect(daysToComplete(w.applications[0] as Application, day0)).toBe(nextCouncilDay(day0 + 21) + 28 - day0);
    const { world: end, log } = run(w, terrain, 120, id);
    const council = nextCouncilDay(day0 + 21);
    expect(log).toEqual([
      { day: day0 + 1, stage: 'zoning' },
      { day: day0 + 7, stage: 'objection' },
      { day: day0 + 21, stage: 'council' },
      { day: council, stage: 'construction' },
      { day: council + 28, stage: 'done' },
    ]);
    const a = end.applications[0] as Application;
    expect(a.vote).toMatchObject({ consent: true, passed: true });
    const f = end.city.facilities.find((x) => x.id === a.target.facilityId);
    expect(f).toMatchObject({ type: 'server', state: 'active', builtDay: council, completeDay: council + 28 });
  });

  it('工事の日数は大きさで決まる: 2×2 は 28・3×2 は 35・3×3 は 42・アップグレードは 21・用途地域の変更は 0', () => {
    const at = { origin: { x: 0, y: 0 }, rotation: 0 as const };
    expect(buildDaysOf({ kind: 'facility', target: { type: 'server', ...at } })).toBe(28);
    expect(buildDaysOf({ kind: 'facility', target: { type: 'datacenter', ...at } })).toBe(35);
    expect(buildDaysOf({ kind: 'facility', target: { type: 'datacenter', origin: at.origin, rotation: 90 } })).toBe(35);
    expect(buildDaysOf({ kind: 'facility', target: { type: 'academy', ...at } })).toBe(42);
    expect(buildDaysOf({ kind: 'upgrade', target: { facilityId: 'f1', toLevel: 2 } })).toBe(21);
    expect(buildDaysOf({ kind: 'rezone', target: { zone: { kind: 'industrial', cells: [] } } })).toBe(0);
  });

  it('3×3 の施設は 42 日、3×2 は 35 日で完成する', () => {
    const { world, terrain } = rich();
    const day0 = Math.floor(world.city.day);
    const council = nextCouncilDay(day0 + 21);
    for (const [type, days] of [['academy', 42], ['datacenter', 35]] as const) {
      const w = place(world, terrain, type);
      const id = (w.applications[0] as Application).id;
      const { log } = run(w, terrain, 120, id);
      expect(log.at(-2)).toEqual({ day: council, stage: 'construction' });
      expect(log.at(-1)).toEqual({ day: council + days, stage: 'done' });
    }
  });

  it('用途の例外（住宅に接する敷地）は公聴会を省けない。開かずに 14 日たつと市長抜きで開かれ、議会へ進む', () => {
    const { world, terrain } = rich();
    const s = spot(world, terrain, 'server');
    // 敷地の西隣のマスに住宅の建物
    const home = { x: s.origin.x - 1, y: s.origin.y };
    let w: World = { ...world, city: { ...world.city, zones: [{ id: 'z-h', kind: 'residential', cells: [home] }], buildings: [{ id: 'b-h', zoneId: 'z-h', cell: home, variant: 'h', level: 1, builtDay: -10 }] } };
    const day0 = Math.floor(w.city.day);
    w = apply(w, terrain, { kind: 'facility', type: 'server', origin: s.origin, rotation: s.rotation });
    const a0 = w.applications.at(-1) as Application;
    const { log, world: end } = run(w, terrain, 120, a0.id);
    const a = end.applications.find((x) => x.id === a0.id) as Application;
    expect(a.exception).toBe(true);
    expect(log.slice(0, 4)).toEqual([
      { day: day0 + 1, stage: 'zoning' },
      { day: day0 + 7, stage: 'objection' },
      { day: day0 + 21, stage: 'hearing' },
      { day: day0 + 35, stage: 'council' },
    ]);
    expect(a.hearing).toEqual({ heldDay: day0 + 35, attended: false });
    expect(a.vote?.consent).toBe(false);
  });

  it('議会は 14 日ごと。段階の残りの日数は、議会の段階では次の議会の日まで', () => {
    expect(nextCouncilDay(0)).toBe(14);
    expect(nextCouncilDay(13)).toBe(14);
    expect(nextCouncilDay(14)).toBe(28);
    const a = { stage: 'council', stageDay: 20, kind: 'facility', target: { type: 'server' } } as Application;
    expect(daysLeft(a, 25)).toBe(3);
    expect(daysLeft({ ...a, stage: 'zoning' }, 22)).toBe(STAGE_DAYS.zoning - 2);
  });
});

describe('費用の取り分けと戻し・取り下げ・6 件まで（15.2）', () => {
  it('取り下げると、費用は全て戻り、敷地が空く', () => {
    const { world, terrain } = rich();
    const w = place(world, terrain, 'datacenter');
    const a = w.applications[0] as Application;
    expect(w.city.funds).toBe(20000 - 650);
    let x = w;
    for (let i = 0; i < 10; i += 1) x = stepDay(x, terrain);
    const back = apply(x, terrain, { kind: 'withdraw', applicationId: a.id });
    expect(back.city.funds).toBe(20000);
    expect(back.applications[0]?.stage).toBe('withdrawn');
    expect(occupiedSites(back).size).toBe(0);
    // 着工の後は取り下げられない
    const { world: built } = run(w, terrain, 60, a.id);
    expect(built.applications[0]?.stage).toBe('construction');
    expect(apply(built, terrain, { kind: 'withdraw', applicationId: a.id })).toBe(built);
  });

  it('同時に審議できる申請は 6 件まで。7 件目は「審議中の申請が多すぎる」で断られる', () => {
    const { world, terrain } = rich();
    let w = world;
    for (let i = 0; i < MAX_PENDING; i += 1) w = place(w, terrain, 'server');
    expect(w.applications).toHaveLength(6);
    const s = spot(w, terrain, 'server');
    const draft = { kind: 'facility' as const, target: { type: 'server' as const, ...s } };
    expect(permitProblems(w, draft, Math.floor(w.city.day))).toEqual(['too-many']);
    const after = apply(w, terrain, { kind: 'facility', type: 'server', origin: s.origin, rotation: s.rotation });
    expect(after).toBe(w);
    expect(after.city.funds).toBe(20000 - 6 * 400);
  });

  it('申請中の敷地には、ほかの物（施設・区画・道路）を置けない', () => {
    const { world, terrain } = rich();
    const s = spot(world, terrain, 'server');
    const w = apply(world, terrain, { kind: 'facility', type: 'server', origin: s.origin, rotation: s.rotation });
    expect(apply(w, terrain, { kind: 'facility', type: 'park', origin: s.origin, rotation: 0 })).toBe(w);
    expect(apply(w, terrain, { kind: 'zone', zone: 'office', a: s.origin, b: s.origin })).toBe(w);
  });

  it('否決から 28 日は、同じ場所に同じ物を出せない', () => {
    const { world, terrain } = rich();
    const s = spot(world, terrain, 'server');
    const day = Math.floor(world.city.day);
    const draft = { kind: 'facility' as const, target: { type: 'server' as const, ...s } };
    const rejected: Application = { id: 'a1', ...draft, stage: 'rejected', stageDay: day, filedDay: day - 30, wallet: 'funds', reserved: 400, exception: false, objections: [], opposition: 60, mods: {} };
    const w = { ...world, applications: [rejected] };
    expect(permitProblems(w, draft, day + 27)).toEqual(['rejected-recently']);
    expect(permitProblems(w, draft, day + 28)).toEqual([]);
    // 別の場所なら出せる
    expect(permitProblems(w, { kind: 'facility', target: { type: 'server', origin: { x: s.origin.x + 5, y: s.origin.y }, rotation: s.rotation } }, day + 1)).toEqual([]);
  });
});

describe('申請中の物は模擬に数えない（15.2）', () => {
  it('申請中・工事中の施設は、雇用・技術力・地価に数えず、完成した日から数える', () => {
    const { world, terrain } = rich();
    // 住宅は道の向かい（北）に塗る。施設は南に置くので、住宅に接さず（用途の例外でなく）同意の案件で可決する
    let w = apply(world, terrain, { kind: 'zone', zone: 'residential', a: { x: 38, y: 46 }, b: { x: 45, y: 46 } });
    for (let i = 0; i < 7; i += 1) w = stepDay(w, terrain);
    w = place(w, terrain, 'server');
    const id = (w.applications.at(-1) as Application).id;
    const jobsOf = (x: World): number => weekStep(x, terrain).view.employers.filter((e) => e.facility).length;
    const facLand = (x: World): number => weekStep(x, terrain).view.field.land.reduce((s, v) => s + v, 0);
    const land0 = facLand(w);
    expect(jobsOf(w)).toBe(0);
    const { world: building } = run(w, terrain, 50, id);
    expect(building.applications.find((a) => a.id === id)?.stage).toBe('construction');
    expect(building.city.facilities.some((f) => f.type === 'server' && f.state === 'constructing')).toBe(true);
    expect(jobsOf(building)).toBe(0);
    expect(building.city.techPower).toBe(0);
    const { world: done } = run(building, terrain, 60, id);
    expect(done.applications.find((a) => a.id === id)?.stage).toBe('done');
    expect(jobsOf(done)).toBe(1);
    expect(done.city.techPower).toBe(1);
    expect(facLand(done)).toBeGreaterThan(land0);
  });
});

describe('施設のアップグレードを申請にする（15.1）', () => {
  it('反対の受付から始まり（用途地域の審査を省く）、21 日の工事の後に Lv が上がる。工事の間も今の Lv で動く', () => {
    const { world, terrain } = rich();
    const s = spot(world, terrain, 'server');
    const f: Facility = { id: 'f1', type: 'server', domain: 'linux', origin: s.origin, rotation: s.rotation, level: 1, state: 'active', builtDay: 0 };
    const w0 = { ...world, city: { ...world.city, facilities: [f] } };
    const w = apply(w0, terrain, { kind: 'upgrade', facilityId: 'f1', skills: { linux: 40 } });
    const a = w.applications[0] as Application;
    expect(a).toMatchObject({ kind: 'upgrade', stage: 'objection', target: { facilityId: 'f1', toLevel: 2 } });
    expect(w.city.funds).toBe(20000 - 400);
    expect(w.city.facilities[0]?.level).toBe(1);
    // 同じ施設のアップグレードは 1 件ずつ
    expect(apply(w, terrain, { kind: 'upgrade', facilityId: 'f1', skills: { linux: 40 } })).toBe(w);
    const day0 = Math.floor(w0.city.day);
    const { log, world: end } = run(w, terrain, 80, a.id);
    const council = nextCouncilDay(day0 + 14);
    expect(log).toEqual([
      { day: day0 + 1, stage: 'objection' },
      { day: day0 + 14, stage: 'council' },
      { day: council, stage: 'construction' },
      { day: council + 21, stage: 'done' },
    ]);
    expect(end.city.facilities[0]).toMatchObject({ level: 2, state: 'active' });
  });
});

describe('配置の小窓に出す、申請になるか・出せない理由', () => {
  it('IT 施設は「申請になる」。7 件目は「審議中の申請が多すぎる」。公園の類は申請にならない', () => {
    const { world, terrain } = rich();
    const s = spot(world, terrain, 'server');
    const op: Op = { kind: 'facility', type: 'server', origin: s.origin, rotation: s.rotation };
    expect(permitPreview(world, op, terrain)).toEqual({ application: true, problems: [] });
    let w = world;
    for (let i = 0; i < MAX_PENDING; i += 1) w = place(w, terrain, 'server');
    const s7 = spot(w, terrain, 'server');
    expect(permitPreview(w, { kind: 'facility', type: 'server', origin: s7.origin, rotation: s7.rotation }, terrain)).toEqual({ application: true, problems: ['too-many'] });
    expect(permitPreview(w, { kind: 'facility', type: 'park', origin: s7.origin, rotation: 0 }, terrain)).toEqual({ application: false, problems: [] });
    // 申請中の敷地に公園は置けない
    const first = w.applications[0]?.target.origin as Point;
    expect(permitPreview(w, { kind: 'facility', type: 'park', origin: first, rotation: 0 }, terrain).problems).toEqual(['site']);
  });
});
