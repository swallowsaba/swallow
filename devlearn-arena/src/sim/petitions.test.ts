import { describe, expect, it } from 'vitest';
import { FACILITY_DEFS } from '@/city/facilities';
import { PETITIONS, POLITICS_RULES, validatePetitions } from '@/content/politics';
import { applyOp } from './commands';
import { incomeOf, LAYERS } from './layers';
import { buildSiteOf, INBOX_MAX, placeValues, PETITION_COOLDOWN_WEEKS, PETITION_DEADLINE_WEEKS } from './petitions';
import type { Petition, PoliticsRules, World } from './types';
import { weekStep, type WeekView } from './week';
import { stepDayView } from './world';
import { grownVillage, village } from './__fixtures__/cities';

const T = village().terrain;

/**
 * 請願（docs/game-design.md 22.1・docs/content-spec.md 7.3）: 届く条件（地区ごとの値）・優先・受信箱 5 通・期限 8 週・26 週は再び届かない・
 * 受理の中身が模擬に効く（家賃の補助・建てる・騒音の制限・バス・電気の上限）・信頼の動き
 */

/** 見本の都市は請願の候補を入れて動かしてあるので、受信箱を空にしてから使う */
const fresh = (g: { world: World }): { world: World } => ({ world: { ...g.world, petitions: { inbox: [], handled: {}, effects: [] } } });
/** 家賃の高い町: 400 日育てた村の需給の倍率を上げてある（空き室が減り続けた町。13.5 の倍率は 1 週に ±3% しか動かない） */
const highRent = (g: { world: World }): { world: World } => ({ world: { ...g.world, sim: { ...g.world.sim, rentFactor: 1.6 } } });
const RENT = fresh(highRent(grownVillage(400)));
const SMALL = fresh(grownVillage(200));

function days(world: World, n: number, rules: PoliticsRules = POLITICS_RULES): { world: World; view: WeekView | null } {
  let w = world;
  let view: WeekView | null = null;
  for (let i = 0; i < n; i += 1) {
    const r = stepDayView(w, T, rules);
    w = r.world;
    if (r.view) view = r.view;
  }
  return { world: w, view };
}
const toWeekEnd = (w: World, rules: PoliticsRules = POLITICS_RULES) => days(w, 7 - (Math.floor(w.city.day) % 7), rules);
const only = (...ids: string[]): PoliticsRules => ({ ...POLITICS_RULES, petitions: PETITIONS.filter((p) => ids.includes(p.id)) });
const withPetitions = (...extra: Petition[]): PoliticsRules => ({ ...POLITICS_RULES, petitions: extra });
const lowBurden = (w: World, view: WeekView, d: number): number => placeValues(w, view).districts.get(d)?.['rentBurden.低'] ?? NaN;

describe('請願のデータ', () => {
  it('検証を通る（式・語・層・文の使い回し）', () => {
    expect(validatePetitions(PETITIONS)).toEqual([]);
  });

  it('読めない式・数えていない語・start の語・申請の要る種類を建てる・文の使い回しを落とす', () => {
    const base = PETITIONS[0] as Petition;
    const bad: Petition[] = [
      { ...base, id: 'a', when: 'rentBurden.低 >> 3' },
      { ...base, id: 'b', when: 'any:coverage.school < 10', text: 'b1', accept: { ...base.accept, why: 'b2' }, reject: { why: 'b3' } },
      { ...base, id: 'c', when: 'population >= start.population', text: 'c1', accept: { ...base.accept, why: 'c2' }, reject: { why: 'c3' } },
      { ...base, id: 'd', text: 'd1', accept: { effect: { kind: 'build', type: 'datacenter' }, why: 'd2' }, reject: base.reject },
    ];
    const problems = validatePetitions(bad);
    expect(problems).toContain('a: when が式として読めない（rentBurden.低 >> 3）');
    expect(problems).toContain('b: coverage.school は今の模擬が数えていない語');
    expect(problems).toContain('c: start の語は公約だけ（population）');
    expect(problems).toContain('d: datacenter は申請の要る種類（建てる請願は、申請の要らない種類だけ）');
    expect(problems.some((p) => p.startsWith('d: 文が a と同じ'))).toBe(true);
  });
});

