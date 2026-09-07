import type { BranchProtection, PullRequest, Repo } from './types';

/** GitHub のリポジトリ状態を、保存できる素のデータに落とす */
export interface RepoSnapshot {
  owner: string;
  name: string;
  defaultBranch: string;
  protections: BranchProtection[];
  pulls: PullRequest[];
  workflows: [string, string][];
  nextPullNumber: number;
}

export function snapshotRepo(repo: Repo): RepoSnapshot {
  return {
    owner: repo.owner,
    name: repo.name,
    defaultBranch: repo.defaultBranch,
    protections: [...repo.protections],
    pulls: [...repo.pulls],
    workflows: [...repo.workflows.entries()],
    nextPullNumber: repo.nextPullNumber,
  };
}

export function restoreRepo(snapshot: RepoSnapshot): Repo {
  return {
    owner: snapshot.owner,
    name: snapshot.name,
    defaultBranch: snapshot.defaultBranch,
    protections: [...snapshot.protections],
    pulls: [...snapshot.pulls],
    workflows: new Map(snapshot.workflows),
    nextPullNumber: snapshot.nextPullNumber,
  };
}
