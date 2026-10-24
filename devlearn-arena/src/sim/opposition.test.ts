import { describe, expect, it } from 'vitest';
import type { FacilityType } from '@/city/types';
import { POLITICS_RULES, REASONS } from '@/content/politics';
import type { Command, Op } from './commands';
import { applyOp } from './commands';
import { layerOf } from './layers';
import { facilitySteps, NOISE_SPAN, oppositionOf, ORGANIZATION, RENT_SPAN, SUNLIGHT_SPAN } from './opposition';
import { CONSENT_LIMIT, STAGE_DAYS } from './permits';
import { SimRunner } from './runner';
import type { Application, Difficulty, Measure, ObjectionReason, World } from './types';
import { stepDay } from './world';
import { village } from './__fixtures__/cities';

/**
 * 反対（docs/game-design.md 16 章・docs/testing-strategy.md 10.2「反対」）。
 * 反対率は模擬の値から計算する。乱数で決めない。
 */

/** 命令の列を日付どおりに当てながら進めた村（90 日。住宅に人が住み、店と工場が動いている） */
function grown(): { world: World; terrain: ReturnType<typeof village>['terrain'] } {
  const { world, terrain, commands } = village();
  const runner = new SimRunner(world);
  runner.load(world, 0, POLITICS_RULES);
  let i = 0;
  for (let d = 0; d <= 90; d += 1) {
    while (i < commands.length && (commands[i] as Command).day <= d) {
      runner.apply(commands[i] as Command);
      i += 1;
    }
    if (d < 90) runner.advance(d + 1);
  }
  const w = runner.current;
  return { world: { ...w, city: { ...w.city, funds: 20000 } }, terrain };
}
const GROWN = grown();

/** 住宅のそば（北の細い道の端。住宅の列 x = 47 の隣）と、住宅から離れた所（工業の東） */
const NEAR = { origin: { x: 46, y: 36 }, rotation: 0 } as const;
const FAR = { origin: { x: 57, y: 48 }, rotation: 180 } as const;

function draft(type: FacilityType, at: { origin: { x: number; y: number }; rotation: 0 | 90 | 180 | 270 }, mods: Application['mods'] = {}): Application {
  return {
    id: 'a9', kind: 'facility', target: { type, origin: { ...at.origin }, rotation: at.rotation }, stage: 'objection', stageDay: 90, filedDay: 83,
    wallet: 'funds', reserved: 650, exception: false, objections: [], opposition: 0, mods,
  };
}

const reason = (id: string): ObjectionReason => REASONS.find((r) => r.id === id) as ObjectionReason;
/** 計算を確かめるための理由（データの理由の形を借りて、強さの計算だけを替える） */
const probe = (measure: Measure, radius = 4, targets = ['datacenter']): ObjectionReason => ({ ...reason('dc-jobs'), id: `probe-${measure.kind}`, measure, radius, targets });

function oppose(world: World, app: Application, reasons?: ObjectionReason[]): ReturnType<typeof oppositionOf> {
  return oppositionOf(world, GROWN.terrain, app, POLITICS_RULES, reasons);
}
const sum = (o: ReturnType<typeof oppositionOf>): number => o.objections.reduce((a, b) => a + b.full, 0);

