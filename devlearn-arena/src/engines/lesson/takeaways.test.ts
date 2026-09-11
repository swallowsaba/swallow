import { describe, expect, it } from 'vitest';
import { findMission } from './missions';
import { allMissions } from './registry';
import { TAKEAWAY_LINES, takeawaysOf } from './takeaways';

describe('ここまでで分かったこと', () => {
  it('どの任務でも、重ならない3行になる', () => {
    for (const entry of allMissions().filter((_, i) => i % 5 === 0)) {
      const lines = takeawaysOf(entry.build());
      expect(lines.length, entry.id).toBe(TAKEAWAY_LINES);
      expect(new Set(lines).size, entry.id).toBe(TAKEAWAY_LINES);
      for (const line of lines) expect(line.length, entry.id).toBeGreaterThan(0);
    }
  });

  it('書いてある任務は、書いたとおりに出す', () => {
    const lesson = findMission('k8s/01/first-kubectl');
    if (!lesson) throw new Error('任務がありません');
    expect(takeawaysOf(lesson)).toEqual(lesson.takeaways);
  });

  it('書いていない任務は、目標から組み立てる', () => {
    const lesson = findMission('git/01/objects');
    if (!lesson) throw new Error('任務がありません');
    expect(takeawaysOf(lesson)[0]).toBe(lesson.objectives[0]);
  });
});
