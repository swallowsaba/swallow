import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { VfsState } from '@/engines/kernel/vfs';
import { useMotionEnabled } from '@/ui/motion';
import { CHIP_H, COL_W, diffVfs, layoutTree, NODE_H } from './treeLayout';

export const FILE_WORLD_LABEL = 'ファイルシステムの階層図';

interface Props {
  vfs: VfsState;
  previous?: VfsState | undefined;
  cwd: string;
}

const ROOM_W = COL_W - 44;
const ROOF_H = 18;

/** 空き地に置く飾り。位置は座標から決まるので毎回同じ */
function decorations(width: number, height: number, occupied: readonly { x: number; y: number; h: number }[]) {
  const items: { x: number; y: number; kind: '🌳' | '🌲' | '🪨' | '🌼' }[] = [];
  const kinds = ['🌳', '🌲', '🪨', '🌼'] as const;
  for (let gx = 0; gx * 120 < width + 200; gx += 1) {
    for (let gy = 0; gy * 110 < height + 160; gy += 1) {
      const x = gx * 120 + (gy % 2) * 60 - 60;
      const y = gy * 110 - 40;
      const hit = occupied.some(
        (o) => x > o.x - 90 && x < o.x + ROOM_W + 40 && y > o.y - 60 && y < o.y + o.h + 40,
      );
      if (hit) continue;
      const kind = kinds[(gx * 7 + gy * 5) % kinds.length] ?? '🌳';
      items.push({ x, y, kind });
    }
  }
  return items;
}

/**
 * ファイルシステムを村として描く。
 * ディレクトリが屋根つきの家、ファイルが中に置かれた木箱、
 * いま居る家に人物が立ち、まだ入っていない家は薄暗い。
 */