describe('反対率と内訳（16.3）', () => {
  it('データセンターを住宅のそばに置くと、夜間の騒音・電力の逼迫・雇用が少ない・冷却水の使用が立ち、内訳の合計が反対率と一致する', () => {
    const o = oppose(GROWN.world, draft('datacenter', NEAR));
    expect(o.objections.map((b) => b.reasonId)).toEqual(['dc-night-noise', 'dc-power', 'dc-jobs', 'dc-cooling-water']);
    for (const b of o.objections) expect(b.full, b.reasonId).toBeGreaterThan(0);
    expect(sum(o)).toBeCloseTo(o.opposition, 9);
    expect(o.opposition).toBeGreaterThan(CONSENT_LIMIT);
    expect(o.opposition).toBeLessThanOrEqual(100);
    // 近くの集団の理由は地区と多い層を持つ。都市全体の集団（環境の会）は地区を持たない
    expect(o.objections.find((b) => b.reasonId === 'dc-jobs')).toMatchObject({ group: 'neighbors', district: expect.any(Number) as number, topLayer: expect.any(Number) as number });
    expect(o.objections.find((b) => b.reasonId === 'dc-cooling-water')?.district).toBeUndefined();
  });

  it('住宅から離して置くと、騒音の理由が立たず、反対率が下がる（場所で反対率が変わる）', () => {
    const near = oppose(GROWN.world, draft('datacenter', NEAR));
    const far = oppose(GROWN.world, draft('datacenter', FAR));
    expect(far.objections.map((b) => b.reasonId)).not.toContain('dc-night-noise');
    expect(far.opposition).toBeLessThan(near.opposition);
    expect(sum(far)).toBeCloseTo(far.opposition, 9);
  });

  it('同じ場所と同じ都市なら、同じ反対率と内訳（決定性）', () => {
    const a = oppose(GROWN.world, draft('datacenter', NEAR));
    const b = oppose(structuredClone(GROWN.world), draft('datacenter', NEAR));
    expect(b).toEqual(a);
  });

  it('組織化の係数（27 章）: やさしい町 0.8 倍・手ごわい町 1.25 倍', () => {
    const at = (d: Difficulty): number => oppose({ ...GROWN.world, politics: { ...GROWN.world.politics, difficulty: d } }, draft('datacenter', FAR)).opposition;
    const normal = at('normal');
    expect(normal).toBeGreaterThan(0);
    expect(normal * ORGANIZATION.tough).toBeLessThan(100);
    expect(at('tough')).toBeCloseTo(normal * 1.25, 9);
    expect(at('gentle')).toBeCloseTo(normal * 0.8, 9);
  });

  it('層の構成で変わる: 仕事を重く見る若者だけの町では、雇用の理由の反対が高齢だけの町より多い', () => {
    const only = (age: number): World => ({
      ...GROWN.world,
      sim: {
        ...GROWN.world.sim,
        households: Object.fromEntries(Object.entries(GROWN.world.sim.households).map(([id, hh]) => {
          const total = hh.reduce((a, v) => a + v, 0);
          const next = new Array<number>(12).fill(0);
          next[layerOf(age, 1)] = total;
          return [id, next];
        })),
      },
    });
    const jobs = [reason('dc-jobs')];
    const young = oppose(only(0), draft('datacenter', NEAR), jobs);
    const senior = oppose(only(3), draft('datacenter', NEAR), jobs);
    expect(young.opposition).toBeGreaterThan(senior.opposition);
    expect(young.objections[0]?.topLayer).toBe(layerOf(0, 1));
  });

  it('都市全体の集団は、人数に 0.3 を掛けて影響の範囲に足す（近くの理由が無ければ、都市全体の懸念の割合そのまま）', () => {
    // 冷却水だけ: 環境の会（高齢と子育て）の懸念 = 強さ × 重み。影響の範囲は環境の会の人だけなので、0.3 は割合に効かない
    const water = oppose(GROWN.world, draft('datacenter', FAR), [reason('dc-cooling-water')]);
    const near = oppose(GROWN.world, draft('datacenter', NEAR), [reason('dc-cooling-water')]);
    expect(water.opposition).toBeCloseTo(near.opposition, 9);
    // 近くの理由と一緒だと、近くの住民（重み 1）が影響の範囲に入り、冷却水の割合は小さくなる
    const both = oppose(GROWN.world, draft('datacenter', NEAR), [reason('dc-jobs'), reason('dc-cooling-water')]);
    expect(both.objections.find((b) => b.reasonId === 'dc-cooling-water')?.full).toBeLessThan(water.opposition);
  });
});

