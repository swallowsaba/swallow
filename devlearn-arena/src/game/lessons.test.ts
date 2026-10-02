import { describe, expect, it } from 'vitest';
import { DOMAINS } from '@/city/facilityInfo';
import { ENTRIES } from '@/content/catalog';
import { LESSONS, lessonMeta } from './lessons';

describe('全レッスンの一覧（content/catalog.json の目録）', () => {
  it('目録と同じ ID・題名・順番（推奨学習順）', () => {
    expect(LESSONS.map((l) => ({ id: l.id, title: l.title }))).toEqual(ENTRIES.map((e) => ({ id: e.id, title: e.title })));
  });

  it('211 本（初級 86・中級 79・上級 46）で、難易度は目録と ID が同じ', () => {
    expect(LESSONS).toHaveLength(211);
    expect(LESSONS.filter((l) => l.difficulty === 'b')).toHaveLength(86);
    expect(LESSONS.filter((l) => l.difficulty === 'i')).toHaveLength(79);
    expect(LESSONS.filter((l) => l.difficulty === 'a')).toHaveLength(46);
    const level = { b: 'beginner', i: 'intermediate', a: 'advanced' } as const;
    for (const [i, l] of LESSONS.entries()) expect(level[l.difficulty], l.id).toBe(ENTRIES[i]?.level);
    const domains = new Set(DOMAINS.map((d) => d.id));
    for (const l of LESSONS) expect(domains.has(l.domain), l.id).toBe(true);
    for (const d of domains) expect(LESSONS.some((l) => l.domain === d), d).toBe(true);
  });

  it('ID から分野と難易度を読む。研究の題名は課題の名前', () => {
    expect(lessonMeta('k8s.i.03')).toMatchObject({ domain: 'k8s', difficulty: 'i' });
    expect(lessonMeta('found.b.04')?.title).toBe('ファイルとディレクトリ');
    expect(lessonMeta('lab.i.01')?.title).toBe('Web サービスを公開する');
    expect(lessonMeta('not-a-lesson')).toBeNull();
  });
});
