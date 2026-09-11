import { describe, expect, it } from 'vitest';
import { concepts, glossary, jargonIn, lookup } from './glossary';
import { allMissions } from './registry';

describe('用語集', () => {
  it('同じ語が2回載っていない', () => {
    const terms = glossary().map((c) => c.term);
    expect(new Set(terms).size).toBe(terms.length);
  });

  it('別名でも引ける', () => {
    expect(lookup('PR')?.term).toBe('Pull Request');
    expect(lookup('pvc')?.term).toBe('PersistentVolumeClaim');
  });

  it('載っていない語は例外にする', () => {
    expect(() => concepts('存在しない語')).toThrow();
  });

  it('語の一部だけを拾わない', () => {
    const found = (text: string) => jargonIn(text).map((c) => c.term);
    expect(found('レポートを書く')).not.toContain('ポート');
    expect(found('GitHub を開く')).not.toContain('Git');
    expect(found('80 番のポートで待つ')).toContain('ポート');
    expect(found('環境変数を渡す')).not.toContain('変数');
  });
});

describe('すべての任務に「学ぶ」段階がある', () => {
  const entries = allMissions();

  it('一行の要約・学ぶ理由・用語・コマンドがそろっている', () => {
    for (const entry of entries) {
      const { intro } = entry;
      expect(intro.summary.length, entry.id).toBeGreaterThan(0);
      expect(intro.why.length, entry.id).toBeGreaterThan(0);
      expect(intro.concepts.length, entry.id).toBeGreaterThan(0);
      expect(intro.commands.length, entry.id).toBeGreaterThan(0);
      for (const c of intro.commands) {
        expect(c.command.length, entry.id).toBeGreaterThan(0);
        expect(c.means.length, entry.id).toBeGreaterThan(0);
      }
    }
  });

  it('組み立てた任務にも同じ説明が入っている', () => {
    for (const entry of entries.filter((_, i) => i % 97 === 0)) {
      expect(entry.build().intro).toEqual(entry.intro);
    }
  });

  /**
   * 専門用語は、初めて出てくる場所で必ず言い換えを添える。
   * 要約・学ぶ理由・コマンドの意味に出てくる語は、その任務の用語の欄に載っていなければならない。
   */
  it('要約・理由・コマンドの説明に出てくる専門用語は、用語の欄で説明している', () => {
    const missing: string[] = [];
    for (const entry of entries) {
      const listed = new Set(entry.intro.concepts.map((c) => c.term));
      const { summary, why, commands } = entry.intro;
      const text = [summary, why, ...commands.map((c) => c.means)].join('\n');
      for (const concept of jargonIn(text)) {
        if (!listed.has(concept.term)) missing.push(`${entry.id}: ${concept.term}`);
      }
    }
    expect([...new Set(missing)]).toEqual([]);
  });
});
