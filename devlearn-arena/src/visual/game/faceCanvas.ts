import { EYES, FACE, HAIR, INK, MOOD_COLOR, SKIN, type Mood } from './faces';

/**
 * 住民の顔を canvas に描く。形は faces.ts の指定をそのまま使うので、
 * 画面の地図（canvas）と説明の絵（SVG）で同じ顔になる。
 */

type Ctx = CanvasRenderingContext2D;

function stroke(ctx: Ctx, d: string, width: number, color = INK): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke(new Path2D(d));
}

function dot(ctx: Ctx, x: number, y: number, r: number, fill: string): void {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * (cx, cy) を中心に、直径 size の顔を描く。
 * 絵文字の代わりに使うので、呼ぶ側は文字の大きさと同じ感覚で size を渡せばよい。
 */
export function drawMoodFace(ctx: Ctx, cx: number, cy: number, size: number, mood: Mood): void {
  const color = MOOD_COLOR[mood];
  const k = size / FACE.size;
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(k, k);

  // 外枠（気持ちの色）
  ctx.beginPath();
  ctx.arc(FACE.head.cx, FACE.head.cy, FACE.head.r + 4.5, 0, Math.PI * 2);
  ctx.fillStyle = '#fffaf0';
  ctx.fill();
  ctx.strokeStyle = color.ring;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  for (const x of [FACE.ear.left, FACE.ear.right]) {
    dot(ctx, x, FACE.ear.y, FACE.ear.r, SKIN);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(x, FACE.ear.y, FACE.ear.r, 0, Math.PI * 2);
    ctx.stroke();
  }

  dot(ctx, FACE.head.cx, FACE.head.cy, FACE.head.r, SKIN);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(FACE.head.cx, FACE.head.cy, FACE.head.r, 0, Math.PI * 2);
  ctx.stroke();

  const hair = new Path2D(FACE.hair);
  ctx.fillStyle = HAIR;
  ctx.fill(hair);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.6;
  ctx.stroke(hair);

  if (mood === 'happy') {
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = color.accent;
    for (const x of [11.5, 28.5]) {
      ctx.beginPath();
      ctx.ellipse(x, 26, 2.6, 1.7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    stroke(ctx, `M${String(EYES.left - 2.6)} ${String(EYES.y + 0.6)} Q${String(EYES.left)} ${String(EYES.y - 2.8)} ${String(EYES.left + 2.6)} ${String(EYES.y + 0.6)}`, 2);
    stroke(ctx, `M${String(EYES.right - 2.6)} ${String(EYES.y + 0.6)} Q${String(EYES.right)} ${String(EYES.y - 2.8)} ${String(EYES.right + 2.6)} ${String(EYES.y + 0.6)}`, 2);
  } else if (mood === 'waiting') {
    stroke(ctx, `M${String(EYES.left - 2.4)} ${String(EYES.y - 0.6)} L${String(EYES.left + 2.4)} ${String(EYES.y - 0.6)}`, 2);
    stroke(ctx, `M${String(EYES.right - 2.4)} ${String(EYES.y - 0.6)} L${String(EYES.right + 2.4)} ${String(EYES.y - 0.6)}`, 2);
    dot(ctx, EYES.left, EYES.y + 1, 1.4, INK);
    dot(ctx, EYES.right, EYES.y + 1, 1.4, INK);
  } else {
    dot(ctx, EYES.left, EYES.y, EYES.r, INK);
    dot(ctx, EYES.right, EYES.y, EYES.r, INK);
  }

  for (const d of FACE.brow[mood]) stroke(ctx, d, 2.2);
  stroke(ctx, FACE.mouth[mood], 2.2);

  if (mood === 'angry') {
    stroke(ctx, 'M30 8 L34.5 8', 2, color.accent);
    stroke(ctx, 'M31 11 L35.5 11', 2, color.accent);
    stroke(ctx, 'M33 5.5 L33 9.5', 2, color.accent);
  } else if (mood === 'waiting') {
    const drop = new Path2D('M33 8 Q36 12.5 33 14 Q30 12.5 33 8 Z');
    ctx.fillStyle = color.accent;
    ctx.fill(drop);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.4;
    ctx.stroke(drop);
  }

  ctx.restore();
}
