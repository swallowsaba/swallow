import { LayoutGroup, motion } from 'framer-motion';
import { useMemo } from 'react';
import { currentBranch, headCommit } from '@/engines/git/repository';
import type { GitState } from '@/engines/git/types';
import type { VfsState } from '@/engines/kernel/vfs';
import { useMotionEnabled } from '@/ui/motion';
import { useT } from '@/i18n/useT';
import { Term } from '@/ui/Term';
import { gitCommands, type RunCommand } from './commands';
import { fileSpots, placeCommits, type FileSpot, type Lane } from './gitModel';

interface Props {
  git: GitState | null;
  /** 作業ツリーを読むために使う。無ければ3面の欄は出さない */
  vfs?: VfsState;
  /** 図の操作をコマンドとして端末に流す。無ければ見るだけの図になる */
  onCommand?: RunCommand;
}

const ROW = 56;
const COL = 34;
const TOP = 22;
const DOT = 13;

const LANES: readonly { lane: Lane; term: string; lead: string }[] = [
  { lane: 'worktree', term: '作業ツリー', lead: '手元で書き換えた' },
  { lane: 'index', term: 'インデックス', lead: '次に記録する' },
  { lane: 'head', term: 'HEAD', lead: '記録済み' },
];

const NOTE: Record<FileSpot['note'], string> = { new: '新', modified: '変', deleted: '消', clean: '✓' };

/** ファイルの札。同じ layoutId の札が別の面に出ると、そこへ滑っていく */
function FileChip({ spot, animate }: { spot: FileSpot; animate: boolean }) {
  return (
    <motion.li
      layoutId={animate ? `file-${spot.path}` : undefined}
      layout={animate}
      transition={{ type: 'spring', stiffness: 260, damping: 24 }}
      className={`flex items-center gap-1 border-2 px-1.5 py-0.5 font-mono text-xs ${
        spot.lane === 'head' ? 'border-wood-dark bg-cream' : 'border-wood-dark bg-gold'
      }`}
      title={`${spot.path} (${spot.note}${spot.alsoChanged ? ', 作業ツリーでさらに変更あり' : ''})`}
    >
      <span aria-hidden className="font-extrabold">
        {NOTE[spot.note]}
      </span>
      <span className="max-w-[9rem] truncate">{spot.path}</span>
      {spot.alsoChanged ? <span aria-hidden>✎</span> : null}
    </motion.li>
  );
}

/**
 * Git の様子。
 * 上は3面（作業ツリー / インデックス / HEAD）。add でファイルが真ん中へ、commit で右へ滑っていく。
 * 下はコミットの図。ブランチが分かれると横の列にずれ、マージで合流する。
 * HEAD とブランチ名は札として付き、切り替えたりコミットしたりすると札が移動する。
 */
