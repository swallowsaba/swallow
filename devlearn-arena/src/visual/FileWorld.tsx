import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { VfsState } from '@/engines/kernel/vfs';
import { useMotionEnabled } from '@/ui/motion';
import { CHIP_H, COL_W, diffVfs, layoutTree, NODE_H } from './treeLayout';

/** 読み上げ名。E2E からも参照するので定数にする */
export const FILE_WORLD_LABEL = 'ファイルシステムの階層図';

interface Props {
  vfs: VfsState;
  previous?: VfsState | undefined;
  cwd: string;
}

const ROOM_W = COL_W - 44;

/**
 * ファイルシステムを「部屋」として描く。
 * ディレクトリが部屋、ファイルがその中の荷物、いま居る場所に人物が立つ。
 * 斜めにはしない（構造を読むのに角度は邪魔）が、
 * 通路でつながった間取り図として、歩き回っている感覚が出るようにする。
 */
export function FileWorld({ vfs, previous, cwd }: Props) {
  const animate = useMotionEnabled();
  const layout = useMemo(() => layoutTree(vfs), [vfs]);
  const diff = useMemo(() => diffVfs(previous, vfs), [previous, vfs]);
  const added = new Set(diff.added);
  const changed = new Set(diff.changed);

  // 一度でも入った部屋は明るくなる。未踏の部屋は暗いまま
  const [visited, setVisited] = useState<ReadonlySet<string>>(() => new Set([cwd]));
  useEffect(() => {
    setVisited((prev) => (prev.has(cwd) ? prev : new Set([...prev, cwd])));
  }, [cwd]);

  // 現在地が変わったら、その部屋が見えるところまでスクロールする
  const viewRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
  }, [cwd]);

  return (
    <div ref={viewRef} className="h-full w-full overflow-auto p-6">
      <div
        className="relative"
        style={{ width: layout.width, height: layout.height, minWidth: '100%' }}
        role="img"
        aria-label={FILE_WORLD_LABEL}
      >
        {/* 部屋をつなぐ通路 */}
        <svg
          className="pointer-events-none absolute left-0 top-0"
          width={layout.width}
          height={layout.height}
          aria-hidden
        >
          {layout.nodes.map((node) => {
            const parent = node.parent === null ? undefined : layout.byPath.get(node.parent);
            if (!parent) return null;
            const x1 = parent.x + ROOM_W;
            const y1 = parent.y + NODE_H / 2;
            const x2 = node.x;
            const y2 = node.y + NODE_H / 2;
            const mid = x1 + (x2 - x1) / 2;
            const lit = visited.has(node.path) || visited.has(parent.path);
            const d = `M ${String(x1)} ${String(y1)} H ${String(mid)} V ${String(y2)} H ${String(x2)}`;
            return (
              <g key={`corridor-${node.path}`}>
                <path d={d} fill="none" stroke="var(--wood-dark)" strokeWidth={14} strokeLinecap="square" />
                <path
                  d={d}
                  fill="none"
                  stroke={lit ? 'var(--path)' : 'var(--cream-dark)'}
                  strokeWidth={8}
                  strokeLinecap="square"
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
              initial={animate && isNew ? { opacity: 0, scale: 0.85, y: -12 } : false}
              animate={{ opacity: lit ? 1 : 0.62, scale: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 240, damping: 20 }}
              className={`absolute border-4 ${
                isCwd ? 'border-[var(--bad)]' : 'border-wood-dark'
              }`}
              style={{
                left: node.x,
                top: node.y,
                width: ROOM_W,
                backgroundColor: lit ? 'var(--cream)' : 'var(--cream-dark)',
                boxShadow: isCwd ? '0 0 0 6px rgba(192,68,47,0.22)' : '0 4px 0 rgba(0,0,0,0.18)',
              }}
            >
              {/* 部屋の名札 */}
              <div
                className={`flex items-center gap-2 border-b-4 border-wood-dark px-3 ${
                  isCwd ? 'bg-[var(--bad)] text-cream' : 'bg-[var(--wood-light)] text-wood-dark'
                }`}
                style={{ height: NODE_H }}
              >
                <span aria-hidden className="text-lg leading-none">
                  {node.path === '/' ? '🏰' : '🚪'}
                </span>
                <span className="truncate font-extrabold" title={node.path}>
                  {node.name}
                </span>
              </div>

              {/* 部屋の中の荷物 */}
              <div className="relative min-h-[42px] px-2 py-2">
                <ul>
                  <AnimatePresence initial={false}>
                    {node.files.map((file) => {
                      const isAdded = added.has(file.path);
                      const isChanged = changed.has(file.path);
                      return (
                        <motion.li
                          key={file.path}
                          initial={animate ? { opacity: 0, y: -14, scale: 0.8 } : false}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={animate ? { opacity: 0, scale: 0.6 } : undefined}
                          transition={{ type: 'spring', stiffness: 300, damping: 18 }}
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

                {/* いま立っている場所 */}
                {isCwd ? (
                  <motion.div
                    layoutId="avatar"
                    transition={{ type: 'spring', stiffness: 220, damping: 22 }}
                    className="absolute -right-4 -top-6 grid h-12 w-12 place-items-center rounded-full border-4 border-wood-dark bg-gold text-2xl"
                    aria-label="現在地"
                    role="img"
                  >
                    <motion.span
                      animate={animate ? { y: [0, -3, 0] } : {}}
                      transition={{ repeat: Infinity, duration: 1.6 }}
                    >
                      🧑‍🚀
                    </motion.span>
                  </motion.div>
                ) : null}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
