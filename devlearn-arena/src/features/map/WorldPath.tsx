import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useMotionEnabled } from '@/ui/motion';

export interface MapNode {
  id: string;
  /** 表示する番号（ボスは ★） */
  mark: string;
  label: string;
  state: 'clear' | 'current' | 'open' | 'locked';
  boss: boolean;
  to: string;
}

const COLS = 6;
const CELL_W = 180;
const CELL_H = 152;
const RADIUS = 30;

function position(index: number): { x: number; y: number } {
  const row = Math.floor(index / COLS);
  const inRow = index % COLS;
  // 蛇行させる。左端まで来たら下の段へ折り返し、道が途切れないようにする
  const col = row % 2 === 0 ? inRow : COLS - 1 - inRow;
  return { x: col * CELL_W + CELL_W / 2, y: row * CELL_H + 56 };
}

function wrap(label: string): string[] {
  if (label.length <= 9) return [label];
  return [label.slice(0, 9), label.slice(9, 18)];
}

/** 章を道で繋いだ地図。クリア済みは点灯し、今いる場所は脈打つ。 */
export function WorldPath({ nodes }: { nodes: readonly MapNode[] }) {
  const navigate = useNavigate();
  const animate = useMotionEnabled();
  const rows = Math.ceil(nodes.length / COLS);
  const height = rows * CELL_H + 20;
  const points = nodes.map((_, i) => position(i));
  const line = points.map((p) => `${String(p.x)},${String(p.y)}`).join(' ');
  const clearedCount = nodes.filter((n) => n.state === 'clear').length;
  const travelled = points.slice(0, Math.max(1, clearedCount + 1));

  return (
    <svg
      viewBox={`0 0 ${String(COLS * CELL_W)} ${String(height)}`}
      className="h-auto w-full"
      role="group"
      aria-label="進行の地図"
    >
      {/* 未踏の道 */}
      <polyline
        points={line}
        fill="none"
        stroke="var(--cream-dark)"
        strokeWidth={10}
        strokeLinecap="round"
        strokeDasharray="4 16"
      />
      {/* 踏破済みの道 */}
      <polyline
        points={travelled.map((p) => `${String(p.x)},${String(p.y)}`).join(' ')}
        fill="none"
        stroke="var(--path)"
        strokeWidth={12}
        strokeLinecap="round"
      />

      {nodes.map((node, i) => {
        const p = position(i);
        const isLocked = node.state === 'locked';
        const stroke =
          node.state === 'clear' || node.state === 'current' || node.state === 'open'
            ? 'var(--gold-dark)'
            : 'var(--c-line)';
        const fill = node.state === 'clear' ? 'var(--gold-dark)' : 'var(--cream)';
        const markFill = node.state === 'clear' ? 'var(--wood-dark)' : stroke;

        return (
          <g
            key={node.id}
            role="link"
            tabIndex={0}
            aria-label={`${node.label}${isLocked ? '（準備中）' : ''}`}
            onClick={() => {
              navigate(node.to);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') navigate(node.to);
            }}
            className="cursor-pointer"
            opacity={isLocked ? 0.5 : 1}
          >
            {node.state === 'current' ? (
              <motion.circle
                cx={p.x}
                cy={p.y}
                r={RADIUS + 8}
                fill="none"
                stroke="var(--path)"
                strokeWidth={2}
                animate={animate ? { r: [RADIUS + 6, RADIUS + 16], opacity: [0.8, 0] } : {}}
                transition={{ repeat: Infinity, duration: 1.8 }}
              />
            ) : null}

            {node.boss ? (
              <rect
                x={p.x - RADIUS}
                y={p.y - RADIUS}
                width={RADIUS * 2}
                height={RADIUS * 2}
                transform={`rotate(45 ${String(p.x)} ${String(p.y)})`}
                fill={fill}
                stroke={node.state === 'locked' ? stroke : 'var(--bad)'}
                strokeWidth={3}
              />
            ) : (
              <circle cx={p.x} cy={p.y} r={RADIUS} fill={fill} stroke={stroke} strokeWidth={3} />
            )}

            <text
              x={p.x}
              y={p.y + 6}
              textAnchor="middle"
              fill={node.boss ? 'var(--warn)' : markFill}
              className="font-mono"
              fontSize={18}
              fontWeight={700}
            >
              {node.mark}
            </text>

            {wrap(node.label).map((part, li) => (
              <text
                key={part + String(li)}
                x={p.x}
                y={p.y + RADIUS + 22 + li * 18}
                textAnchor="middle"
                fill="var(--ink)"
                fontSize={14}
                fontWeight={600}
              >
                {part}
              </text>
            ))}
          </g>
        );
      })}
    </svg>
  );
}
