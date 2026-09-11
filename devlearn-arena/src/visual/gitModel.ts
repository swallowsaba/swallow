import { hashBlob, parseCommit } from '@/engines/git/objects';
import { headCommit, treeFiles, walkWorktree } from '@/engines/git/repository';
import type { GitState } from '@/engines/git/types';
import type { VfsState } from '@/engines/kernel/vfs';

/**
 * 履歴の図に出すものを、リポジトリの状態から組み立てる。
 * 描画から切り離し、分岐が横にずれること・3面のどこにファイルがいるかをテストで確かめる。
 */

/* ---------------- コミットの並びと列 ---------------- */

export interface PlacedCommit {
  hash: string;
  message: string;
  parents: string[];
  /** 上から何番目か（新しいものほど上） */
  row: number;
  /** 何列目か。分岐した先は横にずれる */
  col: number;
}

export interface CommitEdge {
  from: string;
  to: string;
  /** 列が変わる線（分岐・合流）か */
  bend: boolean;
}

interface Raw {
  hash: string;
  message: string;
  parents: string[];
  timestamp: number;
}

/** すべてのブランチと HEAD から辿れるコミット */
function reachable(git: GitState): Map<string, Raw> {
  const starts = [...git.refs.entries()].filter(([ref]) => ref.startsWith('refs/heads/')).map(([, hash]) => hash);
  const head = headCommit(git);
  if (head !== null) starts.unshift(head);
  const out = new Map<string, Raw>();
  const stack = [...starts];
  while (stack.length > 0) {
    const hash = stack.pop();
    if (hash === undefined || out.has(hash)) continue;
    const object = git.objects.read(hash);
    if (!object || object.type !== 'commit') continue;
    const parsed = parseCommit(object.body);
    out.set(hash, { hash, message: parsed.message.trim(), parents: [...parsed.parents], timestamp: parsed.author.timestamp });
    stack.push(...parsed.parents);
  }
  return out;
}

/** 子を必ず親より上に置く並び。同じ高さなら新しいもの、見つけた順を優先する */
function topoOrder(commits: Map<string, Raw>, starts: readonly string[]): Raw[] {
  const children = new Map<string, number>();
  for (const c of commits.values()) children.set(c.hash, 0);
  for (const c of commits.values()) {
    for (const p of c.parents) if (children.has(p)) children.set(p, (children.get(p) ?? 0) + 1);
  }
  const discovered = new Map([...commits.keys()].map((h, i) => [h, i]));
  const ready = [...commits.values()].filter((c) => (children.get(c.hash) ?? 0) === 0);
  const startRank = (h: string) => {
    const i = starts.indexOf(h);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  const out: Raw[] = [];
  while (ready.length > 0) {
    ready.sort(
      (a, b) =>
        b.timestamp - a.timestamp ||
        startRank(a.hash) - startRank(b.hash) ||
        (discovered.get(a.hash) ?? 0) - (discovered.get(b.hash) ?? 0),
    );
    const next = ready.shift();
    if (next === undefined) break;
    out.push(next);
    for (const p of next.parents) {
      const left = (children.get(p) ?? 0) - 1;
      children.set(p, left);
      const parent = commits.get(p);
      if (left === 0 && parent) ready.push(parent);
    }
  }
  return out;
}

/**
 * コミットを行と列に置く。
 * 1本の線（列）は「次に来るはずの親」を覚えておき、そのコミットが来たら同じ列に置く。
 * どの列も待っていないコミット（ブランチの先頭）は空いている列に置くので、分岐は横にずれる。
 * 2つの列が同じ親を待っていたら、その親で1つにまとまる（合流）。
 */
export function placeCommits(git: GitState): { commits: PlacedCommit[]; edges: CommitEdge[]; columns: number } {
  const all = reachable(git);
  const head = headCommit(git);
  const branchHeads = [...git.refs.entries()]
    .filter(([ref]) => ref.startsWith('refs/heads/'))
    .sort(([a], [b]) => (a === 'refs/heads/main' ? -1 : b === 'refs/heads/main' ? 1 : a < b ? -1 : 1))
    .map(([, hash]) => hash);
  const starts = head === null ? branchHeads : [head, ...branchHeads];
  const order = topoOrder(all, branchHeads.length > 0 ? branchHeads : starts);

  const lanes: (string | null)[] = [];
  const placed: PlacedCommit[] = [];
  order.forEach((commit, row) => {
    let col = lanes.indexOf(commit.hash);
    if (col === -1) {
      col = lanes.indexOf(null);
      if (col === -1) {
        col = lanes.length;
        lanes.push(null);
      }
    }
    // 同じコミットを待っていたほかの列は、ここで合流して空く
    for (let i = 0; i < lanes.length; i += 1) if (i !== col && lanes[i] === commit.hash) lanes[i] = null;
    const [first, ...others] = commit.parents;
    lanes[col] = first ?? null;
    for (const parent of others) {
      if (lanes.includes(parent)) continue;
      const free = lanes.indexOf(null);
      if (free === -1) lanes.push(parent);
      else lanes[free] = parent;
    }
    while (lanes.length > 0 && lanes[lanes.length - 1] === null) lanes.pop();
    placed.push({ hash: commit.hash, message: commit.message, parents: commit.parents, row, col });
  });

  const byHash = new Map(placed.map((c) => [c.hash, c]));
  const edges: CommitEdge[] = [];
  for (const c of placed) {
    for (const p of c.parents) {
      const parent = byHash.get(p);
      if (parent) edges.push({ from: c.hash, to: p, bend: parent.col !== c.col });
    }
  }
  const columns = Math.max(1, ...placed.map((c) => c.col + 1));
  return { commits: placed, edges, columns };
}

/* ---------------- 3面（作業ツリー / インデックス / HEAD） ---------------- */

export type Lane = 'worktree' | 'index' | 'head';

export interface FileSpot {
  path: string;
  /** いちばん新しい中身がいる面。add で index へ、commit で head へ動く */
  lane: Lane;
  /** その面での状態 */
  note: 'new' | 'modified' | 'deleted' | 'clean';
  /** 作業ツリーでさらに書き換えている（準備済みの版と、手元の版が違う） */
  alsoChanged: boolean;
}

/**
 * ファイルごとに、いちばん新しい中身が3面のどこにあるかを決める。
 * - 作業ツリーだけが違う（まだ add していない）→ 作業ツリー
 * - インデックスが HEAD と違う（add したがまだ commit していない）→ インデックス
 * - 3面とも同じ → HEAD（記録済み）
 */
export function fileSpots(git: GitState, vfs: VfsState): FileSpot[] {
  const worktree = walkWorktree(vfs, git.root);
  const committed = treeFiles(git, headCommit(git));
  const paths = [...new Set([...worktree.keys(), ...git.index.keys(), ...committed.keys()])].sort();
  return paths.map((path) => {
    const work = worktree.get(path);
    const workHash = work === undefined ? undefined : hashBlob(work);
    const staged = git.index.get(path)?.hash;
    const headHash = committed.get(path);
    const worktreeDiffers = workHash !== staged;
    const indexDiffers = staged !== headHash;
    if (indexDiffers) {
      const note = headHash === undefined ? 'new' : staged === undefined ? 'deleted' : 'modified';
      return { path, lane: 'index', note, alsoChanged: worktreeDiffers };
    }
    if (worktreeDiffers) {
      const note = staged === undefined ? 'new' : workHash === undefined ? 'deleted' : 'modified';
      return { path, lane: 'worktree', note, alsoChanged: false };
    }
    return { path, lane: 'head', note: 'clean', alsoChanged: false };
  });
}