export function CommitGraph({ git, vfs, onCommand }: Props) {
  const t = useT();
  const animate = useMotionEnabled();
  const placed = useMemo(() => (git === null ? null : placeCommits(git)), [git]);
  const spots = useMemo(() => (git === null || vfs === undefined ? [] : fileSpots(git, vfs)), [git, vfs]);

  if (git === null || placed === null) {
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

  const head = headCommit(git);
  const branch = currentBranch(git);
  const branchesAt = new Map<string, string[]>();
  for (const [ref, hash] of git.refs) {
    if (!ref.startsWith('refs/heads/')) continue;
    branchesAt.set(hash, [...(branchesAt.get(hash) ?? []), ref.slice('refs/heads/'.length)]);
  }
  const branchNames = [...branchesAt.values()].flat();
  const byHash = new Map(placed.commits.map((c) => [c.hash, c]));
  const x = (col: number) => COL / 2 + col * COL;
  const y = (row: number) => TOP + row * ROW;
  const graphWidth = placed.columns * COL + 8;
  const height = Math.max(placed.commits.length * ROW + TOP, 80);

  return (
    <div className="h-full overflow-auto p-4">
      {onCommand ? (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <p className="text-xs text-ink-soft">{t('viz.clickHint')}</p>
          {placed.commits.length > 0 ? (
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
          ) : null}
        </div>
      ) : null}

      <LayoutGroup>
        {/* 3面。いちばん新しい中身がいる面にファイルの札が立つ */}
        {vfs !== undefined ? (
          <section aria-label={t('viz.threeTrees')} className="grid grid-cols-3 gap-2">
            {LANES.map(({ lane, term, lead }, i) => (
              <div key={lane} data-lane={lane} className="flex min-w-0 flex-col border-4 border-wood-dark bg-cream">
                <div className="plate flex items-center gap-1 px-2 py-1 text-xs font-extrabold">
                  <Term term={term} />
                  <span className="ml-auto font-normal opacity-80">{lead}</span>
                </div>
                <ul className="flex min-h-[64px] flex-col gap-1 p-2">
                  {spots
                    .filter((s) => s.lane === lane)
                    .map((spot) => (
                      <FileChip key={spot.path} spot={spot} animate={animate} />
                    ))}
                </ul>
                <p className="border-t-2 border-[var(--cream-dark)] px-2 py-0.5 text-center font-mono text-[11px] text-ink-soft">
                  {i === 0 ? 'git add →' : i === 1 ? 'git commit →' : `HEAD → ${branch ?? head?.slice(0, 7) ?? '—'}`}
                </p>
              </div>
            ))}
          </section>
        ) : null}

        {/* コミットの図 */}
        {placed.commits.length === 0 ? (
          <p className="mt-4 text-sm text-ink-soft">{t('viz.noCommits')}</p>
        ) : (
          <div className="relative mt-4" style={{ height }}>
            <svg className="absolute left-0 top-0" width={graphWidth} height={height} aria-hidden>
              {placed.edges.map((edge) => {
                const from = byHash.get(edge.from);
                const to = byHash.get(edge.to);
                if (!from || !to) return null;
                const x1 = x(from.col);
                const y1 = y(from.row);
                const x2 = x(to.col);
                const y2 = y(to.row);
                // 列が変わる線は、途中で曲げて「横にずれた」「戻ってきた」が分かるようにする
                const d = edge.bend
                  ? `M ${String(x1)} ${String(y1)} C ${String(x1)} ${String(y1 + ROW * 0.6)}, ${String(x2)} ${String(y2 - ROW * 0.6)}, ${String(x2)} ${String(y2)}`
                  : `M ${String(x1)} ${String(y1)} L ${String(x2)} ${String(y2)}`;
                return (
                  <path
                    key={`${edge.from}-${edge.to}`}
                    data-bend={edge.bend ? 'true' : 'false'}
                    d={d}
                    fill="none"
                    stroke="var(--wood)"
                    strokeWidth={5}
                  />
                );
              })}
              {placed.commits.map((c) => (
                <circle
                  key={c.hash}
                  data-col={c.col}
                  cx={x(c.col)}
                  cy={y(c.row)}
                  r={DOT}
                  fill={c.hash === head ? 'var(--gold)' : 'var(--cream-dark)'}
                  stroke={c.hash === head ? 'var(--bad)' : 'var(--wood-dark)'}
                  strokeWidth={4}
                />
              ))}
            </svg>

            {placed.commits.map((c) => {
              const labels = branchesAt.get(c.hash) ?? [];
              return (
                <div
                  key={c.hash}
                  className="absolute flex min-w-0 items-center gap-2"
                  style={{ top: y(c.row) - 18, left: graphWidth + 6, right: 0, height: 36 }}
                >
                  <div className="min-w-0 flex-1 border-2 border-wood-dark bg-cream px-2 py-0.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        disabled={!onCommand}
                        aria-label={t('viz.showCommit')}
                        title={gitCommands.show(c.hash)}
                        className="font-mono text-xs text-ink-soft underline decoration-dotted disabled:no-underline"
                        onClick={() => {
                          onCommand?.(gitCommands.show(c.hash));
                        }}
                      >
                        {c.hash.slice(0, 7)}
                      </button>
                      {labels.map((name) => (
                        <motion.button
                          key={name}
                          layoutId={animate ? `branch-${name}` : undefined}
                          layout={animate}
                          type="button"
                          disabled={!onCommand}
                          aria-label={t('viz.switchTo', { name })}
                          title={gitCommands.switchTo(name)}
                          className={`border-2 px-1.5 font-mono text-xs font-bold ${
                            name === branch ? 'border-[var(--bad)] bg-gold' : 'border-wood-dark bg-gold'
                          }`}
                          onClick={() => {
                            onCommand?.(gitCommands.switchTo(name));
                          }}
                        >
                          {name}
                        </motion.button>
                      ))}
                      {c.hash === head ? (
                        <motion.span
                          layoutId={animate ? 'head-tag' : undefined}
                          layout={animate}
                          data-head="true"
                          className="border-2 border-[var(--bad)] bg-cream px-1.5 font-mono text-xs font-bold text-[var(--bad)]"
                        >
                          HEAD{branch !== null ? ` → ${branch}` : ''}
                        </motion.span>
                      ) : null}
                      <span className="min-w-0 truncate text-xs">{c.message.split('\n')[0]}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </LayoutGroup>
    </div>
  );
}
