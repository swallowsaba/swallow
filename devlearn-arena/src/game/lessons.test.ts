import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DOMAINS } from '@/city/facilityInfo';
import { LESSONS, lessonMeta } from './lessons';

/** docs/curriculum.md 4 章の各分野の表の行（ID と題名） */
function curriculumRows(): { id: string; title: string }[] {
  const text = readFileSync(join(__dirname, '../../docs/curriculum.md'), 'utf8');
  const rows: { id: string; title: string }[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^\| ([a-z0-9]+\.[bia]\.\d+) \| [^|]+ \| [^|]+ \| ([^|]+) \|/.exec(line);
    if (m) rows.push({ id: m[1] as string, title: (m[2] as string).trim() });
  }
  return rows;
}

describe('全レッスンの一覧（content/lesson-list.json）', () => {
  it('docs/curriculum.md の表と、ID・題名・順番が一致する', () => {
    expect(LESSONS.map((l) => ({ id: l.id, title: l.title }))).toEqual(curriculumRows());
  });

  it('211 本（初級 86・中級 79・上級 46）で、全て 16 分野のどれかに属する', () => {
    expect(LESSONS).toHaveLength(211);
    expect(LESSONS.filter((l) => l.difficulty === 'b')).toHaveLength(86);
    expect(LESSONS.filter((l) => l.difficulty === 'i')).toHaveLength(79);
    expect(LESSONS.filter((l) => l.difficulty === 'a')).toHaveLength(46);
    const domains = new Set(DOMAINS.map((d) => d.id));
    for (const l of LESSONS) expect(domains.has(l.domain), l.id).toBe(true);
    for (const d of domains) expect(LESSONS.some((l) => l.domain === d), d).toBe(true);
  });

  it('ID から分野と難易度を読む', () => {
    expect(lessonMeta('k8s.i.03')).toMatchObject({ domain: 'k8s', difficulty: 'i' });
    expect(lessonMeta('found.b.04')?.title).toBe('ファイルとディレクトリ');
    expect(lessonMeta('not-a-lesson')).toBeNull();
  });
});
