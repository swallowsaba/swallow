import { motion } from 'framer-motion';
import { useMemo } from 'react';
import type { VfsState } from '@/engines/kernel/vfs';
import { useT } from '@/i18n/useT';
import { useMotionEnabled } from '@/ui/motion';
import { fsCommands, type RunCommand } from './commands';
import { clip, FILL, flow } from './sceneKit';
import { CHIP_H, COL_W, diffVfs, layoutTree, NODE_H, type DirNode } from './treeLayout';

interface Props {
  vfs: VfsState;
  previous?: VfsState | undefined;
  cwd: string;
  /** 図の操作をコマンドとして端末に流す。無ければ見るだけの図になる */
  onCommand?: RunCommand;
}

const BOX_W = COL_W - 50;

/** ルートから cwd までに通るディレクトリ */
function pathTo(cwd: string): Set<string> {
  const out = new Set<string>(['/']);
  let here = '';
  for (const part of cwd.split('/').filter((p) => p !== '')) {
    here = `${here}/${part}`;
    out.add(here);
  }
  return out;
}

/**
 * ファイルシステムの階層図。
 * ディレクトリを箱、ファイルをその中の札として正面から並べ、親から子へ線を引く。
 * いまいる場所（cwd）とそこまでの道筋を金色で示し、増えたファイル・書き換わったファイルを光らせる。
 */
export function FsTree({ vfs, previous, cwd, onCommand }: Props) {
  const t = useT();
  const animate = useMotionEnabled();
  const layout = useMemo(() => layoutTree(vfs), [vfs]);
  const diff = useMemo(() => diffVfs(previous, vfs), [previous, vfs]);
  const added = new Set(diff.added);
  const changed = new Set(diff.changed);
  const onPath = pathTo(cwd);

  const edge = (child: DirNode) => {
    const parent = child.parent === null ? undefined : layout.byPath.get(child.parent);
    if (!parent) return null;
    const lit = onPath.has(child.path);
    return (
      <path
        key={`edge-${child.path}`}
        data-edge={child.path}
        d={flow({ x: parent.x + BOX_W, y: parent.y + NODE_H / 2 }, { x: child.x, y: child.y + NODE_H / 2 })}
        fill="none"
        stroke={lit ? 'var(--gold-dark)' : 'var(--wood)'}
        strokeWidth={lit ? 5 : 3}
      />
    );
  };

  return (
    <div className="p-3" data-testid="fs-tree">
      {onCommand ? <p className="mb-2 text-xs text-ink-soft">{t('viz.clickHint')}</p> : null}
      <svg width={layout.width} height={layout.height} role="img" aria-label={t('viz.fileTree')}>
        {layout.nodes.map(edge)}
        {layout.nodes.map((dir) => {
          const here = dir.path === cwd;
          return (
            <g key={dir.path} transform={`translate(${String(dir.x)} ${String(dir.y)})`} data-dir={dir.path}>
              <rect
                width={BOX_W}
                height={dir.height}
                fill="var(--cream)"
                stroke={here ? 'var(--bad)' : 'var(--wood-dark)'}
                strokeWidth={here ? 4 : 2.5}
              />
              <g
                role={onCommand ? 'button' : undefined}
                aria-label={onCommand ? fsCommands.cd(dir.path) : undefined}
                style={{ cursor: onCommand ? 'pointer' : 'default' }}
                onClick={() => {
                  onCommand?.(fsCommands.cd(dir.path));
                }}
              >
                <title>{onCommand ? fsCommands.cd(dir.path) : dir.path}</title>
                <rect width={BOX_W} height={NODE_H - 8} fill={here ? FILL.glow : onPath.has(dir.path) ? FILL.warn : FILL.idle} />
                <text x={8} y={24} fontSize={14} fontWeight={800} fill="var(--ink)">
                  {`📁 ${clip(dir.name, BOX_W - (here ? 80 : 30), 14)}`}
                  {dir.hiddenCount > 0 ? ` +${String(dir.hiddenCount)}` : ''}
                </text>
                {here ? (
                  <text x={BOX_W - 6} y={24} fontSize={11} fontWeight={800} textAnchor="end" fill="var(--bad)">
                    {t('viz.here')}
                  </text>
                ) : null}
              </g>
              {dir.files.map((file, i) => {
                const glow = added.has(file.path) ? FILL.glow : changed.has(file.path) ? FILL.warn : null;
                return (
                  <motion.g
                    key={file.path}
                    data-file={file.path}
                    data-glow={glow === null ? 'false' : 'true'}
                    initial={animate && glow !== null ? { opacity: 0, y: -12 } : false}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 18 }}
                    role={onCommand ? 'button' : undefined}
                    aria-label={onCommand ? fsCommands.cat(file.path) : undefined}
                    style={{ cursor: onCommand ? 'pointer' : 'default' }}
                    onClick={() => {
                      onCommand?.(fsCommands.cat(file.path));
                    }}
                  >
                    <title>{onCommand ? fsCommands.cat(file.path) : file.path}</title>
                    <rect
                      x={8}
                      y={NODE_H - 2 + i * CHIP_H}
                      width={BOX_W - 16}
                      height={CHIP_H - 4}
                      fill={glow ?? 'white'}
                      stroke="var(--wood-dark)"
                      strokeWidth={1.5}
                    />
                    <text x={14} y={NODE_H + 14 + i * CHIP_H} fontSize={12} fontFamily="monospace" fill="var(--ink)">
                      {`📄 ${clip(file.name, BOX_W - 50, 12)}`}
                    </text>
                  </motion.g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
