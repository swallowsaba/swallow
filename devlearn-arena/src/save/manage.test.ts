import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newCity } from '@/city/newCity';
import { emptyProgress } from '@/game/progress';
import { openSession, startAutosave, type SaveBackend } from './autosave';
import { checkImport, exportFile, freshSave } from './manage';
import { MIGRATIONS, readSave, type Migration } from './migrations';
import { DEFAULT_SETTINGS, SAVE_VERSION } from './schema';

/**
 * 書き出しと読み込み・最初からやり直す（docs/data-model.md 7 章・docs/testing-strategy.md 8 章）。
 * 「別のブラウザ」は、空の保存先から開くことで再現する。
 */

function memoryBackend(fail = false) {
  let current: unknown = null;
  const b = {
    fail,
    writes: 0,
    get current() {
      return current;
    },
    set current(v: unknown) {
      current = v;
    },
    read: () => Promise.resolve(structuredClone(current)),
    write: (data: unknown) => {
      if (b.fail) return Promise.reject(new Error('QuotaExceededError'));
      b.writes += 1;
      current = structuredClone(data);
      return Promise.resolve();
    },
    keep: () => Promise.resolve(),
  } satisfies SaveBackend & Record<string, unknown>;
  return b;
}

const AT = '2026-10-09T10:00:00+09:00';
const now = () => AT;

