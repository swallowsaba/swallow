import { openDb, STORE_SAVE } from '@/lib/storage/idb';
import type { SaveBackend } from './autosave';
import type { SaveData, Settings } from './schema';

/**
 * ブラウザ内の保存先（docs/data-model.md 7 章）。
 * IndexedDB の devlearn-arena データベース、save ストアの current に保存データを置く。
 * 設定の写しを localStorage にも置く（読み込みの速さのため）。
 */

const CURRENT = 'current';
const SETTINGS_KEY = 'devlearn-arena:settings';

function request<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then((db) => new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE_SAVE, mode);
    const req = run(tx.objectStore(STORE_SAVE));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error ?? req.error ?? new Error('IndexedDB の読み書きに失敗した'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB の読み書きが中断された'));
  }));
}

function copySettings(settings: Settings): void {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // 写しは速さのためだけ。書けなくても、本体は IndexedDB にある
  }
}

export function idbBackend(): SaveBackend {
  return {
    read: () => request('readonly', (s) => s.get(CURRENT) as IDBRequest<unknown>),
    write: async (data: SaveData) => {
      await request('readwrite', (s) => s.put(data, CURRENT));
      copySettings(data.player.settings);
    },
    keep: async (key, raw) => {
      await request('readwrite', (s) => s.put(raw, key));
    },
  };
}
