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

describe('つまずいたときの助け', () => {
  it('全ての手順に答えが用意されている', () => {
    for (const source of sources) {
      for (const step of source.build().steps) {
        expect(step.answer, `${source.id}: ${step.prompt}`).toBeTruthy();
      }
    }
  });

  /**
   * 条件は「いつでも成り立つ」ものではない。
   * 例えば「元のファイルが残っていること」は、次の手順で移動すれば崩れる。
   * 確かめたいのは、その条件が模範解答のどこかで確かに満たされること。
   */
  it('通過条件は、模範解答のどこかの時点で必ず満たされる', () => {
    for (const source of sources) {
      const mission = source.build();
      const timeline = play(mission, source.solution).timeline;
      for (const step of mission.steps) {
        for (const part of step.parts ?? []) {
          const reached = timeline.some((shell, i) =>
            part.test({ shell, history: shell.history, timeline: timeline.slice(0, i + 1) }),
          );
          expect(reached, `${source.id}: ${part.label}`).toBe(true);
        }
      }
    }
  });

  it('条件の内訳は、その手順の合否と一致する', () => {
    for (const source of sources) {
      const mission = source.build();
      const timeline = play(mission, source.solution).timeline;
      const shell = timeline[timeline.length - 1];
      if (!shell) continue;
      const ctx = { shell, history: shell.history, timeline };
      for (const step of mission.steps) {
        if (!step.parts) continue;
        expect(step.assert(ctx), `${source.id}: ${step.check}`).toBe(
          step.parts.every((p) => p.test(ctx)),
        );
      }
    }
  });
});
