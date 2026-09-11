import { LayoutGroup, motion } from 'framer-motion';
import { useMemo } from 'react';
import { currentBranch, headCommit } from '@/engines/git/repository';
import type { GitState } from '@/engines/git/types';
import type { VfsState } from '@/engines/kernel/vfs';
import { useMotionEnabled } from '@/ui/motion';
import { useT } from '@/i18n/useT';
import { Term } from '@/ui/Term';
import { gitCommands, type RunCommand } from './commands';
import { fileSpots, gitChanges, placeCommits, type FileSpot, type Lane } from './gitModel';
import { FILL } from './sceneKit';

interface Props {
  git: GitState | null;
  /** 1つ前の状態。新しいコミット・動いたブランチを光らせ、rebase の複製を見せるのに使う */
  previous?: GitState | null;
  /** 作業ツリーを読むために使う。無ければ3面の欄は出さない */
  vfs?: VfsState;
  /** 図の操作をコマンドとして端末に流す。無ければ見るだけの図になる */
  onCommand?: RunCommand;
}

const ROW = 56;
const COL = 34;
const TOP = 22;
const DOT = 13;
/** rebase の複製を1つずつ見せる間隔（秒） */
const COPY_STEP = 0.6;

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
 * rebase のあとは、元のコミットを薄く残し、新しい親にぶら下がった複製が1つずつ現れる。
 */
