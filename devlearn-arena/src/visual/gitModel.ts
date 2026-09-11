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
  /** rebase などで作り直され、もうどのブランチからも辿れない元のコミット。薄く残して見せる */
  ghost: boolean;
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

/** ブランチと HEAD の指す先 */
function tips(git: GitState): string[] {
  const starts = [...git.refs.entries()].filter(([ref]) => ref.startsWith('refs/heads/')).map(([, hash]) => hash);
  const head = headCommit(git);
  if (head !== null) starts.unshift(head);
  return starts;
}

/** 指定した先頭（無ければすべてのブランチと HEAD）から辿れるコミット */
function reachable(git: GitState, starts: readonly string[] = tips(git)): Map<string, Raw> {
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
export function placeCommits(
  git: GitState,
  /** 作り直される前の先頭。そこから辿れるコミットも、薄い「元のコミット」として並べる */
  ghostTips: readonly string[] = [],
): { commits: PlacedCommit[]; edges: CommitEdge[]; columns: number } {
  const live = reachable(git);
  const all = new Map(live);
  for (const [hash, raw] of reachable(git, ghostTips)) if (!all.has(hash)) all.set(hash, raw);
  const head = headCommit(git);
  const branchHeads = [...git.refs.entries()]
    .filter(([ref]) => ref.startsWith('refs/heads/'))
    .sort(([a], [b]) => (a === 'refs/heads/main' ? -1 : b === 'refs/heads/main' ? 1 : a < b ? -1 : 1))
    .map(([, hash]) => hash);
  const starts = head === null ? branchHeads : [head, ...branchHeads];
  const order = topoOrder(all, [...(branchHeads.length > 0 ? branchHeads : starts), ...ghostTips]);

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
    placed.push({ hash: commit.hash, message: commit.message, parents: commit.parents, row, col, ghost: !live.has(commit.hash) });
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

/* ---------------- 直前から何が変わったか ---------------- */

export interface GitChanges {
  /** 新しくできたコミット。光らせる */
  newCommits: ReadonlySet<string>;
  /** 指す先が変わった・新しくできたブランチ。札を光らせる */
  movedBranches: ReadonlySet<string>;
  /** 作り直されて辿れなくなった元のブランチの先頭。図に薄く残す */
  ghostTips: readonly string[];
  /** 元のコミット → 複製されたコミット。古い順（rebase が付け直した順）に並ぶ */
  copies: readonly { from: string; to: string }[];
}

export const NO_CHANGES: GitChanges = { newCommits: new Set(), movedBranches: new Set(), ghostTips: [], copies: [] };

const firstLine = (message: string) => message.split('\n')[0] ?? '';

/**
 * 1つ前の状態からいまの状態までに、履歴で何が起きたか。
 * rebase（や amend）では、元のコミットがどのブランチからも辿れなくなり、同じメッセージの新しいコミットができる。
 * この組を「複製」として返し、図で元のコミットから新しいコミットへ線を引く。
 */
export function gitChanges(prev: GitState | null | undefined, next: GitState | null): GitChanges {
  if (prev == null || next === null || prev === next) return NO_CHANGES;
  const before = reachable(prev);
  const after = reachable(next);
  const newCommits = new Set([...after.keys()].filter((h) => !before.has(h)));

  const movedBranches = new Set<string>();
  for (const [ref, hash] of next.refs) {
    if (!ref.startsWith('refs/heads/')) continue;
    if (prev.refs.get(ref) !== hash) movedBranches.add(ref.slice('refs/heads/'.length));
  }

  // どこからも辿れなくなった元のコミット。next の倉庫にも残っている（追記専用）ので、そこから読める
  const dropped = [...before.values()].filter((c) => !after.has(c.hash) && next.objects.read(c.hash) !== undefined);
  const ghostTips = [...prev.refs.entries()]
    .filter(([ref, hash]) => ref.startsWith('refs/heads/') && !after.has(hash) && next.objects.read(hash) !== undefined)
    .map(([, hash]) => hash);

  // 元の順（古い順）に、同じメッセージの新しいコミットと組にする
  // 同じ時刻にまとめて作られるので、時刻ではなく「根元から何番目か」で並べる
  const oldestFirst = (list: Raw[]) => {
    const inList = new Map(list.map((c) => [c.hash, c]));
    const depth = new Map<string, number>();
    const depthOf = (c: Raw): number => {
      const known = depth.get(c.hash);
      if (known !== undefined) return known;
      const parent = inList.get(c.parents[0] ?? '');
      const value = parent === undefined ? 0 : depthOf(parent) + 1;
      depth.set(c.hash, value);
      return value;
    };
    return [...list].sort((a, b) => depthOf(a) - depthOf(b) || a.timestamp - b.timestamp);
  };
  const fresh = oldestFirst([...after.values()].filter((c) => newCommits.has(c.hash) && c.parents.length <= 1));
  const used = new Set<string>();
  const copies: { from: string; to: string }[] = [];
  for (const old of oldestFirst(dropped.filter((c) => c.parents.length <= 1))) {
    const copy = fresh.find((c) => !used.has(c.hash) && firstLine(c.message) === firstLine(old.message));
    if (copy === undefined) continue;
    used.add(copy.hash);
    copies.push({ from: old.hash, to: copy.hash });
  }
  // 新しい側の並び（付け直した順）にそろえる
  const order = new Map(fresh.map((c, i) => [c.hash, i]));
  copies.sort((a, b) => (order.get(a.to) ?? 0) - (order.get(b.to) ?? 0));

  return { newCommits, movedBranches, ghostTips: copies.length > 0 ? ghostTips : [], copies };
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
