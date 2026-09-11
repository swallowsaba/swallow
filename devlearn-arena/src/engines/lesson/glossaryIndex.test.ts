import { describe, expect, it } from 'vitest';
import { glossaryIndex, matchesGlossary } from './glossaryIndex';
import { allMissions, missionById } from './registry';

describe('用語集の画面', () => {
  const rows = glossaryIndex();

  it('全任務の「学ぶ」画面に出てくる語を、1つ残らず1回ずつ載せる', () => {
    const used = new Set(allMissions().flatMap((m) => m.intro.concepts.map((c) => c.term)));
    const listed = rows.map((r) => r.term);
    expect(new Set(listed).size).toBe(listed.length);
    for (const term of used) expect(listed, term).toContain(term);
  });

  it('語ごとに、それを説明している任務を推奨順で添える', () => {
    const pod = rows.find((r) => r.term === 'Pod');
    expect(pod?.missions.map((m) => m.id)).toContain('k8s/01/first-kubectl');
    for (const row of rows) {
      const orders = row.missions.map((m) => missionById(m.id)?.order ?? 0);
      expect([...orders].sort((a, b) => a - b), row.term).toEqual(orders);
    }
  });

  it('語でも、言い換えの中身でも、別名でも引ける', () => {
    const pod = rows.find((r) => r.term === 'Pod');
    if (!pod) throw new Error('Pod がありません');
    expect(matchesGlossary(pod, 'pod')).toBe(true);
    expect(matchesGlossary(pod, '最小単位')).toBe(true);
    expect(matchesGlossary(pod, 'まったく関係ない語')).toBe(false);
    const k8s = rows.find((r) => r.term === 'Kubernetes');
    if (k8s) expect(matchesGlossary(k8s, 'k8s')).toBe(true);
  });
});
