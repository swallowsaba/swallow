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

export interface Repo {
  owner: string;
  name: string;
  defaultBranch: string;
  protections: BranchProtection[];
  pulls: PullRequest[];
  /** .github/workflows のファイル名 → 中身 */
  workflows: Map<string, string>;
  nextPullNumber: number;
}

export interface MergeCheck {
  ok: boolean;
  reasons: string[];
}
