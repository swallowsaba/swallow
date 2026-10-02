import { describe, expect, it } from 'vitest';
import { DOMAIN_ORDER, ENTRIES } from '@/content/catalog';
import { LESSONS } from '@/game/lessons';
import { emptyProgress, startLesson } from '@/game/progress';
import { applyRecords } from '@/game/records';
import type { Progress } from '@/game/types';
import { entryCardOf, lessonsForDomains, libraryOf, NO_FILTER, statusOf } from './library';

const done = (...ids: string[]): Progress =>
  applyRecords(emptyProgress(), ids.map((lessonId, i) => ({ kind: 'lesson' as const, lessonId, at: `2026-10-0${String(1 + (i % 8))}T10:00:00+09:00`, complete: true })), LESSONS).progress;

describe('学習ライブラリ（docs/ui-design.md 6 章）', () => {
  it('既定は全 211 本を、推奨学習順に分野 → テーマで並べる', () => {
    const lib = libraryOf(emptyProgress());
    expect(lib.map((d) => d.id)).toEqual([...DOMAIN_ORDER]);
    const flat = lib.flatMap((d) => d.themes.flatMap((t) => t.lessons.map((l) => l.entry.id)));
    expect(flat).toEqual(ENTRIES.map((e) => e.id));
    expect(lib[0]?.themes[0]).toMatchObject({ theme: '仕組み' });
    expect(lib.flatMap((d) => d.themes.flatMap((t) => t.lessons.map((l) => l.order)))).toEqual(ENTRIES.map((_, i) => i + 1));
  });

  it('検索は題名・到達目標・テーマ・分野の名前・ID に当たる（全角半角・空白の違いは無視）', () => {
    const ids = (q: string): string[] => libraryOf(emptyProgress(), { ...NO_FILTER, query: q }).flatMap((d) => d.themes.flatMap((t) => t.lessons.map((l) => l.entry.id)));
    expect(ids('systemd')).toContain('linux.i.01');
    expect(ids('ＳＹＳＴＥＭＤ')).toContain('linux.i.01');
    expect(ids('ファイルとディレクトリ')).toEqual(['found.b.04']);
    expect(ids('Kubernetes').every((id) => id.startsWith('k8s.') || ENTRIES.find((e) => e.id === id)?.goal.includes('Kubernetes') || ENTRIES.find((e) => e.id === id)?.title.includes('Kubernetes'))).toBe(true);
    expect(ids('k8s.a.02')).toEqual(['k8s.a.02']);
    expect(ids('存在しない言葉')).toEqual([]);
  });

  it('難易度と修了状況で絞り込める。分野を 1 つに絞れる', () => {
    const progress = startLesson(done('found.b.01', 'found.b.02'), 'found.b.03', '2026-10-02T10:00:00+09:00');
    const lib = (f: Partial<typeof NO_FILTER>) => libraryOf(progress, { ...NO_FILTER, ...f }).flatMap((d) => d.themes.flatMap((t) => t.lessons));
    expect(lib({ levels: ['advanced'] }).every((l) => l.entry.level === 'advanced')).toBe(true);
    expect(lib({ levels: ['advanced'] })).toHaveLength(46);
    expect(lib({ statuses: ['completed'] }).map((l) => l.entry.id)).toEqual(['found.b.01', 'found.b.02']);
    expect(lib({ statuses: ['in-progress'] }).map((l) => l.entry.id)).toEqual(['found.b.03']);
    expect(lib({ statuses: ['not-started'] })).toHaveLength(208);
    expect(libraryOf(progress, { ...NO_FILTER, domain: 'k8s' }).map((d) => d.id)).toEqual(['k8s']);
    expect(libraryOf(progress)[0]).toMatchObject({ id: 'found', total: 12, completed: 2 });
  });

  it('修了は、一度まとめまで行ったら 2 回目の途中でも修了のまま', () => {
    const p = startLesson(done('found.b.04'), 'found.b.04', '2026-10-05T10:00:00+09:00');
    expect(statusOf('found.b.04', p)).toBe('completed');
    expect(statusOf('found.b.05', p)).toBe('not-started');
  });
});

describe('入口の札: 推奨前提は案内だけ（docs/learning-design.md 10 章）', () => {
  it('どのレッスンも始められる（前提を何も学んでいなくても、上級でも）', () => {
    for (const e of ENTRIES) expect(entryCardOf(e.id, emptyProgress())?.canStart, e.id).toBe(true);
  });

  it('推奨前提が未修了なら「先に見ると分かりやすい」と案内し、修了していれば案内しない', () => {
    const card = entryCardOf('linux.i.01', emptyProgress());
    expect(card?.unmet.map((u) => u.id)).toEqual(['linux.b.08']);
    expect(card?.advice).toBe('先に「プロセスを見る・止める」を見ておくと分かりやすい。このまま始めてもよい。');
    expect(entryCardOf('linux.i.01', done('linux.b.08'))?.advice).toBeNull();
  });

  it('到達目標・難易度・目安の時間・関連・次に学ぶとよいを持つ', () => {
    const card = entryCardOf('found.b.04', emptyProgress(), 15);
    expect(card).toMatchObject({ levelName: '初級', minutes: '15 分', entry: { goal: '木の構造・パス・現在地を説明し、初めて pwd/ls/cd を打てる' } });
    expect(card?.related.map((r) => r.id)).toEqual(['linux.b.02', 'git.b.01']);
    expect(card?.next.map((r) => r.id)).toEqual(['found.b.06', 'linux.b.01', 'db.b.01']);
    expect(entryCardOf('net.b.01', emptyProgress())?.minutes).toBe('10〜20 分');
  });

  it('複数の前提が未修了なら推奨学習順に並べる。ID で書けない前提は文で残す', () => {
    expect(entryCardOf('k8s.i.04', emptyProgress())?.unmet.map((u) => u.id)).toEqual(['web.i.03', 'k8s.b.06']);
    expect(entryCardOf('lab.a.03', emptyProgress())).toMatchObject({ prerequisiteNote: '任意の中級 2 分野', advice: null });
  });

  it('目録に無い ID は札を作らない', () => {
    expect(entryCardOf('found.b.99', emptyProgress())).toBeNull();
  });
});

describe('情報パネルの「ここで学ぶ」（docs/ui-design.md 5 章: 推奨順・未修了優先）', () => {
  it('施設の分野のレッスンを、推奨学習順に 3 つ', () => {
    expect(lessonsForDomains(['linux'], emptyProgress()).map((l) => l.id)).toEqual(['linux.b.00', 'linux.b.01', 'linux.b.02']);
  });

  it('修了したレッスンは後ろに回す', () => {
    expect(lessonsForDomains(['linux'], done('linux.b.00', 'linux.b.02')).map((l) => l.id)).toEqual(['linux.b.01', 'linux.b.03', 'linux.b.04']);
  });

  it('コンテナ施設（コンテナと Docker）は、コンテナの概念から', () => {
    expect(lessonsForDomains(['ctr', 'docker'], emptyProgress())[0]?.id).toBe('ctr.b.01');
  });
});
