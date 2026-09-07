import { describe, expect, it } from 'vitest';
import { implementedLessonIds } from '@/engines/lesson/implemented';
import { missions } from '@/engines/lesson/missions';
import { allLessons, countAll, getChapter, getLesson, getTrack, TRACKS } from './catalog';

describe('catalog', () => {
  it('4トラックある', () => {
    expect(TRACKS.map((t) => t.id)).toEqual(['k8s', 'net', 'git', 'github']);
  });

  it('レッスンIDが一意', () => {
    const ids = allLessons().map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('IDが track/NN/slug の形になっている', () => {
    for (const l of allLessons()) {
      expect(l.id).toMatch(/^(k8s|net|git|github)\/\d{2}\/[a-z0-9-]+$/);
      expect(l.id.startsWith(`${l.chapterId}/`)).toBe(true);
    }
  });

  it('全レッスンに出典URLがある', () => {
    for (const l of allLessons()) {
      expect(l.docs.length).toBeGreaterThan(0);
      for (const d of l.docs) expect(d.url.startsWith('https://')).toBe(true);
    }
  });

  it('所要時間が正の値', () => {
    for (const l of allLessons()) expect(l.minutes).toBeGreaterThan(0);
  });

  it('目標本数（レッスン120以上・BOSS20以上）を満たす', () => {
    const counts = countAll();
    expect(counts.lessons).toBeGreaterThanOrEqual(120);
    expect(counts.bosses).toBeGreaterThanOrEqual(20);
  });

  it('章番号が1から連番', () => {
    for (const track of TRACKS) {
      expect(track.chapters.map((c) => c.no)).toEqual(
        track.chapters.map((_, i) => i + 1),
      );
    }
  });

  it('ID で引ける', () => {
    const first = allLessons()[0];
    expect(first).toBeDefined();
    if (!first) return;
    expect(getLesson(first.id)?.title).toBe(first.title);
    expect(getChapter(first.chapterId)?.id).toBe(first.chapterId);
    expect(getTrack(first.trackId)?.id).toBe(first.trackId);
  });

  it('未知のIDでは undefined', () => {
    expect(getLesson('nope/99/x')).toBeUndefined();
    expect(getTrack('nope')).toBeUndefined();
  });
});

describe('目次と任務の対応', () => {
  it('ready なレッスンには必ず任務がある', () => {
    const ids = implementedLessonIds();
    for (const l of allLessons()) {
      expect(l.status === 'ready').toBe(ids.has(l.id));
    }
  });

  it('任務の id は目次に存在する（序章の kernel を除く）', () => {
    const known = new Set(allLessons().map((l) => l.id));
    for (const m of missions) {
      if (m.track === 'kernel') continue;
      expect(known.has(m.id), `目次に無い任務: ${m.id}`).toBe(true);
    }
  });

  it('boss かどうかが目次と任務で一致する', () => {
    for (const m of missions) {
      if (m.track === 'kernel') continue;
      const meta = getLesson(m.id);
      expect(meta).toBeDefined();
      expect(m.kind === 'boss').toBe(meta?.kind === 'boss');
    }
  });

  it('遊べるレッスンが1つ以上ある', () => {
    expect(countAll().ready).toBeGreaterThan(0);
  });
});