describe('理由の強さ（16.2。全ての Measure）', () => {
  const at = (r: ObjectionReason, app = draft('datacenter', NEAR), world = GROWN.world) => oppose(world, app, [r]).objections[0];

  it('騒音の増え方 ÷ 30: 半径の中の住まいの騒音が増える分。夜の騒音を 0 にする性質で 0 になる', () => {
    const b = at(probe({ kind: 'noise', night: true }, 3));
    expect(b?.basis.value).toBeGreaterThan(0);
    expect(b?.strength).toBeCloseTo((b?.basis.value ?? 0) / NOISE_SPAN, 2);
    expect(at(probe({ kind: 'noise', night: true }, 3), draft('datacenter', NEAR, { nightNoise: 0 }))).toBeUndefined();
  });

  it('電力の余裕: 使う量 ÷ 余り（データセンター Lv1 は 3 MW）。余りが 0 以下なら 1。電力の性質で下がる', () => {
    const b = at(probe({ kind: 'power' }));
    expect(b?.basis.value).toBe(3);
    expect(b?.strength).toBeCloseTo(3 / (b?.basis.ref ?? 1), 3);
    expect(at(probe({ kind: 'power' }), draft('datacenter', NEAR, { power: 0.5 }))?.strength).toBeCloseTo((b?.strength ?? 0) / 2, 3);
    const dark = { ...GROWN.world, sim: { ...GROWN.world.sim, power: { ...GROWN.world.sim.power, externalCapMW: 0 } } };
    expect(at(probe({ kind: 'power' }), draft('datacenter', NEAR), dark)?.strength).toBe(1);
  });

  it('雇用の少なさ: 1 − 敷地 1 マスの雇用 ÷ 都市の平均。雇う人数の性質で下がる', () => {
    const b = at(probe({ kind: 'jobs-density' }));
    // データセンター Lv1 は 15 人・6 マス
    expect(b?.basis.value).toBe(2.5);
    expect(b?.strength).toBeCloseTo(1 - 2.5 / (b?.basis.ref ?? 1), 2);
    expect(at(probe({ kind: 'jobs-density' }), draft('datacenter', NEAR, { jobs: 2 }))?.strength).toBeLessThan(b?.strength ?? 0);
  });

  it('日照: （申請の高さ − 隣の住宅の高さ）÷ 4。高さを 1 段下げると 1/4 下がる', () => {
    const b = at(probe({ kind: 'sunlight' }, 3));
    expect(b?.basis).toEqual({ value: facilitySteps('datacenter', 1), ref: 1 });
    expect(b?.strength).toBeCloseTo((facilitySteps('datacenter', 1) - 1) / SUNLIGHT_SPAN, 9);
    expect(at(probe({ kind: 'sunlight' }, 3), draft('datacenter', NEAR, { height: -1 }))?.strength).toBeCloseTo((b?.strength ?? 0) - 1 / SUNLIGHT_SPAN, 9);
  });

  it('交通の増え方: 生む通勤の流れ ÷ 面した道路の容量の余り。交通の性質で下がる', () => {
    const b = at(probe({ kind: 'traffic' }));
    expect(b?.basis.value).toBe(15);
    expect(b?.strength).toBeCloseTo(15 / (b?.basis.ref ?? 1), 2);
    expect(at(probe({ kind: 'traffic' }), draft('datacenter', NEAR, { traffic: 0.5 }))?.strength).toBeCloseTo((b?.strength ?? 0) / 2, 2);
  });

  it('家賃の上がり方 ÷ 10%: 完成した形を仮に入れた 1 週の家賃と、今の家賃を比べる', () => {
    const r = probe({ kind: 'rent' }, 5, ['research']);
    const b = at(r, { ...draft('research', NEAR), reserved: 800 });
    // 研究施設は地価を上げる（13.4）ので、そばの住まいの家賃が上がる見込みになる
    expect(b?.basis.value).toBeGreaterThan(0);
    expect(b?.strength).toBeCloseTo((b?.basis.value ?? 0) / 100 / RENT_SPAN, 2);
    // 遠く（半径の外）なら立たない
    expect(at(r, { ...draft('research', FAR), reserved: 800 })).toBeUndefined();
  });

  it('施設の性質: 冷却水の量 = 0.15 × Lv × 譲歩の倍率', () => {
    expect(at(reason('dc-cooling-water'))?.strength).toBeCloseTo(0.15, 9);
    expect(at(reason('dc-cooling-water'), draft('datacenter', NEAR, { coolingWater: 0.3 }))?.strength).toBeCloseTo(0.045, 9);
  });

  it('公共サービスの負担: 公共サービスは G10 で作るので、それまでは立たない', () => {
    expect(at(probe({ kind: 'service-load', service: 'school' }))).toBeUndefined();
  });

  it('費用: 費用 ÷ 開発資金の残り', () => {
    const b = at({ ...probe({ kind: 'cost' }), group: 'taxpayers', radius: undefined });
    expect(b?.basis).toEqual({ value: 650, ref: 20000 });
    expect(b?.strength).toBeCloseTo(650 / 20000, 4);
  });
});

