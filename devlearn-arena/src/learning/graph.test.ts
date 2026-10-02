import { describe, expect, it } from 'vitest';
import { DOMAIN_DEFS, ENTRIES } from '@/content/catalog';
import { LESSONS } from '@/game/lessons';
import { emptyProgress } from '@/game/progress';
import { applyRecords } from '@/game/records';
import { domainColumns, GRAPH_HEIGHT, GRAPH_WIDTH, knowledgeGraph, LESSON_GAP } from './graph';

describe('知識グラフ（docs/ui-design.md 6 章）', () => {
  const g = knowledgeGraph(emptyProgress());

  it('16 分野を大きな点、211 本のレッスンを小さな点で、全て画面の中に置く', () => {
    expect(g.domains).toHaveLength(16);
    expect(g.lessons).toHaveLength(211);
    for (const p of [...g.domains, ...g.lessons]) {
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(GRAPH_WIDTH);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(GRAPH_HEIGHT);
    }
  });

  it('分野は推奨前提より右の列に置く（前提 → 分野の矢印は左から右）', () => {
    const col = domainColumns();
    expect(col.found).toBe(0);
    for (const d of DOMAIN_DEFS) for (const p of d.prerequisites) expect(col[p], `${p} → ${d.id}`).toBeLessThan(col[d.id]);
    // 前提の無いトラブルシューティングと研究は、関連・次の分野の後ろ
    expect(col.trouble).toBeGreaterThan(col.devops);
    expect(col.lab).toBeGreaterThan(col.trouble);
  });

  it('レッスンの点どうしは重ならない', () => {
    for (let i = 0; i < g.lessons.length; i += 1) {
      for (let j = i + 1; j < g.lessons.length; j += 1) {
        const a = g.lessons[i];
        const b = g.lessons[j];
        if (!a || !b) continue;
        expect(Math.hypot(a.x - b.x, a.y - b.y), `${a.id} と ${b.id}`).toBeGreaterThanOrEqual(LESSON_GAP - 0.01);
      }
    }
  });

  it('推奨前提の辺を全て持つ（レッスン・分野とも）', () => {
    expect(g.lessonEdges).toHaveLength(ENTRIES.reduce((s, e) => s + e.prerequisites.length, 0));
    expect(g.lessonEdges).toContainEqual({ from: 'linux.b.08', to: 'linux.i.01' });
    expect(g.domainEdges).toContainEqual({ from: 'ctr', to: 'docker' });
  });

  it('修了したレッスンと、その分野の修了の数が分かる（光らせるため）', () => {
    const progress = applyRecords(emptyProgress(), [{ kind: 'lesson', lessonId: 'found.b.04', at: '2026-10-02T10:00:00+09:00', complete: true }], LESSONS).progress;
    const k = knowledgeGraph(progress);
    expect(k.lessons.find((l) => l.id === 'found.b.04')?.status).toBe('completed');
    expect(k.lessons.filter((l) => l.status === 'completed')).toHaveLength(1);
    expect(k.domains.find((d) => d.id === 'found')).toMatchObject({ completed: 1, total: 12 });
  });

  it('同じ記録からは同じ配置', () => {
    expect(knowledgeGraph(emptyProgress())).toEqual(g);
  });
});
