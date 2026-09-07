import { load } from 'js-yaml';
import type { CheckRun, CheckStatus } from './types';

/**
 * ワークフローの評価。
 *
 * YAML を実際に構文解析し、job の依存関係（DAG）を評価する。
 * matrix は組み合わせに展開し、cache はキーの一致で当たり外れが決まり、
 * artifact は上げた job と下げた job の間でしか渡らない。
 * どれも作り置きの結果ではなく、その場で組み立てた状態から導く。
 */
export interface Step {
  name: string;
  run: string;
  uses: string;
  /** actions/cache や upload-artifact に渡す値 */
  with: Record<string, string>;
  condition: string | null;
}

export interface WorkflowJob {
  id: string;
  name: string;
  needs: string[];
  steps: Step[];
  /** if: 条件（always() / success() / failure()） */
  condition: string | null;
  /** strategy.matrix。鍵ごとの候補 */
  matrix: Record<string, string[]>;
  /** 再利用可能ワークフローを呼ぶ場合の相手 */
  uses: string | null;
  /** 呼び出し先へ渡す secrets の名前 */
  secrets: string[];
}

export interface Workflow {
  name: string;
  on: string[];
  jobs: WorkflowJob[];
  permissions: Record<string, string>;
}

export interface ParseError {
  error: string;
}

export function isWorkflowError(value: Workflow | ParseError): value is ParseError {
  return 'error' in value;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asStringList(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.map((v) => String(v));
  if (typeof value === 'object' && value !== null) return Object.keys(value);
  return [];
}

function asStringMap(value: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(asRecord(value))) out[k] = String(v);
  return out;
}

function toSteps(value: unknown): Step[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw) => {
    const step = asRecord(raw);
    const fallback =
      typeof step['run'] === 'string'
        ? step['run']
        : typeof step['uses'] === 'string'
          ? step['uses']
          : 'step';
    return {
      name: typeof step['name'] === 'string' ? step['name'] : fallback,
      run: typeof step['run'] === 'string' ? step['run'] : '',
      uses: typeof step['uses'] === 'string' ? step['uses'] : '',
      with: asStringMap(step['with']),
      condition: typeof step['if'] === 'string' ? step['if'] : null,
    };
  });
}

export function parseWorkflow(yaml: string): Workflow | ParseError {
  let doc: unknown;
  try {
    doc = load(yaml);
  } catch (error) {
    return { error: `ワークフローを読めません: ${String(error)}` };
  }
  const root = asRecord(doc);
  if (Object.keys(root).length === 0) return { error: 'ワークフローが空です' };

  const jobsRaw = asRecord(root['jobs']);
  const jobs: WorkflowJob[] = Object.entries(jobsRaw).map(([id, raw]) => {
    const job = asRecord(raw);
    const strategy = asRecord(job['strategy']);
    const matrixRaw = asRecord(strategy['matrix']);
    const matrix: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(matrixRaw)) {
      matrix[key] = asStringList(value).map((v) => String(v));
    }
    return {
      id,
      name: typeof job['name'] === 'string' ? job['name'] : id,
      needs: asStringList(job['needs']),
      steps: toSteps(job['steps']),
      condition: typeof job['if'] === 'string' ? job['if'] : null,
      matrix,
      uses: typeof job['uses'] === 'string' ? job['uses'] : null,
      secrets: Object.keys(asRecord(job['secrets'])),
    };
  });

  if (jobs.length === 0) return { error: 'jobs がありません' };

  // `on:` は文字列・配列・マップのどれでも書ける
  const on = asStringList(root['on'] ?? root[true as unknown as string]);

  return {
    name: typeof root['name'] === 'string' ? root['name'] : 'workflow',
    on,
    jobs,
    permissions: asStringMap(root['permissions']),
  };
}

/** matrix を組み合わせに展開する。順番は鍵の並び順で決まる（決定論） */
export function expandMatrix(matrix: Record<string, string[]>): Record<string, string>[] {
  const keys = Object.keys(matrix);
  if (keys.length === 0) return [{}];
  let combos: Record<string, string>[] = [{}];
  for (const key of keys) {
    const values = matrix[key] ?? [];
    combos = combos.flatMap((combo) => values.map((value) => ({ ...combo, [key]: value })));
  }
  return combos;
}

export interface RunOptions {
  /** 失敗させるジョブ id（matrix なら `id (v1, v2)` の形でも指定できる） */
  failing?: string[];
  /** 使えるシークレット。ここに無い名前を参照したジョブは失敗する */
  secrets?: Record<string, string>;
  /** 走らせる前から入っているキャッシュの鍵 */
  cache?: string[];
  /** 呼び出せる再利用可能ワークフロー。パス → 中身 */
  library?: Record<string, string>;
}

export interface RunResult {
  checks: CheckRun[];
  /** 走り終わったあとのキャッシュの鍵 */
  cache: string[];
  /** job 間で受け渡された成果物。名前 → 上げた job */
  artifacts: Record<string, string>;
}

const SECRET_PATTERN = /\$\{\{\s*secrets\.([A-Za-z0-9_]+)\s*\}\}/g;
const MATRIX_PATTERN = /\$\{\{\s*matrix\.([A-Za-z0-9_]+)\s*\}\}/g;

function substitute(text: string, combo: Record<string, string>): string {
  return text.replace(MATRIX_PATTERN, (_, key: string) => combo[key] ?? '');
}

/** 値に埋め込まれたシークレットは、ログでは伏せる */
function maskSecrets(text: string, secrets: Record<string, string>): string {
  let out = text;
  for (const value of Object.values(secrets)) {
    if (value !== '') out = out.split(value).join('***');
  }
  return out.replace(SECRET_PATTERN, '***');
}

