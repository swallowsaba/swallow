import { describe, expect, it } from 'vitest';
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
