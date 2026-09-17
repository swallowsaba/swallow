import { motion } from 'framer-motion';
import { useT } from '@/i18n/useT';
import { useMotionEnabled } from '@/ui/motion';

export interface IslandInfo {
  id: string;
  title: string;
  subtitle: string;
  /** 0..1 */
  ratio: number;
  done: number;
  total: number;
  playable: boolean;
  /** いま取り組んでいる街 */
  current: boolean;
  color: string;
}

interface Props {
  islands: readonly IslandInfo[];
  onSelect: (id: string) => void;
}

/** 街の座標。全体図として見やすい配置に手で置く */
const SPOTS: readonly { x: number; y: number; r: number }[] = [
  { x: 220, y: 380, r: 118 },
  { x: 520, y: 200, r: 132 },
  { x: 860, y: 330, r: 132 },
  { x: 620, y: 560, r: 126 },
  { x: 1030, y: 620, r: 120 },
];

function blob(cx: number, cy: number, r: number, seed: number): string {
  // 円をわずかに歪ませて市街地の輪郭にする。seed から決まるので毎回同じ形
  const points: string[] = [];
  const steps = 12;
  for (let i = 0; i < steps; i += 1) {
    const angle = (i / steps) * Math.PI * 2;
    const wobble = 0.86 + ((Math.sin(seed * 3.7 + i * 2.1) + 1) / 2) * 0.28;
    const x = cx + Math.cos(angle) * r * wobble;
    const y = cy + Math.sin(angle) * r * wobble * 0.78;
    points.push(`${String(Math.round(x))},${String(Math.round(y))}`);
  }
  return `M ${points.join(' L ')} Z`;
}

export function Overworld({ islands, onSelect }: Props) {
  const t = useT();
  const animate = useMotionEnabled();

  return (
    <svg viewBox="0 0 1280 800" className="h-auto w-full" role="group" aria-label={t('map.worldLabel')}>
      <defs>
        <linearGradient id="land" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a8d38a" />
          <stop offset="100%" stopColor="#86bd62" />
        </linearGradient>
      </defs>

      <rect width="1280" height="800" fill="url(#land)" />
      {/* 郊外の森 */}
      {Array.from({ length: 60 }, (_, i) => {
        const x = (i * 137) % 1240 + 20;
        const y = ((i * 211) % 760) + 20;
        return (
          <g key={`tree-${String(i)}`} aria-hidden>
            <rect x={x - 2} y={y} width={4} height={8} fill="#6b4a2a" />
            <circle cx={x} cy={y - 4} r={9} fill="#5c9a3c" />
          </g>
        );
      })}

      {/* 街をつなぐ高速道路 */}
      {SPOTS.slice(0, islands.length - 1).map((spot, i) => {
        const next = SPOTS[i + 1];
        if (!next) return null;
        return (
          <path
            key={`route-${String(i)}`}
            d={`M ${String(spot.x)} ${String(spot.y)} Q ${String((spot.x + next.x) / 2)} ${String(
              (spot.y + next.y) / 2 - 70,
            )} ${String(next.x)} ${String(next.y)}`}
            stroke="#5f6468"
            strokeWidth={16}
            fill="none"
            strokeLinecap="round"
          />
        );
      })}
      {SPOTS.slice(0, islands.length - 1).map((spot, i) => {
        const next = SPOTS[i + 1];
        if (!next) return null;
        return (
          <path
            key={`lane-${String(i)}`}
            d={`M ${String(spot.x)} ${String(spot.y)} Q ${String((spot.x + next.x) / 2)} ${String((spot.y + next.y) / 2 - 70)} ${String(next.x)} ${String(next.y)}`}
            stroke="#f2e6b8"
            strokeWidth={2}
            strokeDasharray="14 12"
            fill="none"
          />
        );
      })}

      {islands.map((island, i) => {
        const spot = SPOTS[i] ?? SPOTS[0];
        if (!spot) return null;
        const { x, y, r } = spot;
        return (
          <g
            key={island.id}
            role="link"
            tabIndex={0}
            aria-label={`${island.title} ${island.done}/${island.total}`}
            className="cursor-pointer"
            onClick={() => {
              onSelect(island.id);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') onSelect(island.id);
            }}
          >
            {/* 市街地と、進み具合に応じたビル群 */}
            <path d={blob(x, y + 8, r + 14, i + 1)} fill="#b9b2a4" />
            <path d={blob(x, y, r, i + 1)} fill={island.playable ? '#cfd8c3' : '#b8bfb0'} />
            {Array.from({ length: 5 + Math.round(island.ratio * 9) }, (_, k) => {
              const bx = x - r * 0.55 + ((k * 37) % Math.round(r * 1.1));
              const h = 18 + ((k * 23) % 30) + island.ratio * 40;
              const by = y - 10 + ((k * 19) % 26);
              return (
                <g key={`b-${String(k)}`} aria-hidden>
                  <rect x={bx} y={by - h} width={16} height={h} fill={k % 3 === 0 ? '#9fc3de' : k % 3 === 1 ? '#f4e6c8' : '#cdbb9b'} stroke="#422a15" strokeWidth={2} />
                  <rect x={bx} y={by - h} width={16} height={5} fill={island.color} />
                </g>
              );
            })}

            {/* 旗 */}
            <line x1={x} y1={y - r * 0.5} x2={x} y2={y - r * 0.5 - 46} stroke="#422a15" strokeWidth={5} />
            <polygon
              points={`${String(x)},${String(y - r * 0.5 - 46)} ${String(x + 38)},${String(
                y - r * 0.5 - 34,
              )} ${String(x)},${String(y - r * 0.5 - 22)}`}
              fill={island.color}
              stroke="#422a15"
              strokeWidth={3}
            />

            {/* 進み具合の帯 */}
            <rect x={x - 62} y={y + 16} width={124} height={14} fill="#422a15" rx={2} />
            <rect x={x - 59} y={y + 19} width={118} height={8} fill="#f6e8cd" />
            <rect x={x - 59} y={y + 19} width={118 * island.ratio} height={8} fill="#f2c14e" />

            {/* 名札 */}
            <rect
              x={x - 90}
              y={y + 40}
              width={180}
              height={38}
              rx={4}
              fill="#f2c14e"
              stroke="#422a15"
              strokeWidth={3}
            />
            <text
              x={x}
              y={y + 65}
              textAnchor="middle"
              fill="#422a15"
              fontSize={19}
              fontWeight={800}
            >
              {island.title}
            </text>
            <text x={x} y={y + 96} textAnchor="middle" fill="#422a15" fontSize={15} fontWeight={800}>
              {island.done}/{island.total}
              {island.playable ? '' : `  ${t('map.islandPlanned')}`}
            </text>

            {/* いま取り組んでいる街に印を置く */}
            {island.current ? (
              <motion.g
                animate={animate ? { y: [0, -6, 0] } : {}}
                transition={{ repeat: Infinity, duration: 2.2 }}
              >
                <text x={x - r - 34} y={y + 6} fontSize={40}>
                  📍
                </text>
              </motion.g>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
