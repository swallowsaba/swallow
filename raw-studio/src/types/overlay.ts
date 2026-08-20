/**
 * Compositing overlays drawn on top of the developed image — text for now,
 * with room for stickers/shapes later. Overlays live in {@link EditState} like
 * masks, so they are undoable and persisted, and they are baked into the export
 * on a 2D canvas after the WebGL adjustment pass.
 *
 * Positions are normalized 0..1 in the CROPPED image's space (x,y = the text
 * anchor). Sizes are fractions so a text looks the same at preview and export
 * resolution: `fontSize` is a fraction of the cropped image's shorter edge and
 * `strokeWidth` is a fraction of the resolved font pixels.
 */

export type OverlayKind = 'text' | 'emoji' | 'frame' | 'privacy';

export type TextAlign = 'left' | 'center' | 'right';

export interface TextOverlay {
  readonly id: string;
  readonly kind: 'text';
  readonly text: string;
  /** Anchor position, normalized to the cropped image. */
  readonly x: number;
  readonly y: number;
  /** Font size as a fraction of the cropped image's shorter edge (e.g. 0.08). */
  readonly fontSize: number;
  readonly fontFamily: string;
  readonly fontWeight: number;
  readonly italic: boolean;
  readonly color: string;
  readonly align: TextAlign;
  readonly rotationDeg: number;
  readonly strokeColor: string;
  /** Outline width as a fraction of the font pixel size (0 = none). */
  readonly strokeWidth: number;
  readonly shadow: boolean;
  /** 0..1 */
  readonly opacity: number;
}

export type Overlay = TextOverlay | EmojiOverlay | FrameOverlay | PrivacyOverlay;

export type PrivacyStyle = 'pixelate' | 'blur' | 'block';

/**
 * A privacy region that obscures part of the image (faces, plates, personal
 * info). The area is a rectangle in the cropped image's normalized space; the
 * effect is baked into the export so shared images are actually redacted.
 */
export interface PrivacyOverlay {
  readonly id: string;
  readonly kind: 'privacy';
  readonly style: PrivacyStyle;
  /** Rectangle center + size, normalized to the cropped image. */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** Effect strength 0..1 (mosaic cell size / blur radius; ignored for block). */
  readonly strength: number;
  /** Fill color for the `block` style. */
  readonly color: string;
}

/** An emoji sticker (rendered with the platform emoji font — license-free). */
export interface EmojiOverlay {
  readonly id: string;
  readonly kind: 'emoji';
  readonly emoji: string;
  /** Center position, normalized to the cropped image. */
  readonly x: number;
  readonly y: number;
  /** Size as a fraction of the cropped image's shorter edge. */
  readonly size: number;
  readonly rotationDeg: number;
  readonly opacity: number;
}

export type FrameStyle = 'border' | 'matte';

/** A full-frame decorative border around the whole image. */
export interface FrameOverlay {
  readonly id: string;
  readonly kind: 'frame';
  readonly style: FrameStyle;
  readonly color: string;
  /** Border/mat width as a fraction of the shorter edge. */
  readonly thickness: number;
  /** Gap from the image edge (border style only), fraction of the shorter edge. */
  readonly inset: number;
  /** Corner radius as a fraction of the shorter edge. */
  readonly cornerRadius: number;
  readonly opacity: number;
}
