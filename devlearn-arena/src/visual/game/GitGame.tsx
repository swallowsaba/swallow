import { AnimatePresence, motion } from 'framer-motion';
import { useMemo } from 'react';
import { currentBranch, headCommit } from '@/engines/git/repository';
import type { GitState } from '@/engines/git/types';
import { relative } from '@/engines/kernel/path';
import type { VfsState } from '@/engines/kernel/vfs';
import { useT } from '@/i18n/useT';
import { useMotionEnabled } from '@/ui/motion';
import { gitCommands, type RunCommand } from '../commands';
import { fileSpots, gitChanges, placeCommits, type FileSpot, type Lane } from '../gitModel';
import { clip, textWidth, type Box } from '../sceneKit';
import { EmptyWorld, GameStage } from './GameStage';
import { BUILDING_H, BUILDING_W, CRATE_ROW, layoutRailway, trackPath } from './gitRailway';
import { Sprite } from './pixel';
import { CRATE, cratePalette, HERO, heroPalette, INK } from './sprites';
import { Cart, Castle, Clickable, Flag, GOLD, House, Rails, Sign, Sparkle, STONE, STONE_DARK } from './scenery';

interface Props {
  git: GitState | null;
  previous?: GitState | null;
  vfs?: VfsState;
  cwd?: string;
  onCommand?: RunCommand;
}

const COPY_STEP = 0.6;

const NOTE_MARK: Record<FileSpot['note'], string> = { new: '新', modified: '変', deleted: '消', clean: '✓' };
const NOTE_TONE: Record<FileSpot['note'], string | undefined> = {
  new: '#79c46a',
  modified: '#e8823c',
  deleted: '#b9b2a4',
  clean: undefined,
};

const LANE_TEXT: Record<Lane, { name: 'game.git.workshop' | 'game.git.cart' | 'game.git.vault'; lead: 'game.git.workshopLead' | 'game.git.cartLead' | 'game.git.vaultLead' }> = {
  worktree: { name: 'game.git.workshop', lead: 'game.git.workshopLead' },
  index: { name: 'game.git.cart', lead: 'game.git.cartLead' },
  head: { name: 'game.git.vault', lead: 'game.git.vaultLead' },
};

/**
 * Git の鉄道。
 * 上の3つの建物（作業場・荷台・倉庫）の前に、ファイルの木箱が置かれる。git add で荷台へ、git commit で倉庫へ運ばれる。
 * 下の線路では、コミットが駅になり、ブランチは駅に立つ旗、HEAD は主人公が立っている駅。
 * 駅を押すと git show、旗を押すと git switch、作業場の木箱で git add、荷台の木箱で git restore --staged を打つ。
 */
