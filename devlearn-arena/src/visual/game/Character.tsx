import { motion } from 'framer-motion';
import { HAIR, INK, SKIN } from './faces';
import type { CharacterRole } from './roles';

/**
 * 街の人。案内人（街ごとの職員）と住民を、顔の絵と同じ線で描いた胸像にする。
 *
 * ドット絵の小さな人形ではなく、役割が一目で分かる身なり（制帽・ヘルメット・襟章）まで描く。
 * 顔の作りは MoodFace と同じ比率にそろえてあるので、地図の吹き出しと案内人が同じ人に見える。
 */

interface Look {
  /** 上着 */
  coat: string;
  /** 首もと（ネクタイ・スカーフ）。無ければ付けない */
  tie: string | null;
  /** 襟・折り返し */
  trim: string;
  /** 帽子の色。無ければ帽子をかぶらない */
  cap: string | null;
  /** 帽子の形 */
  capKind: 'peaked' | 'helmet' | 'none';
  hair: string;
  /** 襟章・記章の色 */
  badge: string;
  inner: string;
}

const LOOKS: Record<CharacterRole, Look> = {
  // 副市長：背広に襟章
  aide: { coat: '#4a5a72', trim: '#3a4759', tie: '#b5433a', cap: null, capKind: 'none', hair: '#3b2a1a', badge: '#e3b33b', inner: '#f6f1e6' },
  // 駅長：制帽と詰め襟
  station: { coat: '#2f4a6b', trim: '#22364e', tie: '#e3b33b', cap: '#1d2c40', capKind: 'peaked', hair: '#4a3222', badge: '#e3b33b', inner: '#dfe7ef' },
  // 港湾局長：作業着とヘルメット
  port: { coat: '#2f6f8f', trim: '#255870', tie: null, cap: '#f2c14e', capKind: 'helmet', hair: '#2f2418', badge: '#ffffff', inner: '#eaf2f6' },
  // 郵便局長：郵便色の制服と制帽
  post: { coat: '#1f7a6e', trim: '#175c53', tie: '#f2c14e', cap: '#134a43', capKind: 'peaked', hair: '#3a2a1c', badge: '#f2c14e', inner: '#e8f3f0' },
  // 建築課長：現場ヘルメットと事務服
  permit: { coat: '#5b4a93', trim: '#453874', tie: null, cap: '#e0e4ea', capKind: 'helmet', hair: '#2b2118', badge: '#f2c14e', inner: '#efeaf8' },
  // 住民：普段着
  resident: { coat: '#a8704a', trim: '#8a5a3a', tie: null, cap: null, capKind: 'none', hair: HAIR, badge: '#f6f1e6', inner: '#f6f1e6' },
};

const HEAD = { cx: 32, cy: 27, rx: 13, ry: 14 };

function Cap({ look }: { look: Look }) {
  if (look.cap === null) return null;
  if (look.capKind === 'helmet') {
    return (
      <g>
        <path
          d={`M${String(HEAD.cx - 15)} ${String(HEAD.cy - 7)} A15.5 15.5 0 0 1 ${String(HEAD.cx + 15)} ${String(HEAD.cy - 7)} Z`}
          fill={look.cap}
          stroke={INK}
          strokeWidth={2}
          strokeLinejoin="round"
        />
        <path d={`M${String(HEAD.cx - 16.5)} ${String(HEAD.cy - 7)} h33`} stroke={INK} strokeWidth={2.2} strokeLinecap="round" />
        <path d={`M${String(HEAD.cx)} ${String(HEAD.cy - 21)} v6`} stroke="rgba(0,0,0,0.35)" strokeWidth={1.6} />
      </g>
    );
  }
  return (
    <g>
      {/* 制帽：山と鍔、正面に記章 */}
      <path
        d={`M${String(HEAD.cx - 13)} ${String(HEAD.cy - 9)} A13.5 13 0 0 1 ${String(HEAD.cx + 13)} ${String(HEAD.cy - 9)} Z`}
        fill={look.cap}
        stroke={INK}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <path d={`M${String(HEAD.cx - 15.5)} ${String(HEAD.cy - 9)} h31 a1.8 1.8 0 0 1 0 3.6 h-31 a1.8 1.8 0 0 1 0 -3.6 Z`} fill={look.trim} stroke={INK} strokeWidth={1.7} />
      <rect x={HEAD.cx - 3} y={HEAD.cy - 16} width={6} height={4} rx={1} fill={look.badge} stroke={INK} strokeWidth={1.2} />
    </g>
  );
}