export function FileWorld({ vfs, previous, cwd }: Props) {
  const animate = useMotionEnabled();
  const layout = useMemo(() => layoutTree(vfs), [vfs]);
  const diff = useMemo(() => diffVfs(previous, vfs), [previous, vfs]);
  const added = new Set(diff.added);
  const changed = new Set(diff.changed);

  const [visited, setVisited] = useState<ReadonlySet<string>>(() => new Set([cwd]));
  useEffect(() => {
    setVisited((prev) => (prev.has(cwd) ? prev : new Set([...prev, cwd])));
  }, [cwd]);

  const currentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
  }, [cwd]);

  const props = useMemo(
    () => decorations(layout.width, layout.height, layout.nodes.map((n) => ({ x: n.x, y: n.y, h: n.height }))),
    [layout],
  );

  return (
    <div className="h-full w-full overflow-auto p-8">
      <div
        className="relative"
        style={{ width: layout.width + 80, height: layout.height + 60, minWidth: '100%' }}
        role="img"
        aria-label={FILE_WORLD_LABEL}
      >
        {/* 飾り */}
        {props.map((item) => (
          <span
            key={`deco-${String(item.x)}-${String(item.y)}`}
            aria-hidden
            className="pointer-events-none absolute select-none text-3xl opacity-80"
            style={{ left: item.x, top: item.y }}
          >
            {item.kind}
          </span>
        ))}

        {/* 家をつなぐ小道 */}
        <svg
          className="pointer-events-none absolute left-0 top-0"
          width={layout.width + 80}
          height={layout.height + 60}
          aria-hidden
        >
          {layout.nodes.map((node) => {
            const parent = node.parent === null ? undefined : layout.byPath.get(node.parent);
            if (!parent) return null;
            const x1 = parent.x + ROOM_W;
            const y1 = parent.y + ROOF_H + NODE_H / 2;
            const x2 = node.x;
            const y2 = node.y + ROOF_H + NODE_H / 2;
            const mid = x1 + (x2 - x1) / 2;
            const lit = visited.has(node.path) || visited.has(parent.path);
            const d = `M ${String(x1)} ${String(y1)} H ${String(mid)} V ${String(y2)} H ${String(x2)}`;
            return (
              <g key={`path-${node.path}`}>
                <path d={d} fill="none" stroke="#5c8f42" strokeWidth={20} strokeLinecap="round" />
                <path
                  d={d}
                  fill="none"
                  stroke={lit ? 'var(--path)' : '#a89b7d'}
                  strokeWidth={13}
                  strokeLinecap="round"
                  strokeDasharray="16 8"
                />
              </g>
            );
          })}
        </svg>

        {layout.nodes.map((node) => {
          const isCwd = node.path === cwd;
          const isNew = added.has(node.path);
          const lit = visited.has(node.path);
          return (
            <motion.div
              key={node.path}
              ref={isCwd ? currentRef : undefined}
              initial={animate && isNew ? { opacity: 0, scale: 0.8, y: -20 } : false}
              animate={{ opacity: lit ? 1 : 0.7, scale: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 240, damping: 18 }}
              className="absolute"
              style={{ left: node.x, top: node.y, width: ROOM_W }}
            >
              {/* 屋根 */}
              <div
                aria-hidden
                className="mx-auto"
                style={{
                  width: ROOM_W + 16,
                  marginLeft: -8,
                  height: ROOF_H,
                  background: isCwd ? 'var(--bad)' : node.path === '/' ? '#8f4b3f' : '#a8563f',
                  clipPath: 'polygon(6% 100%, 50% 0, 94% 100%)',
                }}
              />
              <div
                className={`border-4 ${isCwd ? 'border-[var(--bad)]' : 'border-wood-dark'}`}
                style={{
                  backgroundColor: lit ? 'var(--cream)' : '#cdbf9d',
                  boxShadow: isCwd
                    ? '0 0 0 6px rgba(192,68,47,0.22), 0 6px 0 rgba(0,0,0,0.2)'
                    : '0 6px 0 rgba(0,0,0,0.2)',
                }}
              >
                <div
                  className={`flex items-center gap-2 px-3 ${
                    isCwd ? 'bg-[var(--bad)] text-cream' : 'plate'
                  }`}
                  style={{ height: NODE_H }}
                >
                  <span aria-hidden className="text-lg leading-none">
                    {node.path === '/' ? '🏰' : '🏠'}
                  </span>
                  <span className="truncate font-extrabold" title={node.path}>
                    {node.name}
                  </span>
                </div>

                <div className="relative min-h-[46px] px-2 py-2">
                  <ul>
                    <AnimatePresence initial={false}>
                      {node.files.map((file) => {
                        const isAdded = added.has(file.path);
                        const isChanged = changed.has(file.path);
                        return (
                          <motion.li
                            key={file.path}
                            initial={animate ? { opacity: 0, y: -16, scale: 0.7 } : false}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={animate ? { opacity: 0, scale: 0.5 } : undefined}
                            transition={{ type: 'spring', stiffness: 320, damping: 17 }}
                            className={`mb-1 flex items-center gap-2 border-2 px-2 font-mono text-sm ${
                              isAdded
                                ? 'border-[var(--ok)] bg-[var(--ok)]/25'
                                : isChanged
                                  ? 'border-[var(--warn)] bg-[var(--warn)]/30'
                                  : 'border-[var(--cream-dark)] bg-white/70'
                            }`}
                            style={{ height: CHIP_H - 2 }}
                            title={file.path}
                          >
                            <span aria-hidden>{isAdded ? '✨' : '📦'}</span>
                            <span className="truncate">{file.name}</span>
                          </motion.li>
                        );
                      })}
                    </AnimatePresence>
                  </ul>
                  {node.hiddenCount > 0 ? (
                    <p className="font-mono text-sm text-ink-soft">ほか {node.hiddenCount} 個</p>
                  ) : null}

                  {isCwd ? (
                    <motion.div
                      layoutId="avatar"
                      transition={{ type: 'spring', stiffness: 200, damping: 20 }}
                      className="absolute -right-6 -top-8"
                      aria-label="現在地"
                      role="img"
                    >
                      <motion.div
                        animate={animate ? { y: [0, -5, 0] } : {}}
                        transition={{ repeat: Infinity, duration: 1.5 }}
                        className="grid h-14 w-14 place-items-center rounded-full border-4 border-wood-dark bg-gold text-3xl shadow-[0_5px_0_rgba(0,0,0,0.25)]"
                      >
                        🧑‍🌾
                      </motion.div>
                    </motion.div>
                  ) : null}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
