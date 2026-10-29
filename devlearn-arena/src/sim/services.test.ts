import { describe, expect, it } from 'vitest';
import { FACILITY_DEFS } from '@/city/facilities';
import type { Facility } from '@/city/types';
import { POLITICS_RULES } from '@/content/politics';
import { applyOp } from './commands';
import { ageOf, factorIndex, LAYERS } from './layers';
import { serviceAt } from './land';
import { reach } from './network';
import { reachAreaOf } from './reachArea';
import { gainsOf } from './council';
import { permitProblems, STAGE_DAYS } from './permits';
import { LAND_SERVICE_MAX, SERVICE_DEFICIT, SERVICE_POINTS } from './rules';
import type { World } from './types';
import { previewOf, weekStep } from './week';
import { stepDay } from './world';
import { grownVillage } from './__fixtures__/cities';

/**
 * 公共サービス（docs/game-design.md 24.2・13.8・22.2・docs/testing-strategy.md 10 章「需要・電力・公共サービス」）:
 * 行き届きの距離（道路で）と定員・満足の点・地価・赤字の間は半分・財政で建てる申請
 */

const GROWN = grownVillage(120);
const T = GROWN.terrain;
const active = (id: string, type: Facility['type'], x: number, y: number): Facility => ({ id, type, origin: { x, y }, rotation: 0, level: 1, state: 'active', builtDay: 0 });
const withFacilities = (w: World, ...fs: Facility[]): World => ({ ...w, city: { ...w.city, facilities: [...w.city.facilities, ...fs] } });
const SCHOOL = active('s', 'school', 53, 48);

describe('定義の値（docs/content-spec.md 6 章: facilities.json が game-design の表と一致する）', () => {
  it('大きさ・費用・維持費・行き届く距離・定員・電力・騒音', () => {
    const pick = (t: Facility['type']) => {
      const d = FACILITY_DEFS[t];
      return [d.w, d.d, d.cost, d.upkeep, d.wallet, d.coverage?.distance, d.coverage?.capacity];
    };
    expect(pick('police')).toEqual([2, 2, 500, 30, 'treasury', 12, undefined]);
    expect(pick('fire')).toEqual([2, 2, 500, 30, 'treasury', 10, undefined]);
    expect(pick('school')).toEqual([3, 2, 700, 30, 'treasury', 10, 600]);
    expect(pick('clinic')).toEqual([1, 2, 400, 30, 'treasury', 8, 400]);
    expect(pick('power-thermal')).toEqual([2, 2, 800, 40, 'treasury', undefined, undefined]);
    expect(pick('power-solar')).toEqual([3, 3, 900, 15, 'treasury', undefined, undefined]);
    expect(FACILITY_DEFS['power-thermal'].noise).toEqual({ value: 25, radius: 5 });
    expect(FACILITY_DEFS['power-solar'].noise).toBeUndefined();
  });

  it('満足の点: 治安・教育・医療は行き届き 0 で −6・1 で +4、防災は −4〜+3。地価は 4 種の平均で最大 +30', () => {
    for (const k of ['police', 'school', 'clinic'] as const) expect([SERVICE_POINTS[k].base, SERVICE_POINTS[k].base + SERVICE_POINTS[k].slope]).toEqual([-6, 4]);
    expect([SERVICE_POINTS.fire.base, SERVICE_POINTS.fire.base + SERVICE_POINTS.fire.slope]).toEqual([-4, 3]);
    expect(LAND_SERVICE_MAX).toBe(30);
    expect(SERVICE_DEFICIT).toBe(0.5);
  });
});

