import { appendJournal } from '@/lib/storage/idb';
import { clearSave, loadSave, writeSave } from '@/lib/storage/local';
import { parseSave, type SaveData } from '@/lib/storage/schema';
import { useStore } from './index';
import { toSaveData } from './types';

let timer: ReturnType<typeof setTimeout> | null = null;
const WRITE_DEBOUNCE_MS = 400;

/** 描画前に一度だけ呼ぶ。以後の変更は購読して自動保存する。 */
export function hydrateStore(): void {
  const { data } = loadSave(Date.now());
  useStore.getState().hydrate(data);

  useStore.subscribe((state) => {
    if (!state.hydrated) return;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      writeSave(toSaveData(state, Date.now()));
    }, WRITE_DEBOUNCE_MS);
  });
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
