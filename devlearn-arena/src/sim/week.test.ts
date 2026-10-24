import { describe, expect, it } from 'vitest';
import type { Building, City } from '@/city/types';
import { NAME_PARTS } from '@/content/politics';
import type { Command } from './commands';
import { commuteOf } from './commute';
import { landTermsAt, noiseTermsAt } from './land';
import { FACTORS, LAYER_SHARE, layerOf, MEAN_HOUSEHOLD_SIZE, weightOf } from './layers';
import { networkOf } from './network';
import { dateOf } from './rules';
import { SimRunner } from './runner';
import { DISTRICT_COUNT, districtOf, spaceOf } from './space';
import type { World } from './types';
import { affordPoints, clampTarget, commutePoints, jobsPoints, nextRentFactor, noisePoints, rentOf, unitsOf, weekStep } from './week';
import { stepDay, worldFromCity } from './world';
import { gridCity, SEED, town, village } from './__fixtures__/cities';

/**
 * 都市の模擬の土台（docs/development-plan.md G1・docs/testing-strategy.md 10.1〜10.2）。
 * docs/game-design.md 13 章の式と表を、ここで固定する。
 */

/** 命令の列を日付どおりに当てながら、days 日進める（Worker と同じ入れ物で動かす） */
function run(world: World, commands: readonly Command[], days: number): World {
  const runner = new SimRunner(world);
  const end = Math.floor(world.city.day) + days;
  let i = 0;
  const sorted = [...commands];
  for (let d = Math.floor(world.city.day); d <= end; d += 1) {
    while (i < sorted.length && (sorted[i] as Command).day <= d) {
      runner.apply(sorted[i] as Command);
      i += 1;
    }
    if (d < end) runner.advance(d + 1);
  }
  return runner.current;
}

describe('時間（docs/game-design.md 13.1）', () => {
  it('1 週 = 7 日、1 年 = 52 週。日付は「N 年目 M 週」', () => {
    expect(dateOf(0)).toEqual({ year: 1, week: 1 });
    expect(dateOf(6)).toEqual({ year: 1, week: 1 });
    expect(dateOf(7)).toEqual({ year: 1, week: 2 });
    expect(dateOf(7 * 52)).toEqual({ year: 2, week: 1 });
    expect(dateOf(7 * 52 + 7 * 13)).toEqual({ year: 2, week: 14 });
  });

  it('週の終わり（7 日ごと）に毎週の計算をする', () => {
    const { world, terrain } = town();
    let w = world;
    const week = w.sim.week;
    for (let i = 0; i < 6; i += 1) w = stepDay(w, terrain);
    expect(w.sim.week).toBe(week);
    w = stepDay(w, terrain);
    expect(w.sim.week).toBe(week + 1);
    expect(w.history.weekly.at(-1)?.week).toBe(week + 1);
  });
});