describe('行き届き（24.2）', () => {
  it('道路の距離が 0 で 1、行き届く距離で 0 の直線。道路の届かない所には届かない', () => {
    const w = withFacilities(GROWN.world, active('p', 'police', 53, 48));
    const view = previewOf(w, T);
    const af = view.space.civic[0];
    if (!af) throw new Error('警察署が数えられていない');
    const dist = reach(view.space, af.fronts, 12);
    for (const [cell, d] of dist) {
      const road = view.field.service.police.road[cell] as number;
      expect(road).toBeCloseTo(Math.max(0, 1 - d / 12), 5);
    }
    // 道路の外のマスは、面している道路の一番大きい値
    const v = serviceAt(view.field, 'police', 53, 46);
    expect(v.value).toBeGreaterThan(0);
    expect(v.src).toBe(0);
    expect(serviceAt(view.field, 'police', 20, 20).value).toBe(0);
  });

  it('財政が赤字の間は半分（22.2）', () => {
    const w = withFacilities(GROWN.world, active('p', 'police', 53, 48));
    const plain = serviceAt(previewOf(w, T).field, 'police', 53, 46).value;
    const red = { ...w, budget: { ...w.budget, treasury: -10 } };
    expect(serviceAt(previewOf(red, T).field, 'police', 53, 46).value).toBeCloseTo(plain * SERVICE_DEFICIT, 5);
  });

  it('定員: 行き届く子育ての世帯が定員を超えると、超えた分だけ下がる（学校 600）', () => {
    const w = withFacilities(GROWN.world, SCHOOL);
    const families = (x: World): number => Object.values(x.sim.households).reduce((s, hh) => s + LAYERS.filter((l) => ageOf(l) === 1).reduce((a, l) => a + (hh[l] ?? 0), 0), 0);
    expect(families(w)).toBeLessThan(600);
    // 子育ての世帯を 30 倍にすると、定員を超え、教育の点が下がる
    const crowded: World = { ...w, sim: { ...w.sim, households: Object.fromEntries(Object.entries(w.sim.households).map(([id, hh]) => [id, hh.map((v, l) => (ageOf(l) === 1 ? v * 30 : v))])) } };
    expect(families(crowded)).toBeGreaterThan(600);
    const school = factorIndex('school');
    const edu = (x: World): number => {
      const b = weekStep(x, T, true, POLITICS_RULES).view;
      let s = 0;
      for (const rows of b.points.values()) for (const l of LAYERS) if (ageOf(l) === 1) s += rows[l]?.[school] ?? 0;
      return s / b.points.size;
    };
    expect(edu(crowded)).toBeLessThan(edu(w));
  });

  it('地価: 公共サービスの行き届きの平均（4 種）× 30 が足される', () => {
    const w = withFacilities(GROWN.world, active('p', 'police', 53, 48));
    const v0 = previewOf(GROWN.world, T).field.land;
    const view = previewOf(w, T);
    const at = 53 + 46 * 96;
    const cover = serviceAt(view.field, 'police', 53, 46).value;
    expect((view.field.land[at] as number) - (v0[at] as number)).toBeCloseTo((cover * LAND_SERVICE_MAX) / 4, 3);
  });
});

describe('学校から遠い子育ての層の満足が下がり、学校を建てると上がる（G10 の完成条件）', () => {
  it('教育の点は子育ての層だけ。学校の無い村では −6 × 重み 2、学校を建てると上がる', () => {
    const school = factorIndex('school');
    const layerPoints = (w: World): number[] => {
      const b = weekStep(w, T, true, POLITICS_RULES).world.history.breakdown.at(-1);
      return LAYERS.map((l) => b?.factors[school]?.[l] ?? 0);
    };
    const before = layerPoints(GROWN.world);
    for (const l of LAYERS) {
      if (ageOf(l) === 1) expect(before[l]).toBeLessThan(0);
      else expect(before[l]).toBe(0);
    }
    const after = layerPoints(withFacilities(GROWN.world, SCHOOL));
    for (const l of LAYERS) if (ageOf(l) === 1 && (before[l] ?? 0) < 0) expect(after[l]).toBeGreaterThan(before[l] ?? 0);
  });
});

describe('財政で建てる申請（15.1・22.2）', () => {
  it('公共サービスと発電所は申請になり、費用は財政から取り分ける（開発資金は変わらない）。取り下げで財政に戻る', () => {
    const w = applyOp(GROWN.world, { kind: 'facility', type: 'police', origin: { x: 53, y: 48 }, rotation: 0 }, T, POLITICS_RULES);
    const app = w.applications.at(-1);
    expect(app).toMatchObject({ kind: 'facility', wallet: 'treasury', reserved: 500, target: { type: 'police' } });
    expect(w.budget.treasury).toBeCloseTo(GROWN.world.budget.treasury - 500, 6);
    expect(w.city.funds).toBe(GROWN.world.city.funds);
    expect(w.city.facilities.some((f) => f.type === 'police')).toBe(false);
    const back = applyOp(w, { kind: 'withdraw', applicationId: app?.id ?? '' }, T, POLITICS_RULES);
    expect(back.budget.treasury).toBeCloseTo(GROWN.world.budget.treasury, 6);
  });

  it('財政が足りなければ置けない。赤字の間は公共サービスと発電所の申請を出せない（IT 施設は出せる）', () => {
    const poor = { ...GROWN.world, budget: { ...GROWN.world.budget, treasury: 300 } };
    expect(applyOp(poor, { kind: 'facility', type: 'police', origin: { x: 53, y: 48 }, rotation: 0 }, T, POLITICS_RULES).applications).toEqual(poor.applications);
    const red = { ...GROWN.world, budget: { ...GROWN.world.budget, treasury: -1 } };
    expect(permitProblems(red, { kind: 'facility', target: { type: 'power-solar', origin: { x: 53, y: 48 }, rotation: 0 } }, 120)).toContain('deficit');
    expect(permitProblems(red, { kind: 'facility', target: { type: 'web', origin: { x: 53, y: 48 }, rotation: 0 } }, 120)).not.toContain('deficit');
  });

  it('完成した公共サービスは職員を雇い（施設の職員）、技術力には数えない', () => {
    const w = withFacilities(GROWN.world, SCHOOL);
    const next = stepDay(w, T, POLITICS_RULES);
    expect(next.city.techPower).toBe(stepDay(GROWN.world, T, POLITICS_RULES).city.techPower);
    const jobs = (x: World): number => weekStep(x, T, true, POLITICS_RULES).view.jobs;
    expect(jobs(w) - jobs(GROWN.world)).toBeCloseTo(15, 6);
  });
});

