import { describe, expect, it } from 'vitest';
import { DOMAIN_DEFS, ENTRIES } from '@/content/catalog';
import { LESSONS } from '@/game/lessons';
import { emptyProgress } from '@/game/progress';
import { applyRecords } from '@/game/records';
import { domainColumns, domainOuterRadius, GRAPH_HEIGHT, GRAPH_WIDTH, knowledgeGraph, labelBox, labelSides, LESSON_GAP, lessonRadius } from './graph';

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
    // 前提の無いトラブルシューティングと研究（全分野を束ねる分野）は、右端の列にまとめる
    const last = Math.max(...Object.values(col));
    expect([col.trouble, col.lab]).toEqual([last, last]);
    expect(Object.entries(col).filter(([, c]) => c === last).map(([d]) => d).sort()).toEqual(['lab', 'trouble']);
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

  it('分野の名前は、ほかの名前ともレッスンの点とも重ならない（1920×1080 と 1280×720 の縮め方で）', () => {
    // 窓の中のグラフの場所の大きさ: 1920×1080 で約 1150×900、1280×720 で約 850×570
    for (const scale of [Math.min(1150 / GRAPH_WIDTH, 880 / GRAPH_HEIGHT), Math.min(850 / GRAPH_WIDTH, 570 / GRAPH_HEIGHT)]) {
      const sides = labelSides(g, scale);
      const boxes = g.domains.map((d) => ({ id: d.id, ...labelBox(d, scale, sides[d.id]) }));
      const hit = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean =>
        a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      for (const [i, a] of boxes.entries()) {
        for (const b of boxes.slice(i + 1)) expect(hit(a, b), `${a.id} と ${b.id}（${scale.toFixed(2)}）`).toBe(false);
        for (const l of g.lessons) expect(hit(a, { x: l.x * scale - 4, y: l.y * scale - 4, w: 8, h: 8 }), `${a.id} と ${l.id}（${scale.toFixed(2)}）`).toBe(false);
        expect(a.x, a.id).toBeGreaterThanOrEqual(0);
        expect(a.x + a.w, a.id).toBeLessThanOrEqual(GRAPH_WIDTH * scale);
      }
    }
  });

  it('分野の点と修了の輪は、レッスンの点に重ならない（重なると、押したレッスンが分野に取られる）', () => {
    for (const scale of [Math.min(1150 / GRAPH_WIDTH, 880 / GRAPH_HEIGHT), Math.min(850 / GRAPH_WIDTH, 570 / GRAPH_HEIGHT)]) {
      const r = domainOuterRadius(scale) + lessonRadius(scale) + 1;
      for (const d of g.domains) {
        for (const l of g.lessons) {
          expect(Math.hypot((l.x - d.x) * scale, (l.y - d.y) * scale), `${d.id} と ${l.id}（${scale.toFixed(2)}）`).toBeGreaterThanOrEqual(r);
        }
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