describe('反対の受付（15.2）', () => {
  function place(world: World, op: Op): World {
    return applyOp(world, op, GROWN.terrain, POLITICS_RULES);
  }
  function days(world: World, n: number): World {
    let w = world;
    for (let i = 0; i < n; i += 1) w = stepDay(w, GROWN.terrain, POLITICS_RULES);
    return w;
  }

  it('用途地域の審査の後に理由が立ち、反対率が 0 から計算の値まで日ごとに直線で上がる。20% 以上は公聴会の段で待ち、取り下げはできる', () => {
    let w = place(GROWN.world, { kind: 'facility', type: 'datacenter', ...NEAR });
    const id = (w.applications.at(-1) as Application).id;
    const app = (): Application => w.applications.find((a) => a.id === id) as Application;
    w = days(w, STAGE_DAYS.zoning);
    expect(app().stage).toBe('objection');
    expect(app().opposition).toBe(0);
    const full = app().objections.reduce((a, b) => a + b.full, 0);
    expect(full).toBeGreaterThan(CONSENT_LIMIT);
    w = days(w, 7);
    expect(app().opposition).toBeCloseTo(full / 2, 6);
    expect(app().objections.reduce((a, b) => a + b.share, 0)).toBeCloseTo(app().opposition, 9);
    w = days(w, 7);
    expect(app()).toMatchObject({ stage: 'hearing' });
    expect(app().opposition).toBeCloseTo(full, 6);
    // 公聴会の手は G5。それまでは公聴会の段で待つ
    w = days(w, 40);
    expect(app().stage).toBe('hearing');
    const funds = w.city.funds;
    w = place(w, { kind: 'withdraw', applicationId: id });
    expect(app().stage).toBe('withdrawn');
    expect(w.city.funds).toBe(funds + 650);
  });

  it('反対率が 20% 未満で用途の例外でない申請は、同意の案件として公聴会を省く', () => {
    let w = place(GROWN.world, { kind: 'facility', type: 'datacenter', ...FAR });
    const id = (w.applications.at(-1) as Application).id;
    w = days(w, STAGE_DAYS.zoning + STAGE_DAYS.objection);
    const app = w.applications.find((a) => a.id === id) as Application;
    expect(app.opposition).toBeGreaterThan(0);
    expect(app.opposition).toBeLessThan(CONSENT_LIMIT);
    expect(app.stage).toBe('council');
  });

  it('アップグレードは出した日から反対の受付（理由が立つ）', () => {
    let w = place(GROWN.world, { kind: 'facility', type: 'datacenter', ...FAR });
    w = days(w, 60);
    const dc = w.city.facilities.find((f) => f.type === 'datacenter');
    expect(dc?.state).toBe('active');
    w = place(w, { kind: 'upgrade', facilityId: dc?.id ?? '', skills: { db: 1000 } });
    const up = w.applications.at(-1) as Application;
    expect(up).toMatchObject({ kind: 'upgrade', stage: 'objection', opposition: 0 });
    expect(up.objections.map((b) => b.reasonId)).toContain('dc-cooling-water');
  });
});
