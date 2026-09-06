import { AnimatePresence, motion } from 'framer-motion';
import { useMemo } from 'react';
import type { VfsState } from '@/engines/kernel/vfs';
import { useMotionEnabled } from '@/ui/motion';
import { buildWorld, diffVfs, focusOf, iso, TILE_H, TILE_W, type Plot } from './iso';

interface Props {
  vfs: VfsState;
  previous?: VfsState | undefined;
  cwd: string;
}

const CRATE_W = 24;
const CRATE_H = 12;
const CRATE_D = 16;
const WALL = 52;

function rhombus(cx: number, cy: number, scale = 1): string {
  const w = (TILE_W / 2) * scale;
  const h = (TILE_H / 2) * scale;
  return `${String(cx)},${String(cy - h)} ${String(cx + w)},${String(cy)} ${String(cx)},${String(cy + h)} ${String(cx - w)},${String(cy)}`;
}

function Crate({ x, y, tone }: { x: number; y: number; tone: string }) {
  const w = CRATE_W / 2;
  const h = CRATE_H / 2;
  return (
    <g>
      <polygon
        points={`${String(x - w)},${String(y)} ${String(x)},${String(y + h)} ${String(x)},${String(y + h + CRATE_D)} ${String(x - w)},${String(y + CRATE_D)}`}
        fill={tone}
        opacity={0.75}
      />
      <polygon
        points={`${String(x + w)},${String(y)} ${String(x)},${String(y + h)} ${String(x)},${String(y + h + CRATE_D)} ${String(x + w)},${String(y + CRATE_D)}`}
        fill={tone}
        opacity={0.5}
      />
      <polygon
        points={`${String(x)},${String(y - h)} ${String(x + w)},${String(y)} ${String(x)},${String(y + h)} ${String(x - w)},${String(y)}`}
        fill={tone}
        stroke="var(--wood-dark)"
        strokeWidth={1}
      />
    </g>
  );
}

/** ディレクトリ＝建物。壁と屋根を持つ小屋として描く。 */
function Building({ plot, isCwd }: { plot: Plot; isCwd: boolean }) {
  const { x, y } = plot.center;
  const w = TILE_W / 2;
  const h = TILE_H / 2;
  const top = y - WALL;
  return (
    <g>
      {/* 敷地（芝の上の土台） */}
      <polygon points={rhombus(x, y, 1.04)} fill="var(--path)" stroke="var(--grass-dark)" strokeWidth={1} />
      {/* 壁 */}
      <polygon
        points={`${String(x - w)},${String(y)} ${String(x)},${String(y + h)} ${String(x)},${String(y + h - WALL)} ${String(x - w)},${String(y - WALL)}`}
        fill="var(--brick)"
      />
      <polygon
        points={`${String(x + w)},${String(y)} ${String(x)},${String(y + h)} ${String(x)},${String(y + h - WALL)} ${String(x + w)},${String(y - WALL)}`}
        fill="var(--roof)"
        opacity={0.85}
      />
      {/* 屋上（ここに荷物を置く） */}
      <polygon
        points={rhombus(x, top)}
        fill={isCwd ? 'var(--gold)' : 'var(--cream-dark)'}
        stroke="var(--wood-dark)"
        strokeWidth={2}
      />
      {isCwd ? (
        <g>
          <line x1={x} y1={top - 6} x2={x} y2={top - 36} stroke="var(--wood-dark)" strokeWidth={3} />
          <polygon
            points={`${String(x)},${String(top - 36)} ${String(x + 26)},${String(top - 29)} ${String(x)},${String(top - 22)}`}
            fill="var(--bad)"
            stroke="var(--wood-dark)"
            strokeWidth={2}
          />
        </g>
      ) : null}
    </g>
  );
}

/**
 * 仮想ファイルシステムを園内の景色として描く。
 * ディレクトリが建物、ファイルが屋上に積まれた荷物。
 * コマンドで状態が変わると、運搬車が現場へ走り、荷物が置かれたり消えたりする。
 */
