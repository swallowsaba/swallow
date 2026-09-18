import {
  BADGE, BADGE_GLYPH, BLUSH, BROW, BUST, BUST_INNER, COAT, COAT_INNER, EAR, EYE, EYE_ALMOND, EYE_CLOSED,
  EYE_SHAPE, FACE_BOX, HAIR, HAIR_LIGHT, HAIR_PATH, HAIR_SHINE, HEAD_PATH, INK, JAW_SHADE, LINE, MOOD_COLOR,
  MOUTH, NECK, NECK_SHADE, NOSE, SKIN, SKIN_SHADE, type Mood,
} from './faces';

/**
 * 住民の顔を canvas に描く。形は faces.ts の指定をそのまま使うので、
 * 画面の地図（canvas）と説明の絵（SVG）で同じ顔になる。
 */

type Ctx = CanvasRenderingContext2D;

function fill(ctx: Ctx, d: string, color: string, alpha = 1): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fill(new Path2D(d));
  ctx.restore();
}

function stroke(ctx: Ctx, d: string, color: string, width: number): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke(new Path2D(d));
}

function ellipse(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, color: string, alpha = 1): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * (cx, cy) を中心に、直径 size の顔を描く。
 * 絵文字の代わりに使うので、呼ぶ側は文字の大きさと同じ感覚で size を渡せばよい。
 */
export function drawMoodFace(ctx: Ctx, cx: number, cy: number, size: number, mood: Mood): void {
  const color = MOOD_COLOR[mood];
  const k = size / FACE_BOX;
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(k, k);

  // 丸く切り抜く
  ctx.save();
  ctx.beginPath();
  ctx.arc(24, 24, 22.2, 0, Math.PI * 2);
  ctx.clip();

  const bg = ctx.createLinearGradient(0, 0, 0, FACE_BOX);
  bg.addColorStop(0, '#ffffff');
  bg.addColorStop(1, color.tint);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, FACE_BOX, FACE_BOX);

  fill(ctx, BUST, COAT);
  fill(ctx, BUST_INNER, COAT_INNER);

  const skin = ctx.createLinearGradient(0, 4, 0, 42);
  skin.addColorStop(0, SKIN);
  skin.addColorStop(1, SKIN_SHADE);
  ctx.fillStyle = skin;
  ctx.fill(new Path2D(NECK));
  fill(ctx, NECK_SHADE, 'rgba(0,0,0,0.13)');

  ellipse(ctx, EAR.left, EAR.y, EAR.rx, EAR.ry, SKIN_SHADE);
  ellipse(ctx, EAR.right, EAR.y, EAR.rx, EAR.ry, SKIN_SHADE);

  ctx.fillStyle = skin;
  ctx.fill(new Path2D(HEAD_PATH));
  fill(ctx, JAW_SHADE, 'rgba(0,0,0,0.07)');

  fill(ctx, HAIR_PATH, HAIR);
  ctx.save();
  ctx.globalAlpha = 0.9;
  stroke(ctx, HAIR_SHINE, HAIR_LIGHT, 1.8);
  ctx.restore();

  ellipse(ctx, BLUSH.left, BLUSH.y, BLUSH.rx, BLUSH.ry, color.blush, 0.45);
  ellipse(ctx, BLUSH.right, BLUSH.y, BLUSH.rx, BLUSH.ry, color.blush, 0.45);

  const eye = EYE_SHAPE[mood];
  if (eye === 'closed') {
    for (const x of [EYE.left, EYE.right]) {
      ctx.save();
      ctx.translate(x, EYE.y);
      stroke(ctx, EYE_CLOSED, INK, 1.9);
      ctx.restore();
    }
  } else {
    for (const [x, dir] of [[EYE.left, 1], [EYE.right, -1]] as const) {
      ctx.save();
      ctx.translate(x, EYE.y);
      ctx.rotate(((eye.rotate * dir) * Math.PI) / 180);
      ctx.scale(1, eye.scaleY);
      fill(ctx, EYE_ALMOND, INK);
      ellipse(ctx, -1, -1.1, 0.95, 0.95, '#ffffff', 0.95);
      ctx.restore();
    }
  }

  for (const d of BROW[mood]) stroke(ctx, d, LINE, 2);
  stroke(ctx, NOSE, 'rgba(42,33,24,0.45)', 1.4);

  const mouth = MOUTH[mood];
  if (mouth.stroke !== undefined) stroke(ctx, mouth.stroke, INK, 2.1);
  if (mouth.fill !== undefined) fill(ctx, mouth.fill, INK);
  if (mouth.tongue !== undefined) fill(ctx, mouth.tongue, '#e07b7b');

  ctx.restore();

  ctx.strokeStyle = color.ring;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(24, 24, 22.2, 0, Math.PI * 2);
  ctx.stroke();

  // 右上の記章
  ctx.beginPath();
  ctx.arc(BADGE.cx, BADGE.cy, BADGE.r, 0, Math.PI * 2);
  ctx.fillStyle = color.accent;
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.stroke();
  const badge = BADGE_GLYPH[mood];
  for (const d of badge.stroke ?? []) stroke(ctx, d, '#ffffff', 2);
  for (const cx2 of badge.dots ?? []) ellipse(ctx, cx2, BADGE.cy, 1.1, 1.1, '#ffffff');

  ctx.restore();
}
