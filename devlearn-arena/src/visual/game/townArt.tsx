import { motion } from 'framer-motion';
import type { MissionTrack } from '@/engines/lesson/types';
import { Sprite } from './pixel';
import { INK, WORKER, workerPalette } from './sprites';
import { FLOOR_H, TOWN_STYLE } from './townStyle';

interface FloorBuildingProps {
  track: MissionTrack;
  /** 地面の左端 */
  x: number;
  /** 地面の高さ（建物はここから上へ伸びる） */
  y: number;
  w: number;
  floors: number;
  built: number;
  /** 名所なら塔の形にする */
  landmark?: boolean;
  animate: boolean;
  /** いま工事している階を示す（職人と足場を出す） */
  working?: boolean;
}

/**
 * 階を積んで建てる建物。建った階は壁と窓、まだの階は点線の枠（建設予定）で描く。
 * 全部の階が建つと屋根が載る。工事中は、いちばん上に足場と職人が出る。
 */
export function FloorBuilding({ track, x, y, w, floors, built, landmark = false, animate, working = false }: FloorBuildingProps) {
  const style = TOWN_STYLE[track];
  const complete = built >= floors && floors > 0;
  const topBuilt = y - built * FLOOR_H;
  const windows = Math.max(1, Math.floor((w - 12) / 16));
  return (
    <g data-floors={floors} data-built={built} data-complete={complete ? 'true' : 'false'}>
      {/* 建設予定の枠 */}
      {Array.from({ length: floors - built }, (_, i) => {
        const fy = topBuilt - (i + 1) * FLOOR_H;
        return <rect key={`plan-${String(i)}`} x={x + 2} y={fy} width={w - 4} height={FLOOR_H} fill="rgba(255,255,255,0.15)" stroke="#f6e8cd" strokeWidth={1.5} strokeDasharray="4 3" />;
      })}
      {/* 基礎 */}
      <rect x={x - 4} y={y} width={w + 8} height={6} fill="#8f877a" stroke={INK} strokeWidth={2} />
      {/* 建った階 */}
      {Array.from({ length: built }, (_, i) => {
        const fy = y - (i + 1) * FLOOR_H;
        const fresh = animate && working && i === built - 1;
        return (
          <motion.g
            key={`floor-${String(i)}`}
            initial={fresh ? { opacity: 0, y: -12 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 16 }}
          >
            <rect x={x} y={fy} width={w} height={FLOOR_H} fill={landmark ? '#d8d1c3' : style.wall} stroke={INK} strokeWidth={2} />
            {Array.from({ length: windows }, (_, k) => (
              <rect key={k} x={x + 7 + k * 16} y={fy + 4} width={8} height={8} fill={complete ? '#ffe69a' : '#9cc9e6'} stroke={INK} strokeWidth={1} />
            ))}
          </motion.g>
        );
      })}
      {/* 屋根か足場 */}
      {complete ? (
        landmark ? (
          <g>
            {Array.from({ length: Math.max(3, Math.floor(w / 14)) }, (_, k) => (
              <rect key={k} x={x + k * 14} y={topBuilt - 10} width={8} height={10} fill="#d8d1c3" stroke={INK} strokeWidth={2} />
            ))}
            <line x1={x + w / 2} x2={x + w / 2} y1={topBuilt - 34} y2={topBuilt - 10} stroke={INK} strokeWidth={3} />
            <polygon points={`${String(x + w / 2)},${String(topBuilt - 34)} ${String(x + w / 2 + 18)},${String(topBuilt - 28)} ${String(x + w / 2)},${String(topBuilt - 22)}`} fill={style.roof} stroke={INK} strokeWidth={2} />
          </g>
        ) : (
          <polygon
            points={`${String(x - 6)},${String(topBuilt)} ${String(x + w / 2)},${String(topBuilt - 20)} ${String(x + w + 6)},${String(topBuilt)}`}
            fill={style.roof}
            stroke={INK}
            strokeWidth={2.5}
            strokeLinejoin="round"
          />
        )
      ) : built > 0 || working ? (
        <g aria-hidden>
          <line x1={x - 3} x2={x - 3} y1={y} y2={topBuilt - FLOOR_H} stroke="#b07f4a" strokeWidth={3} />
          <line x1={x + w + 3} x2={x + w + 3} y1={y} y2={topBuilt - FLOOR_H} stroke="#b07f4a" strokeWidth={3} />
          <line x1={x - 5} x2={x + w + 5} y1={topBuilt - 2} y2={topBuilt - 2} stroke="#b07f4a" strokeWidth={3} />
        </g>
      ) : null}
      {working && !complete ? (
        <motion.g
          animate={animate ? { y: [0, -3, 0] } : { y: 0 }}
          transition={animate ? { repeat: Infinity, duration: 0.6 } : { duration: 0 }}
        >
          <Sprite map={WORKER} palette={workerPalette(style.shirt, '#f2c14e')} x={x + w / 2 - 12} y={topBuilt - 34} scale={2} />
        </motion.g>
      ) : null}
    </g>
  );
}

/** 依頼主の似顔絵 */
export function QuestGiverPortrait({ track, size = 7, talking = false, animate }: { track: MissionTrack; size?: number; talking?: boolean; animate: boolean }) {
  const style = TOWN_STYLE[track];
  const w = 12 * size;
  const h = 16 * size;
  return (
    <svg width={w + 16} height={h + 16} viewBox={`-8 -8 ${String(w + 16)} ${String(h + 16)}`} aria-hidden style={{ imageRendering: 'pixelated' }}>
      <ellipse cx={w / 2} cy={h - 2} rx={w / 2.4} ry={size * 1.2} fill="rgba(0,0,0,0.2)" />
      <motion.g
        animate={animate && talking ? { y: [0, -size * 0.6, 0] } : { y: 0 }}
        transition={animate && talking ? { repeat: Infinity, duration: 0.9 } : { duration: 0 }}
      >
        <Sprite map={WORKER} palette={workerPalette(style.shirt, style.hat)} scale={size} />
      </motion.g>
    </svg>
  );
}