/** 遊んだ後の状態（レッスンを修了し、道路を引き、実戦を途中まで進めた） */
async function playedSession() {
  const backend = memoryBackend();
  const opened = await openSession(backend, { now, newId: () => 'p-1' });
  const saver = startAutosave(opened, backend, { now });
  opened.session.progress.getState().learn([{ kind: 'lesson', lessonId: 'linux.b.01', at: AT, quiz: [{ quizId: 'q1', correct: true }], complete: true }]);
  const c = opened.session.city.getState().city;
  opened.session.city.getState().setCity({ ...c, roads: [...c.roads, { id: 'r9', kind: 'street', path: [{ x: 40, y: 50 }, { x: 44, y: 50 }] }] });
  opened.session.progress.getState().savePractice({ lessonId: 'net.b.01', stepIndex: 2, engineState: { log: [] }, savedAt: AT });
  await saver.flush();
  return { backend, opened, saver };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('書き出しと読み込み', () => {
  it('書き出したファイルを別のブラウザで読み込むと、都市・学習の記録・途中の実戦・市長が全て同じになる', async () => {
    const { opened, saver } = await playedSession();
    const file = exportFile(saver.snapshot());
    expect(file.name).toBe('devlearn-save-2026-10-09.json');

    // 別のブラウザ（何も保存されていない）で開き、ファイルを読み込む
    const other = memoryBackend();
    const fresh = await openSession(other, { now, newId: () => 'p-other' });
    const freshSaver = startAutosave(fresh, other, { now });
    const checked = checkImport(file.text);
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    await freshSaver.replace(checked.data);

    // 開き直す（読み込んだ後は、保存先から開き直して画面に出す）
    const reopened = await openSession(other, { now, newId: () => 'p-x' });
    expect(reopened.session.player.getState().player).toEqual(opened.session.player.getState().player);
    expect(reopened.session.city.getState().city).toEqual(opened.session.city.getState().city);
    expect(reopened.session.progress.getState().progress).toEqual(opened.session.progress.getState().progress);
    expect(reopened.session.progress.getState().practiceSessions).toEqual(opened.session.progress.getState().practiceSessions);
    saver.stop();
  });

  it('読み込む前に、ファイルの中身（市長・都市・書き出した時・XP・修了したレッスンの数）を示す', async () => {
    const { saver } = await playedSession();
    const checked = checkImport(exportFile(saver.snapshot()).text);
    expect(checked.ok && checked.summary).toEqual({ mayor: '市長', city: 'みなと市', savedAt: AT, xp: expect.any(Number) as number, completed: 1 });
    expect(checked.ok && checked.summary.xp).toBeGreaterThan(0);
    saver.stop();
  });

  it('置き換えた後は、元の画面の状態で上書きしない（ページを離れる時の書き切りでも）', async () => {
    const { backend, opened, saver } = await playedSession();
    const other = freshSave({ id: 'p-2', now: AT, settings: DEFAULT_SETTINGS });
    await saver.replace(other);
    opened.session.progress.getState().start('net.b.02', AT);
    await vi.advanceTimersByTimeAsync(3000);
    await saver.flush();
    const read = readSave(backend.current);
    expect(read.ok && read.data.player.id).toBe('p-2');
    expect(read.ok && read.data.lessons).toEqual({});
  });

  it('壊れたファイル・別のファイルは読み込まず、何が起きたか・どうすればよいかを 1 行ずつ返す。今の保存データは残る', async () => {
    const { backend, saver } = await playedSession();
    const before = structuredClone(backend.current);
    const good = JSON.parse(exportFile(saver.snapshot()).text) as Record<string, unknown>;
    const cases = [
      '',
      '{ "version": 1, ',
      JSON.stringify({ hello: 'world' }),
      JSON.stringify({ ...good, city: 'broken' }),
      JSON.stringify({ ...good, version: SAVE_VERSION + 1 }),
    ];
    for (const text of cases) {
      const checked = checkImport(text);
      expect(checked.ok).toBe(false);
      if (checked.ok) continue;
      expect(checked.what).toMatch(/。$/);
      expect(checked.next).toMatch(/。$/);
      expect(`${checked.what}${checked.next}`).not.toContain('\n');
    }
    await vi.advanceTimersByTimeAsync(3000);
    expect(backend.current).toEqual(before);
    saver.stop();
  });

  it('古い版のファイルは、今の版に移してから読み込み、移したことを示す', () => {
    const current = freshSave({ id: 'p-1', now: AT, settings: DEFAULT_SETTINGS });
    // 仮の版 0: 市長の名前を mayor と呼んでいた
    const { name, ...rest } = current.player;
    const player0 = Object.fromEntries(Object.entries(rest).filter(([k]) => k !== 'introSeen'));
    const v0 = JSON.stringify({ ...current, version: 0, player: { ...player0, mayor: name } });
    const toV1: Migration = (old) => {
      const { mayor, ...player } = old.player as Record<string, unknown>;
      return { ...old, player: { ...player, name: mayor } };
    };
    expect(checkImport(v0).ok).toBe(false);
    const checked = checkImport(v0, { migrations: { ...MIGRATIONS, 0: toV1 } });
    expect(checked.ok && checked.data).toEqual({ ...current, player: { ...current.player, introSeen: true } });
    expect(checked.ok && checked.summary.migratedFrom).toBe(0);
  });
});

describe('最初からやり直す', () => {
  it('新しい都市・空の学習の記録・新しい市長で始まる。設定はそのまま残る', async () => {
    const { backend, opened, saver } = await playedSession();
    const settings = { ...DEFAULT_SETTINGS, reduceMotion: true };
    await saver.replace(freshSave({ id: 'p-new', now: AT, settings }));
    const reopened = await openSession(backend, { now, newId: () => 'p-x' });
    expect(reopened.session.player.getState().player).toEqual({ id: 'p-new', name: '市長', createdAt: AT, introSeen: false });
    expect(reopened.session.settings.getState().settings).toEqual(settings);
    expect(reopened.session.city.getState().city).toEqual(newCity());
    expect(reopened.session.progress.getState().progress).toEqual(emptyProgress());
    expect(reopened.session.progress.getState().practiceSessions).toEqual({});
    expect(opened.session.player.getState().player.id).toBe('p-1');
  });

  it('置き換えの書き込みに失敗したら、投げて知らせ、今の記録の自動保存を続ける', async () => {
    const { backend, opened, saver } = await playedSession();
    backend.fail = true;
    await expect(saver.replace(freshSave({ id: 'p-new', now: AT, settings: DEFAULT_SETTINGS }))).rejects.toThrow('QuotaExceededError');
    backend.fail = false;
    opened.session.progress.getState().start('net.b.02', AT);
    await vi.advanceTimersByTimeAsync(2100);
    const read = readSave(backend.current);
    expect(read.ok && read.data.player.id).toBe('p-1');
    expect(read.ok && Object.keys(read.data.lessons)).toContain('net.b.02');
    saver.stop();
  });
});