describe('条件の値（7.7）', () => {
  it('地区の家賃の負担は、その帯の世帯の数で重みを付けた平均（%）', () => {
    const { world, view } = toWeekEnd(RENT.world);
    if (!view) throw new Error('週の終わりの値が無い');
    const d = 66;
    let s = 0;
    let n = 0;
    for (const zb of view.space.residential) {
      if (zb.district !== d) continue;
      const hh = world.sim.households[zb.building.id] ?? [];
      const burden = view.rent.get(zb.building.id)?.burden ?? [];
      for (const l of LAYERS) {
        if (incomeOf(l) !== 0) continue;
        s += (hh[l] ?? 0) * (burden[l] ?? 0);
        n += hh[l] ?? 0;
      }
    }
    expect(lowBurden(world, view, d)).toBeCloseTo((s / n) * 100, 1);
  });
});

describe('届く（22.1）', () => {
  it('家賃の負担が 35% を超えた地区から、低い収入の層の請願が届く。届いた理由の値は、その地区の負担', () => {
    const { world, view } = toWeekEnd(RENT.world, only('rent-low'));
    const got = world.petitions.inbox.at(-1);
    expect(got?.petitionId).toBe('rent-low');
    expect(got?.arrivedWeek).toBe(world.sim.week);
    // 届いた地区は、負担が一番重い地区。層は低い収入の帯
    const values = placeValues(world, view as WeekView);
    const heavy = [...values.districts].filter(([, v]) => (v['rentBurden.低'] ?? 0) > 35).sort((a, b) => (b[1]['rentBurden.低'] ?? 0) - (a[1]['rentBurden.低'] ?? 0));
    expect(got?.district).toBe(heavy[0]?.[0]);
    expect(incomeOf(got?.layer ?? -1)).toBe(0);
    expect(got?.value).toBeGreaterThan(35);
  });

  it('負担が軽い都市には、家賃の請願は届かない', () => {
    // 需給の倍率が一番低い（空き室の多い）町
    const { world } = toWeekEnd({ ...SMALL.world, sim: { ...SMALL.world.sim, rentFactor: 0.6 } }, only('rent-low'));
    expect(world.petitions.inbox).toEqual([]);
  });

  it('同じ週に条件を満たす物が 2 つあれば、優先の高い方が 1 つだけ届く', () => {
    // rent-low（優先 3）と playground（優先 2）の両方が条件を満たす
    const { world } = toWeekEnd(RENT.world, only('rent-low', 'playground'));
    expect(world.petitions.inbox.map((i) => i.petitionId)).toEqual(['rent-low']);
    const next = toWeekEnd(world, only('rent-low', 'playground')).world;
    expect(next.petitions.inbox.map((i) => i.petitionId)).toEqual(['rent-low', 'playground']);
  });

  it('同じ優先なら seed で選ぶ（同じ都市と週なら、いつも同じ物）', () => {
    const a: Petition = { ...(PETITIONS.find((p) => p.id === 'rent-family') as Petition), id: 'pa', priority: 5, when: 'any:population >= 1' };
    const b: Petition = { ...a, id: 'pb', text: 'x', accept: { ...a.accept, why: 'y' }, reject: { why: 'z' } };
    const rules = withPetitions(a, b);
    const one = toWeekEnd(SMALL.world, rules).world.petitions.inbox;
    const two = toWeekEnd(SMALL.world, rules).world.petitions.inbox;
    expect(one).toHaveLength(1);
    expect(one).toEqual(two);
  });

  it('建てる請願は、置ける空き地のある地区にだけ届く', () => {
    // 公園の行き届きが 0 で子育ての世帯が 80 人以上住む地区は 65 と 66。番号の小さい 65 は区画で埋まっていて公園を置けないので、66 に届く
    const { world } = toWeekEnd(SMALL.world, only('playground'));
    expect(buildSiteOf(world, T, 'park', 65)).toBeNull();
    expect(world.petitions.inbox.map((i) => [i.petitionId, i.district])).toEqual([['playground', 66]]);
  });

  it('受信箱は 5 通まで。いっぱいなら届かない', () => {
    const base = PETITIONS.find((p) => p.id === 'rent-family') as Petition;
    const many = Array.from({ length: 7 }, (_, i): Petition => ({ ...base, when: 'any:population >= 1', id: `p${String(i)}`, text: `t${String(i)}`, accept: { ...base.accept, why: `a${String(i)}` }, reject: { why: `r${String(i)}` } }));
    const rules = withPetitions(...many);
    let w = SMALL.world;
    for (let i = 0; i < 7; i += 1) w = toWeekEnd(w, rules).world;
    expect(w.petitions.inbox).toHaveLength(INBOX_MAX);
  });
});

