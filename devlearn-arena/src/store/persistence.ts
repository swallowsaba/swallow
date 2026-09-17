import { appendJournal } from '@/lib/storage/idb';
import { clearSave, loadSave, writeSave } from '@/lib/storage/local';
import { parseSave, type SaveData } from '@/lib/storage/schema';
import { useStore } from './index';
import { toSaveData } from './types';

let timer: ReturnType<typeof setTimeout> | null = null;
const WRITE_DEBOUNCE_MS = 400;
/** 変更が続いても、この時間を超えて書き込みを先送りしない */
const WRITE_MAX_WAIT_MS = 1000;
let lastWrite = 0;

/** 描画前に一度だけ呼ぶ。以後の変更は購読して自動保存する。 */
export function hydrateStore(): void {
  const { data } = loadSave(Date.now());
  useStore.getState().hydrate(data);

  // 読み込み直し・タブを閉じる・別のアプリへ移る瞬間に、待っている書き込みを必ず流す（進捗が巻き戻らないように）
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', flushSave);
    window.addEventListener('beforeunload', flushSave);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushSave();
    });
  }

  useStore.subscribe((state) => {
    if (!state.hydrated) return;
    if (timer !== null) clearTimeout(timer);
    const now = Date.now();
    if (lastWrite === 0) lastWrite = now;
    // 変更が絶え間なく続くと書き込みが永遠に先送りされるので、一定時間ごとに必ず書く
    if (now - lastWrite >= WRITE_MAX_WAIT_MS) {
      timer = null;
      lastWrite = now;
      writeSave(toSaveData(state, now));
      return;
    }
    timer = setTimeout(() => {
      timer = null;
      lastWrite = Date.now();
      writeSave(toSaveData(useStore.getState(), lastWrite));
    }, WRITE_DEBOUNCE_MS);
  });
}

/**
 * 溜めている書き込みを今すぐ流す。
 * すぐにリロードされうる操作（案内を閉じる等）の直後に呼ぶ。
 */
export function flushSave(): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  const state = useStore.getState();
  if (!state.hydrated) return;
  lastWrite = Date.now();
  writeSave(toSaveData(state, lastWrite));
}

export function exportSaveJson(): string {
  return JSON.stringify(toSaveData(useStore.getState(), Date.now()), null, 2);
}

export type ImportResult = { ok: true } | { ok: false; reason: string };

export function importSaveJson(text: string): ImportResult {
  const parsed = parseSave(text);
  if (!parsed.ok) return { ok: false, reason: parsed.detail ?? parsed.reason };
  applySave(parsed.data);
  void appendJournal({ at: Date.now(), kind: 'save_imported' });
  return { ok: true };
}

function applySave(data: SaveData): void {
  useStore.getState().hydrate(data);
  writeSave(data);
}

export function resetAll(): void {
  clearSave();
  useStore.getState().resetProgress(Date.now());
}