export function GitGame({ git, previous, vfs, cwd, onCommand }: Props) {
  const t = useT();
  const animate = useMotionEnabled();
  const changes = useMemo(() => gitChanges(previous, git), [previous, git]);
  const placed = useMemo(() => (git === null ? null : placeCommits(git, changes.ghostTips)), [git, changes]);
  const spots = useMemo(() => (git === null || vfs === undefined ? [] : fileSpots(git, vfs)), [git, vfs]);

  if (git === null || placed === null) {
    return <EmptyWorld title={t('game.git.title')} lead={t('game.git.noRepo')} testId="game-git" />;
  }

  const rail = layoutRailway(spots, placed.commits, placed.columns, changes.copies.length > 0);
  const head = headCommit(git);
  const branch = currentBranch(git);
  const branchesAt = new Map<string, string[]>();
  for (const [ref, hash] of git.refs) {
    if (!ref.startsWith('refs/heads/')) continue;
    branchesAt.set(hash, [...(branchesAt.get(hash) ?? []), ref.slice('refs/heads/'.length)]);
  }
  const branchNames = [...branchesAt.values()].flat();
  const byHash = new Map(placed.commits.map((c) => [c.hash, c]));
  const argFor = (path: string) => (cwd === undefined ? path : relative(cwd, `${git.root}/${path}`));
  const crateCommand = (spot: FileSpot): string | null =>
    spot.lane === 'worktree' ? gitCommands.stage(argFor(spot.path)) : spot.lane === 'index' ? gitCommands.unstage(argFor(spot.path)) : null;
  const copyIndex = new Map(changes.copies.map((c, i) => [c.to, i]));
  const delayOf = (hash: string) => (animate ? (copyIndex.get(hash) ?? 0) * COPY_STEP : 0);

  const headCommitPlaced = head === null ? undefined : byHash.get(head);
  const heroAt = headCommitPlaced ? rail.station(headCommitPlaced) : { x: rail.station({ row: 0, col: 0 }).x, y: rail.railTop };

  const occupied: Box[] = [
    { x: 0, y: 0, w: rail.width, h: rail.railTop - 40 },
    { x: 0, y: rail.railTop - 60, w: rail.width, h: rail.height - rail.railTop + 60 },
  ];

  return (
    <GameStage
      title={t('game.git.title')}
      testId="game-git"
      width={rail.width}
      height={rail.height}
      occupied={occupied}
      interactive={onCommand !== undefined}
      hud={
        <>
          <span className="knob px-2 py-0.5 font-mono text-xs" data-testid="game-head">
            HEAD → {branch ?? (head === null ? '—' : head.slice(0, 7))}
          </span>
          {onCommand && placed.commits.length > 0 ? (
            <button
              type="button"
              className="knob px-2 py-0.5 text-xs"
              title={gitCommands.branchOut(branchNames)}
              onClick={() => {
                onCommand(gitCommands.branchOut(branchNames));
              }}
            >
              {t('game.git.branchOut')}
            </button>
          ) : null}
        </>
      }
      footer={
        changes.copies.length > 0 ? (
          <p data-testid="rebase-note" className="mt-2 border-l-4 border-[var(--gold-dark)] px-2 py-1 text-xs font-bold">
            {t('game.git.rebase', { n: changes.copies.length })}
          </p>
        ) : undefined
      }
    >
      {/* 敷地（建物のある広場） */}
      <rect x={16} y={16} width={rail.width - 32} height={rail.railTop - 76} fill="#d9c39a" stroke="#b79a6d" strokeWidth={4} />

      {/* 3つの建物 */}
      {rail.buildings.map(({ lane, box }) => {
        const text = LANE_TEXT[lane];
        const count = spots.filter((s) => s.lane === lane).length;
        return (
          <g key={lane} data-lane={lane}>
            {lane === 'worktree' ? (
              <House {...box} wall="#e8d3a8" roof="#7a5230" />
            ) : lane === 'index' ? (
              <Cart {...box} y={box.y + 24} h={box.h - 24} />
            ) : (
              <Castle {...box} lit={lane === 'head' && changes.newCommits.size > 0} />
            )}
            <Sign cx={box.x + BUILDING_W / 2} y={box.y - 34} text={`${t(text.name)}（${t(text.lead)}）`} maxWidth={BUILDING_W + 40} />
            {count === 0 ? (
              <text x={box.x + 10} y={box.y + BUILDING_H + 34} fontSize={12} fontFamily="var(--f-mono)" fill="#5d4630">
                {t('game.git.empty')}
              </text>
            ) : null}
            {rail.hidden[lane] > 0 ? (
              <text x={box.x + 34} y={box.y + BUILDING_H + 34 + 6 * CRATE_ROW} fontSize={12} fontWeight={800} fontFamily="var(--f-mono)" fill={INK}>
                {t('game.fs.more', { n: rail.hidden[lane] })}
              </text>
            ) : null}
          </g>
        );
      })}

      {/* 建物のあいだの矢印 */}
      {rail.arrows.map((a) => (
        <g key={a.text} aria-hidden>
          <polygon
            points={`${String(a.x - 18)},${String(a.y - 8)} ${String(a.x + 4)},${String(a.y - 8)} ${String(a.x + 4)},${String(a.y - 16)} ${String(a.x + 20)},${String(a.y)} ${String(a.x + 4)},${String(a.y + 16)} ${String(a.x + 4)},${String(a.y + 8)} ${String(a.x - 18)},${String(a.y + 8)}`}
            fill={GOLD}
            stroke={INK}
            strokeWidth={2.5}
          />
          <text x={a.x} y={a.y + 32} fontSize={11} fontWeight={800} textAnchor="middle" fontFamily="var(--f-mono)" fill={INK}>
            git
          </text>
          <text x={a.x} y={a.y + 45} fontSize={11} fontWeight={800} textAnchor="middle" fontFamily="var(--f-mono)" fill={INK}>
            {a.text}
          </text>
        </g>
      ))}

      {/* 木箱。いちばん新しい中身がある建物の前へ運ばれる */}
      <AnimatePresence initial={false}>
        {rail.crates.map(({ spot, x, y }) => {
          const command = crateCommand(spot);
          return (
            <motion.g
              key={spot.path}
              data-file={spot.path}
              data-lane={spot.lane}
              initial={animate ? { x, y: y - 40, opacity: 0 } : false}
              animate={{ x, y, opacity: 1 }}
              exit={animate ? { opacity: 0, transition: { duration: 0.3 } } : undefined}
              transition={animate ? { type: 'spring', stiffness: 140, damping: 20 } : { duration: 0 }}
            >
              <Clickable command={command} onCommand={onCommand} label={spot.path}>
                <rect x={-2} y={-2} width={BUILDING_W} height={CRATE_ROW - 2} fill="transparent" />
                <Sprite map={CRATE} palette={cratePalette(NOTE_TONE[spot.note])} scale={2} />
                <text x={30} y={13} fontSize={12} fontWeight={800} fontFamily="var(--f-mono)" dominantBaseline="middle" fill={INK} stroke="#f6e8cd" strokeWidth={3} paintOrder="stroke">
                  {`${NOTE_MARK[spot.note]} ${clip(spot.path, BUILDING_W - 60, 12)}${spot.alsoChanged ? ' ✎' : ''}`}
                </text>
              </Clickable>
            </motion.g>
          );
        })}
      </AnimatePresence>

      {/* 線路 */}
      {placed.commits.length === 0 ? (
        <Sign cx={rail.width / 2} y={rail.railTop - 12} text={t('game.git.noCommits')} maxWidth={rail.width - 40} />
      ) : null}
      {placed.edges.map((edge) => {
        const from = byHash.get(edge.from);
        const to = byHash.get(edge.to);
        if (!from || !to) return null;
        return (
          <g key={`${edge.from}-${edge.to}`} data-bend={edge.bend ? 'true' : 'false'}>
            <Rails d={trackPath(rail.station(from), rail.station(to))} faded={from.ghost} />
          </g>
        );
      })}
      {/* 上へ伸びる線路の先（まだ駅の無いところ） */}
      {placed.commits
        .filter((c) => !c.ghost && c.parents.length === 0)
        .map((c) => {
          const at = rail.station(c);
          return <Rails key={`root-${c.hash}`} d={`M ${String(at.x)} ${String(at.y)} L ${String(at.x)} ${String(at.y + 30)}`} />;
        })}

      {changes.copies.map(({ from, to }) => {
        const a = byHash.get(from);
        const b = byHash.get(to);
        if (!a || !b) return null;
        const p1 = rail.station(a);
        const p2 = rail.station(b);
        const bulge = Math.max(p1.x, p2.x) + 60;
        return (
          <motion.path
            key={`copy-${from}`}
            data-copy={`${from.slice(0, 7)}>${to.slice(0, 7)}`}
            d={`M ${String(p1.x + 24)} ${String(p1.y)} C ${String(bulge)} ${String(p1.y)}, ${String(bulge)} ${String(p2.y)}, ${String(p2.x + 24)} ${String(p2.y)}`}
            fill="none"
            stroke="#b8862b"
            strokeWidth={4}
            strokeDasharray="6 6"
            initial={animate ? { pathLength: 0, opacity: 0 } : false}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: COPY_STEP * 0.8, delay: delayOf(to) }}
          />
        );
      })}

      {/* 駅と名札 */}
      {placed.commits.map((c) => {
        const at = rail.station(c);
        const fresh = changes.newCommits.has(c.hash);
        const isHead = c.hash === head;
        const labels = branchesAt.get(c.hash) ?? [];
        const hashText = c.hash.slice(0, 7);
        let cursor = rail.labelX + textWidth(hashText, 13) + 16;
        return (
          <motion.g
            key={c.hash}
            data-commit={c.hash.slice(0, 7)}
            data-col={c.col}
            data-ghost={c.ghost ? 'true' : 'false'}
            opacity={c.ghost ? 0.5 : 1}
            initial={animate && fresh ? { opacity: 0, y: -40 } : false}
            animate={{ opacity: c.ghost ? 0.5 : 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 220, damping: 18, delay: delayOf(c.hash) }}
          >
            <line x1={at.x + 26} x2={rail.labelX - 8} y1={at.y} y2={at.y} stroke="#b79a6d" strokeWidth={2} strokeDasharray="3 5" />
            <Clickable command={gitCommands.show(c.hash)} onCommand={onCommand} label={c.hash}>
              <rect x={at.x - 24} y={at.y - 15} width={48} height={30} fill={isHead ? GOLD : STONE} stroke={isHead ? '#c0392b' : INK} strokeWidth={3} strokeDasharray={c.ghost ? '5 4' : undefined} />
              <rect x={at.x - 24} y={at.y + 9} width={48} height={6} fill={STONE_DARK} />
              <text x={rail.labelX} y={at.y + 1} fontSize={13} fontWeight={800} fontFamily="var(--f-mono)" dominantBaseline="middle" fill="#5d4630" textDecoration="underline">
                {hashText}
              </text>
            </Clickable>
            {fresh ? <Sparkle x={at.x + 20} y={at.y - 18} animate={animate} delay={delayOf(c.hash)} /> : null}
            {labels.map((name) => {
              const x = cursor;
              cursor += textWidth(clip(name, 120, 11), 11) + 26;
              const moved = changes.movedBranches.has(name);
              return (
                <Clickable key={name} command={gitCommands.switchTo(name)} onCommand={onCommand} label={name} data-branch={name} data-moved={moved ? 'true' : 'false'}>
                  <Flag x={x + 2} y={at.y - 26} text={name} tone={name === branch ? GOLD : '#f6e8cd'} strong={name === branch} />
                  {moved ? <Sparkle x={x + 8} y={at.y - 28} animate={animate} /> : null}
                </Clickable>
              );
            })}
            <text x={cursor + 4} y={at.y + 1} fontSize={13} fontWeight={700} dominantBaseline="middle" fill={INK} stroke="#f6e8cd" strokeWidth={4} paintOrder="stroke">
              {clip(`${c.message.split('\n')[0] ?? ''}${c.ghost ? ` ${t('viz.ghostCommit')}` : ''}`, 320, 13)}
            </text>
          </motion.g>
        );
      })}

      {/* 主人公＝HEAD。いまの駅に立ち、切り替えやコミットで駅を移る */}
      <motion.g
        data-testid="hero"
        data-head={head === null ? '' : head.slice(0, 7)}
        initial={false}
        animate={{ x: heroAt.x - 44, y: heroAt.y - 50 }}
        transition={animate ? { type: 'spring', stiffness: 120, damping: 18 } : { duration: 0 }}
      >
        <ellipse cx={18} cy={47} rx={15} ry={5} fill="rgba(0,0,0,0.25)" />
        <Sprite map={HERO} palette={heroPalette('#3f6f8f')} scale={3} />
        <rect x={-6} y={-20} width={48} height={16} fill="#c0392b" stroke={INK} strokeWidth={2} />
        <text x={18} y={-11} fontSize={10} fontWeight={800} textAnchor="middle" dominantBaseline="middle" fill="#fff" fontFamily="var(--f-mono)">
          HEAD
        </text>
      </motion.g>
    </GameStage>
  );
}
