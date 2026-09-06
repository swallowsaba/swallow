import { AnimatePresence, motion } from 'framer-motion';
import { useMemo } from 'react';
import type { VfsState } from '@/engines/kernel/vfs';
import { useMotionEnabled } from '@/ui/motion';
import { buildWorld, diffVfs, focusOf, iso, TILE_D, TILE_H, TILE_W, type Plot } from './iso';

interface Props {
  vfs: VfsState;
  previous?: VfsState | undefined;
  cwd: string;
}

const CRATE_W = 26;
const CRATE_H = 13;
const CRATE_D = 18;

/** 菱形（タイルの上面） */
function tilePoints(cx: number, cy: number, scale = 1): string {
  const w = (TILE_W / 2) * scale;
  const h = (TILE_H / 2) * scale;
  return `${String(cx)},${String(cy - h)} ${String(cx + w)},${String(cy)} ${String(cx)},${String(cy + h)} ${String(cx - w)},${String(cy)}`;
}

function IsoCrate({ x, y, tone }: { x: number; y: number; tone: string }) {
  const w = CRATE_W / 2;
  const h = CRATE_H / 2;
  return (
    <g>
      <polygon
        points={`${String(x)},${String(y - h)} ${String(x + w)},${String(y)} ${String(x)},${String(y + h)} ${String(x - w)},${String(y)}`}
        fill={tone}
      />
      <polygon
        points={`${String(x - w)},${String(y)} ${String(x)},${String(y + h)} ${String(x)},${String(y + h + CRATE_D)} ${String(x - w)},${String(y + CRATE_D)}`}
        fill={tone}
        opacity={0.55}
      />
      <polygon
        points={`${String(x + w)},${String(y)} ${String(x)},${String(y + h)} ${String(x)},${String(y + h + CRATE_D)} ${String(x + w)},${String(y + CRATE_D)}`}
        fill={tone}
        opacity={0.35}
      />
    </g>
  );
}

function IsoTile({ plot, isCwd }: { plot: Plot; isCwd: boolean }) {
  const { x, y } = plot.center;
  const w = TILE_W / 2;
  const h = TILE_H / 2;
  return (
    <g>
      {/* 側面（厚み） */}
      <polygon
        points={`${String(x - w)},${String(y)} ${String(x)},${String(y + h)} ${String(x)},${String(y + h + TILE_D)} ${String(x - w)},${String(y + TILE_D)}`}
        fill={isCwd ? 'var(--c-accent)' : 'var(--c-raised)'}
        opacity={isCwd ? 0.5 : 1}
      />
      <polygon
        points={`${String(x + w)},${String(y)} ${String(x)},${String(y + h)} ${String(x)},${String(y + h + TILE_D)} ${String(x + w)},${String(y + TILE_D)}`}
        fill={isCwd ? 'var(--c-accent)' : 'var(--c-panel)'}
        opacity={isCwd ? 0.35 : 1}
      />
      {/* 上面 */}
      <polygon
        points={tilePoints(x, y)}
        fill={isCwd ? 'color-mix(in srgb, var(--c-accent) 24%, var(--c-panel))' : 'var(--c-panel)'}
        stroke={isCwd ? 'var(--c-accent)' : 'var(--c-line)'}
        strokeWidth={isCwd ? 3 : 1.5}
      />
    </g>
  );
}

/**
 * 仮想ファイルシステムを立体の街として描く。
 * ディレクトリが区画、ファイルが荷箱。コマンドで状態が変わると
 * 運搬車が現場へ走り、荷箱が置かれたり消えたりする。
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

  return (
    <svg
      viewBox={`${String(world.view.x)} ${String(world.view.y)} ${String(world.view.width)} ${String(world.view.height)}`}
      className="h-full w-full"
      role="img"
      aria-label="ファイルシステムの立体表示"
    >
      {/* 区画をつなぐ道 */}
      {world.plots.map((plot) => {
        const parent = plot.parent === null ? undefined : world.byPath.get(plot.parent);
        if (!parent) return null;
        return (
          <line
            key={`road-${plot.path}`}
            x1={parent.center.x}
            y1={parent.center.y + TILE_D / 2}
            x2={plot.center.x}
            y2={plot.center.y + TILE_D / 2}
            stroke="var(--c-line)"
            strokeWidth={4}
            strokeLinecap="round"
          />
        );
      })}

      {/* 区画。奥から手前へ描いて重なりを正しくする */}
      {[...world.plots]
        .sort((a, b) => a.center.y - b.center.y)
        .map((plot) => {
          const isCwd = plot.path === cwd;
          const isNew = addedSet.has(plot.path);
          return (
            <motion.g
              key={plot.path}
              initial={animate && isNew ? { opacity: 0, y: -40 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 220, damping: 18 }}
            >
              <IsoTile plot={plot} isCwd={isCwd} />

              <AnimatePresence>
                {plot.crates.map((crate) => {
                  const added = addedSet.has(crate.path);
                  const changed = changedSet.has(crate.path);
                  const tone = added
                    ? 'var(--c-ok)'
                    : changed
                      ? 'var(--c-warn)'
                      : 'var(--c-muted)';
                  return (
                    <motion.g
                      key={crate.path}
                      initial={animate ? { opacity: 0, y: -30 } : false}
                      animate={{ opacity: 1, y: 0 }}
                      exit={animate ? { opacity: 0, y: -20 } : undefined}
                      transition={{ type: 'spring', stiffness: 260, damping: 16 }}
                    >
                      <IsoCrate
                        x={plot.center.x + crate.offset.x}
                        y={plot.center.y + crate.offset.y - 6}
                        tone={tone}
                      />
                    </motion.g>
                  );
                })}
              </AnimatePresence>

              {plot.hiddenCount > 0 ? (
                <text
                  x={plot.center.x}
                  y={plot.center.y + TILE_H / 2 + 4}
                  textAnchor="middle"
                  fill="var(--c-muted)"
                  fontSize={13}
                >
                  +{plot.hiddenCount}
                </text>
              ) : null}

              <text
                x={plot.center.x}
                y={plot.center.y - TILE_H / 2 - 10}
                textAnchor="middle"
                fill={isCwd ? 'var(--c-accent)' : 'var(--c-text)'}
                fontSize={15}
                fontWeight={isCwd ? 700 : 500}
              >
                {plot.name}
              </text>
            </motion.g>
          );
        })}

      {/* 運搬車。変化のあった区画へ走っていく */}
      <motion.g
        animate={{ x: cart.x, y: cart.y - 26 }}
        initial={false}
        transition={{ type: 'spring', stiffness: 90, damping: 16 }}
      >
        <polygon points="-13,0 0,7 13,0 0,-7" fill="var(--c-accent)" />
        <polygon points="-13,0 0,7 0,17 -13,10" fill="var(--c-accent)" opacity={0.6} />
        <polygon points="13,0 0,7 0,17 13,10" fill="var(--c-accent)" opacity={0.4} />
        <motion.circle
          cx={0}
          cy={-16}
          r={5}
          fill="var(--c-accent)"
          animate={animate ? { opacity: [1, 0.2, 1] } : {}}
          transition={{ repeat: Infinity, duration: 1.4 }}
        />
      </motion.g>
    </svg>
  );
}
