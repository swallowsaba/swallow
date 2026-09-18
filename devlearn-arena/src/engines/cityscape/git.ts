import { currentBranch, headCommit, treeFiles } from '@/engines/git/repository';
import { tagNames, resolveRef } from '@/engines/git/refs';
import type { GitState } from '@/engines/git/types';
import type { VfsState } from '@/engines/kernel/vfs';
import { fileSpots, gitChanges, placeCommits } from '@/visual/gitModel';
import { planTown, type PlanDistrict } from './plan';
import { colorOf, short, type Scene, type SceneItem, type Translate } from './types';

/**
 * Git の街（計画と建設）。
 *
 * ブランチ = 通り（街区ひと続き）、コミット = 通りに面して古い順に並ぶ完成した建物、HEAD = 市長の旗。
 * 作業ツリーの新しいファイル = 計画図 → git add で仮組み（骨組み）→ git commit で完成。
 * 変更したファイル = 改修工事（足場）、消したファイル = 取り壊し、タグ = 記念碑。
 *
 * 通りは碁盤の目の中に並び、通りと通りの間には必ず道が通る。
 */

/** 1 本の通りに並べるコミットの上限。これより古いものは畳む */
const MAX_PER_LANE = 12;

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
    const plan = planTown([{ id: 'vacant', label: t('scape.git.vacant'), tone: 'muted', members: [], min: 6 }]);
    return {
      width: plan.width,
      height: plan.height,
      plan,
      items: [],
      stats: [],
      legend,
      empty: { title: t('scape.git.noRepoTitle'), text: t('scape.git.noRepo') },
      focus: { x: plan.width / 2, y: plan.height / 2 },
    };
  }

  const items: SceneItem[] = [];
  const changes = gitChanges(previous, git);
  const { commits, edges } = placeCommits(git, changes.ghostTips);
  const headHash = headCommit(git);
  const branch = currentBranch(git);

  // 通り = ブランチの列。古い順（row の大きい順）に並べ、そのまま区画の順にする
  const lanes = [...new Set(commits.map((c) => c.col))].sort((a, b) => a - b);
  const laneCommits = new Map(
    lanes.map((col) => [
      col,
      commits
        .filter((c) => c.col === col)
        .sort((a, b) => b.row - a.row)
        .slice(-MAX_PER_LANE),
    ]),
  );

  // どの通りがどのブランチか（先端のコミットから引く）
  const laneName = new Map<number, string>();
  for (const [ref, hash] of git.refs) {
    if (!ref.startsWith('refs/heads/')) continue;
    const tip = commits.find((c) => c.hash === hash);
    if (tip && !laneName.has(tip.col)) laneName.set(tip.col, ref.slice('refs/heads/'.length));
  }

  const spots = fileSpots(git, vfs).filter((s) => s.lane !== 'head');
  const planned = spots.filter((s) => s.lane === 'worktree');
  const staged = spots.filter((s) => s.lane === 'index');

  const districts: PlanDistrict[] = [
    { id: 'site:plan', label: t('scape.git.sitePlan'), tone: 'info', members: planned.map((s) => `file:work:${s.path}`), min: 2 },
    { id: 'site:frame', label: t('scape.git.siteFrame'), tone: 'warn', members: staged.map((s) => `file:index:${s.path}`), min: 2 },
    ...lanes.map((col): PlanDistrict => ({
      id: `lane:${String(col)}`,
      label: laneName.get(col) ?? t('scape.git.laneOther'),
      tone: laneName.get(col) === branch ? 'accent' : 'info',
      shape: 'row',
      members: (laneCommits.get(col) ?? []).map((c) => `commit:${c.hash}`),
      min: 2,
    })),
  ];
  const plan = planTown(districts);
  const lotOf = (id: string) => plan.lots.get(id);

  // コミット = 完成した建物
  const liveCount = commits.filter((c) => !c.ghost).length;
  for (const c of commits) {
    const lot = lotOf(`commit:${c.hash}`);
    if (!lot) continue;
    const files = treeFiles(git, c.hash).size;
    const merge = c.parents.length > 1;
    items.push({
      type: 'building',
      id: `commit:${c.hash}`,
      x: lot.x + 0.15,
      y: lot.y + 0.15,
      w: lot.w - 0.3,
      d: lot.d - 0.3,
      facing: lot.facing,
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

  // 通りをまたぐつながり（分かれ道と合流）
  for (const e of edges) {
    if (!e.bend) continue;
    const a = lotOf(`commit:${e.from}`);
    const b = lotOf(`commit:${e.to}`);
    if (!a || !b) continue;
    items.push({
      type: 'link',
      id: `edge:${e.from}:${e.to}`,
      from: { x: a.x + a.w / 2, y: a.y + a.d / 2 },
      to: { x: b.x + b.w / 2, y: b.y + b.d / 2 },
      style: 'solid',
      tone: 'info',
    });
  }

  // ブランチの札と市長の旗（通りの入口に立てる）
  for (const [ref, hash] of git.refs) {
    if (!ref.startsWith('refs/heads/')) continue;
    const name = ref.slice('refs/heads/'.length);
    const lot = lotOf(`commit:${hash}`);
    if (!lot) continue;
    const here = name === branch;
    items.push({
      type: 'marker',
      id: `branch:${name}`,
      x: lot.x + lot.w - 0.4,
      y: lot.y - 0.7,
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
    const lot = hash === undefined ? undefined : lotOf(`commit:${hash}`);
    if (!lot) continue;
    items.push({
      type: 'marker',
      id: `tag:${tag}`,
      x: lot.x - 0.5,
      y: lot.y + lot.d - 0.6,
      icon: '🗿',
      label: tag,
      tone: 'warn',
      info: { title: t('scape.git.tagTitle', { name: tag }), kind: t('scape.git.tagKind'), lines: [], next: undefined },
    });
  }

  const planBlock = plan.blocks.find((b) => b.id === 'site:plan');
  const frameBlock = plan.blocks.find((b) => b.id === 'site:frame');
  if (git.stash.length > 0 && planBlock) {
    items.push({
      type: 'marker',
      id: 'stash',
      x: planBlock.x - 0.8,
      y: planBlock.y + planBlock.d / 2,
      icon: '📦',
      label: t('scape.git.stashLabel', { n: git.stash.length }),
      tone: 'info',
      info: { title: t('scape.git.stashTitle'), kind: t('scape.git.stashKind'), lines: git.stash.map((s) => s.message), next: t('scape.git.stashNext') },
    });
  }

  // 計画図と仮組み（工事区画の中身）
  planned.forEach((s) => {
    const lot = lotOf(`file:work:${s.path}`);
    if (!lot) return;
    const deleted = s.note === 'deleted';
    const fresh = s.note === 'new';
    items.push({
      type: 'building',
      id: `file:work:${s.path}`,
      x: lot.x + 0.15,
      y: lot.y + 0.15,
      w: lot.w - 0.3,
      d: lot.d - 0.3,
      facing: lot.facing,
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
  staged.forEach((s) => {
    const lot = lotOf(`file:index:${s.path}`);
    if (!lot) return;
    const deleted = s.note === 'deleted';
    items.push({
      type: 'building',
      id: `file:index:${s.path}`,
      x: lot.x + 0.15,
      y: lot.y + 0.15,
      w: lot.w - 0.3,
      d: lot.d - 0.3,
      facing: lot.facing,
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

  const tip = headHash === null ? undefined : lotOf(`commit:${headHash}`);
  if (staged.length > 0 && frameBlock) {
    items.push({
      type: 'link',
      id: 'site:commit',
      from: { x: frameBlock.x + frameBlock.w / 2, y: frameBlock.y + frameBlock.d / 2 },
      to: tip ? { x: tip.x + tip.w / 2, y: tip.y + tip.d / 2 } : { x: frameBlock.x, y: frameBlock.y + frameBlock.d + 2 },
      style: 'dashed',
      tone: 'warn',
      flow: true,
      info: { title: t('scape.git.commitArrow'), kind: t('scape.git.frameKind'), lines: [], next: t('scape.git.commitNextFrame') },
    });
  }

  return {
    width: plan.width,
    height: plan.height,
    plan,
    items,
    legend,
    stats: [
      { icon: '🏢', label: t('scape.git.stat.done'), value: liveCount },
      { icon: '🏗', label: t('scape.git.stat.frame'), value: staged.length },
      { icon: '🔧', label: t('scape.git.stat.repair'), value: planned.filter((s) => s.note === 'modified').length },
      { icon: '📐', label: t('scape.git.stat.plan'), value: planned.filter((s) => s.note === 'new').length },
      { icon: '🛣', label: t('scape.git.stat.streets'), value: [...git.refs.keys()].filter((r) => r.startsWith('refs/heads/')).length },
    ],
    focus: tip ? { x: tip.x, y: tip.y } : { x: plan.width / 2, y: plan.height / 2 },
  };
}
