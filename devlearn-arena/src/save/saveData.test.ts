import { describe, expect, it } from 'vitest';
import { z, type ZodType } from 'zod';
import { newCity } from '@/city/newCity';
import type { City } from '@/city/types';
import { LESSONS } from '@/game/lessons';
import { emptyProgress } from '@/game/progress';
import { applyRecords } from '@/game/records';
import type { PracticeSession } from '@/game/types';
import { MIGRATIONS, readSave, type Migration } from './migrations';
import { exportFileName, fromSaveData, newPlayer, toSaveData, type SaveParts } from './saveData';
import { DEFAULT_SETTINGS, SAVE_VERSION, XP_LOG_LIMIT, type SaveData } from './schema';

/** 遊んだ後の状態: 道路・区画・施設のある都市、修了したレッスンとクイズと実戦、ミッション、途中の実戦 */
function played(): SaveParts {
  const base = newCity(7);
  const city: City = {
    ...base,
    day: 12.5,
    funds: 4321,
    roads: [{ id: 'r1', kind: 'street', path: [{ x: 0, y: 3 }, { x: 8, y: 3 }] }],
    zones: [{ id: 'z1', kind: 'residential', cells: [{ x: 1, y: 4 }, { x: 2, y: 4 }] }],
    buildings: [{ id: 'b1', zoneId: 'z1', cell: { x: 1, y: 4 }, variant: 'house-a', level: 2, builtDay: 3 }],
    facilities: [
      { id: 'f1', type: 'server', domain: 'linux', origin: { x: 4, y: 5 }, rotation: 90, level: 2, state: 'active', builtDay: 4 },
      { id: 'f2', type: 'monument', origin: { x: 9, y: 9 }, rotation: 0, level: 1, state: 'active', builtDay: 10, landmark: 'lighthouse' },
    ],
  };
  const progress = applyRecords(emptyProgress(), [
    { kind: 'lesson', lessonId: 'linux.b.01', at: '2026-10-01T10:00:00+09:00', quiz: [{ quizId: 'q1', correct: true }, { quizId: 'q2', correct: false }], practice: [{ success: true, hintsUsed: 1 }], complete: true },
    { kind: 'lesson', lessonId: 'net.b.01', at: '2026-10-02T09:00:00+09:00', quiz: [{ quizId: 'q1', correct: true }] },
    { kind: 'mission', missionId: 'm-web', xp: 200, funds: 500, at: '2026-10-03T08:00:00+09:00' },
  ], LESSONS).progress;
  const session: PracticeSession = {
    lessonId: 'net.b.01',
    stepIndex: 1,
    engineState: { sim: { type: 'connect', links: [['a', 'b']], up: [], sent: [] }, log: [{ line: 'connect a b' }], run: { stepIndex: 1, hints: { s1: 2 } } },
    savedAt: '2026-10-02T09:20:00+09:00',
  };
  return { player: newPlayer('p-1', '2026-10-01T09:00:00+09:00'), settings: { ...DEFAULT_SETTINGS, reduceMotion: true }, city, progress, practiceSessions: { 'net.b.01': session } };
}