export function CommitGraph({ git, previous, vfs, onCommand }: Props) {
  const t = useT();
  const animate = useMotionEnabled();
  const changes = useMemo(() => gitChanges(previous, git), [previous, git]);
  const placed = useMemo(() => (git === null ? null : placeCommits(git, changes.ghostTips)), [git, changes]);
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
  // 複製の線は右へ膨らむので、その分だけ札を右に寄せる
  const graphWidth = placed.columns * COL + 8 + (changes.copies.length > 0 ? COL : 0);
  const height = Math.max(placed.commits.length * ROW + TOP, 80);
  // 複製されたコミットは、付け直した順に1つずつ現れる
  const copyIndex = new Map(changes.copies.map((c, i) => [c.to, i]));
  const delayOf = (hash: string) => (animate ? (copyIndex.get(hash) ?? 0) * COPY_STEP : 0);

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

        {changes.copies.length > 0 ? (
          <p data-testid="rebase-note" className="mt-3 border-l-4 border-[var(--gold-dark)] bg-cream px-2 py-1 text-xs font-bold">
            {t('viz.rebaseCopied', { n: changes.copies.length })}
          </p>
        ) : null}

        {/* コミットの図 */}
        {placed.commits.length === 0 ? (
          <p className="mt-4 text-sm text-ink-soft">{t('viz.noCommits')}</p>
        ) : (
          <div className="relative mt-4" style={{ height }}>
            <svg className="absolute left-0 top-0" width={graphWidth} height={height} aria-hidden>
              <defs>
                <marker id="copy-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--gold-dark)" />
                </marker>
              </defs>
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
                const fresh = changes.newCommits.has(from.hash);
                return (
                  <motion.path
                    key={`${edge.from}-${edge.to}`}
                    data-bend={edge.bend ? 'true' : 'false'}
                    d={d}
                    fill="none"
                    stroke="var(--wood)"
                    strokeWidth={5}
                    strokeDasharray={from.ghost ? '6 6' : undefined}
                    opacity={from.ghost ? 0.4 : 1}
                    initial={animate && fresh ? { pathLength: 0 } : false}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.4, delay: delayOf(from.hash) }}
                  />
                );
              })}

              {/* rebase の複製。元のコミットから、新しい親にぶら下がった複製へ線を引く */}
              {changes.copies.map(({ from, to }) => {
                const a = byHash.get(from);
                const b = byHash.get(to);
                if (!a || !b) return null;
                const x1 = x(a.col) + DOT;
                const x2 = x(b.col) + DOT;
                const y1 = y(a.row);
                const y2 = y(b.row);
                const bulge = Math.max(x1, x2) + COL;
                return (
                  <motion.path
                    key={`copy-${from}`}
                    data-copy={`${from.slice(0, 7)}>${to.slice(0, 7)}`}
                    d={`M ${String(x1)} ${String(y1)} C ${String(bulge)} ${String(y1)}, ${String(bulge)} ${String(y2)}, ${String(x2)} ${String(y2)}`}
                    fill="none"
                    stroke="var(--gold-dark)"
                    strokeWidth={3}
                    strokeDasharray="4 5"
                    markerEnd="url(#copy-arrow)"
                    initial={animate ? { pathLength: 0, opacity: 0 } : false}
                    animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ duration: COPY_STEP * 0.8, delay: delayOf(to) }}
                  />
                );
              })}

              {placed.commits.map((c) => {
                const fresh = changes.newCommits.has(c.hash);
                const isHead = c.hash === head;
                return (
                  <g key={c.hash}>
                    {fresh ? (
                      // 変わったところは光る
                      <motion.circle
                        data-glow="true"
                        cx={x(c.col)}
                        cy={y(c.row)}
                        r={DOT + 7}
                        fill={FILL.glow}
                        initial={animate ? { opacity: 0 } : false}
                        animate={animate ? { opacity: [0, 0.9, 0.45] } : { opacity: 0.6 }}
                        transition={{ duration: 1.2, delay: delayOf(c.hash) }}
                      />
                    ) : null}
                    <motion.circle
                      data-col={c.col}
                      data-ghost={c.ghost ? 'true' : 'false'}
                      cx={x(c.col)}
                      cy={y(c.row)}
                      r={DOT}
                      fill={c.ghost ? 'var(--cream)' : isHead ? 'var(--gold)' : 'var(--cream-dark)'}
                      stroke={isHead ? 'var(--bad)' : 'var(--wood-dark)'}
                      strokeWidth={4}
                      strokeDasharray={c.ghost ? '4 4' : undefined}
                      opacity={c.ghost ? 0.5 : 1}
                      style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
                      initial={animate && fresh ? { scale: 0 } : false}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 18, delay: delayOf(c.hash) }}
                    />
                  </g>
                );
              })}
            </svg>

            {placed.commits.map((c) => {
              const labels = branchesAt.get(c.hash) ?? [];
              return (
                <motion.div
                  key={c.hash}
                  className="absolute flex min-w-0 items-center gap-2"
                  style={{ top: y(c.row) - 18, left: graphWidth + 6, right: 0, height: 36 }}
                  initial={animate && changes.newCommits.has(c.hash) ? { opacity: 0 } : false}
                  animate={{ opacity: c.ghost ? 0.55 : 1 }}
                  transition={{ delay: delayOf(c.hash) }}
                >
                  <div
                    className={`min-w-0 flex-1 border-2 bg-cream px-2 py-0.5 ${
                      c.ghost ? 'border-dashed border-wood' : 'border-wood-dark'
                    }`}
                  >
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
                      {labels.map((name) => {
                        const moved = changes.movedBranches.has(name);
                        return (
                          <motion.button
                            key={name}
                            layoutId={animate ? `branch-${name}` : undefined}
                            layout={animate}
                            type="button"
                            disabled={!onCommand}
                            aria-label={t('viz.switchTo', { name })}
                            title={gitCommands.switchTo(name)}
                            data-moved={moved ? 'true' : 'false'}
                            className={`border-2 px-1.5 font-mono text-xs font-bold ${
                              name === branch ? 'border-[var(--bad)] bg-gold' : 'border-wood-dark bg-gold'
                            } ${moved ? 'shadow-[0_0_0_3px_var(--gold),0_0_12px_var(--gold)]' : ''}`}
                            onClick={() => {
                              onCommand?.(gitCommands.switchTo(name));
                            }}
                          >
                            {name}
                          </motion.button>
                        );
                      })}
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
                      {c.ghost ? (
                        <span className="font-mono text-[11px] text-ink-soft">{t('viz.ghostCommit')}</span>
                      ) : null}
                      <span className="min-w-0 truncate text-xs">{c.message.split('\n')[0]}</span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </LayoutGroup>
    </div>
  );
}
