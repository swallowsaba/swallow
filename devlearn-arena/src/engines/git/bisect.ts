import { parseCommit } from './objects';
import { headCommit } from './repository';
import type { GitState } from './types';

/**
 * git bisect。
 *
 * 状態は本物と同じ場所に置く。悪い方は `refs/bisect/bad`、
 * 良い方は `refs/bisect/good-<hash>`。これで保存にも自然に乗る。
 * 「あと何回で決まるか」は候補数の二分対数で、その場で数える。
 */
export const BAD_REF = 'refs/bisect/bad';
export const GOOD_PREFIX = 'refs/bisect/good-';
export const START_REF = 'refs/bisect/start';

export function isBisecting(git: GitState): boolean {
  return git.refs.has(START_REF);
}

export function badCommit(git: GitState): string | null {
  return git.refs.get(BAD_REF) ?? null;
}

export function goodCommits(git: GitState): string[] {
  return [...git.refs.entries()]
    .filter(([ref]) => ref.startsWith(GOOD_PREFIX))
    .map(([, hash]) => hash)
    .sort();
}

function parents(git: GitState, hash: string): string[] {
  const object = git.objects.read(hash);
  if (!object || object.type !== 'commit') return [];
  return [...parseCommit(object.body).parents];
}

function ancestors(git: GitState, from: string): Set<string> {
  const seen = new Set<string>();
  const stack = [from];
  while (stack.length > 0) {
    const hash = stack.pop();
    if (hash === undefined || seen.has(hash)) continue;
    seen.add(hash);
    stack.push(...parents(git, hash));
  }
  return seen;
}

/**
 * まだ疑いが残っているコミット。
 * bad から辿れて、どの good からも辿れないもの。good そのものは含めない。
 */
export function candidates(git: GitState): string[] {
  const bad = badCommit(git);
  if (bad === null) return [];
  const suspects = ancestors(git, bad);
  for (const good of goodCommits(git)) {
    for (const hash of ancestors(git, good)) suspects.delete(hash);
  }
  // bad 自身は「悪いと分かっている」ので調べる必要がない
  suspects.delete(bad);
  return [...suspects].sort();
}

/** 次に調べるべきコミット。候補の中央を選ぶ（決定論のため並べてから取る） */
export function nextProbe(git: GitState): string | null {
  const list = candidates(git);
  if (list.length === 0) return null;
  return list[Math.floor(list.length / 2)] ?? null;
}

/** 残り候補から、あと何回試せば決まるかを数える */
export function remainingSteps(count: number): number {
  return count <= 1 ? 0 : Math.ceil(Math.log2(count));
}

export interface BisectStep {
  git: GitState;
  /** 次に調べるコミット。null なら決着している */
  probe: string | null;
  /** 決着したときの犯人 */
  culprit: string | null;
  message: string;
}

export function start(git: GitState): GitState {
  const refs = new Map(git.refs);
  const head = headCommit(git);
  refs.set(START_REF, head ?? '');
  for (const key of [...refs.keys()]) {
    if (key === BAD_REF || key.startsWith(GOOD_PREFIX)) refs.delete(key);
  }
  return { ...git, refs };
}

export function reset(git: GitState): GitState {
  const refs = new Map(git.refs);
  for (const key of [...refs.keys()]) {
    if (key === START_REF || key === BAD_REF || key.startsWith(GOOD_PREFIX)) refs.delete(key);
  }
  return { ...git, refs };
}

/** bad / good を記録して、次の一手を決める */
export function mark(git: GitState, verdict: 'bad' | 'good', hash: string): BisectStep {
  const refs = new Map(git.refs);
  if (verdict === 'bad') refs.set(BAD_REF, hash);
  else refs.set(`${GOOD_PREFIX}${hash}`, hash);
  const next: GitState = { ...git, refs };

  if (badCommit(next) === null) {
    return { git: next, probe: null, culprit: null, message: '悪いコミットをまだ指定していません' };
  }
  if (goodCommits(next).length === 0) {
    return { git: next, probe: null, culprit: null, message: '良いコミットをまだ指定していません' };
  }

  const rest = candidates(next);
  if (rest.length === 0) {
    const culprit = badCommit(next);
    return {
      git: next,
      probe: null,
      culprit,
      message: `${culprit ?? ''} is the first bad commit`,
    };
  }
  const probe = nextProbe(next);
  return {
    git: next,
    probe,
    culprit: null,
    message: `Bisecting: ${String(rest.length - 1)} revisions left to test after this (roughly ${String(remainingSteps(rest.length))} steps)`,
  };
}