function referencedSecrets(job: WorkflowJob): string[] {
  const found = new Set<string>(job.secrets);
  for (const step of job.steps) {
    for (const text of [step.run, ...Object.values(step.with)]) {
      for (const match of text.matchAll(SECRET_PATTERN)) {
        const name = match[1];
        if (name !== undefined) found.add(name);
      }
    }
  }
  return [...found];
}

interface Instance {
  job: WorkflowJob;
  /** matrix の組み合わせ。空なら matrix 無し */
  combo: Record<string, string>;
  /** 表示名。matrix なら組み合わせが付く */
  label: string;
}

function labelOf(job: WorkflowJob, combo: Record<string, string>): string {
  const values = Object.values(combo);
  return values.length === 0 ? job.name : `${job.name} (${values.join(', ')})`;
}

/**
 * job の DAG を評価する。
 *
 * 依存が失敗していれば skipped。always() なら実行し、failure() は失敗したときだけ実行する。
 * matrix は組み合わせごとに独立した job として走る。
 */
export function runWorkflow(workflow: Workflow, options: RunOptions = {}): RunResult {
  const failing = new Set(options.failing ?? []);
  const secrets = options.secrets ?? {};
  const cache = new Set(options.cache ?? []);
  const artifacts: Record<string, string> = {};
  const results = new Map<string, CheckRun[]>();
  const ordered: CheckRun[] = [];

  // 依存を先に評価する順に並べる
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
    const upstream = job.needs.flatMap((n) => results.get(n) ?? []);
    const upstreamMissing = job.needs.some((n) => !results.has(n));
    const upstreamFailed =
      upstreamMissing || upstream.some((r) => r.status !== 'success' && r.status !== 'skipped');
    const always = job.condition === 'always()';
    const onFailure = job.condition === 'failure()';

    const instances: Instance[] = expandMatrix(job.matrix).map((combo) => ({
      job,
      combo,
      label: labelOf(job, combo),
    }));

    const runs: CheckRun[] = [];
    for (const instance of instances) {
      let status: CheckStatus;
      const logs: string[] = [];

      if (onFailure && !upstreamFailed) {
        status = 'skipped';
        logs.push('if: failure() だが、依存は成功したので実行されませんでした');
      } else if (upstreamFailed && !always && !onFailure) {
        status = 'skipped';
        logs.push('依存するジョブが成功しなかったため実行されませんでした');
      } else {
        // 再利用可能ワークフローの呼び出し
        if (job.uses !== null) {
          const source = options.library?.[job.uses];
          if (source === undefined) {
            status = 'failure';
            logs.push(`呼び出し先が見つかりません: ${job.uses}`);
            runs.push({ name: instance.label, status, needs: job.needs, logs });
            continue;
          }
          const called = parseWorkflow(source);
          if (isWorkflowError(called)) {
            status = 'failure';
            logs.push(called.error);
            runs.push({ name: instance.label, status, needs: job.needs, logs });
            continue;
          }
          const inner = runWorkflow(called, {
            ...options,
            secrets: Object.fromEntries(job.secrets.map((n) => [n, secrets[n] ?? ''])),
            cache: [...cache],
          });
          const failed = inner.checks.some((c) => c.status === 'failure');
          status = failed ? 'failure' : 'success';
          logs.push(`再利用可能ワークフロー ${job.uses} を呼び出し`);
          for (const check of inner.checks) logs.push(`  ${check.name}: ${check.status}`);
          for (const key of inner.cache) cache.add(key);
          runs.push({ name: instance.label, status, needs: job.needs, logs });
          continue;
        }

        const missing = referencedSecrets(job).filter((name) => secrets[name] === undefined);
        if (missing.length > 0) {
          status = 'failure';
          logs.push(`secrets.${missing[0] ?? ''} が設定されていません`);
          runs.push({ name: instance.label, status, needs: job.needs, logs });
          continue;
        }

        const failsHere =
          failing.has(job.id) ||
          failing.has(instance.label) ||
          Object.values(instance.combo).some((v) => failing.has(`${job.id}:${v}`));
        status = failsHere ? 'failure' : 'success';

        job.steps.forEach((step, i) => {
          const head = `[${String(i + 1)}/${String(job.steps.length)}]`;
          const run = substitute(step.run, instance.combo);

          if (step.uses.startsWith('actions/cache')) {
            const key = substitute(step.with['key'] ?? '', instance.combo);
            const hit = cache.has(key);
            logs.push(`${head} cache ${hit ? 'hit' : 'miss'}: ${key}`);
            if (!hit) cache.add(key);
            return;
          }
          if (step.uses.startsWith('actions/upload-artifact')) {
            const name = substitute(step.with['name'] ?? 'artifact', instance.combo);
            artifacts[name] = job.id;
            logs.push(`${head} artifact を保存: ${name}`);
            return;
          }
          if (step.uses.startsWith('actions/download-artifact')) {
            const name = substitute(step.with['name'] ?? 'artifact', instance.combo);
            const from = artifacts[name];
            if (from === undefined) {
              status = 'failure';
              logs.push(`${head} artifact が見つかりません: ${name}`);
              return;
            }
            logs.push(`${head} artifact を取得: ${name}（${from} が保存したもの）`);
            return;
          }

          const label = substitute(step.name, instance.combo);
          const detail = run === '' ? (step.uses === '' ? '' : ` — ${step.uses}`) : ` — ${run}`;
          logs.push(
            maskSecrets(`${head} ${label}${detail}`, secrets) +
              (status === 'failure' && i === job.steps.length - 1 ? '  ← ここで失敗' : ''),
          );
        });
      }

      runs.push({ name: instance.label, status, needs: job.needs, logs });
    }

    results.set(job.id, runs);
    ordered.push(...runs);
  }

  return { checks: ordered, cache: [...cache], artifacts };
}
