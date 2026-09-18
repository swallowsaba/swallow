import { motion } from 'framer-motion';
import { useId } from 'react';
import {
  BADGE, BADGE_GLYPH, BLUSH, BROW, BUST, BUST_INNER, COAT, COAT_INNER, EAR, EYE, EYE_ALMOND, EYE_CLOSED,
  EYE_SHAPE, FACE_BOX, HAIR, HAIR_LIGHT, HAIR_PATH, HAIR_SHINE, HEAD_PATH, INK, JAW_SHADE, LINE, MOOD_COLOR,
  MOUTH, NECK, NECK_SHADE, NOSE, SKIN, SKIN_SHADE, type Mood,
} from './faces';

/**
 * 住民の顔。苦情・対応待ち・評価を、目・眉・口の形で描き分ける。
 *
 * 首から上を丸く切り抜いた人の像にして、地面に顔だけが浮かないようにする。
 * 同じ形を canvas 版（faceCanvas.ts）でも使うので、地図の中と説明の中で同じ人に見える。
 */

/** 顔の中身。48×48 の枠に描く */
function FaceArt({ mood, id }: { mood: Mood; id: string }) {
  const color = MOOD_COLOR[mood];
  const eye = EYE_SHAPE[mood];
  const mouth = MOUTH[mood];
  const badge = BADGE_GLYPH[mood];
  return (
    <>
      <defs>
        <clipPath id={`${id}-round`}>
          <circle cx={24} cy={24} r={22.2} />
        </clipPath>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor={color.tint} />
        </linearGradient>
        <linearGradient id={`${id}-skin`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.15" stopColor={SKIN} />
          <stop offset="1" stopColor={SKIN_SHADE} />
        </linearGradient>
      </defs>

      <g clipPath={`url(#${id}-round)`}>
        <rect x={0} y={0} width={FACE_BOX} height={FACE_BOX} fill={`url(#${id}-bg)`} />

        {/* 肩と首 */}
        <path d={BUST} fill={COAT} />
        <path d={BUST_INNER} fill={COAT_INNER} />
        <path d={NECK} fill={`url(#${id}-skin)`} />
        <path d={NECK_SHADE} fill="rgba(0,0,0,0.14)" />

        {/* 耳 */}
        <ellipse cx={EAR.left} cy={EAR.y} rx={EAR.rx} ry={EAR.ry} fill={SKIN_SHADE} />
        <ellipse cx={EAR.right} cy={EAR.y} rx={EAR.rx} ry={EAR.ry} fill={SKIN_SHADE} />

        {/* 輪郭 */}
        <path d={HEAD_PATH} fill={`url(#${id}-skin)`} />
        <path d={JAW_SHADE} fill="rgba(0,0,0,0.07)" />

        {/* 髪 */}
        <path d={HAIR_PATH} fill={HAIR} />
        <path d={HAIR_SHINE} fill="none" stroke={HAIR_LIGHT} strokeWidth={1.8} strokeLinecap="round" opacity={0.9} />

        {/* ほほ */}
        <ellipse cx={BLUSH.left} cy={BLUSH.y} rx={BLUSH.rx} ry={BLUSH.ry} fill={color.blush} opacity={0.45} />
        <ellipse cx={BLUSH.right} cy={BLUSH.y} rx={BLUSH.rx} ry={BLUSH.ry} fill={color.blush} opacity={0.45} />

        {/* 目 */}
        {eye === 'closed' ? (
          <g fill="none" stroke={INK} strokeWidth={1.9} strokeLinecap="round">
            <path d={EYE_CLOSED} transform={`translate(${String(EYE.left)} ${String(EYE.y)})`} />
            <path d={EYE_CLOSED} transform={`translate(${String(EYE.right)} ${String(EYE.y)})`} />
          </g>
        ) : (
          ([['left', 1], ['right', -1]] as const).map(([side, dir]) => (
            <g key={side} transform={`translate(${String(EYE[side])} ${String(EYE.y)}) rotate(${String(eye.rotate * dir)}) scale(1 ${String(eye.scaleY)})`}>
              <path d={EYE_ALMOND} fill={INK} />
              <circle cx={-1} cy={-1.1} r={0.95} fill="#ffffff" opacity={0.95} />
            </g>
          ))
        )}

        {/* 眉 */}
        <g fill="none" stroke={LINE} strokeWidth={2} strokeLinecap="round">
          {BROW[mood].map((d) => (
            <path key={d} d={d} />
          ))}
        </g>

        {/* 鼻と口 */}
        <path d={NOSE} fill="none" stroke="rgba(42,33,24,0.45)" strokeWidth={1.4} strokeLinecap="round" />
        {mouth.stroke ? <path d={mouth.stroke} fill="none" stroke={INK} strokeWidth={2.1} strokeLinecap="round" /> : null}
        {mouth.fill ? <path d={mouth.fill} fill={INK} /> : null}
        {mouth.tongue ? <path d={mouth.tongue} fill="#e07b7b" /> : null}
      </g>

      <circle cx={24} cy={24} r={22.2} fill="none" stroke={color.ring} strokeWidth={1.8} />

      {/* 右上の記章 */}
      <circle cx={BADGE.cx} cy={BADGE.cy} r={BADGE.r} fill={color.accent} stroke="#ffffff" strokeWidth={2} />
      {badge.stroke?.map((d) => (
        <path key={d} d={d} fill="none" stroke="#ffffff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {badge.dots?.map((cx) => (
        <circle key={cx} cx={cx} cy={BADGE.cy} r={1.1} fill="#ffffff" />
      ))}
    </>
  );
}

const WOBBLE: Record<Mood, Record<string, number[]>> = {
  angry: { rotate: [0, -3.5, 3.5, -2.5, 0] },
  waiting: { rotate: [0, 1.8, 0, -1.8, 0] },
  happy: { y: [0, -2.2, 0] },
};

/** ほかの絵（SVG）の中に顔を置く。(x, y) は左上、size は 1 辺 */
export function MoodMark({ mood, x, y, size, animate = false }: { mood: Mood; x: number; y: number; size: number; animate?: boolean }) {
  const id = useId().replace(/[^\w-]/g, '');
  const k = size / FACE_BOX;
  return (
    <motion.g
      transform={`translate(${String(x)} ${String(y)}) scale(${String(k)})`}
      animate={animate ? WOBBLE[mood] : undefined}
      transition={animate ? { repeat: Infinity, duration: mood === 'angry' ? 0.9 : 1.6, repeatDelay: 0.6 } : undefined}
      style={{ transformOrigin: `${String(x + size / 2)}px ${String(y + size / 2)}px` }}
      data-mood={mood}
    >
      <FaceArt mood={mood} id={id} />
    </motion.g>
  );
}

/** 顔だけを 1 枚の絵として置く */
export function MoodFace({
  mood,
  size = 40,
  animate = false,
  label,
  className,
}: {
  mood: Mood;
  /** 1 辺の大きさ(px) */
  size?: number;
  /** 少し動かす（苦情は震え、評価は弾む） */
  animate?: boolean;
  /** 読み上げ用の説明。無ければ飾りとして扱う */
  label?: string;
  className?: string;
}) {
  const id = useId().replace(/[^\w-]/g, '');
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox={`0 0 ${String(FACE_BOX)} ${String(FACE_BOX)}`}
      className={className}
      role={label === undefined ? undefined : 'img'}
      aria-label={label}
      aria-hidden={label === undefined ? true : undefined}
      data-mood={mood}
      animate={animate ? WOBBLE[mood] : undefined}
      transition={animate ? { repeat: Infinity, duration: mood === 'angry' ? 0.9 : 1.6, repeatDelay: 0.6 } : undefined}
      style={{ flexShrink: 0, overflow: 'visible' }}
    >
      <FaceArt mood={mood} id={id} />
    </motion.svg>
  );
}
