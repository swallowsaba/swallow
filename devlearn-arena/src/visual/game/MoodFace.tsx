import { motion } from 'framer-motion';
import { EYES, FACE, HAIR, INK, MOOD_COLOR, SKIN, type Mood } from './faces';

/**
 * 住民の顔。苦情・対応待ち・評価の 3 つの気持ちを、街の絵と同じ線で描く。
 * 絵文字を使わないので、どの環境でも同じ絵になり、街の絵の中で浮かない。
 */

/** 顔の中身だけ。40×40 の枠に描く。ほかの絵の中に置くときはこれを使う */
export function FaceShapes({ mood }: { mood: Mood }) {
  const color = MOOD_COLOR[mood];
  return (
    <>
      <circle cx={FACE.head.cx} cy={FACE.head.cy} r={FACE.head.r + 4.5} fill="#fffaf0" stroke={color.ring} strokeWidth={2.5} />
      <circle cx={FACE.ear.left} cy={FACE.ear.y} r={FACE.ear.r} fill={SKIN} stroke={INK} strokeWidth={1.6} />
      <circle cx={FACE.ear.right} cy={FACE.ear.y} r={FACE.ear.r} fill={SKIN} stroke={INK} strokeWidth={1.6} />
      <circle cx={FACE.head.cx} cy={FACE.head.cy} r={FACE.head.r} fill={SKIN} stroke={INK} strokeWidth={2} />
      <path d={FACE.hair} fill={HAIR} stroke={INK} strokeWidth={1.6} strokeLinejoin="round" />

      {mood === 'happy' ? (
        <>
          <ellipse cx={11.5} cy={26} rx={2.6} ry={1.7} fill={color.accent} opacity={0.75} />
          <ellipse cx={28.5} cy={26} rx={2.6} ry={1.7} fill={color.accent} opacity={0.75} />
        </>
      ) : null}

      {mood === 'happy' ? (
        <>
          <path d={`M${String(EYES.left - 2.6)} ${String(EYES.y + 0.6)} Q${String(EYES.left)} ${String(EYES.y - 2.8)} ${String(EYES.left + 2.6)} ${String(EYES.y + 0.6)}`} fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" />
          <path d={`M${String(EYES.right - 2.6)} ${String(EYES.y + 0.6)} Q${String(EYES.right)} ${String(EYES.y - 2.8)} ${String(EYES.right + 2.6)} ${String(EYES.y + 0.6)}`} fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" />
        </>
      ) : mood === 'waiting' ? (
        <>
          <path d={`M${String(EYES.left - 2.4)} ${String(EYES.y - 0.6)} L${String(EYES.left + 2.4)} ${String(EYES.y - 0.6)}`} stroke={INK} strokeWidth={2} strokeLinecap="round" />
          <path d={`M${String(EYES.right - 2.4)} ${String(EYES.y - 0.6)} L${String(EYES.right + 2.4)} ${String(EYES.y - 0.6)}`} stroke={INK} strokeWidth={2} strokeLinecap="round" />
          <circle cx={EYES.left} cy={EYES.y + 1} r={1.4} fill={INK} />
          <circle cx={EYES.right} cy={EYES.y + 1} r={1.4} fill={INK} />
        </>
      ) : (
        <>
          <circle cx={EYES.left} cy={EYES.y} r={EYES.r} fill={INK} />
          <circle cx={EYES.right} cy={EYES.y} r={EYES.r} fill={INK} />
        </>
      )}

      {FACE.brow[mood].map((d) => (
        <path key={d} d={d} stroke={INK} strokeWidth={2.2} strokeLinecap="round" fill="none" />
      ))}

      <path d={FACE.mouth[mood]} fill="none" stroke={INK} strokeWidth={2.2} strokeLinecap="round" />

      {/* 気持ちの印：苦情は怒りの筋、対応待ちは汗 */}
      {mood === 'angry' ? (
        <g stroke={color.accent} strokeWidth={2} strokeLinecap="round">
          <path d="M30 8 L34.5 8" />
          <path d="M31 11 L35.5 11" />
          <path d="M33 5.5 L33 9.5" />
        </g>
      ) : mood === 'waiting' ? (
        <path d="M33 8 Q36 12.5 33 14 Q30 12.5 33 8 Z" fill={color.accent} stroke={INK} strokeWidth={1.4} />
      ) : null}
    </>
  );
}

const WOBBLE: Record<Mood, Record<string, number[]>> = {
  angry: { rotate: [0, -4, 4, -3, 0] },
  waiting: { rotate: [0, 2, 0, -2, 0] },
  happy: { y: [0, -2.5, 0] },
};

/** ほかの絵（SVG）の中に顔を置く。(x, y) は左上、size は 1 辺 */
export function MoodMark({ mood, x, y, size, animate = false }: { mood: Mood; x: number; y: number; size: number; animate?: boolean }) {
  const k = size / FACE.size;
  return (
    <motion.g
      transform={`translate(${String(x)} ${String(y)}) scale(${String(k)})`}
      animate={animate ? WOBBLE[mood] : undefined}
      transition={animate ? { repeat: Infinity, duration: mood === 'angry' ? 0.9 : 1.6, repeatDelay: 0.6 } : undefined}
      style={{ transformOrigin: `${String(x + size / 2)}px ${String(y + size / 2)}px` }}
      data-mood={mood}
    >
      <FaceShapes mood={mood} />
    </motion.g>
  );
}

/** 顔だけを 1 枚の絵として置く */
export function MoodFace({
  mood,
  size = 36,
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
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox={`0 0 ${String(FACE.size)} ${String(FACE.size)}`}
      className={className}
      role={label === undefined ? undefined : 'img'}
      aria-label={label}
      aria-hidden={label === undefined ? true : undefined}
      data-mood={mood}
      animate={animate ? WOBBLE[mood] : undefined}
      transition={animate ? { repeat: Infinity, duration: mood === 'angry' ? 0.9 : 1.6, repeatDelay: 0.6 } : undefined}
      style={{ flexShrink: 0 }}
    >
      <FaceShapes mood={mood} />
    </motion.svg>
  );
}