describe('受理・拒否・保留（22.1）', () => {
  const arrived = toWeekEnd(RENT.world, only('rent-low')).world;
  const entry = arrived.petitions.inbox[0];
  if (!entry) throw new Error('請願が届いていない');
  const p = PETITIONS.find((x) => x.id === 'rent-low') as Petition;
  const rules = only('rent-low');

  it('受理すると、その地区の低い収入の層の家賃が 1 割下がり、12 週のあいだ財政から毎週払う。送った層の信頼 +2', () => {
    const accepted = applyOp(arrived, { kind: 'petition', inboxId: entry.id, choice: 'accept' }, T, rules);
    expect(accepted.petitions.inbox).toEqual([]);
    expect(accepted.petitions.handled['rent-low']).toEqual({ week: arrived.sim.week, choice: 'accept' });
    for (const l of p.layers ?? []) expect(accepted.sim.trust[l]).toBeCloseTo((arrived.sim.trust[l] ?? 0) + 2, 6);
    expect(accepted.sim.trust[1]).toBe(arrived.sim.trust[1]);
    // 次の週: 補助のある方が、同じ地区の低い収入の帯の負担が 1 割軽い
    const yes = toWeekEnd(accepted, rules);
    const no = toWeekEnd(applyOp(arrived, { kind: 'petition', inboxId: entry.id, choice: 'hold' }, T, rules), rules);
    const d = entry.district as number;
    const byes = weekStep(yes.world, T, true, rules).view.rent;
    const bno = weekStep(no.world, T, true, rules).view.rent;
    const home = (yes.view as WeekView).space.residential.find((zb) => zb.district === d && (yes.world.sim.households[zb.building.id]?.[0] ?? 0) > 0);
    if (!home) throw new Error('地区に住まいが無い');
    const ry = byes.get(home.building.id);
    const rn = bno.get(home.building.id);
    expect((ry?.burden[0] ?? 0) / (ry?.rent ?? 1)).toBeCloseTo(((rn?.burden[0] ?? 0) / (rn?.rent ?? 1)) * 0.9, 9);
    // 高い収入の帯（送っていない層）は下がらない
    expect((ry?.burden[2] ?? 0) / (ry?.rent ?? 1)).toBeCloseTo((rn?.burden[2] ?? 0) / (rn?.rent ?? 1), 9);
    expect(lowBurden(yes.world, yes.view as WeekView, d)).toBeLessThan(lowBurden(no.world, no.view as WeekView, d));
    // 財政から払う: 請願の支出が 6。12 週で終わる
    expect(yes.world.budget.ledger.at(-1)?.spend.petitions).toBe(6);
    let w = yes.world;
    let paid = 6;
    for (let i = 0; i < 14; i += 1) {
      w = toWeekEnd(w, rules).world;
      paid += w.budget.ledger.at(-1)?.spend.petitions ?? 0;
    }
    expect(paid).toBe(6 * 12);
    expect(w.petitions.effects).toEqual([]);
  });

  it('拒否すると、送った層の信頼 −2。26 週は同じ請願が届かない', () => {
    const rejected = applyOp(arrived, { kind: 'petition', inboxId: entry.id, choice: 'reject' }, T, rules);
    for (const l of p.layers ?? []) expect(rejected.sim.trust[l]).toBeCloseTo((arrived.sim.trust[l] ?? 0) - 2, 6);
    expect(rejected.petitions.effects).toEqual([]);
    let w = rejected;
    for (let i = 0; i < PETITION_COOLDOWN_WEEKS - 1; i += 1) {
      w = toWeekEnd(w, rules).world;
      expect(w.petitions.inbox).toEqual([]);
    }
    // 26 週の間に家賃の倍率は下がっていくので、家賃の高い町に戻してから 26 週目を進める
    w = toWeekEnd(highRent({ world: w }).world, rules).world;
    expect(w.petitions.inbox.map((i) => i.petitionId)).toEqual(['rent-low']);
  });

  it('保留は何も起きない。届いて 8 週で期限が来ると放置になり、信頼 −1・期限切れを数える', () => {
    const held = applyOp(arrived, { kind: 'petition', inboxId: entry.id, choice: 'hold' }, T, rules);
    expect(held).toBe(arrived);
    let w = held;
    for (let i = 0; i < PETITION_DEADLINE_WEEKS - 1; i += 1) w = toWeekEnd(w, rules).world;
    expect(w.petitions.inbox.map((i) => i.id)).toEqual([entry.id]);
    const before = w.sim.trust;
    w = toWeekEnd(w, rules).world;
    expect(w.petitions.inbox.some((i) => i.id === entry.id)).toBe(false);
    expect(w.petitions.handled['rent-low']?.choice).toBe('expire');
    expect(w.politics.expiredPetitions).toBe(arrived.politics.expiredPetitions + 1);
    // 信頼は毎週少し 0 へ戻るので、戻った後の値から −1
    expect(w.sim.trust[0]).toBeLessThan(before[0] ?? 0);
  });
});

