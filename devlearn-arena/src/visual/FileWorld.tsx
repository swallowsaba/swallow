import { AnimatePresence, motion } from 'framer-motion';
import { useMemo } from 'react';
import type { VfsState } from '@/engines/kernel/vfs';
import { useMotionEnabled } from '@/ui/motion';
import { CHIP_H, COL_W, diffVfs, layoutTree, NODE_H } from './treeLayout';

interface Props {
  vfs: VfsState;
  previous?: VfsState | undefined;
  cwd: string;
}

/**
 * 仮想ファイルシステムの階層図。
 * 斜めの立体はやめ、正面から見た樹形図にする。構造を読むことが目的なので、
 * 奥行きより「どこが親でどこが子か」がはっきり見えることを優先する。
 */
export function FileWorld({ vfs, previous, cwd }: Props) {
  const animate = useMotionEnabled();
  const layout = useMemo(() => layoutTree(vfs), [vfs]);
  const diff = useMemo(() => diffVfs(previous, vfs), [previous, vfs]);
  const added = new Set(diff.added);
  const changed = new Set(diff.changed);

  return (
    <div className="h-full w-full overflow-auto p-6">
      <div
        className="relative"
        style={{ width: layout.width, height: layout.height, minWidth: '100%' }}
        role="img"
        aria-label="ファイルシステムの階層図"
      >
        {/* 親子をつなぐ線 */}
        <svg
          className="pointer-events-none absolute left-0 top-0"
          width={layout.width}
          height={layout.height}
          aria-hidden
        >
          {layout.nodes.map((node) => {
            const parent = node.parent === null ? undefined : layout.byPath.get(node.parent);
            if (!parent) return null;
            const x1 = parent.x + COL_W - 42;
            const y1 = parent.y + NODE_H / 2;
            const x2 = node.x;
            const y2 = node.y + NODE_H / 2;
            const mid = x1 + (x2 - x1) / 2;
            return (
              <path
                key={`edge-${node.path}`}
                d={`M ${String(x1)} ${String(y1)} H ${String(mid)} V ${String(y2)} H ${String(x2)}`}
                fill="none"
                stroke="var(--wood-light)"
                strokeWidth={2.5}
              />
            );
          })}
        </svg>

        {layout.nodes.map((node) => {
          const isCwd = node.path === cwd;
          const isNew = added.has(node.path);
          return (
            <motion.div
              key={node.path}
              initial={animate && isNew ? { opacity: 0, scale: 0.9 } : false}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 20 }}
              className={`absolute border-2 bg-cream ${
                isCwd ? 'border-[var(--bad)] shadow-[0_0_0_4px_rgba(192,68,47,0.18)]' : 'border-wood-dark'
              }`}
              style={{ left: node.x, top: node.y, width: COL_W - 44 }}
            >
              <div
                className={`flex items-center gap-2 px-3 py-2 ${
                  isCwd ? 'bg-[var(--bad)] text-cream' : 'bg-[var(--cream-dark)] text-ink'
                }`}
                style={{ height: NODE_H }}
              >
                <span aria-hidden className="text-lg leading-none">
                  {isCwd ? '▶' : '📁'}
                </span>
                <span className="truncate font-bold" title={node.path}>
                  {node.name}
                </span>
              </div>

              {node.files.length > 0 ? (
                <ul className="px-2 py-1.5">
                  <AnimatePresence initial={false}>
                    {node.files.map((file) => {
                      const tone = added.has(file.path)
                        ? 'bg-[var(--ok)]/25 border-[var(--ok)]'
                        : changed.has(file.path)
                          ? 'bg-[var(--warn)]/30 border-[var(--warn)]'
                          : 'bg-white/60 border-[var(--cream-dark)]';
                      return (
                        <motion.li
                          key={file.path}
                          initial={animate ? { opacity: 0, x: -8 } : false}
                          animate={{ opacity: 1, x: 0 }}
                          exit={animate ? { opacity: 0, x: 8 } : undefined}
                          transition={{ duration: 0.18 }}
                          className={`mb-1 truncate border-l-4 px-2 font-mono text-sm ${tone}`}
                          style={{ height: CHIP_H - 4, lineHeight: `${String(CHIP_H - 6)}px` }}
                          title={file.path}
                        >
                          {file.name}
                        </motion.li>
                      );
                    })}
                  </AnimatePresence>
                  {node.hiddenCount > 0 ? (
                    <li className="px-2 font-mono text-sm text-ink-soft">
                      ほか {node.hiddenCount} 件
                    </li>
                  ) : null}
                </ul>
              ) : null}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
