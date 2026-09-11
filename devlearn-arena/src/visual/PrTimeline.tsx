import { motion } from 'framer-motion';
import type { CheckRun, PullRequest, Repo } from '@/engines/github/types';
import { useMotionEnabled } from '@/ui/motion';
import { useT } from '@/i18n/useT';
import { prCommands, type RunCommand } from './commands';

interface Props {
  repo: Repo | null;
  /** 図の操作をコマンドとして端末に流す。無ければ見るだけの図になる */
  onCommand?: RunCommand;
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

function PullCard({ pull, onCommand }: { pull: PullRequest; onCommand?: RunCommand }) {
  const t = useT();
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
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-bold text-ink-soft">{t('viz.reviews')}</p>
          {onCommand && pull.state === 'open' ? (
            <span className="ml-auto flex flex-wrap gap-2">
              <button
                type="button"
                className="knob px-2 py-0.5 text-xs"
                title={prCommands.view(pull.number)}
                onClick={() => {
                  onCommand(prCommands.view(pull.number));
                }}
              >
                {t('viz.viewPull')}
              </button>
              <button
                type="button"
                className="knob px-2 py-0.5 text-xs"
                title={prCommands.approve(pull.number)}
                onClick={() => {
                  onCommand(prCommands.approve(pull.number));
                }}
              >
                ✓ {t('viz.approve')}
              </button>
              <button
                type="button"
                className="knob px-2 py-0.5 text-xs"
                title={prCommands.requestChanges(pull.number)}
                onClick={() => {
                  onCommand(prCommands.requestChanges(pull.number));
                }}
              >
                ✎ {t('viz.requestChanges')}
              </button>
            </span>
          ) : null}
        </div>
        {pull.reviews.length === 0 ? (
          <p className="text-sm text-ink-soft">{t('viz.none')}</p>
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
                {review.reviewer}:{' '}
                {review.state === 'approved'
                  ? t('viz.approved')
                  : review.state === 'changes_requested'
                    ? t('viz.changesRequested')
                    : t('viz.commented')}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <p className="text-sm font-bold text-ink-soft">{t('viz.checks')}</p>
          {onCommand && pull.state === 'open' ? (
            <button
              type="button"
              className="knob ml-auto px-2 py-0.5 text-xs"
              title={prCommands.checks(pull.number)}
              onClick={() => {
                onCommand(prCommands.checks(pull.number));
              }}
            >
              ▶ {t('viz.runChecks')}
            </button>
          ) : null}
        </div>
        {pull.checks.length === 0 ? (
          <p className="text-sm text-ink-soft">{t('viz.notRunYet')}</p>
        ) : (
          <div className="mt-2 flex items-start gap-3 overflow-auto">
            {columns.map((column, i) => (
              <div key={`col-${String(i)}`} className="flex flex-col gap-2">
                {column.map((check) => (
                  <motion.button
                    key={check.name}
                    type="button"
                    disabled={!onCommand}
                    initial={animate ? { opacity: 0, scale: 0.85 } : false}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 280, damping: 20 }}
                    className="min-w-[132px] border-2 border-wood-dark px-2 py-1 text-left disabled:cursor-default"
                    style={{ backgroundColor: TONE[check.status] }}
                    title={[prCommands.checks(pull.number), ...check.logs].join('\n')}
                    onClick={() => {
                      onCommand?.(prCommands.checks(pull.number));
                    }}
                  >
                    <span className="block font-mono text-sm font-bold text-ink">
                      {MARK[check.status]} {check.name}
                    </span>
                    <span className="block font-mono text-xs text-ink">{check.status}</span>
                  </motion.button>
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
export function PrTimeline({ repo, onCommand }: Props) {
  const t = useT();
  if (repo === null) {
    return (
      <div className="grid h-full place-items-center p-6 text-center">
        <div>
          <p className="text-lg font-bold">{t('viz.noGhRepo')}</p>
          <p className="mt-2 text-sm text-ink-soft">
            {t('viz.noGhRepoLead')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-4">
      <p className="font-mono text-sm text-ink-soft">
        {t('viz.repoLine', {
          owner: repo.owner,
          name: repo.name,
          branch: repo.defaultBranch,
        })}
      </p>

      {repo.protections.length > 0 ? (
        <div className="mt-2 border-4 border-wood-dark bg-[var(--cream-dark)] p-3">
          <p className="text-sm font-bold">{t('viz.protection')}</p>
          {repo.protections.map((rule) => (
            <p key={rule.branch} className="font-mono text-sm">
              {t('viz.protectionLine', {
                branch: rule.branch,
                approvals: rule.requiredApprovals,
                checks: rule.requiredChecks.join(', ') || t('viz.noneShort'),
              })}
            </p>
          ))}
        </div>
      ) : null}

      <div className="mt-3 flex flex-col gap-3">
        {repo.pulls.length === 0 ? (
          <p className="text-sm text-ink-soft">
            {t('viz.noPulls')}
          </p>
        ) : (
          repo.pulls.map((pull) => <PullCard key={pull.number} pull={pull} onCommand={onCommand} />)
        )}
      </div>
    </div>
  );
}
