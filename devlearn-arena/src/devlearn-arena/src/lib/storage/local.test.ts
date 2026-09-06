import { beforeEach, describe, expect, it } from 'vitest';
import { __setStore, loadSave, SAVE_KEY, writeSave } from './local';
import { createEmptySave } from './schema';

function fakeStore() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

let store = fakeStore();

beforeEach(() => {
  store = fakeStore();
  __setStore(store);
});

describe('local save', () => {
  it('保存したものを読み戻せる', () => {
    const save = createEmptySave(10);
    save.profile.xp = 120;
    writeSave(save);
    const loaded = loadSave(20);
    expect(loaded.recovered).toBe(false);
    expect(loaded.data.profile.xp).toBe(120);
  });

  it('未保存なら初期データを返す', () => {
    const loaded = loadSave(5);
    expect(loaded.data.profile.xp).toBe(0);
    expect(loaded.recovered).toBe(false);
  });

  it('壊れたデータは退避してから初期化する', () => {
    store.map.set(SAVE_KEY, '{broken');
    const loaded = loadSave(7);
    expect(loaded.recovered).toBe(true);
    expect(store.map.get(`${SAVE_KEY}:broken:7`)).toBe('{broken');
  });

  it('スキーマ違反のまま書き込めない', () => {
    const bad = { ...createEmptySave(1), profile: { xp: -5, streakDays: 0, lastActiveDay: null } };
    expect(() => {
      writeSave(bad);
    }).toThrow();
  });
});
