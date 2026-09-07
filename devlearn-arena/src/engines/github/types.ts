export type ReviewState = 'approved' | 'changes_requested' | 'commented';
export type PullState = 'open' | 'merged' | 'closed';
export type MergeStrategy = 'merge' | 'squash' | 'rebase';
export type CheckStatus = 'queued' | 'running' | 'success' | 'failure' | 'skipped';

export interface Review {
  reviewer: string;
  state: ReviewState;
  body: string;
}

export interface PullRequest {
  number: number;
  title: string;
  body: string;
  author: string;
  head: string;
  base: string;
  state: PullState;
  reviews: Review[];
  labels: string[];
  /** チェックの結果。ワークフローの実行から作られる */
  checks: CheckRun[];
}

export interface CheckRun {
  name: string;
  status: CheckStatus;
  /** 依存するジョブ */
  needs: string[];
  logs: string[];
}

export interface BranchProtection {
  branch: string;
  requiredApprovals: number;
  requiredChecks: string[];
  /** 直 push を禁止する */
  blockDirectPush: boolean;
}


export type IssueState = 'open' | 'closed';

export interface Issue {
  number: number;
  title: string;
  body: string;
  author: string;
  state: IssueState;
  labels: string[];
  assignees: string[];
  milestone: string | null;
  /** この Issue を閉じる Pull Request の番号 */
  closedBy: number | null;
}

/** Projects の盤面。列と、そこに置かれた Issue / PR の番号 */
export interface ProjectColumn {
  name: string;
  items: number[];
}

export interface Project {
  name: string;
  columns: ProjectColumn[];
}

/** CODEOWNERS の1行 */
export interface OwnerRule {
  pattern: string;
  owners: string[];
}

export interface Release {
  tag: string;
  title: string;
  notes: string;
  prerelease: boolean;
}

/** fork 元。fork でなければ null */
export interface Upstream {
  owner: string;
  name: string;
}

export interface Repo {
  owner: string;
  name: string;
  defaultBranch: string;
  protections: BranchProtection[];
  pulls: PullRequest[];
  /** .github/workflows のファイル名 → 中身 */
  workflows: Map<string, string>;
  nextPullNumber: number;
  issues: Issue[];
  nextIssueNumber: number;
  projects: Project[];
  /** CODEOWNERS の内容から読み取った規則 */
  codeowners: OwnerRule[];
  /** Actions から使えるシークレット */
  secrets: Record<string, string>;
  /** fork 元。自分が fork でなければ null */
  upstream: Upstream | null;
  /** この リポジトリから作られた fork */
  forks: Upstream[];
  releases: Release[];
}

export interface MergeCheck {
  ok: boolean;
  reasons: string[];
}
