/**
 * IndexedDB の devlearn-arena データベースを開く（保存データの置き場。docs/data-model.md 7 章・src/save/idb.ts）。
 * ライブラリは使わない。
 */
const DB_NAME = 'devlearn-arena';
/** 版 2 で、保存データの save ストアを足した（docs/data-model.md 7 章。src/save/idb.ts） */
const DB_VERSION = 2;
/** 版 1 で作った、以前の学習の記録の置き場。今は使わないが、版を上げずに残す（消すと版を上げることになる） */
const STORE_JOURNAL = 'journal';
export const STORE_SAVE = 'save';

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_JOURNAL)) {
        db.createObjectStore(STORE_JOURNAL, { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(STORE_SAVE)) db.createObjectStore(STORE_SAVE);
    };
    req.onsuccess = () => {
      // 別のタブが新しい版で開こうとしたら、閉じて譲る（譲らないと、そのタブの読み込みが止まる）
      req.result.onversionchange = () => {
        req.result.close();
        dbPromise = null;
      };
      resolve(req.result);
    };
    req.onerror = () => {
      // 開けなかった時は、次に呼んだ時に開き直せるようにする
      dbPromise = null;
      reject(req.error ?? new Error('IndexedDB open failed'));
    };
  });
  return dbPromise;
}
