import { currentBranch, headCommit, treeFiles } from '@/engines/git/repository';
import { tagNames, resolveRef } from '@/engines/git/refs';
import type { GitState } from '@/engines/git/types';
import type { VfsState } from '@/engines/kernel/vfs';
import { fileSpots, gitChanges, placeCommits } from '@/visual/gitModel';
import { colorOf, short, type Scene, type SceneItem, type Translate } from './types';

/**
 * Git の街（計画と建設）。
 * ブランチ = 通り、コミット = 通り沿いの完成した建物、HEAD = 市長の旗。
 * 作業ツリーの新しいファイル = 計画図 → git add で仮組み（骨組み）→ git commit で完成。
 * 変更したファイル = 改修工事（足場）、消したファイル = 取り壊し、タグ = 記念碑。
 */

const SITE_Y = 1;
const LANE_TOP = 7;
const LANE_GAP = 5;
const STEP_X = 3;

export function gitScene(git: GitState | null, vfs: VfsState, previous: GitState | null | undefined, t: Translate): Scene {
  const legend = [
    { sample: 'blueprint' as const, name: t('scape.git.legend.plan'), meaning: t('scape.git.legend.planMeaning'), command: 'git add <ファイル>' },
    { sample: 'scaffold' as const, name: t('scape.git.legend.repair'), meaning: t('scape.git.legend.repairMeaning'), command: 'git add <ファイル>' },
    { sample: 'frame' as const, name: t('scape.git.legend.frame'), meaning: t('scape.git.legend.frameMeaning'), command: 'git commit -m "…"' },
    { sample: 'solid' as const, name: t('scape.git.legend.done'), meaning: t('scape.git.legend.doneMeaning'), command: 'git log' },
    { sample: 'road' as const, name: t('scape.git.legend.street'), meaning: t('scape.git.legend.streetMeaning'), command: 'git switch -c <名前>' },
    { sample: 'marker' as const, icon: '🚩', name: t('scape.git.legend.flag'), meaning: t('scape.git.legend.flagMeaning'), command: 'git switch <名前>' },
    { sample: 'ruin' as const, name: t('scape.git.legend.ruin'), meaning: t('scape.git.legend.ruinMeaning'), command: 'git rm <ファイル>' },
  ];
  if (git === null) {
    return {
      width: 16,
      height: 10,
      items: [{ type: 'plot', id: 'vacant', x: 2, y: 2, w: 10, d: 6, tone: 'muted', label: t('scape.git.vacant') }],
      stats: [],
      legend,
      empty: { title: t('scape.git.noRepoTitle'), text: t('scape.git.noRepo') },
      focus: { x: 7, y: 5 },
    };
  }

  const items: SceneItem[] = [];
  const changes = gitChanges(previous, git);
  const { commits, edges } = placeCommits(git, changes.ghostTips);
  const maxRow = Math.max(0, ...commits.map((c) => c.row));
  const pos = new Map(commits.map((c) => [c.hash, { x: 2 + (maxRow - c.row) * STEP_X, y: LANE_TOP + c.col * LANE_GAP }]));
  const headHash = headCommit(git);
  const branch = currentBranch(git);

  // 通り（ブランチの列）
  const columns = new Set(commits.map((c) => c.col));
  if (columns.size === 0) columns.add(0);
  for (const col of columns) {
    const inCol = commits.filter((c) => c.col === col);
    const lastX = Math.max(4, ...inCol.map((c) => (pos.get(c.hash)?.x ?? 0) + 3));
    const y = LANE_TOP + col * LANE_GAP + 2;
    items.push({
      type: 'road',
      id: `lane:${String(col)}`,
      cells: Array.from({ length: lastX + 1 }, (_, x) => ({ x, y })),
      kind: col === 0 ? 'main' : 'street',
    });
  }

  // コミット = 完成した建物
  const liveCount = commits.filter((c) => !c.ghost).length;
  for (const c of commits) {
    const p = pos.get(c.hash);
    if (!p) continue;
    const files = treeFiles(git, c.hash).size;
    const merge = c.parents.length > 1;
    items.push({
      type: 'building',
      id: `commit:${c.hash}`,
      x: p.x,
      y: p.y,
      w: 2,
      d: 2,
      floors: Math.max(1, Math.min(6, files)),
      style: c.ghost ? 'ghost' : 'solid',
      color: c.ghost ? '#b8b8b8' : colorOf(`c${String(c.col)}`),
      roof: merge ? 'dome' : 'gable',
      label: short(c.hash),
      changed: changes.newCommits.has(c.hash),
      badges: c.hash === headHash ? [{ icon: '🚩', tone: 'accent' }] : undefined,
      info: {
        title: t('scape.git.commitTitle', { hash: short(c.hash) }),
        kind: c.ghost ? t('scape.git.ghostKind') : merge ? t('scape.git.mergeKind') : t('scape.git.commitKind'),
        lines: [c.message, t('scape.git.commitFiles', { n: files })],
        next: c.ghost ? t('scape.git.ghostNext') : t('scape.git.commitNext', { hash: short(c.hash) }),
      },
    });
  }
  for (const e of edges) {
    if (!e.bend) continue;
    const a = pos.get(e.from);
    const b = pos.get(e.to);
    if (!a || !b) continue;
    items.push({ type: 'link', id: `edge:${e.from}:${e.to}`, from: { x: a.x + 1, y: a.y + 1 }, to: { x: b.x + 1, y: b.y + 1 }, style: 'solid', tone: 'info' });
  }

  // ブランチの札と市長の旗
  for (const [ref, hash] of git.refs) {
    if (!ref.startsWith('refs/heads/')) continue;
    const name = ref.slice('refs/heads/'.length);
    const p = pos.get(hash);
    if (!p) continue;
    const here = name === branch;
    items.push({
      type: 'marker',
      id: `branch:${name}`,
      x: p.x + 2.4,
      y: p.y + 2,
      icon: here ? '🚩' : '🪧',
      label: name,
      tone: here ? 'accent' : 'info',
      info: {
        title: t('scape.git.branchTitle', { name }),
        kind: t('scape.git.branchKind'),
        lines: [here ? t('scape.git.branchHere') : t('scape.git.branchOther')],
        next: here ? t('scape.git.branchHereNext') : t('scape.git.branchNext', { name }),
      },
    });
  }
  for (const tag of tagNames(git)) {
    const hash = resolveRef(git, `refs/tags/${tag}`);
    const p = hash === undefined ? undefined : pos.get(hash);
    if (!p) continue;
    items.push({
      type: 'marker',
      id: `tag:${tag}`,
      x: p.x - 0.4,
      y: p.y + 1,
      icon: '🗿',
      label: tag,
      tone: 'warn',
      info: { title: t('scape.git.tagTitle', { name: tag }), kind: t('scape.git.tagKind'), lines: [], next: undefined },
    });
  }
  if (git.stash.length > 0) {
    items.push({
      type: 'marker',
      id: 'stash',
      x: 0.5,
      y: SITE_Y + 4.5,
      icon: '📦',
      label: t('scape.git.stashLabel', { n: git.stash.length }),
      tone: 'info',
      info: { title: t('scape.git.stashTitle'), kind: t('scape.git.stashKind'), lines: git.stash.map((s) => s.message), next: t('scape.git.stashNext') },
    });
  }

  // 工事区画：計画図・改修工事（作業ツリー）と、仮組み（インデックス）
  const spots = fileSpots(git, vfs).filter((s) => s.lane !== 'head');
  const planned = spots.filter((s) => s.lane === 'worktree');
  const staged = spots.filter((s) => s.lane === 'index');
  const planW = Math.max(4, planned.length * 3 + 1);
  const frameX = planW + 2;
  const frameW = Math.max(4, staged.length * 3 + 1);
  items.push({ type: 'plot', id: 'site:plan', x: 0, y: SITE_Y - 0.5, w: planW, d: 3.5, tone: 'info', label: t('scape.git.sitePlan') });
  items.push({ type: 'plot', id: 'site:frame', x: frameX, y: SITE_Y - 0.5, w: frameW, d: 3.5, tone: 'warn', label: t('scape.git.siteFrame') });
  planned.forEach((s, i) => {
    const deleted = s.note === 'deleted';
    const fresh = s.note === 'new';
    items.push({
      type: 'building',
      id: `file:work:${s.path}`,
      x: 1 + i * 3,
      y: SITE_Y,
      w: 2,
      d: 2,
      floors: 2,
      style: deleted ? 'ruin' : fresh ? 'blueprint' : 'scaffold',
      color: '#5aa6e9',
      roof: 'gable',
      label: s.path,
      info: {
        title: s.path,
        kind: deleted ? t('scape.git.deletedKind') : fresh ? t('scape.git.planKind') : t('scape.git.repairKind'),
        lines: [deleted ? t('scape.git.deletedLine') : fresh ? t('scape.git.planLine') : t('scape.git.repairLine')],
        next: deleted ? t('scape.git.deletedNext', { path: s.path }) : t('scape.git.addNext', { path: s.path }),
      },
    });
  });
  staged.forEach((s, i) => {
    const deleted = s.note === 'deleted';
    items.push({
      type: 'building',
      id: `file:index:${s.path}`,
      x: frameX + 1 + i * 3,
      y: SITE_Y,
      w: 2,
      d: 2,
      floors: 2,
      style: deleted ? 'ruin' : 'frame',
      color: '#f2b233',
      roof: 'gable',
      label: s.path,
      badges: s.alsoChanged ? [{ icon: '🔧', tone: 'warn' }] : undefined,
      info: {
        title: s.path,
        kind: deleted ? t('scape.git.stagedDeleteKind') : t('scape.git.frameKind'),
        lines: [t('scape.git.frameLine'), ...(s.alsoChanged ? [t('scape.git.alsoChanged')] : [])],
        next: t('scape.git.commitNextFrame'),
      },
    });
  });
  const tip = headHash === null ? undefined : pos.get(headHash);
  if (staged.length > 0) {
    items.push({
      type: 'link',
      id: 'site:commit',
      from: { x: frameX + frameW / 2, y: SITE_Y + 2.5 },
      to: tip ? { x: tip.x + 1, y: tip.y } : { x: 3, y: LANE_TOP },
      style: 'dashed',
      tone: 'warn',
      flow: true,
      info: { title: t('scape.git.commitArrow'), kind: t('scape.git.frameKind'), lines: [], next: t('scape.git.commitNextFrame') },
    });
  }

  const width = Math.max(frameX + frameW + 2, 2 + (maxRow + 1) * STEP_X + 4);
  const height = LANE_TOP + Math.max(1, columns.size) * LANE_GAP + 1;
  return {
    width,
    height,
    items,
    legend,
    stats: [
      { icon: '🏢', label: t('scape.git.stat.done'), value: liveCount },
      { icon: '🏗', label: t('scape.git.stat.frame'), value: staged.length },
      { icon: '🔧', label: t('scape.git.stat.repair'), value: planned.filter((s) => s.note === 'modified').length },
      { icon: '📐', label: t('scape.git.stat.plan'), value: planned.filter((s) => s.note === 'new').length },
      { icon: '🛣', label: t('scape.git.stat.streets'), value: [...git.refs.keys()].filter((r) => r.startsWith('refs/heads/')).length },
    ],
    focus: tip ? { x: tip.x, y: (tip.y + SITE_Y) / 2 } : { x: 4, y: 4 },
  };
}
