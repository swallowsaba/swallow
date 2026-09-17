import { describe, expect, it } from 'vitest';
import { allMissions, mainMissions, missionById } from './registry';

describe('同じ形の繰り返しは本編に並べない', () => {
  it('値だけ違う任務は反復演習になり、本編には最初の 1 本だけが並ぶ', () => {
    const main = mainMissions();
    expect(main.every((m) => m.repeatOf === null)).toBe(true);
    // 「いまどこに立っているか」の家族は 12 本あるが、本編に出るのは 1 本
    const family = allMissions().filter((m) => m.id.startsWith('kernel/00/where-am-i-'));
    expect(family.length).toBeGreaterThan(5);
    expect(family.filter((m) => m.repeatOf === null)).toHaveLength(1);
    expect(family.filter((m) => m.repeatOf !== null).every((m) => m.repeatOf === family[0]?.id)).toBe(true);
  });

  it('本編は、同じ章の中で同じ題（値だけ違うもの）が並ばない', () => {
    const seen = new Map<string, string>();
    for (const m of mainMissions()) {
      // 題名から値（パスや数値）を抜いた形が、章の中で重ならないこと
      const shape = `${m.chapterId}:${m.title.replace(/[/\w.-]*[/\d][\w./-]*/g, '*')}`;
      expect(seen.get(shape), `${m.id} と ${seen.get(shape) ?? ''} が同じ形`).toBeUndefined();
      seen.set(shape, m.id);
    }
  });

  it('本編だけでも、どの街にも十分な数の任務がある', () => {
    for (const track of ['kernel', 'git', 'github', 'k8s', 'net'] as const) {
      expect(mainMissions().filter((m) => m.track === track).length, track).toBeGreaterThanOrEqual(15);
    }
  });

  it('反復演習も、選べば今までどおり開ける', () => {
    const repeat = allMissions().find((m) => m.repeatOf !== null);
    expect(repeat).toBeDefined();
    expect(missionById(repeat?.id ?? '')).toBeDefined();
  });
});
