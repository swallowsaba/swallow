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

/** 課題の札の置き場所と大きさ（px）。left / top は学習画面の左上から */
export interface CardBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface LayoutPrefs {
  dock: number;
  /** 動かしたことが無ければ null。端末の右の決まった所に出す */
  card: CardBox | null;
  /** 課題の札を見出しだけにしている */
  cardFolded: boolean;
}

/** 課題の札の大きさの下限（px）。これより小さくすると中身が読めない */
export const CARD_MIN = { width: 260, height: 140 } as const;
/** 札の見出しが画面に残る幅（px）。これだけは必ず見えていて、つかんで戻せる */
const CARD_GRIP = 120;

/** 端末の幅を、下限 320px・上限は画面の 60% に収める */
export function clampDock(width: number, viewport: number): number {
  const max = Math.max(DOCK_MIN, Math.floor(viewport * DOCK_MAX_RATIO));
  return Math.round(Math.min(max, Math.max(DOCK_MIN, width)));
}

/**
 * 課題の札を画面の中に収める。大きさは下限と画面の大きさの間に、
 * 位置は見出しの一部が必ず画面に残り、上の帯の下から出るように。
 */
export function clampCard(box: CardBox, viewport: { width: number; height: number }): CardBox {
  const width = Math.round(Math.min(Math.max(box.width, CARD_MIN.width), Math.max(CARD_MIN.width, viewport.width - 16)));
  const height = Math.round(
    Math.min(Math.max(box.height, CARD_MIN.height), Math.max(CARD_MIN.height, viewport.height - SIZE.topBar - 8)),
  );
  const left = Math.round(Math.min(Math.max(box.left, CARD_GRIP - width), viewport.width - CARD_GRIP));
  const top = Math.round(Math.min(Math.max(box.top, SIZE.topBar + 4), viewport.height - 44));
  return { left, top, width, height };
}

function isCard(value: unknown): value is CardBox {
  if (typeof value !== 'object' || value === null) return false;
  const box = value as Record<string, unknown>;
  return ['left', 'top', 'width', 'height'].every((k) => typeof box[k] === 'number' && Number.isFinite(box[k]));
}

export function loadLayout(): LayoutPrefs {
  const fallback: LayoutPrefs = { dock: SIZE.dock, card: null, cardFolded: false };
  const raw = readValue(KEY);
  if (raw === null) return fallback;
  try {
    const parsed = JSON.parse(raw) as { dock?: unknown; card?: unknown; cardFolded?: unknown };
    return {
      dock: typeof parsed.dock === 'number' && Number.isFinite(parsed.dock) ? parsed.dock : SIZE.dock,
      card: isCard(parsed.card) ? parsed.card : null,
      cardFolded: parsed.cardFolded === true,
    };
  } catch {
    return fallback;
  }
}

export function saveLayout(next: Partial<LayoutPrefs>): void {
  writeValue(KEY, JSON.stringify({ ...loadLayout(), ...next }));
}
