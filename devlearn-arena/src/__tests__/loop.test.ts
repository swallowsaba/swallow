import { describe, expect, it } from 'vitest';
import { advance, statsOf } from '@/city/growth';
import { checkFacility, placeFacility } from '@/city/place';
import { generateTerrain } from '@/city/terrain';
import { checkUpgrade } from '@/city/upgrade';
import { LESSONS } from '@/game/lessons';
import { skillsOf } from '@/game/skill';
import type { Progress } from '@/game/types';
import { DOMAIN_IDS } from '@/screens/skills';
import { createSession } from '@/screens/session';

/**
 * 統合テスト（docs/testing-strategy.md 4 章）: 学習記録 → XP・スキル・資金 → 都市の状態。
 * 見本の 2 本（found.b.04・linux.i.01）を学んで都市へ戻り、施設を上げるまでを、画面を通さずに通す。
 */

const DAY = '2026-10-04';
const values = (p: Progress) => Object.fromEntries(Object.entries(skillsOf(DOMAIN_IDS, p, LESSONS, DAY)).map(([d, s]) => [d, s.value]));

function sessionWithFacilities() {
  const session = createSession(7);
  const city = session.city.getState().city;
  const terrain = generateTerrain(city.seed);
  // 初めの道路（y=47）の南側に、市立 IT 学院とサーバ施設を道路へ向けて建てる
  let c = city;
  for (const [type, x] of [['academy', 40], ['server', 46]] as const) {
    const check = checkFacility(c, terrain, type, { x, y: 48 }, 180);
    expect(check.reasons).toEqual([]);
    c = placeFacility(c, type, { x, y: 48 }, 180, check);
  }
  session.city.getState().setCity(advance({ ...c, facilities: c.facilities.map((f) => ({ ...f, state: 'active' as const })) }, 3));
  return session;
}

describe('ゲームループ（docs/acceptance-criteria.md 1 章）: 学習 → XP・スキル・資金 → 都市', () => {
  it('見本の 2 本を学ぶと、資金が XP と同じだけ増え、施設を上げられるようになり、資金で上げると技術力が増える', () => {
    const session = sessionWithFacilities();
    const city = session.city.getState();
    const fundsBefore = city.city.funds;
    expect(fundsBefore).toBe(1500 - 600 - 400);
    expect(statsOf(city.city).techPower).toBe(2);

    city.leave(values(session.progress.getState().progress));
    const outcome = session.progress.getState().learn(['found.b.04', 'linux.i.01'].map((lessonId, i) => ({
      kind: 'lesson' as const, lessonId, at: `${DAY}T1${String(i)}:00:00+09:00`,
      quiz: [1, 2, 3].map((n) => ({ quizId: `${lessonId}.q${String(n)}`, correct: true })),
      practice: [{ success: true }],
      complete: true,
    })));
    const earned = outcome.events.reduce((n, e) => n + e.amount, 0);
    expect(earned).toBeGreaterThan(0);
    // 開発資金は学習で得た XP と同じ量が入る（docs/game-design.md 2 章）
    expect(session.city.getState().city.funds).toBe(fundsBefore + earned);

    const after = values(session.progress.getState().progress);
    const changes = session.city.getState().welcomeBack(after, [], 0);
    const upgradable = changes.filter((c) => c.kind === 'upgradable');
    expect(upgradable.map((c) => c.kind === 'upgradable' && c.level)).toEqual([2, 2]);
    // 戻るとカメラは最初の変化の施設へ寄り、その施設を選ぶ
    const s = session.city.getState();
    expect(s.selected).toEqual({ kind: 'facility', id: upgradable[0]?.kind === 'upgradable' ? upgradable[0].facilityId : '' });
    expect(s.focus?.seq).toBe(1);

    // 資金で上げる。サーバ施設（400）を上げると技術力（施設の Lv の合計）が 2 → 3。
    // 残りの資金では市立 IT 学院（600）に届かず、足りない額を理由に出す（もっと学ぶと上げられる）
    const funds = s.city.funds;
    const server = s.city.facilities.find((f) => f.type === 'server');
    const academy = s.city.facilities.find((f) => f.type === 'academy');
    expect(session.city.getState().upgrade(server?.id ?? '', after, 0)).toBe(true);
    const upgraded = session.city.getState().city;
    expect(upgraded.facilities.find((f) => f.type === 'server')?.level).toBe(2);
    expect(upgraded.funds).toBe(funds - 400);
    expect(statsOf(upgraded).techPower).toBe(3);
    expect(checkUpgrade(upgraded, academy?.id ?? '', after)?.reasons).toEqual([{ code: 'funds', text: `資金が足りない（あと ${String(600 - upgraded.funds)}）` }]);
  });

  it('学ばずに戻っても、都市は上げられるようにならない（学習が都市の燃料）', () => {
    const session = sessionWithFacilities();
    const v = values(session.progress.getState().progress);
    session.city.getState().leave(v);
    expect(session.city.getState().welcomeBack(v, [], 0).filter((c) => c.kind === 'upgradable')).toEqual([]);
    for (const f of session.city.getState().city.facilities) expect(session.city.getState().upgrade(f.id, v, 0)).toBe(false);
  });
});
