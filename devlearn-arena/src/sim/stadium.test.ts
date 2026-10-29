import { describe, expect, it } from 'vitest';
import { checkFacility } from '@/city/place';
import type { Facility, FacilityType, Point } from '@/city/types';
import { POLITICS_RULES } from '@/content/politics';
import { eventNear, matchDay, matchInWeek, STADIUM, unlitStadiums } from './awards';
import { heatOf } from './heat';
import { landTermsAt } from './land';
import { factorIndex, FACTORS, LAYERS, ageOf, WEIGHTS } from './layers';
import { oppositionOf } from './opposition';
import { indexOf } from './space';
import type { World } from './types';
import { previewOf, weekStep } from './week';
import { grownVillage } from './__fixtures__/cities';

/**
 * 競技場の効き（docs/game-design.md 25 章・docs/decisions.md U-13・U-14 の判断）:
 * - 若者と子育ての層の住宅が、完成した競技場の中心から直線で 15 マス以内なら、13 番目の要因「催し」に +3（距離で薄めない）
 * - 試合の日は完成した日から 14 日ごと。試合の日を含む週だけ、騒音 20（半径 5）と、
 *   面する道路から道路で 15 マス以内の道路のマスへ交通の流れ 2,000 × (1 − 距離 ÷ 15) を足す
 */

const GROWN = grownVillage(120, true);
const T = GROWN.terrain;
const EVENT = factorIndex('event');
const withFacilities = (w: World, ...fs: Facility[]): World => ({ ...w, city: { ...w.city, facilities: [...w.city.facilities, ...fs] } });
/** 置ける場所のうち、中心から 15 マス以内と外の両方に住宅がある所（見本の村の空き地） */
function siteFor(w: World, type: FacilityType): Point {
  const homes = w.city.buildings.filter((b) => w.sim.households[b.id]);
  for (let y = 20; y < 76; y += 1) {
    for (let x = 20; x < 76; x += 1) {
      if (!checkFacility(w.city, T, type, { x, y }, 0, 1e9).ok) continue;
      const d = homes.map((b) => Math.hypot(b.cell.x + 0.5 - (x + 1.5), b.cell.y + 0.5 - (y + 1.5)));
      if (d.some((v) => v <= 12) && d.some((v) => v > 16)) return { x, y };
    }
  }
  throw new Error(`${type} を置ける場所が無い`);
}
/** 週の終わりの日（その世界の次の週の終わり） */
const END = (Math.floor(GROWN.world.city.day / 7) + 1) * 7;
const AT_END: World = { ...GROWN.world, city: { ...GROWN.world.city, day: END } };
const SITE = siteFor(AT_END, 'stadium');
/** 完成した日を決めた競技場。completeDay = END − 14 なら END が試合の日、END − 7 なら試合の日はこの週に無い */
const stadium = (completeDay: number, mods?: Record<string, number>): Facility => ({
  id: 'st', type: 'stadium', origin: SITE, rotation: 0, level: 1, state: 'active', builtDay: completeDay - 30, completeDay, ...(mods ? { mods } : {}),
});
const MATCH = withFacilities(AT_END, stadium(END - 14));
const OFF = withFacilities(AT_END, stadium(END - 7));

describe('試合の日（U-14: 完成した日から 14 日ごと）', () => {
  it('完成した日の 14 日後・28 日後… が試合の日。完成した日そのものは試合の日でない', () => {
    const f = { builtDay: 0, completeDay: 3 };
    expect([3, 16, 17, 30, 31, 45].map((d) => matchDay(f, d))).toEqual([false, false, true, false, true, true]);
    // 申請を通らずに置いた物（completeDay が無い）は builtDay から数える
    expect(matchDay({ builtDay: 10 }, 24)).toBe(true);
  });

  it('照明（docs/city-design.md 9.5）: 完成した競技場は試合の日だけ照明が灯り、ほかの日は消えている。工事中は数えない', () => {
    const st = (id: string, completeDay: number, state: Facility['state'] = 'active'): Facility => ({ id, type: 'stadium', origin: { x: 0, y: 0 }, rotation: 0, level: 1, state, builtDay: 0, completeDay });
    const city = (day: number) => ({ day, facilities: [st('a', 3), st('b', 10), st('c', 99, 'constructing'), { ...st('p', 3), type: 'police' as const }] });
    expect([...unlitStadiums(city(17))]).toEqual(['b']);
    expect([...unlitStadiums(city(24))]).toEqual(['a']);
    expect([...unlitStadiums(city(18))]).toEqual(['a', 'b']);
  });

  it('週の終わり（7 の倍数の日）ごとに見ると、試合の日を含む週は 1 週おきに来る', () => {
    const f = { builtDay: 0, completeDay: 3 };
    // 週 (14, 21] に 17、週 (28, 35] に 31、週 (42, 49] に 45
    expect([14, 21, 28, 35, 42, 49].map((d) => matchInWeek(f, d))).toEqual([false, true, false, true, false, true]);
  });
});