describe('公共サービスと発電所の反対と得（16 章・18.1）', () => {
  const T2 = T;
  it('火力の発電所を住宅のそばに出すと、タービンの音と費用の理由が立つ。発電所は議員の「安全」の得になる', () => {
    let w = applyOp(GROWN.world, { kind: 'facility', type: 'power-thermal', origin: { x: 53, y: 48 }, rotation: 0 }, T2, POLITICS_RULES);
    const id = w.applications.at(-1)?.id ?? '';
    for (let i = 0; i < STAGE_DAYS.zoning + 1; i += 1) w = stepDay(w, T2, POLITICS_RULES);
    const app = w.applications.find((a) => a.id === id);
    const reasons = app?.objections.map((o) => o.reasonId) ?? [];
    expect(reasons).toEqual(expect.arrayContaining(['cv-thermal-noise', 'cv-thermal-cost']));
    const g = app ? gainsOf(w, app, T2) : null;
    // 出力 40 MW ÷ 10 = 4（行き届きは持たない）
    expect(g?.raw.safety).toBeCloseTo(4, 1);
    // 譲歩で出力を絞ると、得も下がる
    const trimmed = app ? gainsOf(w, { ...app, mods: { power: 0.75, noise: 0.7 } }, T2) : null;
    expect(trimmed?.raw.safety).toBeCloseTo(3, 1);
    // 財政の得は、税収（職員 15 人分）から維持費 40 を引くと負なので 0
    expect(g?.raw.finance).toBe(0);
  });

  it('警察署は、住民の行き届きが増えた分だけ「安全」の得になる。地形を渡さなければ数えない', () => {
    const w = applyOp(GROWN.world, { kind: 'facility', type: 'police', origin: { x: 53, y: 48 }, rotation: 0 }, T2, POLITICS_RULES);
    const app = w.applications.at(-1);
    if (!app) throw new Error('申請が無い');
    expect(gainsOf(w, app, T2).raw.safety).toBeGreaterThan(0);
    expect(gainsOf(w, app).raw.safety).toBe(0);
  });
});

describe('届く範囲（docs/ui-design.md 11.1・11.5: 置く場所の枠と、施設を押した時に縁で示す範囲）', () => {
  it('公共サービスの届く範囲は、行き届きが 0 より大きい道路の外のマスと一致する', () => {
    const police = active('p', 'police', 53, 48);
    const view = previewOf(withFacilities(GROWN.world, police), T);
    const area = new Set(reachAreaOf(view.space, police));
    expect(area.size).toBeGreaterThan(0);
    for (let i = 0; i < 96 * 96; i += 1) {
      if ((view.space.roadKind[i] ?? -1) >= 0) continue;
      const v = serviceAt(view.field, 'police', i % 96, Math.floor(i / 96)).value;
      expect(area.has(i), String(i)).toBe(v > 0);
    }
  });

  it('発電所は、面している道路網の全て。道路に面していなければ空。IT 施設は範囲を持たない', () => {
    const view = previewOf(GROWN.world, T);
    const plant = active('t', 'power-thermal', 53, 48);
    const all = reachAreaOf(view.space, plant) ?? [];
    const school = reachAreaOf(view.space, SCHOOL) ?? [];
    expect(all.length).toBeGreaterThan(school.length);
    expect(reachAreaOf(view.space, active('t2', 'power-thermal', 10, 10))).toEqual([]);
    expect(reachAreaOf(view.space, active('w', 'web', 53, 48))).toBeNull();
  });
});
