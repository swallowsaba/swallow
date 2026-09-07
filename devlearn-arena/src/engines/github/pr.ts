import type { MergeCheck, MergeStrategy, PullRequest, Repo, Review } from './types';

export function createRepo(owner: string, name: string): Repo {
  return {
    owner,
    name,
    defaultBranch: 'main',
    protections: [],
    pulls: [],
    workflows: new Map(),
    nextPullNumber: 1,
    issues: [],
    nextIssueNumber: 1,
    projects: [],
    codeowners: [],
    secrets: {},
    upstream: null,
    forks: [],
  };
}

export function openPull(
  repo: Repo,
  input: { title: string; body?: string; author?: string; head: string; base?: string },
): { repo: Repo; pull: PullRequest } {
  const pull: PullRequest = {
    number: repo.nextPullNumber,
    title: input.title,
    body: input.body ?? '',
    author: input.author ?? 'learner',
    head: input.head,
    base: input.base ?? repo.defaultBranch,
    state: 'open',
    reviews: [],
    labels: [],
    checks: [],
  };
  return {
    repo: { ...repo, pulls: [...repo.pulls, pull], nextPullNumber: repo.nextPullNumber + 1 },
    pull,
  };
}

export function findPull(repo: Repo, number: number): PullRequest | undefined {
  return repo.pulls.find((p) => p.number === number);
}

function replacePull(repo: Repo, pull: PullRequest): Repo {
  return { ...repo, pulls: repo.pulls.map((p) => (p.number === pull.number ? pull : p)) };
}

export function addReview(repo: Repo, number: number, review: Review): Repo | { error: string } {
  const pull = findPull(repo, number);
  if (!pull) return { error: `pull request #${String(number)} が見つかりません` };
  if (review.reviewer === pull.author) {
    return { error: 'error: 自分の Pull Request は自分では承認できません' };
  }
  // 同じ人の後のレビューが前を上書きする
  const reviews = [...pull.reviews.filter((r) => r.reviewer !== review.reviewer), review];
  return replacePull(repo, { ...pull, reviews });
}

export function setChecks(repo: Repo, number: number, checks: PullRequest['checks']): Repo {
  const pull = findPull(repo, number);
  if (!pull) return repo;
  return replacePull(repo, { ...pull, checks });
}

export function protection(repo: Repo, branch: string) {
  return repo.protections.find((p) => p.branch === branch);
}

/**
 * マージできるかを、保護ルールと突き合わせて判定する。
 * 通らない理由は全部返す（1つ直すたびに次が出る、を避ける）。
 */
export function canMerge(repo: Repo, number: number): MergeCheck {
  const pull = findPull(repo, number);
  if (!pull) return { ok: false, reasons: ['pull request が見つかりません'] };
  if (pull.state !== 'open') return { ok: false, reasons: [`この Pull Request は ${pull.state} です`] };

  const rule = protection(repo, pull.base);
  const reasons: string[] = [];

  if (rule) {
    const approvals = pull.reviews.filter((r) => r.state === 'approved').length;
    if (approvals < rule.requiredApprovals) {
      reasons.push(
        `承認が足りません（${String(approvals)} / ${String(rule.requiredApprovals)}）`,
      );
    }
    if (pull.reviews.some((r) => r.state === 'changes_requested')) {
      reasons.push('変更を要求しているレビューがあります');
    }
    for (const required of rule.requiredChecks) {
      const check = pull.checks.find((c) => c.name === required);
      if (!check) reasons.push(`必須のチェックが実行されていません: ${required}`);
      else if (check.status !== 'success') reasons.push(`チェックが通っていません: ${required}`);
    }
  }

  return { ok: reasons.length === 0, reasons };
}

export interface MergeResult {
  repo: Repo;
  /** 統合後にできるコミットの数（履歴の形の違いを示す） */
  commitsAdded: number;
  message: string;
  error?: string;
}

/**
 * マージ戦略の違いを、履歴に残るコミット数として表す。
 * merge  … 元のコミット + マージコミット
 * squash … まとめて 1 つ
 * rebase … 元のコミットを載せ替え（マージコミットは作らない）
 */
export function mergePull(
  repo: Repo,
  number: number,
  strategy: MergeStrategy,
  commitsOnBranch: number,
): MergeResult {
  const check = canMerge(repo, number);
  const pull = findPull(repo, number);
  if (!pull) return { repo, commitsAdded: 0, message: '', error: 'pull request が見つかりません' };
  if (!check.ok) {
    return { repo, commitsAdded: 0, message: '', error: check.reasons.join('\n') };
  }

  const commitsAdded =
    strategy === 'squash' ? 1 : strategy === 'rebase' ? commitsOnBranch : commitsOnBranch + 1;
  const message =
    strategy === 'squash'
      ? `${String(commitsOnBranch)} 件のコミットを 1 つにまとめました`
      : strategy === 'rebase'
        ? `${String(commitsOnBranch)} 件のコミットを ${pull.base} の上に載せ替えました`
        : `マージコミットを作りました（元の ${String(commitsOnBranch)} 件は残ります）`;

  return {
    repo: { ...repo, pulls: repo.pulls.map((p) => (p.number === number ? { ...p, state: 'merged' } : p)) },
    commitsAdded,
    message,
  };
}
