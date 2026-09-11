import { motion } from 'framer-motion';
import type { CheckRun, PullRequest, Repo } from '@/engines/github/types';
import { useMotionEnabled } from '@/ui/motion';
import { useT } from '@/i18n/useT';
import type { TKey } from '@/i18n';
import { prCommands, type RunCommand } from './commands';
import { DAG, jobDag, prTimeline, type Stage, type StageId, type StageState } from './prModel';
import { FILL } from './sceneKit';
import { Viewport } from './Viewport';

interface Props {
  repo: Repo | null;
  /** 図の操作をコマンドとして端末に流す。無ければ見るだけの図になる */
  onCommand?: RunCommand;
}

const MARK: Record<CheckRun['status'], string> = {
  success: '✓',
  failure: '✗',
  skipped: '−',
  running: '⟳',
  queued: '…',
};

const TONE: Record<CheckRun['status'], string> = {
  success: FILL.ok,
  failure: FILL.bad,
  skipped: '#d4d4d4',
  running: FILL.warn,
  queued: FILL.idle,
};

const STAGE_TONE: Record<StageState, string> = {
  done: FILL.ok,
  active: FILL.warn,
  waiting: FILL.idle,
  bad: FILL.bad,
};

const STAGE_LABEL: Record<StageId, TKey> = {
  created: 'viz.stage.created',
  review: 'viz.stage.review',
  checks: 'viz.stage.checks',
  merge: 'viz.stage.merge',
};

/** 段を押したときに打つコマンド。押しても意味の無い段は null */
function stageCommand(stage: Stage, pull: PullRequest): string | null {
  if (pull.state !== 'open') return null;
  if (stage.id === 'review') return prCommands.approve(pull.number);
  if (stage.id === 'checks') return prCommands.checks(pull.number);
  if (stage.id === 'merge' && stage.state === 'active') return prCommands.merge(pull.number);
  if (stage.id === 'created') return prCommands.view(pull.number);
  return null;
}

