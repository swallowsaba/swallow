import { motion } from 'framer-motion';
import { useMemo } from 'react';
import { log } from '@/engines/git/repository';
import type { GitState } from '@/engines/git/types';
import { useMotionEnabled } from '@/ui/motion';
import { useT } from '@/i18n/useT';
import { gitCommands, type RunCommand } from './commands';

interface Props {
  git: GitState | null;
  /** 図の操作をコマンドとして端末に流す。無ければ見るだけの図になる */
  onCommand?: RunCommand;
}

const ROW = 62;
const LEFT = 44;

/** コミットの並びを、下から上へ積み上がる柱として描く */
export function CommitGraph({ git, onCommand }: Props) {
  const t = useT();
  const animate = useMotionEnabled();
  const entries = useMemo(() => (git === null ? [] : log(git, 40)), [git]);

  const branchAt = useMemo(() => {
    const map = new Map<string, string[]>();
    if (git === null) return map;
    for (const [ref, hash] of git.refs) {
      if (!ref.startsWith('refs/heads/')) continue;
      const name = ref.slice('refs/heads/'.length);
      map.set(hash, [...(map.get(hash) ?? []), name]);
    }
    return map;
  }, [git]);

  if (git === null) {
    return (
      <div className="grid h-full place-items-center p-6 text-center">
        <div>
          <p className="text-lg font-bold">{t('viz.noRepo')}</p>
          <p className="mt-2 text-sm text-ink-soft">
            {t('viz.noRepoLead')}
          </p>
        </div>
      </div>
    );
  }

  const headHash = entries[0]?.hash ?? null;
  const height = Math.max(entries.length * ROW + 40, 120);

  const branchNames = [...branchAt.values()].flat();

  return (
    <div className="h-full overflow-auto p-4">
      {onCommand && entries.length > 0 ? (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <p className="text-xs text-ink-soft">{t('viz.clickHint')}</p>
          <button
            type="button"
            className="knob ml-auto px-3 py-1 text-sm"
            title={gitCommands.branchOut(branchNames)}
            onClick={() => {
              onCommand(gitCommands.branchOut(branchNames));
            }}
          >
            ⑂ {t('viz.branchOut')}
          </button>
        </div>
      ) : null}
      {entries.length === 0 ? (
        <p className="text-sm text-ink-soft">
          {t('viz.noCommits')}
        </p>
      ) : (
        <div className="relative" style={{ height }}>
          <svg className="absolute left-0 top-0" width={LEFT + 8} height={height} aria-hidden>
            <line
              x1={LEFT / 2}
              y1={24}
              x2={LEFT / 2}
              y2={entries.length * ROW - ROW + 24}
              stroke="var(--wood)"
              strokeWidth={6}
            />
          </svg>

          {entries.map((entry, i) => {
            const isHead = entry.hash === headHash;
            const labels = branchAt.get(entry.hash) ?? [];
            return (
              <motion.div
                key={entry.hash}
                initial={animate && i === 0 ? { opacity: 0, y: -18, scale: 0.9 } : false}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 280, damping: 20 }}
                className="absolute flex items-center gap-3"
                style={{ top: i * ROW, left: 0, right: 0 }}
              >
                <span
                  aria-hidden
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-full border-4 text-sm font-extrabold ${
                    isHead
                      ? 'border-[var(--bad)] bg-gold'
                      : 'border-wood-dark bg-[var(--cream-dark)]'
                  }`}
                  style={{ marginLeft: LEFT / 2 - 20 }}
                >
                  {entry.parents.length > 1 ? '⑂' : '●'}
                </span>

                <div className="min-w-0 flex-1 border-2 border-wood-dark bg-cream px-3 py-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={!onCommand}
                      aria-label={t('viz.showCommit')}
                      title={gitCommands.show(entry.hash)}
                      className="font-mono text-sm text-ink-soft underline decoration-dotted disabled:no-underline"
                      onClick={() => {
                        onCommand?.(gitCommands.show(entry.hash));
                      }}
                    >
                      {entry.hash.slice(0, 7)}
                    </button>
                    {labels.map((name) => (
                      <button
                        key={name}
                        type="button"
                        disabled={!onCommand}
                        aria-label={t('viz.switchTo', { name })}
                        title={gitCommands.switchTo(name)}
                        className="border-2 border-wood-dark bg-gold px-1.5 font-mono text-xs font-bold"
                        onClick={() => {
                          onCommand?.(gitCommands.switchTo(name));
                        }}
                      >
                        {name}
                      </button>
                    ))}
                    {isHead ? (
                      <span className="border-2 border-[var(--bad)] px-1.5 font-mono text-xs font-bold text-[var(--bad)]">
                        HEAD
                      </span>
                    ) : null}
                  </div>
                  <p className="truncate text-sm">{entry.message}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
