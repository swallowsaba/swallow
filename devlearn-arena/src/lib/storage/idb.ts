/**
 * IndexedDB の最小ラッパ。
 * localStorage には収まらない大きさのもの（学習ジャーナル、後続フェーズの
 * タイムトラベル用スナップショット）を置く。ライブラリは使わない。
 * IndexedDB が使えない環境ではメモリにフォールバックし、機能は落とさない。
 */
export interface JournalEntry {
  id?: number;
  at: number;
  kind: 'lesson_opened' | 'lesson_cleared' | 'xp_gained' | 'save_imported';
  lessonId?: string;
  amount?: number;
}

const DB_NAME = 'devlearn-arena';
const DB_VERSION = 1;
const STORE_JOURNAL = 'journal';

let dbPromise: Promise<IDBDatabase> | null = null;
const memoryJournal: JournalEntry[] = [];

function available(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_JOURNAL)) {
        db.createObjectStore(STORE_JOURNAL, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
  return dbPromise;
}

export async function appendJournal(entry: JournalEntry): Promise<void> {
  if (!available()) {
    memoryJournal.push(entry);
    return;
  }
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_JOURNAL, 'readwrite');
    tx.objectStore(STORE_JOURNAL).add(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('journal write failed'));
  });
}

export async function readJournal(limit = 50): Promise<JournalEntry[]> {
  if (!available()) return memoryJournal.slice(-limit).reverse();
  const db = await openDb();
  return new Promise<JournalEntry[]>((resolve, reject) => {
    const out: JournalEntry[] = [];
    const tx = db.transaction(STORE_JOURNAL, 'readonly');
    const cursorReq = tx.objectStore(STORE_JOURNAL).openCursor(null, 'prev');
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (!cursor || out.length >= limit) {
        resolve(out);
        return;
      }
      out.push(cursor.value as JournalEntry);
      cursor.continue();
    };
    cursorReq.onerror = () => reject(cursorReq.error ?? new Error('journal read failed'));
  });
}

export async function clearJournal(): Promise<void> {
  memoryJournal.length = 0;
  if (!available()) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_JOURNAL, 'readwrite');
    tx.objectStore(STORE_JOURNAL).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('journal clear failed'));
  });
}