describe('催し（U-14 の要因 13 番目）', () => {
  it('要因は 13。13 番目が「催し」で、どの層も重みは 1', () => {
    expect(FACTORS.length).toBe(13);
    expect(FACTORS[12]).toBe('event');
    for (const l of LAYERS) expect((WEIGHTS[l] as number[])[EVENT]).toBe(1);
  });

  it('中心から直線で 15 マス以内の若者と子育ての層に +3（薄めない）。中年・高齢と、15 マスの外は 0', () => {
    const { world, view } = weekStep(MATCH, T, false, POLITICS_RULES);
    const center = view.space.awards.find((a) => a.facility.id === 'st')?.center as Point;
    expect(center).toBeDefined();
    let near = 0;
    let far = 0;
    for (const zb of view.space.residential) {
      const d = Math.hypot(zb.building.cell.x + 0.5 - center.x, zb.building.cell.y + 0.5 - center.y);
      const rows = view.points.get(zb.building.id) as number[][];
      for (const l of LAYERS) {
        const row = rows[l] as number[];
        const v = row[EVENT] as number;
        const expected = d <= 15 && ageOf(l) <= 1 ? 3 : 0;
        // 合計が 0〜100 を外れた行は、点の比を保って縮める（clampTarget）。縮めた行は向きだけ比べる
        const clamped = Math.abs(Math.abs(row.reduce((a, x) => a + x, 0)) - 50) < 1e-9;
        if (clamped) expect(v > 0, `${zb.building.id} 層 ${String(l)}`).toBe(expected > 0);
        else expect(v, `${zb.building.id} 層 ${String(l)}`).toBeCloseTo(expected, 6);
      }
      if (d <= 15) near += 1;
      else far += 1;
    }
    expect(near).toBeGreaterThan(0);
    expect(far).toBeGreaterThan(0);
    // 内訳と原因: 催しの点は競技場に付く
    const b = world.history.breakdown.at(-1);
    expect((b?.factors[EVENT] ?? []).reduce((s, v) => s + v, 0)).toBeGreaterThan(0);
    expect(b?.causes.find((c) => c.factor === 'event')?.source).toMatchObject({ kind: 'facility', id: 'st' });
    expect(eventNear(view.space, center.x + 14.4, center.y - 0.5)).toBe(true);
    expect(eventNear(view.space, center.x + 14.6, center.y - 0.5)).toBe(false);
  });

  it('催しは試合の日に関係なく、完成した競技場で毎週効く。工事中と、競技場の無い都市では 0', () => {
    const sum = (w: World): number => (weekStep(w, T, false, POLITICS_RULES).world.history.breakdown.at(-1)?.factors[EVENT] ?? []).reduce((s, v) => s + v, 0);
    expect(sum(OFF)).toBeCloseTo(sum(MATCH), 1);
    expect(sum(AT_END)).toBe(0);
    expect(sum(withFacilities(AT_END, { ...stadium(END + 30), state: 'constructing' }))).toBe(0);
  });
});

