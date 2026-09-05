import { createEmptySave, parseSave, saveDataSchema, type SaveData } from './schema';

export const SAVE_KEY = 'devlearn-arena:save:v1';

interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function memoryStore(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

/** Safari のプライベートモード等で localStorage が例外を投げる環境を吸収する */
export function resolveStore(): KeyValueStore {
  try {
    const probe = '__devlearn_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return memoryStore();
  }
}

let store: KeyValueStore | null = null;
function getStore(): KeyValueStore {
  store ??= typeof window === 'undefined' ? memoryStore() : resolveStore();
  return store;
}

/** テスト用。任意のストアを差し込む。 */
export function __setStore(next: KeyValueStore | null): void {
  store = next;
}

export function loadSave(now: number): { data: SaveData; recovered: boolean } {
  const result = parseSave(getStore().getItem(SAVE_KEY));
  if (result.ok) return { data: result.data, recovered: false };
  // 壊れた保存データは捨てずに退避してから初期化する
  if (result.reason === 'invalid-json' || result.reason === 'schema') {
    const broken = getStore().getItem(SAVE_KEY);
    if (broken !== null) getStore().setItem(`${SAVE_KEY}:broken:${String(now)}`, broken);
  }
  return { data: createEmptySave(now), recovered: result.reason !== 'empty' };
}

export function writeSave(data: SaveData): void {
  const validated = saveDataSchema.parse(data);
  getStore().setItem(SAVE_KEY, JSON.stringify(validated));
}

export function clearSave(): void {
  getStore().removeItem(SAVE_KEY);
}