describe('受理の中身が模擬に効く', () => {
  it('公園を建てる: 届いた地区の空き地に公園を置き、財政から払う（開発資金は変わらない）', () => {
    const rules = only('playground');
    const w0 = toWeekEnd(SMALL.world, rules).world;
    const entry = w0.petitions.inbox[0];
    expect(entry?.petitionId).toBe('playground');
    const w1 = applyOp(w0, { kind: 'petition', inboxId: entry?.id ?? '', choice: 'accept' }, T, rules);
    const added = w1.city.facilities.filter((f) => !w0.city.facilities.some((g) => g.id === f.id));
    expect(added.map((f) => f.type)).toEqual(['park']);
    const at = added[0]?.origin ?? { x: -1, y: -1 };
    expect(Math.floor(at.y / 8) * 12 + Math.floor(at.x / 8)).toBe(entry?.district);
    expect(w1.budget.treasury).toBeCloseTo(w0.budget.treasury - FACILITY_DEFS.park.cost, 2);
    expect(w1.city.funds).toBe(w0.city.funds);
  });

  it('騒音の制限: 地区に届く工業の騒音と、その工場の売上が同じ割合で下がる', () => {
    const base = PETITIONS.find((p) => p.id === 'night-factory') as Petition;
    const rules = withPetitions(base);
    const w = SMALL.world;
    const plain = weekStep(w, T, true, rules).view;
    const factory = plain.space.workplaces.find((x) => x.kind === 'industrial');
    if (!factory) throw new Error('工場が無い');
    const d = factory.district;
    const limited: World = { ...w, petitions: { ...w.petitions, effects: [{ petitionId: base.id, untilWeek: w.sim.week + 5, district: d }] } };
    const after = weekStep(limited, T, true, rules).view;
    const at = factory.cell;
    expect(after.field.noise[at]).toBeLessThan(plain.field.noise[at] as number);
    const src = (v: WeekView) => v.field.noiseSources.find((s) => s.id === factory.building.id)?.value ?? 0;
    expect(src(after)).toBeCloseTo(src(plain) * 0.7, 6);
  });

  it('バス: 届いた地区から通う人の通勤の時間が倍率の分だけ短くなる', () => {
    const bus: Petition = { ...(PETITIONS[0] as Petition), id: 'bus', accept: { effect: { kind: 'bus', traffic: 0.8, weeks: 10 }, why: 'x' } };
    const rules = withPetitions(bus);
    const w = SMALL.world;
    const plain = weekStep(w, T, true, rules).view;
    const home = plain.space.residential[0];
    if (!home) throw new Error('住まいが無い');
    const with_: World = { ...w, petitions: { ...w.petitions, effects: [{ petitionId: 'bus', untilWeek: w.sim.week + 5, district: home.district }] } };
    const after = weekStep(with_, T, true, rules).view;
    expect(after.commute.minutes[home.district]).toBeCloseTo((plain.commute.minutes[home.district] as number) * 0.8, 3);
  });

  it('外からの電気の上限を足す', () => {
    const cap: Petition = { ...(PETITIONS.find((p) => p.id === 'outage-power') as Petition), when: 'population >= 1' };
    const rules = withPetitions(cap);
    const w0 = toWeekEnd(SMALL.world, rules).world;
    const entry = w0.petitions.inbox[0];
    const w1 = applyOp(w0, { kind: 'petition', inboxId: entry?.id ?? '', choice: 'accept' }, T, rules);
    expect(w1.sim.power.externalCapMW).toBe(w0.sim.power.externalCapMW + 4);
  });
});

describe('決定性', () => {
  it('同じ都市と同じ操作からは、同じ受信箱と同じ財政', () => {
    const run = (): World => {
      let w = toWeekEnd(RENT.world).world;
      const e = w.petitions.inbox[0];
      if (e) w = applyOp(w, { kind: 'petition', inboxId: e.id, choice: 'accept' }, T, POLITICS_RULES);
      for (let i = 0; i < 4; i += 1) w = toWeekEnd(w).world;
      return w;
    };
    const a = run();
    const b = run();
    expect(a.petitions).toEqual(b.petitions);
    expect(a.budget).toEqual(b.budget);
  });
});