function Hair({ look, hidden }: { look: Look; hidden: boolean }) {
  if (hidden) {
    // 帽子の下からのぞく横の髪だけ
    return (
      <g fill={look.hair} stroke={INK} strokeWidth={1.4} strokeLinejoin="round">
        <path d={`M${String(HEAD.cx - 12.5)} ${String(HEAD.cy - 7)} q-2 9 0.5 13 q-4.5 -4 -4 -13 Z`} />
        <path d={`M${String(HEAD.cx + 12.5)} ${String(HEAD.cy - 7)} q2 9 -0.5 13 q4.5 -4 4 -13 Z`} />
      </g>
    );
  }
  return (
    <g>
      <path
        d={`M${String(HEAD.cx - 13.5)} ${String(HEAD.cy - 2)}
           a 13.5 14 0 0 1 27 0
           q -2 -5 -7 -6
           q -6 2 -12 1
           q -4.5 0 -8 5 Z`}
        fill={look.hair}
        stroke={INK}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      {/* 分け目の light */}
      <path
        d={`M${String(HEAD.cx + 4)} ${String(HEAD.cy - 13.5)} q5 1.5 7.5 6`}
        stroke="rgba(255,255,255,0.35)"
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
      />
    </g>
  );
}

export function Character({
  role,
  size = 96,
  talking = false,
  animate = false,
  className,
  label,
}: {
  role: CharacterRole;
  /** 高さ(px) */
  size?: number;
  talking?: boolean;
  animate?: boolean;
  className?: string;
  label?: string;
}) {
  const look = LOOKS[role];
  const capped = look.cap !== null;
  return (
    <motion.svg
      viewBox="0 0 64 76"
      height={size}
      width={(size * 64) / 76}
      className={className}
      data-character={role}
      role={label === undefined ? undefined : 'img'}
      aria-label={label}
      aria-hidden={label === undefined ? true : undefined}
      animate={animate && talking ? { y: [0, -1.6, 0] } : { y: 0 }}
      transition={animate && talking ? { repeat: Infinity, duration: 1.4, ease: 'easeInOut' } : { duration: 0 }}
      style={{ overflow: 'visible' }}
    >
      {/* 肩と上着 */}
      <path
        d="M6 76 q1 -18 13 -23 q6 -3 13 -3 q7 0 13 3 q12 5 13 23 Z"
        fill={look.coat}
        stroke={INK}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {/* 襟もとのシャツ */}
      <path d="M23 49 L32 62 L41 49 L45 52 L32 71 L19 52 Z" fill={look.inner} stroke={INK} strokeWidth={1.6} strokeLinejoin="round" />
      {/* 上着の折り襟 */}
      <path d="M23 49 L32 62 L26.5 67 L18.5 53 Z" fill={look.trim} stroke={INK} strokeWidth={1.6} strokeLinejoin="round" />
      <path d="M41 49 L32 62 L37.5 67 L45.5 53 Z" fill={look.trim} stroke={INK} strokeWidth={1.6} strokeLinejoin="round" />
      {look.tie === null ? null : (
        <path d="M32 55 l3.2 3.4 l-1.6 10.6 h-3.2 l-1.6 -10.6 Z" fill={look.tie} stroke={INK} strokeWidth={1.4} strokeLinejoin="round" />
      )}
      <circle cx={47} cy={59} r={2.2} fill={look.badge} stroke={INK} strokeWidth={1.2} />

      {/* 首 */}
      <path d="M26 38 h12 v9 q-6 4 -12 0 Z" fill={SKIN} stroke={INK} strokeWidth={1.8} strokeLinejoin="round" />
      <path d="M26 44 q6 4 12 0" stroke="rgba(0,0,0,0.25)" strokeWidth={1.4} fill="none" />

      {/* 耳 */}
      <ellipse cx={HEAD.cx - 13} cy={HEAD.cy + 2} rx={2.4} ry={3.2} fill={SKIN} stroke={INK} strokeWidth={1.6} />
      <ellipse cx={HEAD.cx + 13} cy={HEAD.cy + 2} rx={2.4} ry={3.2} fill={SKIN} stroke={INK} strokeWidth={1.6} />

      {/* 顔 */}
      <ellipse cx={HEAD.cx} cy={HEAD.cy} rx={HEAD.rx} ry={HEAD.ry} fill={SKIN} stroke={INK} strokeWidth={2} />
      <Hair look={look} hidden={capped} />
      <Cap look={look} />

      {/* 目とまゆ */}
      <path d={`M${String(HEAD.cx - 9)} ${String(HEAD.cy - 3)} q3 -2 6 -0.5`} stroke={INK} strokeWidth={1.8} fill="none" strokeLinecap="round" />
      <path d={`M${String(HEAD.cx + 9)} ${String(HEAD.cy - 3)} q-3 -2 -6 -0.5`} stroke={INK} strokeWidth={1.8} fill="none" strokeLinecap="round" />
      <motion.g
        animate={animate ? { scaleY: [1, 1, 0.1, 1] } : { scaleY: 1 }}
        transition={animate ? { repeat: Infinity, duration: 4.2, times: [0, 0.93, 0.96, 1] } : { duration: 0 }}
        style={{ transformOrigin: `${String(HEAD.cx)}px ${String(HEAD.cy + 2)}px` }}
      >
        <circle cx={HEAD.cx - 5.5} cy={HEAD.cy + 2} r={2} fill={INK} />
        <circle cx={HEAD.cx + 5.5} cy={HEAD.cy + 2} r={2} fill={INK} />
        <circle cx={HEAD.cx - 4.9} cy={HEAD.cy + 1.3} r={0.7} fill="#ffffff" />
        <circle cx={HEAD.cx + 6.1} cy={HEAD.cy + 1.3} r={0.7} fill="#ffffff" />
      </motion.g>

      {/* 鼻と口。話している間は口が動く */}
      <path d={`M${String(HEAD.cx)} ${String(HEAD.cy + 3)} q1.6 3 -1 3.6`} stroke={INK} strokeWidth={1.4} fill="none" strokeLinecap="round" />
      {animate && talking ? (
        <motion.ellipse
          cx={HEAD.cx}
          cy={HEAD.cy + 9.5}
          rx={3.2}
          fill="#8c4a4a"
          stroke={INK}
          strokeWidth={1.6}
          animate={{ ry: [0.6, 2.4, 1.1, 2.6, 0.6] }}
          transition={{ repeat: Infinity, duration: 1.1 }}
        />
      ) : (
        <path d={`M${String(HEAD.cx - 4)} ${String(HEAD.cy + 8.5)} q4 3.2 8 0`} stroke={INK} strokeWidth={1.8} fill="none" strokeLinecap="round" />
      )}
      <ellipse cx={HEAD.cx - 8.5} cy={HEAD.cy + 6.5} rx={2.2} ry={1.4} fill="#e59a8e" opacity={0.5} />
      <ellipse cx={HEAD.cx + 8.5} cy={HEAD.cy + 6.5} rx={2.2} ry={1.4} fill="#e59a8e" opacity={0.5} />
    </motion.svg>
  );
}
