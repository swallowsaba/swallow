import type {
  EditState,
  EmojiOverlay,
  FrameOverlay,
  FrameStyle,
  Overlay,
  PrivacyOverlay,
  PrivacyStyle,
  TextOverlay,
} from '@/types';
import { createId } from '@/utils/id';

/**
 * Pure transitions over {@link EditState.overlays} and pure layout math for
 * text overlays. The editor store wraps the transitions with a history push so
 * every text edit is undoable and persisted; the layout resolver is shared by
 * the viewport (SVG) and the export baker (2D canvas) so they stay in sync.
 */

export function defaultTextOverlay(text: string): TextOverlay {
  return {
    id: createId('txt'),
    kind: 'text',
    text,
    x: 0.5,
    y: 0.5,
    fontSize: 0.1,
    fontFamily: 'Inter, system-ui, sans-serif',
    fontWeight: 700,
    italic: false,
    color: '#ffffff',
    align: 'center',
    rotationDeg: 0,
    strokeColor: '#000000',
    strokeWidth: 0.12,
    shadow: true,
    opacity: 1,
  };
}

function withOverlays(state: EditState, overlays: readonly Overlay[]): EditState {
  return { ...state, overlays, updatedAt: Date.now() };
}

export function defaultEmojiOverlay(emoji: string): EmojiOverlay {
  return {
    id: createId('emo'),
    kind: 'emoji',
    emoji,
    x: 0.5,
    y: 0.5,
    size: 0.15,
    rotationDeg: 0,
    opacity: 1,
  };
}

export function defaultFrameOverlay(): FrameOverlay {
  return {
    id: createId('frm'),
    kind: 'frame',
    style: 'border',
    color: '#ffffff',
    thickness: 0.02,
    inset: 0.03,
    cornerRadius: 0.02,
    opacity: 1,
  };
}

export function defaultPrivacyOverlay(): PrivacyOverlay {
  return {
    id: createId('prv'),
    kind: 'privacy',
    style: 'pixelate',
    x: 0.5,
    y: 0.5,
    w: 0.28,
    h: 0.2,
    strength: 0.5,
    color: '#000000',
  };
}

export function addOverlay(state: EditState, overlay: Overlay): EditState {
  return withOverlays(state, [...state.overlays, overlay]);
}

/** A patch over any overlay's editable fields (never id/kind). The shared but
 *  differently-typed fields (`style`, `color`) are given explicit union types so
 *  the kinds don't collapse to `never`. */
export type OverlayPatch = Partial<
  Omit<TextOverlay, 'id' | 'kind' | 'color'> &
    Pick<EmojiOverlay, 'emoji' | 'size'> &
    Pick<FrameOverlay, 'thickness' | 'inset' | 'cornerRadius'> &
    Pick<PrivacyOverlay, 'w' | 'h' | 'strength'> & {
      color: string;
      style: FrameStyle | PrivacyStyle;
    }
>;

export function updateOverlay(state: EditState, id: string, patch: OverlayPatch): EditState {
  return withOverlays(
    state,
    // The patch never carries `kind`, so the merged object stays the same
    // overlay kind at runtime; the cast just reassures the union type.
    state.overlays.map((o) => (o.id === id ? ({ ...o, ...patch } as Overlay) : o)),
  );
}

export function moveOverlay(state: EditState, id: string, x: number, y: number): EditState {
  const cx = x < 0 ? 0 : x > 1 ? 1 : x;
  const cy = y < 0 ? 0 : y > 1 ? 1 : y;
  return updateOverlay(state, id, { x: cx, y: cy });
}

export function removeOverlay(state: EditState, id: string): EditState {
  return withOverlays(
    state,
    state.overlays.filter((o) => o.id !== id),
  );
}

export function reorderOverlay(
  state: EditState,
  id: string,
  direction: 'up' | 'down',
): EditState {
  const idx = state.overlays.findIndex((o) => o.id === id);
  if (idx === -1) return state;
  const target = direction === 'up' ? idx + 1 : idx - 1;
  if (target < 0 || target >= state.overlays.length) return state;
  const next = [...state.overlays];
  const a = next[idx];
  const b = next[target];
  if (!a || !b) return state;
  next[idx] = b;
  next[target] = a;
  return withOverlays(state, next);
}

export function getOverlay(state: EditState, id: string | null): Overlay | null {
  if (!id) return null;
  return state.overlays.find((o) => o.id === id) ?? null;
}

/* ------------------------------ layout math ------------------------------ */

export interface TextLayout {
  /** Anchor position in pixels. */
  readonly x: number;
  readonly y: number;
  readonly fontPx: number;
  readonly strokePx: number;
  readonly lines: readonly string[];
  readonly lineHeightPx: number;
}

