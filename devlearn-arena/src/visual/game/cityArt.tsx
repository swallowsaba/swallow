import { motion } from 'framer-motion';
import type { BuildingKind, FacilityState } from '@/content/city';
import type { MissionTrack } from '@/engines/lesson/types';
import { Character } from './Character';
import { ROLE_OF_TRACK } from './roles';
import { Sprite } from './pixel';
import { Cart, Castle, Field, House, Kiosk, Sparkle, Tower } from './scenery';
import { CITY_COLOR } from './cityColor';
import { INK, WORKER, workerPalette } from './sprites';

export const PLOT_W = 150;
export const PLOT_H = 120;

interface Props {
  kind: BuildingKind;
  track: MissionTrack;
  state: FacilityState;
  /** 区画の左上 */
  x: number;
  y: number;
  animate: boolean;
}

/** 建物の本体。区画の中に収まる大きさで描く */
function Body({ kind, track, x, y, lit }: { kind: BuildingKind; track: MissionTrack; x: number; y: number; lit: boolean }) {
  const roof = CITY_COLOR[track].roof;
  const box = { x: x + 20, y: y + 22, w: 110, h: 80 };
  switch (kind) {
    case 'castle':
      return <Castle {...box} />;
    case 'tower':
      return <Tower x={x + 50} y={y + 16} w={50} h={86} />;
    case 'gate':
      return (
        <g>
          <Tower x={x + 14} y={y + 26} w={36} h={76} />
          <Tower x={x + 100} y={y + 26} w={36} h={76} />
          <rect x={x + 48} y={y + 44} width={54} height={16} fill="#b9b2a4" stroke={INK} strokeWidth={3} />
          <rect x={x + 60} y={y + 60} width={30} height={42} fill={lit ? '#ffe69a' : '#3b4a6b'} stroke={INK} strokeWidth={2} />
        </g>
      );
    case 'warehouse':
      return (
        <g>
          <rect x={box.x + 4} y={box.y + 24} width={box.w} height={box.h - 20} fill="rgba(0,0,0,0.2)" />
          <rect x={box.x} y={box.y + 20} width={box.w} height={box.h - 20} fill="#c9a36b" stroke={INK} strokeWidth={3} />
          <polygon points={`${String(box.x - 6)},${String(box.y + 22)} ${String(box.x + box.w / 2)},${String(box.y)} ${String(box.x + box.w + 6)},${String(box.y + 22)}`} fill={roof} stroke={INK} strokeWidth={3} />
          <rect x={box.x + 30} y={box.y + 44} width={50} height={36} fill={lit ? '#ffe69a' : '#7a5230'} stroke={INK} strokeWidth={2} />
          <line x1={box.x + 30} x2={box.x + 80} y1={box.y + 62} y2={box.y + 62} stroke={INK} strokeWidth={2} />
        </g>
      );
    case 'factory':
      return (
        <g>
          <rect x={box.x + 70} y={box.y - 8} width={14} height={40} fill="#8f877a" stroke={INK} strokeWidth={2} />
          <rect x={box.x + 90} y={box.y + 2} width={12} height={30} fill="#8f877a" stroke={INK} strokeWidth={2} />
          <rect x={box.x} y={box.y + 30} width={box.w} height={box.h - 30} fill="#d8d1c3" stroke={INK} strokeWidth={3} />
          <polygon points={`${String(box.x)},${String(box.y + 30)} ${String(box.x + 22)},${String(box.y + 16)} ${String(box.x + 22)},${String(box.y + 30)} ${String(box.x + 44)},${String(box.y + 16)} ${String(box.x + 44)},${String(box.y + 30)} ${String(box.x + 66)},${String(box.y + 16)} ${String(box.x + 66)},${String(box.y + 30)}`} fill={roof} stroke={INK} strokeWidth={2} />
          {[0, 1, 2, 3].map((i) => (
            <rect key={i} x={box.x + 10 + i * 25} y={box.y + 46} width={14} height={12} fill={lit ? '#ffe69a' : '#9cc9e6'} stroke={INK} strokeWidth={1.5} />
          ))}
        </g>
      );
    case 'station':
      return (
        <g>
          <rect x={box.x - 6} y={box.y + 70} width={box.w + 12} height={10} fill="#8f877a" stroke={INK} strokeWidth={2} />
          <rect x={box.x + 6} y={box.y + 30} width={6} height={40} fill={INK} />
          <rect x={box.x + box.w - 12} y={box.y + 30} width={6} height={40} fill={INK} />
          <polygon points={`${String(box.x - 8)},${String(box.y + 32)} ${String(box.x + box.w / 2)},${String(box.y + 8)} ${String(box.x + box.w + 8)},${String(box.y + 32)}`} fill={roof} stroke={INK} strokeWidth={3} />
          <rect x={box.x + 30} y={box.y + 40} width={50} height={16} fill="#f6e8cd" stroke={INK} strokeWidth={2} />
          <rect x={box.x + 36} y={box.y + 44} width={38} height={8} fill={lit ? '#ffe69a' : '#b9b2a4'} />
        </g>
      );
    case 'bridge':
      return (
        <g>
          <rect x={x + 6} y={y + 84} width={138} height={18} fill="#64b6d8" />
          <path d={`M ${String(x + 10)} ${String(y + 84)} Q ${String(x + 75)} ${String(y + 20)} ${String(x + 140)} ${String(y + 84)}`} fill="none" stroke="#b9b2a4" strokeWidth={12} />
          <path d={`M ${String(x + 10)} ${String(y + 84)} Q ${String(x + 75)} ${String(y + 20)} ${String(x + 140)} ${String(y + 84)}`} fill="none" stroke={INK} strokeWidth={2} />
          <rect x={x + 6} y={y + 60} width={138} height={8} fill="#b07f4a" stroke={INK} strokeWidth={2} />
          {lit ? <circle cx={x + 75} cy={y + 44} r={5} fill="#ffe69a" stroke={INK} strokeWidth={1.5} /> : null}
        </g>
      );
    case 'farm':
      return <Field x={x + 14} y={y + 30} w={122} h={72} gateOpen />;
    case 'lab':
      return (
        <g>
          <Kiosk x={box.x + 10} y={box.y + 24} w={90} h={56} />
          <circle cx={box.x + 55} cy={box.y + 22} r={20} fill="#bfe3f5" stroke={INK} strokeWidth={3} />
          {lit ? <circle cx={box.x + 55} cy={box.y + 22} r={6} fill="#ffe69a" /> : null}
        </g>
      );
    case 'library':
      return (
        <g>
          <House {...box} wall="#efe6d6" roof={roof} lit={false} />
          {[0, 1, 2, 3].map((i) => (
            <rect key={i} x={box.x + 12 + i * 26} y={box.y + 44} width={8} height={36} fill="#d8d1c3" stroke={INK} strokeWidth={1.5} />
          ))}
        </g>
      );
    case 'post':
      return (
        <g>
          <House {...box} wall="#f6e8cd" roof="#c0392b" />
          <rect x={box.x + box.w + 2} y={box.y + 54} width={14} height={20} fill="#c0392b" stroke={INK} strokeWidth={2} />
        </g>
      );
    case 'workshop':
      return (
        <g>
          <rect x={box.x + 80} y={box.y + 2} width={12} height={24} fill="#8f877a" stroke={INK} strokeWidth={2} />
          <House {...box} wall="#e8d3a8" roof={roof} />
        </g>
      );
    case 'hall':
      return (
        <g>
          <House {...box} wall="#f1dfbc" roof={roof} />
          <line x1={box.x + box.w / 2} x2={box.x + box.w / 2} y1={box.y - 20} y2={box.y + 4} stroke={INK} strokeWidth={3} />
          <polygon points={`${String(box.x + box.w / 2)},${String(box.y - 20)} ${String(box.x + box.w / 2 + 18)},${String(box.y - 14)} ${String(box.x + box.w / 2)},${String(box.y - 8)}`} fill="#f2c14e" stroke={INK} strokeWidth={2} />
        </g>
      );
    case 'office':
      return <House {...box} wall="#e9eef5" roof={roof} />;
    case 'house':
    default:
      return <House {...box} roof={roof} />;
  }
}

