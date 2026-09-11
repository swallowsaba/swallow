import { canMerge } from '@/engines/github/pr';
import type { CheckRun, PullRequest, Repo } from '@/engines/github/types';

/**
 * Pull Request の図に出すものを、リポジトリの状態から組み立てる。
 * 描画から切り離し、タイムラインの段の状態・ジョブの依存と失敗の伝わり方をテストで確かめる。
 */

/* ---------------- タイムライン（作成 → レビュー → チェック → マージ） ---------------- */

export type StageId = 'created' | 'review' | 'checks' | 'merge';
/** done=済んだ, active=動いている, waiting=まだ, bad=止まっている */
export type StageState = 'done' | 'active' | 'waiting' | 'bad';

export interface Stage {
  id: StageId;
  state: StageState;
  /** その段のいまの様子を一言で */
  detail: string;
}

export function prTimeline(repo: Repo, pull: PullRequest): Stage[] {
  const approvals = pull.reviews.filter((r) => r.state === 'approved').length;
  const blockedReview = pull.reviews.some((r) => r.state === 'changes_requested');
  const review: Stage = blockedReview
    ? { id: 'review', state: 'bad', detail: '変更を求められている' }
    : approvals > 0
      ? { id: 'review', state: 'done', detail: `承認 ${String(approvals)} 件` }
      : { id: 'review', state: pull.state === 'merged' ? 'done' : 'waiting', detail: 'レビュー待ち' };

  const failed = pull.checks.filter((c) => c.status === 'failure').length;
  const running = pull.checks.some((c) => c.status === 'running' || c.status === 'queued');
  const checks: Stage =
    pull.checks.length === 0
      ? { id: 'checks', state: pull.state === 'merged' ? 'done' : 'waiting', detail: 'まだ走っていない' }
      : failed > 0
        ? { id: 'checks', state: 'bad', detail: `${String(failed)} 件失敗` }
        : running
          ? { id: 'checks', state: 'active', detail: '実行中' }
          : { id: 'checks', state: 'done', detail: 'すべて通過' };

  const check = canMerge(repo, pull.number);
  const merge: Stage =
    pull.state === 'merged'
      ? { id: 'merge', state: 'done', detail: 'マージ済み' }
      : pull.state === 'closed'
        ? { id: 'merge', state: 'bad', detail: '閉じられた' }
        : check.ok
          ? { id: 'merge', state: 'active', detail: 'マージできる' }
          : { id: 'merge', state: 'waiting', detail: check.reasons[0] ?? 'まだ' };

  return [{ id: 'created', state: 'done', detail: `${pull.head} → ${pull.base}` }, review, checks, merge];
}

/* ---------------- Actions のジョブの DAG ---------------- */

export const DAG = { jobW: 150, jobH: 46, gapX: 56, gapY: 14, pad: 8 } as const;

export interface DagJob {
  check: CheckRun;
  col: number;
  row: number;
  x: number;
  y: number;
  /** 上流のどこかが失敗していて、その影響で走れなかった（×を付ける） */
  blocked: boolean;
}

export interface DagEdge {
  from: string;
  to: string;
}

/** needs はジョブの id、チェックの名前は表示名（matrix なら「名前 (値)」）。大文字小文字と matrix の違いを吸収して結ぶ */
function matches(need: string, check: CheckRun): boolean {
  const name = check.name.toLowerCase();
  const id = need.toLowerCase();
  return name === id || name.startsWith(`${id} (`);
}

/**
 * ジョブを依存の深さで列に分けて左から並べ、依存を矢印で結ぶ。
 * 失敗したジョブから下流へ辿り、その先のジョブ全部に「失敗の影響で止まった」印を付ける。
 */
export function jobDag(checks: readonly CheckRun[]): { jobs: DagJob[]; edges: DagEdge[]; width: number; height: number } {
  const parentsOf = new Map(
    checks.map((c) => [c.name, checks.filter((p) => p !== c && c.needs.some((n) => matches(n, p)))]),
  );
  const depth = new Map<string, number>();
  const depthOf = (check: CheckRun, guard = 0): number => {
    const known = depth.get(check.name);
    if (known !== undefined) return known;
    const parents = guard > checks.length ? [] : (parentsOf.get(check.name) ?? []);
    const value = parents.length === 0 ? 0 : Math.max(...parents.map((p) => depthOf(p, guard + 1))) + 1;
    depth.set(check.name, value);
    return value;
  };
  for (const c of checks) depthOf(c);

  const edges: DagEdge[] = checks.flatMap((c) => (parentsOf.get(c.name) ?? []).map((p) => ({ from: p.name, to: c.name })));

  // 失敗から下流へ伝える
  const blocked = new Set<string>();
  const queue = checks.filter((c) => c.status === 'failure').map((c) => c.name);
  while (queue.length > 0) {
    const name = queue.shift();
    if (name === undefined) break;
    for (const edge of edges) {
      if (edge.from !== name || blocked.has(edge.to)) continue;
      blocked.add(edge.to);
      queue.push(edge.to);
    }
  }

  const rows = new Map<number, number>();
  const jobs = checks.map((check) => {
    const col = depth.get(check.name) ?? 0;
    const row = rows.get(col) ?? 0;
    rows.set(col, row + 1);
    return {
      check,
      col,
      row,
      x: DAG.pad + col * (DAG.jobW + DAG.gapX),
      y: DAG.pad + row * (DAG.jobH + DAG.gapY),
      blocked: blocked.has(check.name) && check.status !== 'failure',
    };
  });
  const columns = Math.max(1, ...jobs.map((j) => j.col + 1));
  const maxRows = Math.max(1, ...rows.values());
  return {
    jobs,
    edges,
    width: DAG.pad * 2 + columns * DAG.jobW + (columns - 1) * DAG.gapX,
    height: DAG.pad * 2 + maxRows * DAG.jobH + (maxRows - 1) * DAG.gapY,
  };
}
