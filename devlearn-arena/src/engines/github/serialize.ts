import type {
  BranchProtection, Issue, OwnerRule, Project, PullRequest, Release, Repo, Upstream,
} from './types';

/** GitHub のリポジトリ状態を、保存できる素のデータに落とす */
export interface RepoSnapshot {
  owner: string;
  name: string;
  defaultBranch: string;
  protections: BranchProtection[];
  pulls: PullRequest[];
  workflows: [string, string][];
  nextPullNumber: number;
  issues: Issue[];
  nextIssueNumber: number;
  projects: Project[];
  codeowners: OwnerRule[];
  secrets: Record<string, string>;
  upstream: Upstream | null;
  forks: Upstream[];
  releases: Release[];
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
    issues: [...repo.issues],
    nextIssueNumber: repo.nextIssueNumber,
    projects: [...repo.projects],
    codeowners: [...repo.codeowners],
    secrets: { ...repo.secrets },
    upstream: repo.upstream,
    forks: [...repo.forks],
    releases: [...repo.releases],
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
    issues: [...snapshot.issues],
    nextIssueNumber: snapshot.nextIssueNumber,
    projects: [...snapshot.projects],
    codeowners: [...snapshot.codeowners],
    secrets: { ...snapshot.secrets },
    upstream: snapshot.upstream,
    forks: [...snapshot.forks],
    releases: [...snapshot.releases],
  };
}
