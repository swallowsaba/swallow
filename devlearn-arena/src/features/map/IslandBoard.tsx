import { motion } from 'framer-motion';
import { useMotionEnabled } from '@/ui/motion';
import type { StageNode } from './stages';

interface Props {
  title: string;
  stages: readonly StageNode[];
  onPick: (id: string) => void;
  selectedId: string | null;
}

const COLS = 5;
const CELL_W = 220;
const CELL_H = 150;
const R = 34;

function position(index: number): { x: number; y: number } {
  const row = Math.floor(index / COLS);
  const inRow = index % COLS;
  const col = row % 2 === 0 ? inRow : COLS - 1 - inRow;
  return { x: col * CELL_W + CELL_W / 2, y: row * CELL_H + 70 };
}

/** 島の中のステージ選択。道でつないだ標識として並べる。 */
export function IslandBoard({ title, stages, onPick, selectedId }: Props) {
  const animate = useMotionEnabled();
  const rows = Math.ceil(stages.length / COLS);
  const height = rows * CELL_H + 40;
  const points = stages.map((_, i) => position(i));
  const line = points.map((p) => `${String(p.x)},${String(p.y)}`).join(' ');
  const clearedCount = stages.filter((s) => s.state === 'clear').length;
  const walked = points.slice(0, Math.max(1, clearedCount + 1));

  return (
    <svg
      viewBox={`0 0 ${String(COLS * CELL_W)} ${String(height)}`}
      className="h-auto w-full"
      role="group"
      aria-label={`${title} のステージ`}
    >
      <rect width={COLS * CELL_W} height={height} fill="#77b356" />
      {Array.from({ length: 60 }, (_, i) => (
        <circle
          key={`turf-${String(i)}`}
          cx={(i * 173) % (COLS * CELL_W)}
          cy={(i * 97) % height}
          r={4}
          fill="#5c8f42"
          opacity={0.5}
        />
      ))}

      <polyline points={line} fill="none" stroke="#5c8f42" strokeWidth={26} strokeLinecap="round" />
      <polyline points={line} fill="none" stroke="#d9c39a" strokeWidth={18} strokeLinecap="round" />
      <polyline
        points={walked.map((p) => `${String(p.x)},${String(p.y)}`).join(' ')}
        fill="none"
        stroke="#f2c14e"
        strokeWidth={18}
        strokeLinecap="round"
      />

      {stages.map((stage, i) => {
        const p = position(i);
        const selected = stage.id === selectedId;
        const fill =
          stage.state === 'clear' ? '#f2c14e' : stage.state === 'open' ? '#f6e8cd' : '#b9b3a4';
        return (
          <g
            key={stage.id}
            role="link"
            tabIndex={0}
            aria-label={`${String(stage.no)} ${stage.title}`}
            className="cursor-pointer"
            onClick={() => {
              onPick(stage.id);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') onPick(stage.id);
            }}
          >
            {selected ? (
              <motion.circle
                cx={p.x}
                cy={p.y}
                r={R + 10}
                fill="none"
                stroke="#c0442f"
                strokeWidth={4}
                animate={animate ? { r: [R + 8, R + 18], opacity: [0.9, 0] } : {}}
                transition={{ repeat: Infinity, duration: 1.6 }}
              />
            ) : null}

            {stage.boss ? (
              <polygon
                points={`${String(p.x)},${String(p.y - R - 6)} ${String(p.x + R + 6)},${String(p.y)} ${String(p.x)},${String(p.y + R + 6)} ${String(p.x - R - 6)},${String(p.y)}`}
                fill={fill}
                stroke="#422a15"
                strokeWidth={4}
              />
            ) : (
              <circle cx={p.x} cy={p.y} r={R} fill={fill} stroke="#422a15" strokeWidth={4} />
            )}

            <text
              x={p.x}
              y={p.y + 8}
              textAnchor="middle"
              fill="#422a15"
              fontSize={22}
              fontWeight={800}
            >
              {stage.state === 'locked' ? '🔒' : stage.boss ? '★' : String(stage.no)}
            </text>

            <rect
              x={p.x - 92}
              y={p.y + R + 12}
              width={184}
              height={30}
              rx={4}
              fill="#f6e8cd"
              stroke="#422a15"
              strokeWidth={2}
              opacity={0.95}
            />
            <text x={p.x} y={p.y + R + 33} textAnchor="middle" fill="#422a15" fontSize={15}>
              {stage.title.length > 12 ? `${stage.title.slice(0, 12)}…` : stage.title}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