/**
 * Resolve a text overlay's normalized description into concrete pixel values
 * for a target of `size`. Font size is a fraction of the shorter edge so text
 * scales consistently between the on-screen preview and full-res export.
 */
export function resolveTextLayout(
  o: TextOverlay,
  size: { width: number; height: number },
): TextLayout {
  const shortEdge = Math.max(1, Math.min(size.width, size.height));
  const fontPx = Math.max(1, o.fontSize * shortEdge);
  return {
    x: o.x * size.width,
    y: o.y * size.height,
    fontPx,
    strokePx: Math.max(0, o.strokeWidth) * fontPx,
    lines: o.text.split('\n'),
    lineHeightPx: fontPx * 1.2,
  };
}

/** A CSS font shorthand string for the overlay (used by SVG/canvas). */
export function fontString(o: TextOverlay, fontPx: number): string {
  const style = o.italic ? 'italic ' : '';
  return `${style}${String(o.fontWeight)} ${String(Math.round(fontPx))}px ${o.fontFamily}`;
}

export interface EmojiLayout {
  readonly x: number;
  readonly y: number;
  readonly px: number;
}

/** Resolve an emoji sticker's position and pixel size for a target of `size`. */
export function resolveEmojiLayout(
  o: EmojiOverlay,
  size: { width: number; height: number },
): EmojiLayout {
  const shortEdge = Math.max(1, Math.min(size.width, size.height));
  return { x: o.x * size.width, y: o.y * size.height, px: Math.max(1, o.size * shortEdge) };
}

export interface FrameGeometry {
  readonly style: 'border' | 'matte';
  readonly outerW: number;
  readonly outerH: number;
  /** Inner rect: the stroked rect (border) or the transparent hole (matte). */
  readonly rx: number;
  readonly ry: number;
  readonly rw: number;
  readonly rh: number;
  readonly thicknessPx: number;
  readonly radiusPx: number;
}

/**
 * Resolve a frame into concrete geometry. `border` is a stroked rounded rect
 * inset from the edge; `matte` is a solid band filling the margin down to a
 * rounded inner hole. Shared by the SVG preview and the canvas export.
 */
export function resolveFrameGeometry(
  o: FrameOverlay,
  size: { width: number; height: number },
): FrameGeometry {
  const W = size.width;
  const H = size.height;
  const shortEdge = Math.max(1, Math.min(W, H));
  const t = Math.max(0, o.thickness) * shortEdge;
  const radius = Math.max(0, o.cornerRadius) * shortEdge;
  if (o.style === 'matte') {
    const rx = t;
    const ry = t;
    return {
      style: 'matte',
      outerW: W,
      outerH: H,
      rx,
      ry,
      rw: Math.max(0, W - 2 * t),
      rh: Math.max(0, H - 2 * t),
      thicknessPx: t,
      radiusPx: radius,
    };
  }
  const inset = Math.max(0, o.inset) * shortEdge;
  const rx = inset + t / 2;
  const ry = inset + t / 2;
  return {
    style: 'border',
    outerW: W,
    outerH: H,
    rx,
    ry,
    rw: Math.max(0, W - 2 * rx),
    rh: Math.max(0, H - 2 * ry),
    thicknessPx: t,
    radiusPx: radius,
  };
}

export interface RectPx {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Resolve a privacy region's center+size (normalized) into a pixel rect,
 *  clamped to the target bounds. */
export function resolvePrivacyRect(
  o: PrivacyOverlay,
  size: { width: number; height: number },
): RectPx {
  const w = Math.max(0, o.w) * size.width;
  const h = Math.max(0, o.h) * size.height;
  let x = o.x * size.width - w / 2;
  let y = o.y * size.height - h / 2;
  x = Math.max(0, Math.min(x, size.width));
  y = Math.max(0, Math.min(y, size.height));
  const cw = Math.min(w, size.width - x);
  const ch = Math.min(h, size.height - y);
  return { x, y, w: Math.max(0, cw), h: Math.max(0, ch) };
}

/**
 * Mosaic cell size in pixels for a region, from strength 0..1. Higher strength
 * → coarser blocks. Always at least one pixel and never larger than the region.
 */
export function mosaicCellPx(rect: RectPx, strength: number): number {
  const s = strength < 0 ? 0 : strength > 1 ? 1 : strength;
  const minDim = Math.max(1, Math.min(rect.w, rect.h));
  const cell = minDim * (0.02 + s * 0.2);
  return Math.max(1, Math.min(Math.round(cell), Math.round(minDim)));
}

/** Blur radius in pixels for a region, from strength 0..1. */
export function blurRadiusPx(rect: RectPx, strength: number): number {
  const s = strength < 0 ? 0 : strength > 1 ? 1 : strength;
  const minDim = Math.max(1, Math.min(rect.w, rect.h));
  return Math.max(1, Math.round(minDim * (0.02 + s * 0.12)));
}
