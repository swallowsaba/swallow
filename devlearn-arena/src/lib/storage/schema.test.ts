import { describe, expect, it } from 'vitest';
import { createEmptySave, parseSave, saveDataSchema } from './schema';

describe('save schema', () => {
  it('空の保存データは自身のスキーマを満たす', () => {
    expect(saveDataSchema.safeParse(createEmptySave(1)).success).toBe(true);
  });

  it('往復して同じ値になる', () => {
    const save = createEmptySave(1000);
    save.profile.xp = 240;
    save.lessons['git/01/objects'] = {
      cleared: true,
      attempts: 2,
      hintsUsed: 1,
      bestScore: 88,
      clearedAt: 1234,
    };
    const result = parseSave(JSON.stringify(save));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual(save);
  });

  it('null と空文字は empty として扱う', () => {
    expect(parseSave(null)).toEqual({ ok: false, reason: 'empty' });
    expect(parseSave('   ')).toEqual({ ok: false, reason: 'empty' });
  });

  it('壊れたJSONを弾く', () => {
    const r = parseSave('{oops');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('invalid-json');
  });

  it('スキーマ違反を弾く', () => {
    const r = parseSave(JSON.stringify({ version: 1, profile: {} }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('schema');
  });

  it('分割比率が既定で埋まる（古い保存データを壊さない）', () => {
    const save = createEmptySave(1);
    const raw = JSON.parse(JSON.stringify(save)) as Record<string, unknown>;
    const settings = raw['settings'] as Record<string, unknown>;
    delete settings['paneMain'];
    delete settings['paneMap'];
    const r = parseSave(JSON.stringify(raw));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.settings.paneMain).toBe(55);
      expect(r.data.settings.paneMap).toBe(62);
    }
  });

  it('範囲外の比率を弾く', () => {
    const save = createEmptySave(1);
    save.settings.paneMain = 99;
    expect(parseSave(JSON.stringify(save)).ok).toBe(false);
  });

  it('未知バージョンを弾く', () => {
    const save = { ...createEmptySave(1), version: 99 };
    const r = parseSave(JSON.stringify(save));
    expect(r.ok).toBe(false);
  });

  it('XPが負の保存データを弾く', () => {
    const save = createEmptySave(1);
    save.profile.xp = -1;
    expect(parseSave(JSON.stringify(save)).ok).toBe(false);
  });
});
