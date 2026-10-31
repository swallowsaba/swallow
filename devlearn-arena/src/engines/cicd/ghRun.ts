import { displayWidth } from '@/engines/kernel/lineEditor';
import type { Conclusion, JobRecord, RunRecord } from './types';
import { stamp } from './runner';

/**
 * gh run list・gh run view・gh run watch の出力（本物の gh 2 の形）。純粋な関数。
 * 端末で ID を書かずに打つと、本物の gh は選ぶ画面を出すが、ここでは一番新しい実行を選んだことにする。
 */

const MARK: Record<Conclusion, string> = { success: '✓', failure: 'X', skipped: '-', waiting: '*' };

/** 4m0s・31s・1h2m3s（gh の経過の書き方） */
export function elapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${String(h)}h${String(m)}m${String(s)}s`;
  if (m > 0) return `${String(m)}m${String(s)}s`;
  return `${String(s)}s`;
}

/** about 5 minutes ago（gh の fuzzy ago） */
export function ago(now: number, then: number): string {
  const d = Math.max(0, now - then);
  if (d < 60) return 'less than a minute ago';
  const m = Math.floor(d / 60);
  if (m < 60) return m === 1 ? 'about 1 minute ago' : `about ${String(m)} minutes ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return h === 1 ? 'about 1 hour ago' : `about ${String(h)} hours ago`;
  const days = Math.floor(h / 24);
  return days === 1 ? 'about 1 day ago' : `about ${String(days)} days ago`;
}

/** 表の形（列の幅を揃える。最後の列は揃えない） */
function table(rows: readonly (readonly string[])[]): string[] {
  const width = displayWidth;
  const cols = Math.max(...rows.map((r) => r.length));
  const widths = Array.from({ length: cols }, (_, i) => Math.max(...rows.map((r) => width(r[i] ?? ''))));
  return rows.map((r) => r.map((c, i) => (i === r.length - 1 ? c : c + ' '.repeat((widths[i] ?? 0) - width(c) + 2))).join('').trimEnd());
}

export function runList(runs: readonly RunRecord[], now: number, opts: { workflow?: string; branch?: string; limit?: number }): string {
  const picked = [...runs]
    .reverse()
    .filter((r) => opts.workflow === undefined || r.workflow === opts.workflow || r.file === opts.workflow || r.file.endsWith(`/${opts.workflow}`))
    .filter((r) => opts.branch === undefined || r.branch === opts.branch)
    .slice(0, opts.limit ?? 20);
  if (picked.length === 0) return 'no runs found\n';
  const rows = [
    ['STATUS', 'TITLE', 'WORKFLOW', 'BRANCH', 'EVENT', 'ID', 'ELAPSED', 'AGE'],
    ...picked.map((r) => [MARK[r.conclusion], r.title, r.workflow, r.branch, r.event, String(r.id), elapsed(r.seconds), ago(now, r.startedAt)]),
  ];
  return `${table(rows).join('\n')}\n`;
}

function jobLines(jobs: readonly JobRecord[], verbose: boolean): string[] {
  return jobs.flatMap((j) => {
    if (j.conclusion === 'waiting') return [`${MARK.waiting} ${j.name} (ID ${String(j.id)})`, `  Waiting for review: ${j.waitingFor ?? ''} needs approval to start deploying changes.`];
    const head = j.conclusion === 'skipped' ? `${MARK.skipped} ${j.name} (ID ${String(j.id)})` : `${MARK[j.conclusion]} ${j.name} in ${elapsed(j.seconds)} (ID ${String(j.id)})`;
    const steps = verbose || j.conclusion === 'failure' ? j.steps.map((s) => `  ${MARK[s.conclusion]} ${s.name}`) : [];
    return [head, ...steps];
  });
}

export const runUrl = (host: string, repo: string, id: number): string => `https://${host}/${repo}/actions/runs/${String(id)}`;

/** 失敗した手順ごとの、注釈（ANNOTATIONS）の行 */
function annotations(run: RunRecord): string[] {
  return run.jobs.flatMap((j) =>
    j.steps.filter((s) => s.conclusion === 'failure').flatMap((s) => {
      const err = s.log.filter((l) => l.startsWith('##[error]')).map((l) => l.slice('##[error]'.length));
      return err.map((e) => [`X ${e}`, `${j.name}: .github#${String(s.log.length)}`]).flat();
    }),
  );
}

export function runView(run: RunRecord, now: number, host: string, repo: string, opts: { verbose?: boolean } = {}): string {
  const lines = [`${MARK[run.conclusion]} ${run.branch} ${run.workflow} · ${String(run.id)}`, `Triggered via ${run.event} ${ago(now, run.startedAt)}`, ''];
  if (run.invalid) {
    lines.push('X This run likely failed because of a workflow file issue.', '', 'ANNOTATIONS', ...run.invalid.map((l, i) => (i === 0 ? `X ${l}` : `  ${l}`)), '', `For more information, see: ${runUrl(host, repo, run.id)}`);
    return `${lines.join('\n')}\n`;
  }
  lines.push('JOBS', ...jobLines(run.jobs, opts.verbose === true));
  const notes = annotations(run);
  if (notes.length > 0) lines.push('', 'ANNOTATIONS', ...notes);
  if (run.artifacts.length > 0) lines.push('', 'ARTIFACTS', ...run.artifacts.map((a) => a.name));
  lines.push('');
  if (run.conclusion === 'failure') lines.push(`To see what failed, try: gh run view ${String(run.id)} --log-failed`);
  else lines.push('For more information about a job, try: gh run view --job=<job-id>');
  lines.push(`View this run on GitHub: ${runUrl(host, repo, run.id)}`);
  return `${lines.join('\n')}\n`;
}

/** --log・--log-failed: 「job<TAB>手順<TAB>時刻 行」の形 */
export function runLog(run: RunRecord, failedOnly: boolean, jobId?: number): string {
  const out: string[] = [];
  for (const j of run.jobs) {
    if (jobId !== undefined && j.id !== jobId) continue;
    if (failedOnly && j.conclusion !== 'failure') continue;
    for (const s of j.steps) {
      if (failedOnly && s.conclusion !== 'failure') continue;
      if (s.conclusion === 'skipped') continue;
      s.log.forEach((l, i) => out.push(`${j.name}\t${s.name}\t${stamp(s.startedAt, i)} ${l}`));
    }
  }
  return out.length === 0 ? '' : `${out.join('\n')}\n`;
}

/** gh run watch: 終わるまで見て、最後の様子と結果の 1 行 */
export function runWatch(run: RunRecord, now: number, host: string, repo: string): string {
  const view = runView(run, now, host, repo).split('\n');
  // 見続ける時は、終わった後の案内の行を出さない
  const body = view.filter((l) => !l.startsWith('To see what failed') && !l.startsWith('For more information about a job') && !l.startsWith('View this run on GitHub')).join('\n').trimEnd();
  return `Refreshing run status every 3 seconds. Press Ctrl+C to quit.\n\n${body}\n\n${MARK[run.conclusion]} Run ${run.workflow} (${String(run.id)}) completed with '${run.conclusion}'\n`;
}
