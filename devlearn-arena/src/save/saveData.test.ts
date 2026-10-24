import { describe, expect, it } from 'vitest';
import { z, type ZodType } from 'zod';
import { newCity } from '@/city/newCity';
import type { City, Facility } from '@/city/types';
import { LESSONS } from '@/game/lessons';
import { emptyProgress } from '@/game/progress';
import { applyRecords } from '@/game/records';
import type { PracticeSession } from '@/game/types';
import { NAME_PARTS } from '@/content/politics';
import { terrainOf } from '@/sim/runner';
import { newWorld } from '@/sim/world';
import { statsOf } from '@/city/growth';
import { sampleCity } from '@/city/sample';

const SEED_V3 = 20261002;
import { MIGRATIONS, readSave, type Migration } from './migrations';
import { exportFileName, fromSaveData, newPlayer, toSaveData, type SaveParts } from './saveData';
import { DEFAULT_SETTINGS, SAVE_VERSION, XP_LOG_LIMIT, type SaveData } from './schema';

/** 版 4 で足した、都市の模擬と市政の項目 */
const WORLD_KEYS = ['sim', 'history', 'applications', 'politics', 'budget', 'petitions', 'rewards'] as const;

/** 版 3 の形（版 4 の項目が無い） */
function v3Of(data: SaveData): Record<string, unknown> {
  const out: Record<string, unknown> = { ...data, version: 3 };
  for (const k of WORLD_KEYS) delete out[k];
  return out;
}

/** 都市と、模擬と市政の項目を除いた所（移行で作り直される所を除いて比べる） */
function learningPart(data: Record<string, unknown>): Record<string, unknown> {
  const out = { ...data };
  for (const k of WORLD_KEYS) delete out[k];
  delete out.city;
  return out;
}

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
  return { player: newPlayer('p-1', '2026-10-01T09:00:00+09:00'), settings: { ...DEFAULT_SETTINGS, reduceMotion: true }, world: { ...newWorld(terrainOf(7), NAME_PARTS, 7), city }, progress, practiceSessions: { 'net.b.01': session } };
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
    // 本物の形で: 仮に版 0 が設定を持たず、都市の名前を town と呼んでいたなら、版 0 → 1 → 2 と移して今の版として読める
    const current = toSaveData(played(), '2026-10-04T12:00:00+09:00', '2026-10-04');
    const player0 = Object.fromEntries(Object.entries(current.player).filter(([k]) => k !== 'settings' && k !== 'introSeen'));
    const { name, ...city0 } = current.city;
    const v0 = { ...v3Of(current), version: 0, player: player0, city: { ...city0, town: name } };
    const toV1: Migration = (old) => {
      const { town, ...city } = old.city as Record<string, unknown>;
      return { ...old, player: { ...(old.player as object), settings: DEFAULT_SETTINGS }, city: { ...city, name: town } };
    };
    expect(readSave(JSON.stringify(v0))).toMatchObject({ ok: false, reason: 'too-old' });
    const migrated = readSave(JSON.stringify(v0), { migrations: { ...MIGRATIONS, 0: toV1 } });
    expect(migrated).toMatchObject({ ok: true, migratedFrom: 0 });
    expect(migrated.ok && learningPart(migrated.data)).toEqual(learningPart({ ...current, player: { ...current.player, settings: DEFAULT_SETTINGS, introSeen: true } }));
    expect(migrated.ok && migrated.data.city.funds).toBe(current.city.funds);
  });

  it('版 1 の保存データは今の版に移る（市長に introSeen を足す。もう遊んだ人なので、初回の操作説明は出さない）', () => {
    const current = toSaveData(played(), '2026-10-04T12:00:00+09:00', '2026-10-04');
    const settings2: Partial<typeof current.player.settings> = { ...current.player.settings };
    delete settings2.minimap;
    const player1 = { ...Object.fromEntries(Object.entries(current.player).filter(([k]) => k !== 'introSeen')), settings: settings2 };
    const v1 = { ...v3Of(current), version: 1, player: player1 };
    const migrated = readSave(JSON.stringify(v1));
    expect(migrated).toMatchObject({ ok: true, migratedFrom: 1 });
    expect(migrated.ok && learningPart(migrated.data)).toEqual(learningPart({ ...current, player: { ...current.player, introSeen: true } }));
    // 移行は受け取った物を変えない
    expect(v1.player).not.toHaveProperty('introSeen');
  });

  it('版 2 の保存データは版 3 に移る（設定に minimap を足す。ミニマップを出す。docs/decisions.md D-18）', () => {
    const current = toSaveData(played(), '2026-10-04T12:00:00+09:00', '2026-10-04');
    expect(current.version).toBe(4);
    // 版 2 で、音を鳴らし文字を大きくしていた人の記録
    const settings2: Partial<typeof current.player.settings> = { ...current.player.settings, sound: true, fontScale: 1.3 as const };
    delete settings2.minimap;
    const v2 = { ...v3Of(current), version: 2, player: { ...current.player, settings: settings2 } };
    const migrated = readSave(JSON.stringify(v2));
    expect(migrated).toMatchObject({ ok: true, migratedFrom: 2 });
    expect(migrated.ok && migrated.data.player.settings).toEqual({ ...current.player.settings, sound: true, fontScale: 1.3, minimap: true });
    expect(migrated.ok && learningPart(migrated.data)).toEqual(learningPart({ ...current, player: { ...current.player, settings: { ...current.player.settings, sound: true, fontScale: 1.3, minimap: true } } }));
    // 移行は受け取った物を変えない
    expect(v2.player.settings).not.toHaveProperty('minimap');
    // 版 2 のまま minimap の無い設定は、今の版としては読めない（移行を通す）
    expect(readSave({ ...v2, version: 3 })).toMatchObject({ ok: false, reason: 'invalid' });
  });

  it('書き出すファイルの名前は devlearn-save-<日付>.json', () => {
    expect(exportFileName('2026-10-08')).toBe('devlearn-save-2026-10-08.json');
  });
});

