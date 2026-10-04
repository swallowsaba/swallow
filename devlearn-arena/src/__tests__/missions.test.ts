import { describe, expect, it } from 'vitest';
import { FACILITY_DEFS } from '@/city/facilities';
import { checkFacility, placeFacility } from '@/city/place';
import { upgradeCost } from '@/city/rules';
import { generateTerrain } from '@/city/terrain';
import { ERROR_GUIDES } from '@/content/glossary';
import { MISSIONS } from '@/content/missions';
import type { Mission } from '@/content/schema';
import { initialShell } from '@/engines/environments';
import { createClock } from '@/engines/kernel/clock';
import { createDefaultRegistry } from '@/engines/kernel/commands';
import { execute } from '@/engines/kernel/shell';
import { afterCommand, answerOf, attemptOf, isFinished, openHint, startRun, type PracticeRun } from '@/learning/practice';
import { missionFacility, missionStatus, unplacedLandmarks } from '@/learning/missions';
import { createSession } from '@/screens/session';

/**
 * 統合テスト（docs/testing-strategy.md 4 章）: ミッションの達成 → 報酬 → 都市。
 * 6 本のミッションを受け、模擬環境で最後のヒントの通りに打って達成し、報酬が都市に現れるまでを、画面を通さずに通す。
 */

const registry = createDefaultRegistry();
const AT = '2026-10-04T10:00:00+09:00';

/** 実戦を、各手順の最後のヒント（そのまま打てば通る答え）を開いて打ちながら進める */
function play(m: Mission): PracticeRun {
  const practice = m.practice;
  const clock = createClock();
  let shell = initialShell(practice.environment, practice.setup);
  let run = startRun();
  for (const step of practice.steps) {
    if (isFinished(practice, run)) break;
    for (let i = 0; i < 3; i++) run = openHint(practice, run);
    for (const line of answerOf(step)) {
      const out = execute(shell, line, registry, clock);
      shell = out.state;
      const stderr = out.chunks.filter((c) => c.stream === 'stderr').map((c) => c.text).join('');
      run = afterCommand(practice, run, { line, stderr, shell }, ERROR_GUIDES).run;
    }
  }
  return run;
}

describe('ミッションの達成 → 報酬 → 都市（docs/development-plan.md Phase 9 の完成条件）', () => {
  it.each(MISSIONS.map((m) => [m.title, m] as const))('%s: 受けて達成すると、XP と資金が入り、記念碑を都市に置ける', (_, m) => {
    const session = createSession(7);
    const fundsBefore = session.city.getState().city.funds;

    // 受けるのに前提は要らない
    session.progress.getState().startMission(m.id);
    expect(missionStatus(session.progress.getState().progress, m.id)).toBe('in-progress');

    const run = play(m);
    expect(isFinished(m.practice, run)).toBe(true);
    const outcome = session.progress.getState().finishMission(m.id, attemptOf(m.practice, run), AT);
    const progress = session.progress.getState().progress;
    expect(missionStatus(progress, m.id)).toBe('completed');

    // 報酬: XP、開発資金（XP と同じ量 + 報酬の資金。docs/game-design.md 2・8 章）
    expect(outcome.events.filter((e) => e.source === 'mission').reduce((n, e) => n + e.amount, 0)).toBe(m.rewards.xp);
    const city = session.city.getState().city;
    expect(city.funds).toBe(fundsBefore + m.rewards.xp + m.rewards.funds);
    // 報酬の資金だけで、依頼を出した施設を Lv2 に上げられる
    const facility = missionFacility(m);
    expect(facility && m.rewards.funds >= upgradeCost(FACILITY_DEFS[facility].cost, 2)).toBe(true);

    // 景観: 受け取った記念碑を費用なしで都市に置く。置くと、置いていない記念碑から外れる
    expect(unplacedLandmarks(progress, city.facilities)).toEqual([m.rewards.landmark]);
    const check = checkFacility(city, generateTerrain(city.seed), 'monument', { x: 48, y: 48 }, 180);
    expect(check.reasons).toEqual([]);
    const placed = placeFacility(city, 'monument', { x: 48, y: 48 }, 180, check, m.rewards.landmark);
    session.city.getState().setCity(placed);
    expect(placed.funds).toBe(city.funds);
    expect(placed.facilities.filter((f) => f.type === 'monument').map((f) => f.landmark)).toEqual([m.rewards.landmark]);
    expect(unplacedLandmarks(progress, placed.facilities)).toEqual([]);
  });

  it('同じミッションを達成した後にもう一度通しても、報酬は増えない（稼ぎ防止）', () => {
    const session = createSession(7);
    const m = MISSIONS[0];
    if (!m) throw new Error('ミッションが無い');
    session.progress.getState().finishMission(m.id, attemptOf(m.practice, play(m)), AT);
    const funds = session.city.getState().city.funds;
    const again = session.progress.getState().finishMission(m.id, attemptOf(m.practice, play(m)), AT);
    expect(again.events).toEqual([]);
    expect(session.city.getState().city.funds).toBe(funds);
  });

  it('途中で終えると未達で、報酬も記念碑も無い。挑戦中のまま残る', () => {
    const session = createSession(7);
    const m = MISSIONS[0];
    if (!m) throw new Error('ミッションが無い');
    const funds = session.city.getState().city.funds;
    session.progress.getState().startMission(m.id);
    const outcome = session.progress.getState().finishMission(m.id, attemptOf(m.practice, startRun()), AT);
    expect(outcome.events).toEqual([]);
    expect(session.city.getState().city.funds).toBe(funds);
    expect(missionStatus(session.progress.getState().progress, m.id)).toBe('in-progress');
    expect(unplacedLandmarks(session.progress.getState().progress, [])).toEqual([]);
  });
});
