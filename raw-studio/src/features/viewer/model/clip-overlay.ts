/**
 * Pure classifier for the on-image clipping overlay ("blinkies"). Given a final
 * (0..1) pixel color, decides whether it should be flagged as highlight-clipped
 * (any channel at/above the high threshold) or shadow-clipped (all channels
 * at/below the low threshold). Mirrored in the GLSL shader.
 */

export type ClipKind = 'highlight' | 'shadow' | null;

export function clipOverlay(
  r: number,
  g: number,
  b: number,
  high = 0.996,
  low = 0.004,
): ClipKind {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  if (mx >= high) return 'highlight';
  if (mn <= low) return 'shadow';
  return null;
}
