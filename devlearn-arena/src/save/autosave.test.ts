import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newCity } from '@/city/newCity';
import { openSession, startAutosave, type SaveBackend } from './autosave';
import { readSave } from './migrations';

/**
 * 自動保存と起動時の読み込み（docs/architecture.md 5 章・docs/data-model.md 7 章）。
 * 「リロード」は、同じ保存先から新しく遊ぶ状態を開き直すことで再現する（ブラウザでは IndexedDB、ここではメモリ）。
 */

/** メモリの保存先。fail を立てると書けない */
function memoryBackend() {
  const kept: Record<string, unknown> = {};
  let current: unknown = null;
  const b = {
    fail: false,
    writes: 0,
    get current() {
      return current;
    },
    set current(v: unknown) {
      current = v;
    },
    kept,
    read: () => Promise.resolve(structuredClone(current)),
    write: (data: unknown) => {
      if (b.fail) return Promise.reject(new Error('QuotaExceededError'));
      b.writes += 1;
      current = structuredClone(data);
      return Promise.resolve();
    },
    keep: (key: string, raw: unknown) => {
      kept[key] = raw;
      return Promise.resolve();
    },
  } satisfies SaveBackend & Record<string, unknown>;
  return b;
}

const AT = '2026-10-08T10:00:00+09:00';
const now = () => AT;

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('リロードしても進捗が消えない', () => {
  it('学習・都市・プレイヤーの状態は、操作の 2 秒後に保存され、開き直すと全て元に戻る', async () => {
    const backend = memoryBackend();
    const first = await openSession(backend, { now, newId: () => 'p-1' });
    const saver = startAutosave(first, backend, { now });

    // レッスンを修了した（段が進んだので、すぐ書く）
    first.session.progress.getState().learn([{ kind: 'lesson', lessonId: 'linux.b.01', at: AT, quiz: [{ quizId: 'q1', correct: true }], complete: true }]);
    await vi.advanceTimersByTimeAsync(0);
    expect(backend.writes).toBe(1);
    // 道路を引き、実戦を途中まで進めた
    const c = first.session.city.getState().city;
    first.session.city.getState().setCity({ ...c, roads: [...c.roads, { id: 'r9', kind: 'street', path: [{ x: 40, y: 50 }, { x: 44, y: 50 }] }] });
    first.session.progress.getState().savePractice({ lessonId: 'net.b.01', stepIndex: 2, engineState: { log: [] }, savedAt: AT });

    // 2 秒たつまでは書かない（操作のたびに書かない）。2 秒後に 1 回だけ書く
    await vi.advanceTimersByTimeAsync(1900);
    expect(backend.writes).toBe(1);
    await vi.advanceTimersByTimeAsync(200);
    expect(backend.writes).toBe(2);
    saver.stop();

    // リロード（同じ保存先から開き直す）
    const second = await openSession(backend, { now, newId: () => 'p-other' });
    expect(second.problem).toBeUndefined();
    expect(second.player.id).toBe('p-1');
    expect(second.session.progress.getState().progress).toEqual(first.session.progress.getState().progress);
    expect(second.session.progress.getState().progress.lessons['linux.b.01']?.status).toBe('completed');
    expect(second.session.progress.getState().practiceSessions).toEqual(first.session.progress.getState().practiceSessions);
    expect(second.session.city.getState().city).toEqual(first.session.city.getState().city);
    expect(second.session.city.getState().city.roads.map((r) => r.id)).toContain('r9');
    // 学習で得た資金も都市に残っている
    expect(second.session.city.getState().city.funds).toBe(first.session.city.getState().city.funds);
  });

  it('レッスンの段が進んだ時は、2 秒を待たずにすぐ保存する', async () => {
    const backend = memoryBackend();
    const opened = await openSession(backend, { now, newId: () => 'p-1' });
    const saver = startAutosave(opened, backend, { now });
    opened.session.progress.getState().start('linux.b.01', AT);
    await vi.advanceTimersByTimeAsync(0);
    const writesAfterStart = backend.writes;
    opened.session.progress.getState().reach('linux.b.01', 'understand');
    await vi.advanceTimersByTimeAsync(0);
    expect(backend.writes).toBe(writesAfterStart + 1);
    const read = readSave(backend.current);
    expect(read.ok && read.data.lessons['linux.b.01']?.stage).toBe('understand');
    saver.stop();
  });

  it('初めて遊ぶ時は新しい都市と市長で始め、保存先に何も無いことを問題にしない', async () => {
    const backend = memoryBackend();
    const opened = await openSession(backend, { now, newId: () => 'p-new' });
    expect(opened.problem).toBeUndefined();
    expect(opened.player).toEqual({ id: 'p-new', name: '市長', createdAt: AT });
    expect(opened.session.city.getState().city).toEqual(newCity());
    expect(opened.session.progress.getState().progress.lessons).toEqual({});
  });

  it('保存に失敗したら、何が起きたかを 1 行で知らせ、次の操作でもう一度保存する', async () => {
    const backend = memoryBackend();
    const opened = await openSession(backend, { now, newId: () => 'p-1' });
    const status: (string | null)[] = [];
    const saver = startAutosave(opened, backend, { now, onStatus: (s) => status.push(s) });
    backend.fail = true;
    opened.session.progress.getState().start('linux.b.01', AT);
    await vi.advanceTimersByTimeAsync(2100);
    const message = status.at(-1);
    expect(message).toMatch(/保存できなかった/);
    expect(message).not.toContain('\n');
    // 直ったら、次の操作で保存され、知らせは消える
    backend.fail = false;
    opened.session.progress.getState().start('net.b.01', AT);
    await vi.advanceTimersByTimeAsync(2100);
    expect(status.at(-1)).toBeNull();
    const read = readSave(backend.current);
    expect(read.ok && Object.keys(read.data.lessons).sort()).toEqual(['linux.b.01', 'net.b.01']);
    saver.stop();
  });

  it('保存データが壊れていたら、その写しを残して新しく始め、何が起きたかを知らせる（壊れた物で上書きして失わない）', async () => {
    const backend = memoryBackend();
    backend.current = { version: 1, city: 'broken' };
    const opened = await openSession(backend, { now, newId: () => 'p-1' });
    expect(opened.problem).toMatch(/読めなかった/);
    expect(opened.problem).not.toContain('\n');
    expect(Object.values(backend.kept)).toEqual([{ version: 1, city: 'broken' }]);
    expect(opened.session.progress.getState().progress.lessons).toEqual({});
  });

  it('止めた後は保存しない。止める前の書きかけは flush で書き切れる', async () => {
    const backend = memoryBackend();
    const opened = await openSession(backend, { now, newId: () => 'p-1' });
    const saver = startAutosave(opened, backend, { now });
    opened.session.progress.getState().start('linux.b.01', AT);
    await saver.flush();
    expect(backend.writes).toBe(1);
    saver.stop();
    opened.session.progress.getState().start('net.b.01', AT);
    await vi.advanceTimersByTimeAsync(3000);
    expect(backend.writes).toBe(1);
  });
});
