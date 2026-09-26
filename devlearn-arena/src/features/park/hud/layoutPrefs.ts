import { readValue, writeValue } from '@/lib/storage/local';
import { SIZE } from './theme';

/**
 * 学習画面の配置のうち、学習者が動かして決めるもの（REWORK 3-3・4-1・4-2）。
 * 端末の幅と、課題の札の位置・大きさ・畳んだかどうか。開き直しても同じ配置で出す。
 */

const KEY = 'devlearn-arena:layout:v1';

/** 端末の幅の下限（px） */
export const DOCK_MIN = 320;
/** 端末の幅の上限。画面の幅に対する割合 */
export const DOCK_MAX_RATIO = 0.6;

/** 課題の札の置き場所と大きさ（px）。left / top は画面の左上から */
export interface CardBox {
  left: number;
  top: number;
  width: number;
  height: number;
  /** 見出しだけにしている */
  folded: boolean;
}

export interface LayoutPrefs {
  dock: number;
  card: CardBox | null;
}

/** 端末の幅を、下限 320px・上限は画面の 60% に収める */
export function clampDock(width: number, viewport: number): number {
  const max = Math.max(DOCK_MIN, Math.floor(viewport * DOCK_MAX_RATIO));
  return Math.round(Math.min(max, Math.max(DOCK_MIN, width)));
}

function isCard(value: unknown): value is CardBox {
  if (typeof value !== 'object' || value === null) return false;
  const box = value as Record<string, unknown>;
  return (
    ['left', 'top', 'width', 'height'].every((k) => typeof box[k] === 'number' && Number.isFinite(box[k])) &&
    typeof box['folded'] === 'boolean'
  );
}

export function loadLayout(): LayoutPrefs {
  const fallback: LayoutPrefs = { dock: SIZE.dock, card: null };
  const raw = readValue(KEY);
  if (raw === null) return fallback;
  try {
    const parsed = JSON.parse(raw) as { dock?: unknown; card?: unknown };
    return {
      dock: typeof parsed.dock === 'number' && Number.isFinite(parsed.dock) ? parsed.dock : SIZE.dock,
      card: isCard(parsed.card) ? parsed.card : null,
    };
  } catch {
    return fallback;
  }
}

export function saveLayout(next: Partial<LayoutPrefs>): void {
  writeValue(KEY, JSON.stringify({ ...loadLayout(), ...next }));
}