describe('保存データ（docs/data-model.md 7 章）', () => {
  it('保存して読み直すと、都市・学習の記録・途中の実戦・設定が全て元に戻る（ファイルの文字列を通しても同じ）', () => {
    const parts = played();
    const data = toSaveData(parts, '2026-10-04T12:00:00+09:00', '2026-10-04');
    const read = readSave(JSON.stringify(data));
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(fromSaveData(read.data)).toEqual(parts);
    // ブラウザ内の保存（物のまま）からも同じ
    const direct = readSave(structuredClone(data));
    expect(direct.ok && fromSaveData(direct.data)).toEqual(parts);
  });

  it('市長の XP・エンジニア段階・スキルは、学習の記録から計算した値を写す', () => {
    const parts = played();
    const data = toSaveData(parts, '2026-10-04T12:00:00+09:00', '2026-10-04');
    expect(data.version).toBe(SAVE_VERSION);
    expect(data.player.xp).toBe(parts.progress.xp);
    expect(data.player.xp).toBeGreaterThan(0);
    expect(data.player.engineerRank).toBe('apprentice');
    expect(Object.keys(data.player.skills)).toHaveLength(16);
    expect(data.player.skills.linux?.value).toBeGreaterThan(0);
    expect(data.player.skills.k8s?.value).toBe(0);
  });

  it('XP の記録は直近 1,000 件だけ残す', () => {
    const parts = played();
    const log = Array.from({ length: XP_LOG_LIMIT + 5 }, (_, i) => ({ at: `2026-10-01T10:00:00+09:00`, source: 'quiz' as const, ref: `r${String(i)}`, amount: 1 }));
    const data = toSaveData({ ...parts, progress: { ...parts.progress, xpLog: log } }, '2026-10-04T12:00:00+09:00', '2026-10-04');
    expect(data.xpLog).toHaveLength(XP_LOG_LIMIT);
    expect(data.xpLog[0]?.ref).toBe('r5');
    expect(readSave(data).ok).toBe(true);
  });

  it('壊れた物は、投げずに読めない理由を返す（今のデータを上書きしないため）', () => {
    const data = toSaveData(played(), '2026-10-04T12:00:00+09:00', '2026-10-04');
    expect(readSave(null)).toEqual({ ok: false, reason: 'empty' });
    expect(readSave('')).toEqual({ ok: false, reason: 'empty' });
    expect(readSave('{"version": 1, "city": ').ok).toBe(false);
    expect(readSave('{"version": 1, "city": ')).toMatchObject({ reason: 'not-json' });
    expect(readSave('[1,2,3]')).toMatchObject({ reason: 'not-save' });
    expect(readSave({ player: data.player })).toMatchObject({ reason: 'not-save' });
    expect(readSave({ ...data, version: SAVE_VERSION + 1 })).toMatchObject({ reason: 'newer' });
    // 形が合わない: 資金が文字・知らない施設・余計な項目・XP が負
    expect(readSave({ ...data, city: { ...data.city, funds: '9999' } })).toMatchObject({ reason: 'invalid', detail: expect.stringContaining('city.funds') as string });
    expect(readSave({ ...data, city: { ...data.city, facilities: [{ ...data.city.facilities[0], type: 'casino' }] } })).toMatchObject({ reason: 'invalid' });
    expect(readSave({ ...data, cheat: true })).toMatchObject({ reason: 'invalid' });
    expect(readSave({ ...data, player: { ...data.player, xp: -10 } })).toMatchObject({ reason: 'invalid' });
    expect(readSave({ ...data, practiceSessions: { x: { lessonId: 'x', stepIndex: 0, engineState: 'broken', savedAt: 'a' } } })).toMatchObject({ reason: 'invalid' });
  });

  it('古い版は、今の版になるまで移行を順に当ててから確かめる。移行の道が無い版や、移行が投げた物は読めない', () => {
    // 版 1 が最初の版なので、本物の移行はまだ無い（版を上げた時に足す）
    expect(MIGRATIONS).toEqual({});
    // 仕組み: 版 1 → 2 → 3 と順に当てる（版 1 は a を数でなく文字で持ち、版 2 は b が無かった）
    const schema = z.object({ version: z.literal(3), a: z.number(), b: z.string() }).strict() as unknown as ZodType<SaveData>;
    const migrations: Record<number, Migration> = {
      1: (old) => ({ ...old, a: Number(old.a) }),
      2: (old) => ({ ...old, b: 'added' }),
    };
    expect(readSave('{"version": 1, "a": "5"}', { migrations, version: 3, schema })).toEqual({ ok: true, data: { version: 3, a: 5, b: 'added' }, migratedFrom: 1 });
    expect(readSave({ version: 2, a: 7 }, { migrations, version: 3, schema })).toEqual({ ok: true, data: { version: 3, a: 7, b: 'added' }, migratedFrom: 2 });
    expect(readSave({ version: 0, a: 1 }, { migrations, version: 3, schema })).toMatchObject({ ok: false, reason: 'too-old' });
    expect(readSave({ version: 1, a: 1 }, { migrations: { ...migrations, 2: () => { throw new Error('壊れた'); } }, version: 3, schema })).toMatchObject({ ok: false, reason: 'invalid' });
    // 本物の形で: 仮に版 0 が設定を持たず、都市の名前を town と呼んでいたなら、移行して今の版として読める
    const current = toSaveData(played(), '2026-10-04T12:00:00+09:00', '2026-10-04');
    const player0 = Object.fromEntries(Object.entries(current.player).filter(([k]) => k !== 'settings'));
    const { name, ...city0 } = current.city;
    const v0 = { ...current, version: 0, player: player0, city: { ...city0, town: name } };
    const toV1: Migration = (old) => {
      const { town, ...city } = old.city as Record<string, unknown>;
      return { ...old, player: { ...(old.player as object), settings: DEFAULT_SETTINGS }, city: { ...city, name: town } };
    };
    expect(readSave(JSON.stringify(v0))).toMatchObject({ ok: false, reason: 'too-old' });
    const migrated = readSave(JSON.stringify(v0), { migrations: { 0: toV1 } });
    expect(migrated).toMatchObject({ ok: true, migratedFrom: 0 });
    expect(migrated.ok && migrated.data).toEqual({ ...current, player: { ...current.player, settings: DEFAULT_SETTINGS } });
  });

  it('書き出すファイルの名前は devlearn-save-<日付>.json', () => {
    expect(exportFileName('2026-10-08')).toBe('devlearn-save-2026-10-08.json');
  });
});