describe('試合の日の騒音と交通（U-13・U-14）', () => {
  const match = weekStep(MATCH, T, false, POLITICS_RULES).view;
  const off = weekStep(OFF, T, false, POLITICS_RULES).view;
  const center = match.space.awards[0]?.center as Point;
  const cell = (dx: number, dy: number): number => indexOf(Math.floor(center.x + dx), Math.floor(center.y + dy));

  it('試合の日を含む週だけ、中心に騒音 20（半径 5 で 0 へ薄まる）', () => {
    const at = cell(0, 0);
    const d = Math.hypot(Math.floor(center.x) + 0.5 - center.x, Math.floor(center.y) + 0.5 - center.y);
    expect((match.field.noise[at] as number) - (off.field.noise[at] as number)).toBeCloseTo(20 * (1 - d / 5), 3);
    expect((match.field.noise[cell(6, 0)] as number) - (off.field.noise[cell(6, 0)] as number)).toBeCloseTo(0, 6);
    // 騒音の原因は競技場
    expect(match.field.noiseSources.some((s) => s.id === 'st' && s.value === 20 && s.radius === 5)).toBe(true);
    expect(off.field.noiseSources.some((s) => s.id === 'st')).toBe(false);
  });

  it('試合の日を含む週だけ、面する道路に 2,000、道路で 15 マス先まで薄めて足す', () => {
    const af = match.space.awards[0];
    const front = af?.fronts[0] as number;
    expect((match.commute.traffic[front] as number) - (off.commute.traffic[front] as number)).toBeCloseTo(STADIUM.traffic.value, 1);
    let farther = 0;
    for (let i = 0; i < match.commute.traffic.length; i += 1) {
      const up = (match.commute.traffic[i] as number) - (off.commute.traffic[i] as number);
      if (up > 1e-3 && up < STADIUM.traffic.value) farther += 1;
    }
    expect(farther).toBeGreaterThan(0);
  });

  it('譲歩の noise と traffic（屋根を延ばす・臨時のバス）が、試合の日の騒音と交通に効く', () => {
    const soft = weekStep(withFacilities(AT_END, stadium(END - 14, { noise: 0.6, traffic: 0.6 })), T, false, POLITICS_RULES).view;
    expect(soft.field.noiseSources.find((s) => s.id === 'st')?.value).toBeCloseTo(12, 6);
    const front = soft.space.awards[0]?.fronts[0] as number;
    expect((soft.commute.traffic[front] as number) - (off.commute.traffic[front] as number)).toBeCloseTo(1200, 1);
  });

  it('試合の週は近くの地価が騒音の分だけ下がる（地価と家賃もその週だけ動く）', () => {
    const at = cell(0, -3);
    expect(match.field.land[at] as number).toBeLessThan(off.field.land[at] as number);
  });

  it('全てのマスの地価は、項（13.4 の式。原因つき）の合計と一致する（試合の週も、無い週も）', () => {
    for (const v of [match, off]) {
      for (let y = 0; y < 96; y += 1) {
        for (let x = 0; x < 96; x += 1) {
          const sum = landTermsAt(v.space, v.field, v.commute.minutes, x, y, 'z').reduce((a, t) => a + t.value, 0);
          expect(v.field.land[indexOf(x, y)] as number, `${String(x)},${String(y)}`).toBeCloseTo(sum, 3);
        }
      }
    }
  });

  it('ヒートマップの「催し」: 住宅のマスに、15 マス以内なら 1、外なら 0。競技場の無い都市は全て 0', () => {
    const heat = heatOf(MATCH, match).cells.event;
    const seen = new Set<number>();
    for (const zb of match.space.residential) {
      const d = Math.hypot(zb.building.cell.x + 0.5 - center.x, zb.building.cell.y + 0.5 - center.y);
      expect(heat[zb.cell], zb.building.id).toBe(d <= 15 ? 1 : 0);
      seen.add(d <= 15 ? 1 : 0);
    }
    expect([...seen].sort()).toEqual([0, 1]);
    const plain = weekStep(AT_END, T, false, POLITICS_RULES).view;
    const none = heatOf(AT_END, plain).cells.event;
    for (const zb of plain.space.residential) expect(none[zb.cell]).toBe(0);
  });
});

describe('反対の見込み（16.2）は試合の日の値で見る', () => {
  const app: World['applications'][number] = {
    id: 'a1', kind: 'facility', target: { type: 'stadium', origin: SITE, rotation: 0 }, stage: 'objection', stageDay: END, filedDay: END,
    wallet: 'treasury', reserved: 2000, exception: false, objections: [], opposition: 0, mods: {},
  };
  const world: World = { ...AT_END, budget: { ...AT_END.budget, treasury: 9000 } };

  it('歓声と場内放送: 半径の中の住まいの騒音の増え方から強さが立つ', () => {
    const opp = oppositionOf(world, T, app, POLITICS_RULES);
    const noise = opp.objections.find((o) => o.reasonId === 'rw-stadium-noise');
    expect(noise?.strength ?? 0).toBeGreaterThan(0);
  });

  it('試合の日の渋滞: 申請が生む流れは試合の日の 2,000 と職員の通勤。臨時のバスで 0.6 倍', () => {
    const traffic = (a: typeof app) => oppositionOf(world, T, a, POLITICS_RULES).objections.find((o) => o.reasonId === 'rw-stadium-traffic')?.basis.value;
    expect(traffic(app)).toBe(2015);
    expect(traffic({ ...app, mods: { traffic: 0.6 } })).toBe(1209);
  });

  it('見込みは何日目に見ても同じ（週の偶奇で反対率が揺れない）', () => {
    const later: World = { ...world, city: { ...world.city, day: END + 7 } };
    expect(oppositionOf(later, T, app, POLITICS_RULES).opposition).toBeCloseTo(oppositionOf(world, T, app, POLITICS_RULES).opposition, 6);
    expect(previewOf(MATCH, T).field.noiseSources.some((s) => s.id === 'st')).toBe(true);
    expect(previewOf(OFF, T).field.noiseSources.some((s) => s.id === 'st')).toBe(true);
  });
});