describe('家賃と手頃さ（docs/game-design.md 13.5）', () => {
  it('地価 100・集合住宅・倍率 1.0 で 6 万円。低の帯（18 万円）の負担は 33%、中の帯（35 万円）は 17%', () => {
    const rent = rentOf(100, 2, 1);
    expect(rent).toBe(60000);
    expect(rent / 180000).toBeCloseTo(0.333, 3);
    expect(rent / 350000).toBeCloseTo(0.171, 3);
    // 戸建ては 1.3 倍
    expect(rentOf(100, 1, 1)).toBe(78000);
  });

  it('需給の倍率は 1 + 0.8 × (5% − 空き室) ÷ 5% を目標に、1 週に ±0.03 まで動き、0.6〜1.8 に収まる', () => {
    expect(nextRentFactor(1, 0.05)).toBe(1);
    expect(nextRentFactor(1, 0)).toBe(1.03);
    expect(nextRentFactor(1.79, 0)).toBe(1.8);
    expect(nextRentFactor(1, 0.5)).toBe(0.97);
    expect(nextRentFactor(0.61, 0.5)).toBe(0.6);
    // 空き室 3% なら目標は 1.32。今 1.31 なら目標まで
    expect(nextRentFactor(1.31, 0.03)).toBeCloseTo(1.32, 6);
  });

  it('仕事に引かれて入る世帯は、空いた仕事の収入の帯の人（オフィスの仕事だけなら、低の帯は初めの分布より少ない）', () => {
    const { world, terrain } = village();
    const homes: Building[] = [40, 41, 42, 43].map((x) => ({ id: `b-h${String(x)}`, zoneId: 'z-home', cell: { x, y: 48 }, variant: 'h', level: 2, builtDay: -10 }));
    const office: Building = { id: 'b-off', zoneId: 'z-off', cell: { x: 46, y: 48 }, variant: 'o', level: 3, builtDay: -10 };
    const city: City = { ...world.city, zones: [{ id: 'z-home', kind: 'residential', cells: homes.map((h) => h.cell) }, { id: 'z-off', kind: 'office', cells: [office.cell] }], buildings: [...homes, office] };
    const empty: World = { ...worldFromCity(city, terrain, NAME_PARTS), sim: { ...worldFromCity(city, terrain, NAME_PARTS).sim, households: {} } };
    const after = weekStep(empty, terrain).world;
    let low = 0;
    let all = 0;
    for (const hh of Object.values(after.sim.households)) {
      hh.forEach((v, l) => {
        all += v;
        if (l % 3 === 0) low += v;
      });
    }
    expect(all).toBeGreaterThan(0);
    expect(low / all).toBeLessThan(0.3);
  });

  it('戸数は住宅の CAPACITY を 1 世帯 2.3 人で割った数', () => {
    expect(unitsOf({ level: 1 })).toBeCloseTo(8 / 2.3, 6);
    expect(unitsOf({ level: 2 })).toBeCloseTo(40 / 2.3, 6);
  });

  it('負担が 40% を超えた層は、毎週その建物の世帯の 5% が出ていく。住めない層は新しく入らない', () => {
    const { world, terrain } = town();
    // 倍率を上限にして、低の帯の負担を 40% より上げる
    const w0: World = { ...world, sim: { ...world.sim, rentFactor: 1.8 } };
    const { world: w1, view } = weekStep(w0, terrain);
    let checked = 0;
    for (const [id, before] of Object.entries(w0.sim.households)) {
      const r = view.rent.get(id);
      if (!r) continue;
      for (const income of [0, 1, 2]) {
        const l = layerOf(0, income);
        if ((r.burden[l] as number) <= 0.4 || (before[l] as number) <= 0) continue;
        expect(w1.sim.households[id]?.[l]).toBeCloseTo((before[l] as number) * 0.95, 5);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe('満足の要因の点（docs/game-design.md 13.8 の表）', () => {
  it('手頃さ: 25% 以下 +5・30% で 0・40% で −15・50% 以上 −20（間は直線）', () => {
    expect(affordPoints(0.1)).toBe(5);
    expect(affordPoints(0.25)).toBe(5);
    expect(affordPoints(0.3)).toBeCloseTo(0, 9);
    expect(affordPoints(0.35)).toBeCloseTo(-7.5, 9);
    expect(affordPoints(0.4)).toBeCloseTo(-15, 9);
    expect(affordPoints(0.6)).toBe(-20);
  });

  it('仕事: 3% 以下 +5・10% で −10・20% 以上 −20', () => {
    expect(jobsPoints(0)).toBe(5);
    expect(jobsPoints(0.1)).toBeCloseTo(-10, 9);
    expect(jobsPoints(0.15)).toBeCloseTo(-15, 9);
    expect(jobsPoints(0.5)).toBe(-20);
  });

  it('通勤: 20 分以下 +3・45 分で −5・60 分以上 −10。騒音: 20 以下 0・60 で −10・80 以上 −15', () => {
    expect(commutePoints(10)).toBe(3);
    expect(commutePoints(45)).toBeCloseTo(-5, 9);
    expect(commutePoints(90)).toBe(-10);
    expect(noisePoints(20)).toBe(0);
    expect(noisePoints(60)).toBeCloseTo(-10, 9);
    expect(noisePoints(70)).toBeCloseTo(-12.5, 9);
    expect(noisePoints(100)).toBe(-15);
  });

  it('層の重み: 年齢の帯と収入の帯の重みを掛ける（若者・低の手頃さは 1.5 × 1.5、高齢の騒音は 1.5、高の帯の税は 1.5）', () => {
    expect(weightOf(layerOf(0, 0), 'afford')).toBe(2.25);
    expect(weightOf(layerOf(0, 2), 'afford')).toBe(0.75);
    expect(weightOf(layerOf(3, 1), 'noise')).toBe(1.5);
    expect(weightOf(layerOf(2, 2), 'tax')).toBeCloseTo(1.8, 9);
    expect(weightOf(layerOf(1, 1), 'school')).toBe(2);
    expect(weightOf(layerOf(1, 1), 'green')).toBe(1);
  });

  it('目標 = 50 + Σ 点 × 重み。0〜100 を外れる時は、点の比を保って縮める', () => {
    expect(clampTarget([10, -5])).toEqual([10, -5]);
    const big = clampTarget([40, 30]);
    expect(50 + big.reduce((s, v) => s + v, 0)).toBeCloseTo(100, 9);
    expect((big[0] as number) / (big[1] as number)).toBeCloseTo(40 / 30, 9);
    const low = clampTarget([-40, -30]);
    expect(50 + low.reduce((s, v) => s + v, 0)).toBeCloseTo(0, 9);
  });
});

describe('支持と支持率（docs/game-design.md 13.8）', () => {
  it('層の支持は、毎週、目標との差の 1/4 だけ近づく（急に跳ねない）', () => {
    const { world, terrain } = town();
    // 税率を 20% にすると、税の点が 10 下がる（重みのある層はそれだけ）。支持はその 1/4 ずつ近づく
    const before = world.sim.supportParts;
    const taxed: World = { ...world, budget: { ...world.budget, taxRate: 20 } };
    const { world: after } = weekStep(taxed, terrain);
    const d = Object.keys(before)[0] as string;
    const tax = FACTORS.indexOf('tax');
    for (let l = 0; l < 12; l += 1) {
      const prev = before[d]?.[l]?.[tax] as number;
      const next = after.sim.supportParts[d]?.[l]?.[tax] as number;
      if (after.sim.support[Number(d)]?.[l] === -1) continue;
      const goal = -10 * weightOf(l, 'tax');
      expect(next - prev).toBeCloseTo((goal - prev) / 4, 4);
    }
  });

  it('支持率 = Σ 層の支持 × 18 歳以上の人数 ÷ 18 歳以上の人数の合計。内訳（要因 × 層）の合計 + 50 と一致する', () => {
    const { world, terrain } = town();
    const w = weekStep(world, terrain).world;
    const b = w.history.breakdown.at(-1);
    expect(b).toBeDefined();
    const sum = (b?.factors ?? []).reduce((s, row) => s + row.reduce((x, v) => x + v, 0), 0);
    expect(50 + sum).toBeCloseTo(w.sim.lastWeek.approval, 3);
  });

  it('支持率の 4 週の変化が、内訳（要因 × 層）の変化の合計と一致する', () => {
    const v = village();
    const w = run(v.world, v.commands, 7 * 12);
    const last = w.history.breakdown.at(-1);
    const prev = w.history.breakdown.at(-5);
    expect(last && prev).toBeTruthy();
    if (!last || !prev) return;
    const total = (b: typeof last): number => b.factors.reduce((s, row) => s + row.reduce((x, y) => x + y, 0), 0);
    expect(last.approval - prev.approval).toBeCloseTo(total(last) - total(prev), 3);
    // 要因ごとの変化も、層ごとの足し算になっている
    const change = FACTORS.map((_, f) => (last.factors[f] ?? []).reduce((s, v) => s + v, 0) - (prev.factors[f] ?? []).reduce((s, v) => s + v, 0));
    expect(change.reduce((s, v) => s + v, 0)).toBeCloseTo(last.approval - prev.approval, 3);
  });

  it('市政への信頼は、1 年で 0 へ 1/4 戻る', () => {
    const { world, terrain } = town();
    let w: World = { ...world, sim: { ...world.sim, trust: world.sim.trust.map(() => 8) } };
    for (let i = 0; i < 52; i += 1) w = weekStep(w, terrain).world;
    for (const t of w.sim.trust) expect(t).toBeCloseTo(6, 3);
  });
});

describe('騒音と地価（docs/game-design.md 13.4）', () => {
  it('工業区画の建物の騒音は 高さの段 × 8、半径 4 で薄まる。住宅の騒音の原因はその建物になる', () => {
    const { world, terrain } = village();
    const home: Building = { id: 'b-home', zoneId: 'z-home', cell: { x: 40, y: 48 }, variant: 'h', level: 1, builtDay: -10 };
    const factory: Building = { id: 'b-fac', zoneId: 'z-fac', cell: { x: 42, y: 48 }, variant: 'f', level: 2, builtDay: -10 };
    const city: City = {
      ...world.city,
      zones: [{ id: 'z-home', kind: 'residential', cells: [home.cell] }, { id: 'z-fac', kind: 'industrial', cells: [factory.cell] }],
      buildings: [home, factory],
    };
    const w = worldFromCity(city, terrain, NAME_PARTS);
    const { view } = weekStep(w, terrain);
    const i = 48 * 96 + 40;
    // 距離 2: 16 × (1 − 2/4) = 8
    expect(view.field.noise[i]).toBeCloseTo(8, 4);
    const terms = noiseTermsAt(view.field, 40, 48);
    expect(terms.map((t) => [t.source.kind, t.source.id, Math.round(t.value * 1000) / 1000])).toEqual([['building', 'b-fac', 8]]);
    // 地価の項の合計は地価のヒートマップの値と同じ。騒音は −0.8 倍で効く
    const land = landTermsAt(view.space, view.field, view.commute.minutes, 40, 48, 'z-home');
    expect(land.reduce((s, t) => s + t.value, 0)).toBeCloseTo(view.field.land[i] as number, 3);
    expect(land.find((t) => t.source.id === 'b-fac')?.value).toBeCloseTo(-6.4, 4);
  });

  it('住宅から離して置くと、騒音は届かない', () => {
    const { world, terrain } = village();
    const home: Building = { id: 'b-home', zoneId: 'z-home', cell: { x: 40, y: 48 }, variant: 'h', level: 1, builtDay: -10 };
    const factory: Building = { id: 'b-fac', zoneId: 'z-fac', cell: { x: 50, y: 48 }, variant: 'f', level: 2, builtDay: -10 };
    const city: City = { ...world.city, zones: [{ id: 'z-home', kind: 'residential', cells: [home.cell] }, { id: 'z-fac', kind: 'industrial', cells: [factory.cell] }], buildings: [home, factory] };
    const { view } = weekStep(worldFromCity(city, terrain, NAME_PARTS), terrain);
    expect(view.field.noise[48 * 96 + 40]).toBe(0);
  });
});

describe('雇用と通勤（docs/game-design.md 13.6）', () => {
  it('働く人は、収入の帯の合う仕事に近い順に入り、入れなかった人が失業率になる', () => {
    const { world, terrain } = town();
    const space = spaceOf(world.city, terrain);
    const net = networkOf(space);
    const a = districtOf(40, 47);
    const near = districtOf(47, 47);
    const far = districtOf(56, 47);
    const workers = new Float64Array(DISTRICT_COUNT * 3);
    const jobs = new Float64Array(DISTRICT_COUNT * 3);
    workers[a * 3 + 1] = 100;
    jobs[near * 3 + 1] = 60;
    jobs[far * 3 + 1] = 60;
    jobs[near * 3 + 2] = 500; // 帯が違う仕事には入らない
    const c = commuteOf(space, net, workers, jobs);
    const to = new Map(c.flows.map((f) => [`${String(f.to)}:${String(f.band)}`, f.people]));
    expect(to.get(`${String(near)}:1`)).toBe(60);
    expect(to.get(`${String(far)}:1`)).toBe(40);
    expect(to.get(`${String(near)}:2`)).toBeUndefined();
    expect(c.unemployment[a * 3 + 1]).toBe(0);
    // 仕事が足りなければ失業する
    jobs[far * 3 + 1] = 10;
    const c2 = commuteOf(space, net, workers, jobs);
    expect(c2.unemployment[a * 3 + 1]).toBeCloseTo(0.3, 9);
  });

  it('道路の流れが容量を超えると、通勤時間が延びる', () => {
    const { world, terrain } = town();
    const space = spaceOf(world.city, terrain);
    const net = networkOf(space);
    const a = districtOf(40, 47);
    const b = districtOf(56, 47);
    const few = new Float64Array(DISTRICT_COUNT * 3);
    const many = new Float64Array(DISTRICT_COUNT * 3);
    const jobs = new Float64Array(DISTRICT_COUNT * 3);
    few[a * 3 + 1] = 10;
    many[a * 3 + 1] = 5000;
    jobs[b * 3 + 1] = 5000;
    const t1 = commuteOf(space, net, few, jobs).minutes[a] as number;
    const t2 = commuteOf(space, net, many, jobs).minutes[a] as number;
    expect(t1).toBeGreaterThan(0);
    expect(t2).toBeGreaterThan(t1 * 2);
  });
});

describe('決定性（docs/testing-strategy.md 10.1）', () => {
  it('同じ seed・同じ命令の列からは、2 年分を 2 回流しても深く等しい（村）', () => {
    const v1 = village();
    const a = run(v1.world, v1.commands, 728);
    const v2 = village();
    const b = run(v2.world, v2.commands, 728);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    expect(a.city.population).toBeGreaterThan(0);
    expect(a.history.weekly.length).toBeGreaterThan(100);
  });

  it('町と地方都市でも、2 回流すと深く等しい', () => {
    for (const make of [town, () => gridCity(false)]) {
      const x = make();
      const y = make();
      const days = 7 * 30;
      expect(JSON.stringify(run(y.world, [], days))).toBe(JSON.stringify(run(x.world, [], days)));
    }
  });

  it('命令の順を入れ替えると、結果が変わる（命令が本当に効いている）', () => {
    const v = village();
    const base = run(v.world, v.commands, 200);
    // 工業と公園の日を入れ替える
    const swapped = v.commands.map((c) => (c.seq === 7 ? { ...c, day: 45 } : c.seq === 9 ? { ...c, day: 20 } : c)).sort((p, q) => p.day - q.day || p.seq - q.seq);
    const other = run(village().world, swapped, 200);
    expect(JSON.stringify(other)).not.toBe(JSON.stringify(base));
  });

  it('途中で保存して読み込んで続けても、結果が変わらない（命令は日の区切りで当たる）', () => {
    const v = village();
    const whole = run(v.world, v.commands, 300);
    const half = run(village().world, v.commands.filter((c) => c.day < 100), 100);
    const reloaded = JSON.parse(JSON.stringify(half)) as World;
    const rest = run(reloaded, v.commands.filter((c) => c.day >= 100), 200);
    expect(JSON.stringify(rest)).toBe(JSON.stringify(whole));
  });

  it('seed を変えても、地区の名前のほかは同じ数字になる（数字に乱数を使っていない）', () => {
    const a = town();
    const b = town();
    const other: World = { ...b.world, sim: { ...b.world.sim, districtNames: NAME_PARTS.prefixes.slice(0, 1).flatMap(() => b.world.sim.districtNames).reverse() } };
    const ra = run(a.world, [], 70);
    const rb = run(other, [], 70);
    expect(rb.history.weekly).toEqual(ra.history.weekly);
    expect(rb.sim.households).toEqual(ra.sim.households);
  });
});

describe('移行と始め（docs/data-model.md 12 章）', () => {
  it('今の都市から始めると、都市規模の差が 1% 以内で、世帯は初めの分布になる', () => {
    const { world, terrain } = gridCity(false);
    const capacityPeople = world.city.buildings.reduce((s, b) => {
      const zone = world.city.zones.find((z) => z.id === b.zoneId);
      return zone?.kind === 'residential' ? s + ([8, 40, 150, 600, 1500][b.level - 1] ?? 0) : s;
    }, 0);
    expect(Math.abs(world.city.population - capacityPeople) / capacityPeople).toBeLessThan(0.01);
    const hh = Object.values(world.sim.households)[0] as number[];
    const total = hh.reduce((s, v) => s + v, 0);
    LAYER_SHARE.forEach((share, l) => expect((hh[l] as number) / total).toBeCloseTo(share, 6));
    expect(total * MEAN_HOUSEHOLD_SIZE).toBeGreaterThan(0);
    // 支持は始めの週の目標の値で埋める（−1 のままの所は住む人がいない）
    expect(world.sim.support.flat().some((v) => v >= 0)).toBe(true);
    expect(world.sim.trust.every((v) => v === 0)).toBe(true);
    expect(world.sim.rentFactor).toBe(1);
    expect(terrain.seed).toBe(SEED);
  });
});
