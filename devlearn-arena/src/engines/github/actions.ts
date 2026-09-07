import type { CheckRun, CheckStatus } from './types';

/**
 * ワークフローの評価。
 * YAML を字下げから読み、on / jobs / needs / steps を取り出して
 * job の依存関係（DAG）を実際に評価する。
 * 失敗したジョブの下流は skipped になる。
 */
export interface WorkflowJob {
  id: string;
  name: string;
  needs: string[];
  steps: { name: string; run: string }[];
  /** if: 条件（簡易。always() と success() のみ） */
  condition: string | null;
}

export interface Workflow {
  name: string;
  on: string[];
  jobs: WorkflowJob[];
}

interface Line {
  indent: number;
  text: string;
}

function readLines(yaml: string): Line[] {
  return yaml
    .split('\n')
    .filter((line) => line.trim() !== '' && !line.trim().startsWith('#'))
    .map((line) => ({ indent: line.length - line.trimStart().length, text: line.trim() }));
}

function unquote(value: string): string {
  return value.replace(/^['"]|['"]$/g, '').trim();
}

/** ごく限られた形の YAML を読む。仕様の全体ではなく、教材に必要な範囲 */
export function parseWorkflow(yaml: string): Workflow | { error: string } {
  const lines = readLines(yaml);
  if (lines.length === 0) return { error: 'ワークフローが空です' };

  let name = 'workflow';
  const on: string[] = [];
  const jobs: WorkflowJob[] = [];

  let section: 'none' | 'on' | 'jobs' = 'none';
  let current: WorkflowJob | null = null;
  let inSteps = false;

  for (const line of lines) {
    if (line.indent === 0) {
      const [key, ...rest] = line.text.split(':');
      const value = rest.join(':').trim();
      section = key === 'on' ? 'on' : key === 'jobs' ? 'jobs' : 'none';
      if (key === 'name') name = unquote(value);
      if (key === 'on' && value !== '') {
        const inline = /\[(.*)\]/.exec(value);
        if (inline?.[1] !== undefined) on.push(...inline[1].split(',').map((v) => unquote(v)));
        else on.push(unquote(value));
      }
      continue;
    }

    if (section === 'on' && line.indent >= 2) {
      const key = line.text.replace(/:.*$/, '').replace(/^-\s*/, '');
      if (key !== '' && !key.startsWith('branches')) on.push(key);
      continue;
    }

    if (section !== 'jobs') continue;

    // ジョブの見出し（jobs 直下）
    if (line.indent === 2 && line.text.endsWith(':')) {
      if (current) jobs.push(current);
      current = { id: line.text.slice(0, -1), name: line.text.slice(0, -1), needs: [], steps: [], condition: null };
      inSteps = false;
      continue;
    }
    if (!current) continue;

    if (line.indent === 4) {
      inSteps = false;
      const [key, ...rest] = line.text.split(':');
      const value = rest.join(':').trim();
      if (key === 'name') current.name = unquote(value);
      if (key === 'if') current.condition = unquote(value);
      if (key === 'steps') inSteps = true;
      if (key === 'needs') {
        const inline = /\[(.*)\]/.exec(value);
        if (inline?.[1] !== undefined) current.needs.push(...inline[1].split(',').map((v) => unquote(v)));
        else if (value !== '') current.needs.push(unquote(value));
      }
      continue;
    }

    if (line.indent >= 6 && current.needs.length >= 0 && line.text.startsWith('- ') && !inSteps) {
      current.needs.push(unquote(line.text.slice(2)));
      continue;
    }

    if (inSteps && line.indent >= 6) {
      if (line.text.startsWith('- ')) {
        const rest = line.text.slice(2);
        const [key, ...tail] = rest.split(':');
        const value = tail.join(':').trim();
        current.steps.push({
          name: key === 'name' ? unquote(value) : rest,
          run: key === 'run' ? unquote(value) : '',
        });
        continue;
      }
      const [key, ...tail] = line.text.split(':');
      const value = tail.join(':').trim();
      const last = current.steps[current.steps.length - 1];
      if (!last) continue;
      if (key === 'name') last.name = unquote(value);
      if (key === 'run') last.run = unquote(value);
    }
  }
  if (current) jobs.push(current);

  if (jobs.length === 0) return { error: 'jobs がありません' };
  return { name, on, jobs };
}

export interface RunOptions {
  /** 失敗させるジョブ id */
  failing?: string[];
}

/**
 * job の DAG を評価する。
 * 依存が失敗していれば skipped。always() が付いていれば実行する。
 */
export function runWorkflow(workflow: Workflow, options: RunOptions = {}): CheckRun[] {
  const failing = new Set(options.failing ?? []);
  const results = new Map<string, CheckRun>();

  const order: WorkflowJob[] = [];
  const visited = new Set<string>();
  const visit = (job: WorkflowJob): void => {
    if (visited.has(job.id)) return;
    visited.add(job.id);
    for (const need of job.needs) {
      const parent = workflow.jobs.find((j) => j.id === need);
      if (parent) visit(parent);
    }
    order.push(job);
  };
  for (const job of workflow.jobs) visit(job);

  for (const job of order) {
    const upstream = job.needs.map((n) => results.get(n));
    const upstreamFailed = upstream.some((r) => r === undefined || r.status !== 'success');
    const always = job.condition === 'always()';

    let status: CheckStatus;
    if (upstreamFailed && !always) status = 'skipped';
    else if (failing.has(job.id)) status = 'failure';
    else status = 'success';

    const logs =
      status === 'skipped'
        ? ['依存するジョブが成功しなかったため実行されませんでした']
        : job.steps.map(
            (step, i) =>
              `[${String(i + 1)}/${String(job.steps.length)}] ${step.name}${step.run === '' ? '' : ` — ${step.run}`}` +
              (status === 'failure' && i === job.steps.length - 1 ? '  ← ここで失敗' : ''),
          );

    results.set(job.id, { name: job.name, status, needs: job.needs, logs });
  }

  return order.map((job) => results.get(job.id)).filter((r): r is CheckRun => r !== undefined);
}
