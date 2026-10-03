import { describe, expect, it } from 'vitest';
import type { Facility } from '@/city/types';
import { MISSIONS } from '@/content/missions';
import { emptyProgress, finishMission, startMission } from '@/game/progress';
import type { Progress } from '@/game/types';
import { activeMissions, earnedLandmarks, missionCountForFacility, missionsForFacility, missionStatus, unplacedLandmarks } from './missions';

const ok = { at: '', stepsDone: [], hintsUsed: 0, errors: [], recoveredFromError: false, dangerousUsed: [], success: true, commands: [] };

function complete(p: Progress, id: string, at: string): Progress {
  const m = MISSIONS.find((x) => x.id === id);
  if (!m) throw new Error(id);
  return finishMission(p, { missionId: id, attempt: ok, xp: m.rewards.xp, funds: m.rewards.funds }, at, []).progress;
}

describe('施設の情報パネルに並ぶミッション（docs/decisions.md D-14）', () => {
  it('施設の Lv の数まで並び、Lv が上がるほど増える。どれも最初から受けられる', () => {
    // Web 施設（web）: Web サーバ・HTTPS・障害原因の 3 本に web が入る
    expect(missionCountForFacility('web')).toBe(3);
    expect(missionsForFacility('web', 1)).toHaveLength(1);
    expect(missionsForFacility('web', 2)).toHaveLength(2);
    expect(missionsForFacility('web', 5)).toHaveLength(3);
    for (const m of missionsForFacility('web', 5)) expect(missionStatus(emptyProgress(), m.id)).toBe('available');
  });

  it('先頭の分野がその施設の分野の物から並ぶ', () => {
    // サーバ施設（linux）: 先頭が linux の Web サーバを構築せよ が、先頭が trouble の障害原因より前
    expect(missionsForFacility('server', 5).map((m) => m.id)).toEqual(['web-server', 'incident']);
    // コンテナ施設（ctr と docker）: 先頭が ctr のコンテナを起動せよ → 先頭が k8s の Kubernetes
    expect(missionsForFacility('container', 5).map((m) => m.id)).toEqual(['container-run', 'k8s-app']);
    expect(missionsForFacility('container', 1).map((m) => m.id)).toEqual(['container-run']);
  });

  it('分野を持たない公園の類や、関係するミッションの無い施設には並ばない', () => {
    expect(missionsForFacility('park', 5)).toEqual([]);
    expect(missionsForFacility('datacenter', 5)).toEqual([]);
  });

  it('ミッション一覧には常に 6 本の全てがある（施設の Lv に関係なく）', () => {
    expect(MISSIONS).toHaveLength(6);
  });
});

describe('挑戦中のミッションと記念碑', () => {
  it('受けたミッションは挑戦中として並び、達成すると外れる', () => {
    let p = startMission(emptyProgress(), 'k8s-app');
    expect(activeMissions(p).map((m) => m.id)).toEqual(['k8s-app']);
    p = complete(p, 'k8s-app', '2026-10-04T10:00:00+09:00');
    expect(activeMissions(p)).toEqual([]);
  });

  it('達成した順に記念碑を受け取り、置いた物は外れる。取り壊すと、また置ける', () => {
    let p = complete(emptyProgress(), 'incident', '2026-10-04T11:00:00+09:00');
    p = complete(p, 'web-server', '2026-10-04T10:00:00+09:00');
    expect(earnedLandmarks(p)).toEqual(['beacon', 'bell']);
    const placed: Facility = { id: 'f1', type: 'monument', origin: { x: 0, y: 0 }, rotation: 0, level: 1, state: 'active', builtDay: 0, landmark: 'beacon' };
    expect(unplacedLandmarks(p, [placed])).toEqual(['bell']);
    expect(unplacedLandmarks(p, [])).toEqual(['beacon', 'bell']);
  });
});