export function FileWorld({ vfs, previous, cwd }: Props) {
  const animate = useMotionEnabled();
  const world = useMemo(() => buildWorld(vfs), [vfs]);
  const diff = useMemo(() => diffVfs(previous, vfs), [previous, vfs]);

  const focusPath = focusOf(diff);
  const focusPlot = focusPath
    ? (world.byPath.get(focusPath) ??
      world.plots.find((p) => focusPath.startsWith(`${p.path === '/' ? '' : p.path}/`)))
    : undefined;
  const cart = focusPlot?.center ?? world.byPath.get(cwd)?.center ?? iso(0, 0);

  const addedSet = new Set(diff.added);
  const changedSet = new Set(diff.changed);
  const pad = 90;

  const trees = useMemo(() => {
    const out: { x: number; y: number; size: number }[] = [];
    const { x, y, width, height } = world.view;
    for (let gx = 0; gx < 9; gx += 1) {
      for (let gy = 0; gy < 7; gy += 1) {
        const px = x + ((gx + (gy % 2) * 0.5) / 9) * width;
        const py = y + (gy / 7) * height;
        const tooClose = world.plots.some(
          (plot) => Math.hypot(plot.center.x - px, plot.center.y - py) < 190,
        );
        if (tooClose) continue;
        out.push({ x: px, y: py, size: 0.8 + ((gx * 7 + gy * 13) % 5) * 0.1 });
      }
    }
    return out;
  }, [world]);

  return (
    <svg
      viewBox={`${String(world.view.x - pad)} ${String(world.view.y - pad)} ${String(world.view.width + pad * 2)} ${String(world.view.height + pad * 2)}`}
      className="h-full w-full"
      role="img"
      aria-label="ファイルシステムの園内図"
    >
      {/* 園内の木 */}
      {trees.map((tree) => (
        <g key={`tree-${String(tree.x)}-${String(tree.y)}`} transform={`translate(${String(tree.x)} ${String(tree.y)}) scale(${String(tree.size)})`}>
          <ellipse cx={0} cy={4} rx={16} ry={7} fill="rgb(0 0 0 / 12%)" />
          <rect x={-4} y={-16} width={8} height={20} fill="var(--wood)" />
          <circle cx={0} cy={-26} r={17} fill="var(--grass-dark)" />
          <circle cx={-10} cy={-19} r={12} fill="var(--grass-dark)" />
          <circle cx={10} cy={-19} r={12} fill="var(--grass-dark)" />
          <circle cx={-3} cy={-31} r={10} fill="var(--grass)" opacity={0.8} />
        </g>
      ))}

      {/* 園内の道 */}
      {world.plots.map((plot) => {
        const parent = plot.parent === null ? undefined : world.byPath.get(plot.parent);
        if (!parent) return null;
        return (
          <line
            key={`road-${plot.path}`}
            x1={parent.center.x}
            y1={parent.center.y}
            x2={plot.center.x}
            y2={plot.center.y}
            stroke="var(--path)"
            strokeWidth={16}
            strokeLinecap="round"
          />
        );
      })}

      {/* 建物。奥から手前へ描いて重なりを正しくする */}
      {[...world.plots]
        .sort((a, b) => a.center.y - b.center.y)
        .map((plot) => {
          const isCwd = plot.path === cwd;
          const isNew = addedSet.has(plot.path);
          return (
            <motion.g
              key={plot.path}
              initial={animate && isNew ? { opacity: 0, y: -60 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 16 }}
            >
              <Building plot={plot} isCwd={isCwd} />

              <AnimatePresence>
                {plot.crates.map((crate) => {
                  const added = addedSet.has(crate.path);
                  const changed = changedSet.has(crate.path);
                  const tone = added
                    ? 'var(--crate-new)'
                    : changed
                      ? 'var(--crate-hot)'
                      : 'var(--crate)';
                  return (
                    <motion.g
                      key={crate.path}
                      initial={animate ? { opacity: 0, y: -40 } : false}
                      animate={{ opacity: 1, y: 0 }}
                      exit={animate ? { opacity: 0, y: -30 } : undefined}
                      transition={{ type: 'spring', stiffness: 240, damping: 15 }}
                    >
                      <Crate
                        x={plot.center.x + crate.offset.x}
                        y={plot.center.y + crate.offset.y - WALL - 8}
                        tone={tone}
                      />
                    </motion.g>
                  );
                })}
              </AnimatePresence>

            </motion.g>
          );
        })}

      {/* 看板は最後にまとめて描く。手前の建物に隠されないようにするため */}
      {world.plots.map((plot) => {
        const label = plot.name + (plot.hiddenCount > 0 ? ` +${String(plot.hiddenCount)}` : '');
        const width = Math.max(64, label.length * 11 + 20);
        return (
          <g key={`sign-${plot.path}`}>
            <rect
              x={plot.center.x - width / 2}
              y={plot.center.y + TILE_H / 2 + 2}
              width={width}
              height={22}
              rx={3}
              fill="var(--gold)"
              stroke="var(--wood-dark)"
              strokeWidth={2}
            />
            <text
              x={plot.center.x}
              y={plot.center.y + TILE_H / 2 + 17}
              textAnchor="middle"
              fill="var(--wood-dark)"
              fontSize={13}
              fontWeight={700}
            >
              {label}
            </text>
          </g>
        );
      })}

      {/* 運搬車 */}
      <motion.g
        animate={{ x: cart.x, y: cart.y - 10 }}
        initial={false}
        transition={{ type: 'spring', stiffness: 80, damping: 15 }}
      >
        <ellipse cx={0} cy={10} rx={20} ry={8} fill="rgb(0 0 0 / 20%)" />
        <polygon points="-16,0 0,8 16,0 0,-8" fill="var(--gold)" stroke="var(--wood-dark)" strokeWidth={2} />
        <polygon points="-16,0 0,8 0,20 -16,12" fill="var(--gold-dark)" stroke="var(--wood-dark)" strokeWidth={2} />
        <polygon points="16,0 0,8 0,20 16,12" fill="var(--gold-dark)" stroke="var(--wood-dark)" strokeWidth={2} opacity={0.85} />
      </motion.g>
    </svg>
  );
}