/**
 * 街の区画 1 つ。施設の状態で見え方が変わる。
 * 未開拓は霧の中の予定地、建設可能は杭と看板、建設済みは灯りの消えた建物、
 * 稼働中は灯りと煙、フル稼働は旗ときらめき。
 */
export function FacilityPlot({ kind, track, state, x, y, animate }: Props) {
  const built = state === 'built' || state === 'operating' || state === 'complete';
  const lit = state === 'operating' || state === 'complete';
  return (
    <g data-plot-state={state}>
      {/* 区画の地面 */}
      <rect x={x + 4} y={y + 96} width={PLOT_W - 8} height={16} fill={built ? '#c9b48a' : '#a9855a'} stroke={INK} strokeWidth={1.5} />
      {built ? (
        <motion.g
          initial={animate ? { opacity: 0, y: 30 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 160, damping: 16 }}
          style={{ filter: state === 'built' ? 'saturate(0.55) brightness(0.95)' : undefined }}
        >
          <Body kind={kind} track={track} x={x} y={y} lit={lit} />
        </motion.g>
      ) : state === 'available' ? (
        <g>
          {/* 杭とロープ、資材 */}
          {[x + 20, x + 130].map((px) => (
            <rect key={px} x={px - 2} y={y + 64} width={4} height={34} fill="#7a5230" />
          ))}
          <line x1={x + 20} x2={x + 130} y1={y + 70} y2={y + 70} stroke="#f2c14e" strokeWidth={2} strokeDasharray="6 4" />
          <Cart x={x + 50} y={y + 70} w={50} h={30} />
          <motion.g
            animate={animate ? { rotate: [0, -25, 0] } : { rotate: 0 }}
            transition={animate ? { repeat: Infinity, duration: 0.8 } : { duration: 0 }}
            style={{ transformBox: 'fill-box', transformOrigin: '80% 80%' }}
          >
            <Sprite map={WORKER} palette={workerPalette('#c0604a', '#f2c14e')} x={x + 102} y={y + 58} scale={2} />
          </motion.g>
        </g>
      ) : (
        <g opacity={0.8}>
          <rect x={x + 16} y={y + 30} width={118} height={70} fill="rgba(255,255,255,0.25)" stroke="#f6e8cd" strokeWidth={2} strokeDasharray="6 5" />
          <text x={x + 75} y={y + 72} fontSize={30} fontWeight={900} textAnchor="middle" fill="#f6e8cd">
            ?
          </text>
        </g>
      )}
      {lit && animate ? (
        <motion.g
          animate={{ opacity: [0.2, 0.8, 0.2], y: [0, -10, -18] }}
          transition={{ repeat: Infinity, duration: 2.4 }}
          aria-hidden
        >
          <circle cx={x + 118} cy={y + 18} r={6} fill="#e9e4da" />
          <circle cx={x + 126} cy={y + 10} r={4} fill="#e9e4da" />
        </motion.g>
      ) : null}
      {state === 'complete' ? <Sparkle x={x + 24} y={y + 20} animate={animate} /> : null}
    </g>
  );
}

/** 街の案内人・住民の似顔絵 */
export function CityPortrait({ track, size = 7, talking = false, animate, resident = false }: { track: MissionTrack; size?: number; talking?: boolean; animate: boolean; resident?: boolean }) {
  // size はドット絵のときの 1 ドットの大きさだった。胸像の高さに読み替える
  return (
    <Character
      role={resident ? 'resident' : ROLE_OF_TRACK[track]}
      size={size * 15}
      talking={talking}
      animate={animate}
    />
  );
}
