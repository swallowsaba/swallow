import { describe, expect, it } from 'vitest';
import { getChapter } from '@/content/catalog';
import { explainFailure, play } from '../authoring/play';
import { drillSources } from './index';

const sources = drillSources();

describe('生成した任務', () => {
  it('id が重複しない', () => {
    const ids = sources.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('全て目次のある章に属している', () => {
    for (const source of sources) {
      expect(getChapter(source.chapterId), source.id).toBeDefined();
    }
  });

  it('id の頭が章 id と一致している', () => {
    for (const source of sources) {
      expect(source.id.startsWith(`${source.chapterId}/`), source.id).toBe(true);
    }
  });

  it('手順に説明・通過条件・助言がそろっている', () => {
    for (const source of sources) {
      const mission = source.build();
      expect(mission.steps.length, source.id).toBeGreaterThan(0);
      for (const step of mission.steps) {
        expect(step.prompt.length, source.id).toBeGreaterThan(0);
        expect(step.check.length, source.id).toBeGreaterThan(0);
        expect(step.explain.length, source.id).toBeGreaterThan(0);
        expect(step.hints.length, source.id).toBeGreaterThan(0);
      }
    }
  });

  it('何もしないうちはクリアにならない', () => {
    for (const source of sources) {
      expect(play(source.build(), []).cleared, source.id).toBe(false);
    }
  });

  it('模範解答で必ずクリアできる', () => {
    for (const source of sources) {
      const mission = source.build();
      const result = play(mission, source.solution);
      if (!result.cleared) throw new Error(explainFailure(mission, result));
      expect(result.cleared).toBe(true);
    }
  });
});