/** 作成 → レビュー → チェック → マージ を横に並べる。押すとその段のコマンドを打つ */
function Timeline({ repo, pull, onCommand }: { repo: Repo; pull: PullRequest; onCommand?: RunCommand }) {
  const t = useT();
  const stages = prTimeline(repo, pull);
  return (
    <ol aria-label={t('viz.timeline')} className="flex flex-wrap items-stretch gap-1">
      {stages.map((stage, i) => {
        const command = onCommand ? stageCommand(stage, pull) : null;
        return (
          <li key={stage.id} className="flex min-w-[112px] flex-1 items-stretch gap-1">
            {i > 0 ? (
              <span aria-hidden className="self-center font-extrabold text-ink-soft">
                →
              </span>
            ) : null}
            <button
              type="button"
              data-stage={stage.id}
              data-state={stage.state}
              disabled={command === null}
              title={command ?? undefined}
              className="flex-1 border-4 border-wood-dark px-2 py-1 text-left disabled:cursor-default"
              style={{ backgroundColor: STAGE_TONE[stage.state] }}
              onClick={() => {
                if (command !== null) onCommand?.(command);
              }}
            >
              <span className="block text-sm font-extrabold text-ink">{t(STAGE_LABEL[stage.id])}</span>
              <span className="block truncate font-mono text-[11px] text-ink">{stage.detail}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Actions のジョブを DAG として描く。依存は矢印で結ぶ。
 * 実行中は回り、成功は緑、失敗は赤、skipped は灰色。失敗の下流には × を付けて、止まった理由が上流にあると分かるようにする。
 */
function JobDag({ pull, onCommand }: { pull: PullRequest; onCommand?: RunCommand }) {
  const t = useT();
  const animate = useMotionEnabled();
  const dag = jobDag(pull.checks);
  const byName = new Map(dag.jobs.map((j) => [j.check.name, j]));
  const command = prCommands.checks(pull.number);
  return (
    <div className="mt-2">
      <svg width={dag.width} height={dag.height} role="img" aria-label={t('viz.checks')}>
        <defs>
          <marker id="dag-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--wood-dark)" />
          </marker>
        </defs>
        {dag.edges.map((edge) => {
          const a = byName.get(edge.from);
          const b = byName.get(edge.to);
          if (!a || !b) return null;
          const x1 = a.x + DAG.jobW;
          const y1 = a.y + DAG.jobH / 2;
          const x2 = b.x - 2;
          const y2 = b.y + DAG.jobH / 2;
          const mid = (x1 + x2) / 2;
          const broken = a.check.status === 'failure' || a.blocked;
          return (
            <path
              key={`${edge.from}->${edge.to}`}
              data-dag-edge={`${edge.from}>${edge.to}`}
              d={`M ${String(x1)} ${String(y1)} C ${String(mid)} ${String(y1)}, ${String(mid)} ${String(y2)}, ${String(x2)} ${String(y2)}`}
              fill="none"
              stroke={broken ? 'var(--bad)' : 'var(--wood-dark)'}
              strokeWidth={2.5}
              strokeDasharray={broken ? '6 4' : undefined}
              markerEnd="url(#dag-arrow)"
            />
          );
        })}
        {dag.jobs.map((job) => (
          <g
            key={job.check.name}
            data-job={job.check.name}
            data-status={job.check.status}
            data-blocked={job.blocked ? 'true' : 'false'}
            transform={`translate(${String(job.x)} ${String(job.y)})`}
            role={onCommand ? 'button' : undefined}
            aria-label={onCommand ? `${job.check.name}: ${command}` : undefined}
            style={{ cursor: onCommand ? 'pointer' : 'default' }}
            onClick={() => {
              onCommand?.(command);
            }}
          >
            <title>{[onCommand ? command : '', ...job.check.logs].filter((l) => l !== '').join('\n')}</title>
            <rect width={DAG.jobW} height={DAG.jobH} fill={TONE[job.check.status]} stroke="var(--wood-dark)" strokeWidth={2.5} />
            {job.check.status === 'running' && animate ? (
              <motion.text
                x={16}
                y={20}
                fontSize={15}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="var(--ink)"
                style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1.2, ease: 'linear' }}
              >
                {MARK.running}
              </motion.text>
            ) : (
              <text x={16} y={20} fontSize={15} textAnchor="middle" dominantBaseline="middle" fill="var(--ink)">
                {MARK[job.check.status]}
              </text>
            )}
            <text x={30} y={19} fontSize={12} fontWeight={700} fontFamily="monospace" fill="var(--ink)">
              {job.check.name.slice(0, 15)}
            </text>
            <text x={30} y={36} fontSize={11} fontFamily="monospace" fill="var(--ink)">
              {job.check.status}
            </text>
            {job.blocked ? (
              // 失敗の影響で止まった
              <g data-cross="true">
                <line x1={DAG.jobW - 22} y1={6} x2={DAG.jobW - 6} y2={22} stroke="var(--bad)" strokeWidth={4} />
                <line x1={DAG.jobW - 6} y1={6} x2={DAG.jobW - 22} y2={22} stroke="var(--bad)" strokeWidth={4} />
              </g>
            ) : null}
          </g>
        ))}
      </svg>
      {dag.jobs.some((j) => j.blocked) ? (
        <p className="mt-1 text-xs font-bold text-[var(--bad)]">{t('viz.blockedByFailure')}</p>
      ) : null}
    </div>
  );
}

function PullCard({ repo, pull, onCommand }: { repo: Repo; pull: PullRequest; onCommand?: RunCommand }) {
  const t = useT();

  return (
    <div className="border-4 border-wood-dark bg-cream" data-pull={pull.number}>
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
        <Timeline repo={repo} pull={pull} onCommand={onCommand} />

        <div className="mt-3 flex flex-wrap items-center gap-2">
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
          <JobDag pull={pull} onCommand={onCommand} />
        )}
      </div>
    </div>
  );
}

/** Pull Request の流れ（作成 → レビュー → チェック → マージ）と、Actions のジョブ DAG を並べて見せる */
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
    <div className="h-full min-h-0">
      <Viewport label={t('viz.timeline')}>
      <div className="p-4 pr-44">
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
          repo.pulls.map((pull) => <PullCard key={pull.number} repo={repo} pull={pull} onCommand={onCommand} />)
        )}
      </div>
      </div>
      </Viewport>
    </div>
  );
}
