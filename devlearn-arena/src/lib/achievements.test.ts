import { describe, expect, it } from 'vitest';
import { achievements, streakStrip } from './achievements';
import { emptyLessonProgress } from './storage/schema';

function profile(overrides: Partial<{ xp: number; streakDays: number; activeDays: string[] }> = {}) {
  return {
    xp: overrides.xp ?? 0,
    streakDays: overrides.streakDays ?? 0,
    lastActiveDay: null,
    activeDays: overrides.activeDays ?? [],
    onboarded: true,
  };
}

function cleared(ids: readonly string[], patch: Partial<ReturnType<typeof emptyLessonProgress>> = {}) {
  return Object.fromEntries(
    ids.map((id) => [id, { ...emptyLessonProgress(), cleared: true, ...patch }]),
  );
}

describe('実績', () => {
  it('何もしていなければ1つも取れていない', () => {
    const badges = achievements({ profile: profile(), lessons: {}, missionProgress: {} });
    expect(badges.every((b) => !b.earned)).toBe(true);
  });

  it('1つクリアすると最初の実績が付く', () => {
    const badges = achievements({
      profile: profile(),
      lessons: cleared(['git/01/objects']),
      missionProgress: {},
    });
    expect(badges.find((b) => b.id === 'first-clear')?.earned).toBe(true);
    expect(badges.find((b) => b.id === 'ten-clears')?.earned).toBe(false);
  });

  it('進み具合が数で見える', () => {
    const badges = achievements({
      profile: profile(),
      lessons: cleared(['a', 'b', 'c']),
      missionProgress: {},
    });
    const ten = badges.find((b) => b.id === 'ten-clears');
    expect(ten?.done).toBe(3);
    expect(ten?.total).toBe(10);
  });

  it('ボスをクリアすると別の実績になる', () => {
    const badges = achievements({
      profile: profile(),
      lessons: cleared(['k8s/07/boss-service-no-endpoint']),
      missionProgress: {},
    });
    expect(badges.find((b) => b.id === 'first-boss')?.earned).toBe(true);
  });

  it('ヒント無しと満点は別々に数える', () => {
    const noHint = achievements({
      profile: profile(),
      lessons: cleared(['x'], { hintsUsed: 0, bestScore: 80 }),
      missionProgress: {},
    });
    expect(noHint.find((b) => b.id === 'no-hint')?.earned).toBe(true);
    expect(noHint.find((b) => b.id === 'perfect')?.earned).toBe(false);

    const perfect = achievements({
      profile: profile(),
      lessons: cleared(['x'], { hintsUsed: 2, bestScore: 100 }),
      missionProgress: {},
    });
    expect(perfect.find((b) => b.id === 'no-hint')?.earned).toBe(false);
    expect(perfect.find((b) => b.id === 'perfect')?.earned).toBe(true);
  });

  it('連続日数で段階的に付く', () => {
    const badges = achievements({
      profile: profile({ streakDays: 7 }),
      lessons: {},
      missionProgress: {},
    });
    expect(badges.find((b) => b.id === 'streak-3')?.earned).toBe(true);
    expect(badges.find((b) => b.id === 'streak-7')?.earned).toBe(true);
    expect(badges.find((b) => b.id === 'streak-30')?.earned).toBe(false);
  });

  it('トラック踏破の実績が各トラックにある', () => {
    const badges = achievements({ profile: profile(), lessons: {}, missionProgress: {} });
    for (const track of ['git', 'k8s', 'net', 'github']) {
      expect(badges.some((b) => b.id === `track-${track}`)).toBe(true);
    }
  });
});

describe('取り組んだ日の並び', () => {
  it('指定した日数ぶん、古い順に並ぶ', () => {
    const strip = streakStrip([], '2026-03-10', 3);
    expect(strip.map((d) => d.day)).toEqual(['2026-03-08', '2026-03-09', '2026-03-10']);
  });

  it('取り組んだ日に印が付く', () => {
    const strip = streakStrip(['2026-03-09'], '2026-03-10', 3);
    expect(strip.map((d) => d.active)).toEqual([false, true, false]);
  });

  it('月をまたいでも正しく戻る', () => {
    const strip = streakStrip([], '2026-03-01', 2);
    expect(strip[0]?.day).toBe('2026-02-28');
  });
});
