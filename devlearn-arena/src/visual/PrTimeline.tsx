import { motion } from 'framer-motion';
import type { CheckRun, PullRequest, Repo } from '@/engines/github/types';
import { useMotionEnabled } from '@/ui/motion';

interface Props {
  repo: Repo | null;
}

const MARK: Record<CheckRun['status'], string> = {
  success: '✓',
  failure: '✗',
  skipped: '−',
  running: '…',
  queued: '…',
};

const TONE: Record<CheckRun['status'], string> = {
  success: 'var(--ok)',
  failure: 'var(--bad)',
  skipped: 'var(--cream-dark)',
  running: 'var(--warn)',
  queued: 'var(--cream-dark)',
};

/** ジョブの依存を段（列）に分けて、DAG として並べる */
function levels(checks: readonly CheckRun[]): CheckRun[][] {
  const byName = new Map(checks.map((c) => [c.name, c]));
  const depth = new Map<string, number>();
  const resolveDepth = (check: CheckRun, guard = 0): number => {
    if (guard > 10) return 0;
    const cached = depth.get(check.name);
    if (cached !== undefined) return cached;
    const parents = check.needs
      .map((n) => checks.find((c) => c.name.toLowerCase() === n.toLowerCase()) ?? byName.get(n))
      .filter((c): c is CheckRun => c !== undefined);
    const value = parents.length === 0 ? 0 : Math.max(...parents.map((p) => resolveDepth(p, guard + 1))) + 1;
    depth.set(check.name, value);
    return value;
  };
  for (const check of checks) resolveDepth(check);
  const max = Math.max(0, ...[...depth.values()]);
  return Array.from({ length: max + 1 }, (_, i) => checks.filter((c) => depth.get(c.name) === i));
}

function PullCard({ pull }: { pull: PullRequest }) {
  const animate = useMotionEnabled();
  const columns = levels(pull.checks);

  return (
    <div className="border-4 border-wood-dark bg-cream">
      <div className="plate flex flex-wrap items-center gap-2 px-3 py-1.5 text-sm font-extrabold">
        <span>#{pull.number}</span>
        <span className="truncate">{pull.title}</span>
        <span className="ml-auto font-mono text-xs">
          {pull.head} → {pull.base}
        </span>
        <span
          className="border-2 border-wood-dark px-2 text-xs"
          style={{
            backgroundColor:
              pull.state === 'merged' ? 'var(--ok)' : pull.state === 'closed' ? 'var(--bad)' : 'var(--gold)',
            color: 'var(--ink)',
          }}
        >
          {pull.state}
        </span>
      </div>

      <div className="p-3">
        <p className="text-sm font-bold text-ink-soft">レビュー</p>
        {pull.reviews.length === 0 ? (
          <p className="text-sm text-ink-soft">まだありません</p>
        ) : (
          <ul className="mt-1 flex flex-wrap gap-2">
            {pull.reviews.map((review) => (
              <li
                key={review.reviewer}
                className="border-2 px-2 py-0.5 text-sm"
                style={{
                  borderColor:
                    review.state === 'approved'
                      ? 'var(--ok)'
                      : review.state === 'changes_requested'
                        ? 'var(--bad)'
                        : 'var(--cream-dark)',
                }}
              >
                {review.reviewer}: {review.state === 'approved' ? '承認' : review.state === 'changes_requested' ? '変更要求' : 'コメント'}
              </li>
            ))}
          </ul>
        )}

        <p className="mt-3 text-sm font-bold text-ink-soft">チェック（依存の順に左から）</p>
        {pull.checks.length === 0 ? (
          <p className="text-sm text-ink-soft">まだ実行されていません</p>
        ) : (
          <div className="mt-2 flex items-start gap-3 overflow-auto">
            {columns.map((column, i) => (
              <div key={`col-${String(i)}`} className="flex flex-col gap-2">
                {column.map((check) => (
                  <motion.div
                    key={check.name}
                    initial={animate ? { opacity: 0, scale: 0.85 } : false}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 280, damping: 20 }}
                    className="min-w-[132px] border-2 border-wood-dark px-2 py-1"
                    style={{ backgroundColor: TONE[check.status] }}
                    title={check.logs.join('\n')}
                  >
                    <p className="font-mono text-sm font-bold text-ink">
                      {MARK[check.status]} {check.name}
                    </p>
                    <p className="font-mono text-xs text-ink">{check.status}</p>
                  </motion.div>
                ))}
                {i < columns.length - 1 ? null : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Pull Request の状態と、Actions のジョブ DAG を並べて見せる */
export function PrTimeline({ repo }: Props) {
  if (repo === null) {
    return (
      <div className="grid h-full place-items-center p-6 text-center">
        <div>
          <p className="text-lg font-bold">リポジトリがありません</p>
          <p className="mt-2 text-sm text-ink-soft">
            GitHub の任務を選ぶと、ここに Pull Request が並びます。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-4">
      <p className="font-mono text-sm text-ink-soft">
        {repo.owner}/{repo.name} · 既定ブランチ {repo.defaultBranch}
      </p>

      {repo.protections.length > 0 ? (
        <div className="mt-2 border-4 border-wood-dark bg-[var(--cream-dark)] p-3">
          <p className="text-sm font-bold">保護ルール</p>
          {repo.protections.map((rule) => (
            <p key={rule.branch} className="font-mono text-sm">
              {rule.branch}: 承認 {rule.requiredApprovals} 件 / 必須チェック{' '}
              {rule.requiredChecks.join(', ') || 'なし'}
            </p>
          ))}
        </div>
      ) : null}

      <div className="mt-3 flex flex-col gap-3">
        {repo.pulls.length === 0 ? (
          <p className="text-sm text-ink-soft">
            まだ Pull Request がありません。端末で gh pr create -t "タイトル" -b ブランチ名 と打ってください。
          </p>
        ) : (
          repo.pulls.map((pull) => <PullCard key={pull.number} pull={pull} />)
        )}
      </div>
    </div>
  );
}