describe('版 3 → 版 4 の移行（docs/data-model.md 12 章・docs/acceptance-criteria.md S29）', () => {
  /** 版 3 の、住宅とオフィスが育った都市の保存データ */
  function v3Save(): Record<string, unknown> {
    const parts = played();
    const city = sampleCity(SEED_V3);
    const done = { ...city, day: 40, buildings: city.buildings.map((b) => ({ ...b, builtDay: 0 })), facilities: city.facilities.map((f, i) => ({ ...f, state: i === 0 ? ('constructing' as const) : f.state })) };
    const data = toSaveData({ ...parts, world: { ...parts.world, city: done } }, '2026-10-04T12:00:00+09:00', '2026-10-04');
    return { ...v3Of(data), city: { ...done, population: statsOf(done).population } };
  }

  it('都市規模の差が 1% 以内で、学習の記録と開発資金は変わらない。工事中の施設は完成になる', () => {
    const old = v3Save();
    const read = readSave(JSON.stringify(old));
    expect(read).toMatchObject({ ok: true, migratedFrom: 3 });
    if (!read.ok) return;
    const before = (old.city as City).population;
    expect(before).toBeGreaterThan(0);
    expect(Math.abs(read.data.city.population - before) / before).toBeLessThanOrEqual(0.01);
    expect(read.data.city.funds).toBe((old.city as City).funds);
    expect(learningPart(read.data)).toEqual(learningPart({ ...old, version: 4 }));
    expect(read.data.city.facilities.every((f) => f.state === 'active')).toBe(true);
  });

  it('市政は「ふつう」・政治資本 10・財政 800・税率 10% で始まり、申請は空、信頼は 0、需給の倍率は 1', () => {
    const read = readSave(JSON.stringify(v3Save()));
    if (!read.ok) throw new Error('読めない');
    const d = read.data;
    expect(d.politics.difficulty).toBe('normal');
    expect(d.politics.capital).toBe(10);
    expect(d.politics.term.no).toBe(1);
    expect(d.budget).toMatchObject({ treasury: 800, taxRate: 10 });
    expect(d.applications).toEqual([]);
    expect(d.sim.trust.every((v) => v === 0)).toBe(true);
    expect(d.sim.rentFactor).toBe(1);
    expect(new Set(d.sim.districtNames).size).toBe(144);
    // 支持は始めの週の目標の値で埋める（住む人のいる地区は 0〜100）
    expect(d.sim.support.flat().filter((v) => v >= 0).length).toBeGreaterThan(0);
  });

  it('審議中・工事中の申請（docs/data-model.md 10 章。反対の理由・割合・元の値を含む）と、工事の終わる日を持つ施設が、保存・読み込みで元に戻る', () => {
    const parts = played();
    const world = parts.world;
    const facility: Facility = { id: 'f3', type: 'datacenter', domain: 'cloud', origin: { x: 20, y: 5 }, rotation: 0, level: 1, state: 'constructing', builtDay: 28, completeDay: 63 };
    const withApps: SaveParts = {
      ...parts,
      world: {
        ...world,
        city: { ...world.city, facilities: [...world.city.facilities, facility] },
        applications: [
          { id: 'a1', kind: 'facility', target: { type: 'web', origin: { x: 12, y: 5 }, rotation: 90 }, stage: 'objection', stageDay: 8, filedDay: 1, wallet: 'funds', reserved: 450, exception: true, objections: [{ reasonId: 'web-crowd', group: 'neighbors', district: 3, strength: 0.4125, share: 6.25, full: 12.5, basis: { value: 15, ref: 36.4 }, topLayer: 4 }, { reasonId: 'web-rent', group: 'merchants', strength: 0.2, share: 1.5, full: 3, basis: { value: 2 } }], opposition: 7.75, mods: {} },
          { id: 'a2', kind: 'facility', target: { type: 'datacenter', origin: { x: 20, y: 5 }, rotation: 0, facilityId: 'f3' }, stage: 'construction', stageDay: 28, filedDay: 0, wallet: 'funds', reserved: 650, exception: false, objections: [], opposition: 0, mods: {}, vote: { day: 28, consent: true, members: [], passed: true } },
          { id: 'a3', kind: 'rezone', target: { zone: { kind: 'industrial', cells: [{ x: 3, y: 4 }], from: 'residential' } }, stage: 'withdrawn', stageDay: 9, filedDay: 2, wallet: 'funds', reserved: 30, exception: true, objections: [], opposition: 0, mods: {}, hearing: { heldDay: 9, attended: false } },
          { id: 'a4', kind: 'upgrade', target: { facilityId: 'f1', toLevel: 3 }, stage: 'council', stageDay: 12, filedDay: 0, wallet: 'funds', reserved: 600, exception: false, objections: [], opposition: 0, mods: {}, persuaded: 'kajiya' },
          // 議会で可決し、異議申し立てで止まっている申請（採決の 7 人と、申し立てた集団）
          {
            id: 'a5', kind: 'facility', target: { type: 'server', origin: { x: 30, y: 5 }, rotation: 0 }, stage: 'appeal', stageDay: 42, filedDay: 3, wallet: 'funds', reserved: 460, exception: true,
            objections: [{ reasonId: 'server-noise', group: 'neighbors', district: 2, strength: 0.6, share: 30, full: 30, basis: { value: 18 }, issue: true, layers: [0, 4], hand: { kind: 'push', capital: 6, day: 35 } }],
            opposition: 30, mods: {}, hearing: { heldDay: 35, attended: true }, persuaded: 'shinjo',
            vote: { day: 42, consent: false, passed: true, members: ['nadamoto', 'shiomi', 'kajiya', 'chouba', 'iwakiri', 'michishita', 'shinjo'].map((m, i) => ({ memberId: m, score: i - 3 + 0.5, yes: i >= 3, reasonKey: i >= 3 ? 'gain:tech' : 'pushed:server-noise', persuaded: m === 'shinjo' })) },
            appeal: { day: 42, group: 'neighbors' },
          },
        ],
      },
    };
    const read = readSave(JSON.stringify(toSaveData(withApps, '2026-10-04T12:00:00+09:00', '2026-10-04')));
    expect(read.ok && fromSaveData(read.data)).toEqual(withApps);
  });

  it('版 4 の保存・読み込みで、模擬と市政の状態が全て元に戻る', () => {
    const read = readSave(JSON.stringify(v3Save()));
    if (!read.ok) throw new Error('読めない');
    const again = readSave(JSON.stringify(read.data));
    expect(again.ok && again.data).toEqual(read.data);
  });
});
