import { AnimatePresence, motion } from 'framer-motion';
import type { VfsState } from '@/engines/kernel/vfs';
import { useMotionEnabled } from '@/ui/motion';

interface Props {
  vfs: VfsState;
  previous?: VfsState | undefined;
  cwd: string;
}

type Change = 'added' | 'changed' | 'none';

function changeOf(path: string, vfs: VfsState, previous: VfsState | undefined): Change {
  if (!previous) return 'none';
  const before = previous.nodes.get(path);
  const after = vfs.nodes.get(path);
  if (!before) return 'added';
  if (before.kind === 'file' && after?.kind === 'file' && before.content !== after.content) return 'changed';
  return 'none';
}

/** VFS の状態から描くだけの純粋な表示。差分は色と印で示す（色だけに頼らない）。 */
export function FileTree({ vfs, previous, cwd }: Props) {
  const animate = useMotionEnabled();
  const paths = [...vfs.nodes.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  return (
    <ul className="overflow-auto p-3 font-mono text-xs leading-6">
      <AnimatePresence initial={false}>
        {paths.map((path) => {
          const node = vfs.nodes.get(path);
          if (!node) return null;
          const depth = path === '/' ? 0 : path.split('/').length - 1;
          const name = path === '/' ? '/' : (path.split('/').pop() ?? path);
          const change = changeOf(path, vfs, previous);
          const isCwd = path === cwd;
          return (
            <motion.li
              key={path}
              layout={animate}
              initial={animate ? { opacity: 0, x: -6 } : false}
              animate={{ opacity: 1, x: 0 }}
              exit={animate ? { opacity: 0, x: 6 } : undefined}
              transition={{ duration: 0.18 }}
              style={{ paddingLeft: `${String(depth * 12)}px` }}
              className={
                change === 'added'
                  ? 'text-[var(--c-ok)]'
                  : change === 'changed'
                    ? 'text-[var(--c-warn)]'
                    : isCwd
                      ? 'text-accent'
                      : 'text-muted'
              }
            >
              <span aria-hidden>{node.kind === 'dir' ? '▸ ' : '· '}</span>
              {name}
              {node.kind === 'dir' && path !== '/' ? '/' : ''}
              {change === 'added' ? <span className="ml-2 text-[10px]">新規</span> : null}
              {change === 'changed' ? <span className="ml-2 text-[10px]">更新</span> : null}
              {isCwd ? <span className="ml-2 text-[10px]">現在地</span> : null}
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}
