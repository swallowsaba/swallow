import type { Size } from './collage-layout';

export type TextAnchor =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'middle-left'
  | 'middle-center'
  | 'middle-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

/**
 * Compute the draw origin (baseline-left) for a text string at one of 9
 * anchor points within `canvas`, given its rendered width and the font size
 * (used for vertical baseline offset) and a margin from the edges.
 */
export function computeTextPosition(
  anchor: TextAnchor,
  canvas: Size,
  textWidth: number,
  fontPx: number,
  margin: number,
): { x: number; y: number } {
  const left = margin;
  const right = canvas.width - textWidth - margin;
  const centerX = (canvas.width - textWidth) / 2;

  const top = margin + fontPx;
  const bottom = canvas.height - margin;
  const centerY = canvas.height / 2 + fontPx / 2;

  const [vert, horiz] = anchor.split('-') as [
    'top' | 'middle' | 'bottom',
    'left' | 'center' | 'right',
  ];
  const x = horiz === 'left' ? left : horiz === 'right' ? right : centerX;
  const y = vert === 'top' ? top : vert === 'bottom' ? bottom : centerY;
  return { x, y };
}
