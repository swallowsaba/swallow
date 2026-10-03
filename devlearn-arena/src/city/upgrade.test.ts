import { describe, expect, it } from 'vitest';
import { FACILITY_ORDER, isLargeFacility } from './facilities';
import { newCity } from './newCity';
import { checkUpgrade, upgradeFacility } from './upgrade';
import type { City, Facility, FacilityType } from './types';

const fac = (id: string, type: FacilityType, level: Facility['level'], over: Partial<Facility> = {}): Facility => ({
  id, type, origin: { x: 45, y: 44 }, rotation: 0, level, state: 'active', builtDay: 0, ...over,
});
const city = (facilities: Facility[], over: Partial<City> = {}): City => ({ ...newCity(), facilities, ...over });

describe('大型施設（docs/game-design.md 5 章・docs/decisions.md D-12）', () => {
  it('敷地が 3×3 の 5 施設だけが大型施設', () => {
    expect(FACILITY_ORDER.filter(isLargeFacility).sort()).toEqual(['academy', 'cloud', 'cluster', 'container', 'research']);
  });
});

describe('施設のアップグレード（docs/game-design.md 2・5・6 章）', () => {
  it('Lv N に上げるには、分野のスキル段階 N 以上と資金（建てた費用 × N ÷ 2）が要る', () => {
    const c = city([fac('f1', 'server', 1)]);
    const no = checkUpgrade(c, 'f1', { linux: 29 });
    expect(no).toMatchObject({ ok: false, level: 2, cost: 400, reasons: [{ code: 'skill' }] });
    expect(no?.reasons[0]?.text).toBe('Linux / CLIのスキルが「初級」以上になると上げられる（今は「見習い」）');

    const yes = checkUpgrade(c, 'f1', { linux: 30 });
    expect(yes).toMatchObject({ ok: true, level: 2, cost: 400, reasons: [] });
    const after = upgradeFacility(c, yes!);
    expect(after.facilities[0]?.level).toBe(2);
    expect(after.funds).toBe(c.funds - 400);
  });

  it('資金が足りなければ、足りない額を理由に出し、上げない', () => {
    const c = city([fac('f1', 'server', 2)], { funds: 500 });
    const check = checkUpgrade(c, 'f1', { linux: 55 });
    expect(check).toMatchObject({ ok: false, level: 3, cost: 600, reasons: [{ code: 'funds', text: '資金が足りない（あと 100）' }] });
    expect(upgradeFacility(c, check!)).toBe(c);
  });

  it('大型施設の Lv3・Lv4・Lv5 は、地方都市・中核都市・技術都市になってから', () => {
    const rich = { funds: 100000 };
    const at = (level: Facility['level'], stage: City['stage']) => checkUpgrade(city([fac('f1', 'academy', level)], { ...rich, stage }), 'f1', { found: 100 });
    expect(at(1, 1)?.ok).toBe(true);
    expect(at(2, 2)).toMatchObject({ ok: false, reasons: [{ code: 'stage', text: '大型施設の Lv3 は、都市が「地方都市」になると上げられる' }] });
    expect(at(2, 3)?.ok).toBe(true);
    expect(at(3, 3)?.reasons.map((r) => r.code)).toEqual(['stage']);
    expect(at(3, 4)?.ok).toBe(true);
    expect(at(4, 4)?.reasons.map((r) => r.code)).toEqual(['stage']);
    expect(at(4, 5)?.ok).toBe(true);
  });

  it('大型施設でない施設は、村のままでもスキルと資金だけで Lv5 まで上げられる', () => {
    let c = city([fac('f1', 'web', 1)], { funds: 100000, stage: 1 });
    for (const lv of [2, 3, 4, 5]) {
      const check = checkUpgrade(c, 'f1', { web: 95 });
      expect(check).toMatchObject({ ok: true, level: lv });
      c = upgradeFacility(c, check!);
    }
    expect(c.facilities[0]?.level).toBe(5);
    expect(checkUpgrade(c, 'f1', { web: 95 })).toBeNull();
  });

  it('2 つの分野の施設（コンテナ施設）は、高い方の分野の段階で判定する', () => {
    const c = city([fac('f1', 'container', 1)]);
    expect(checkUpgrade(c, 'f1', { ctr: 5, docker: 31 })).toMatchObject({ ok: true, currentSkillStage: 2 });
  });

  it('建設中の施設と、公園の類は上げられない', () => {
    expect(checkUpgrade(city([fac('f1', 'server', 1, { state: 'constructing' })]), 'f1', { linux: 40 })?.reasons.map((r) => r.code)).toEqual(['constructing']);
    expect(checkUpgrade(city([fac('p1', 'park', 1)]), 'p1', {})).toBeNull();
  });
});
