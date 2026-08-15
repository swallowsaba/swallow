import type { EmojiOverlay, FrameOverlay, Overlay, TextAlign, TextOverlay } from '@/types';
import {
  fontString,
  resolveEmojiLayout,
  resolveFrameGeometry,
  resolveTextLayout,
} from './overlay-ops';

/**
 * Bake overlays onto a 2D canvas context at export resolution. Shares the same
 * layout resolver as the on-screen preview so what you see is what you get.
 * Works with both OffscreenCanvas and HTMLCanvas 2D contexts.
 */

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function textAnchor(align: TextAlign): CanvasTextAlign {
  return align === 'left' ? 'left' : align === 'right' ? 'right' : 'center';
}

function drawText(ctx: Ctx, o: TextOverlay, size: { width: number; height: number }): void {
  const layout = resolveTextLayout(o, size);
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, o.opacity));
  ctx.translate(layout.x, layout.y);
  if (o.rotationDeg !== 0) ctx.rotate((o.rotationDeg * Math.PI) / 180);
  ctx.font = fontString(o, layout.fontPx);
  ctx.textAlign = textAnchor(o.align);
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;

  const n = layout.lines.length;
  // Vertically center the whole block around the anchor.
  const startY = -((n - 1) * layout.lineHeightPx) / 2;

  for (let i = 0; i < n; i++) {
    const line = layout.lines[i] ?? '';
    const y = startY + i * layout.lineHeightPx;
    if (o.shadow) {
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = layout.fontPx * 0.08;
      ctx.shadowOffsetX = layout.fontPx * 0.03;
      ctx.shadowOffsetY = layout.fontPx * 0.03;
    }
    if (layout.strokePx > 0) {
      ctx.lineWidth = layout.strokePx;
      ctx.strokeStyle = o.strokeColor;
      ctx.strokeText(line, 0, y);
    }
    // Turn the shadow off for the fill so it doesn't double up on the stroke.
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.fillStyle = o.color;
    ctx.fillText(line, 0, y);
  }
  ctx.restore();
}

function drawEmoji(ctx: Ctx, o: EmojiOverlay, size: { width: number; height: number }): void {
  const layout = resolveEmojiLayout(o, size);
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, o.opacity));
  ctx.translate(layout.x, layout.y);
  if (o.rotationDeg !== 0) ctx.rotate((o.rotationDeg * Math.PI) / 180);
  ctx.font = `${String(Math.round(layout.px))}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(o.emoji, 0, 0);
  ctx.restore();
}

/** Trace a rounded rectangle path (radius clamped to half the smaller side). */
function roundRectPath(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawFrame(ctx: Ctx, o: FrameOverlay, size: { width: number; height: number }): void {
  const g = resolveFrameGeometry(o, size);
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, o.opacity));
  if (g.style === 'matte') {
    // Fill the whole canvas, then punch a rounded hole (even-odd).
    ctx.fillStyle = o.color;
    ctx.beginPath();
    ctx.rect(0, 0, g.outerW, g.outerH);
    roundRectPath(ctx, g.rx, g.ry, g.rw, g.rh, g.radiusPx);
    ctx.fill('evenodd');
  } else {
    ctx.strokeStyle = o.color;
    ctx.lineWidth = g.thicknessPx;
    ctx.beginPath();
    roundRectPath(ctx, g.rx, g.ry, g.rw, g.rh, g.radiusPx);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawOverlays(
  ctx: Ctx,
  overlays: readonly Overlay[],
  size: { width: number; height: number },
): void {
  for (const o of overlays) {
    if (o.kind === 'text') drawText(ctx, o, size);
    else if (o.kind === 'emoji') drawEmoji(ctx, o, size);
    else drawFrame(ctx, o, size);
  }
}
