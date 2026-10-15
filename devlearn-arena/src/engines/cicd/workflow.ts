import { load } from 'js-yaml';

/**
 * GitHub Actions のワークフローの YAML を読む。純粋な関数。
 *
 * 読めない YAML・知らない鍵・runs-on の無い job・知らない job への needs・依存の輪は、
 * 本物の GitHub と同じ言い方の誤り（Invalid workflow file）にする。誤りのあるワークフローは、job を 1 つも動かさない。
 */

export interface WfStep {
  /** 画面に出る名前（name が無ければ「Run <uses か run の 1 行目>」） */
  name: string;
  id?: string;
  uses?: string;
  run?: string;
  with: Record<string, string>;
  env: Record<string, string>;
  if?: string;
}

export interface WfJob {
  key: string;
  name: string;
  needs: string[];
  runsOn: string;
  if?: string;
  env: Record<string, string>;
  steps: WfStep[];
}

export interface Workflow {
  name: string;
  file: string;
  /** きっかけ → 絞る枝（無ければどの枝でも） */
  on: Record<string, { branches?: string[] }>;
  env: Record<string, string>;
  jobs: WfJob[];
}

export type WorkflowRead = { ok: true; workflow: Workflow } | { ok: false; name: string; errors: string[] };

const JOB_KEYS = new Set([
  'name', 'runs-on', 'needs', 'steps', 'if', 'env', 'environment', 'strategy', 'timeout-minutes', 'permissions',
  'outputs', 'uses', 'with', 'secrets', 'services', 'container', 'concurrency', 'defaults', 'continue-on-error',
]);
const STEP_KEYS = new Set(['name', 'id', 'uses', 'run', 'with', 'env', 'if', 'shell', 'working-directory', 'continue-on-error', 'timeout-minutes']);
const ROOT_KEYS = new Set(['name', 'run-name', 'on', 'jobs', 'env', 'permissions', 'concurrency', 'defaults']);

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const strings = (v: unknown): string[] =>
  typeof v === 'string' ? [v] : Array.isArray(v) ? v.map((x) => String(x)) : [];

const stringMap = (v: unknown): Record<string, string> =>
  isRecord(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typeof x === 'string' ? x : JSON.stringify(x)])) : {};

/** 鍵が書いてある行と桁（1 から）。from の行より後ろから探す */
function place(lines: readonly string[], key: string, from = 0): { line: number; col: number } {
  const re = new RegExp(`^(\\s*(?:-\\s+)?)${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:`);
  for (let i = from; i < lines.length; i += 1) {
    const m = re.exec(lines[i] ?? '');
    if (m) return { line: i + 1, col: (m[1] ?? '').length + 1 };
  }
  return { line: from + 1, col: 1 };
}

/** job の名前の行（jobs: の下の「  名前:」） */
function jobLine(lines: readonly string[], key: string): number {
  const jobs = place(lines, 'jobs').line;
  return place(lines, key, jobs).line - 1;
}

/** job の steps の下の、手順ごとの始まりの行と桁（「- 」の所） */
function stepLines(lines: readonly string[], jobAt: number): { line: number; col: number }[] {
  const indent = (s: string): number => /^\s*/.exec(s)?.[0].length ?? 0;
  const jobIndent = indent(lines[jobAt] ?? '');
  const out: { line: number; col: number }[] = [];
  let dash: number | null = null;
  let inSteps = false;
  let stepsIndent = 0;
  for (let i = jobAt + 1; i < lines.length; i += 1) {
    const l = lines[i] ?? '';
    if (l.trim() === '' || l.trim().startsWith('#')) continue;
    if (indent(l) <= jobIndent) break;
    if (/^\s*steps\s*:/.test(l)) {
      inSteps = true;
      stepsIndent = indent(l);
      continue;
    }
    if (!inSteps) continue;
    // steps と同じ深さの別の鍵で、steps の段は終わる
    if (indent(l) <= stepsIndent && !/^\s*-\s/.test(l)) break;
    const m = /^(\s*)-\s/.exec(l);
    if (m && (dash === null || (m[1] ?? '').length === dash)) {
      dash = (m[1] ?? '').length;
      out.push({ line: i + 1, col: dash + 1 });
    }
  }
  return out;
}

function stepName(raw: Record<string, unknown>): string {
  if (typeof raw['name'] === 'string') return raw['name'];
  if (typeof raw['uses'] === 'string') return `Run ${raw['uses']}`;
  const run = typeof raw['run'] === 'string' ? raw['run'].split('\n')[0] ?? '' : '';
  return `Run ${run}`;
}

export function readWorkflow(file: string, text: string): WorkflowRead {
  const lines = text.split('\n');
  const where = (p: { line: number; col: number }): string => `${file} (Line: ${String(p.line)}, Col: ${String(p.col)})`;
  let doc: unknown;
  try {
    doc = load(text);
  } catch (e) {
    const mark = (e as { mark?: { line?: number } }).mark;
    const line = (mark?.line ?? 0) + 1;
    return { ok: false, name: file, errors: [`Invalid workflow file: ${file}#L${String(line)}`, `You have an error in your yaml syntax on line ${String(line)}`] };
  }
  if (!isRecord(doc)) return { ok: false, name: file, errors: [`Invalid workflow file: ${file}`, `${file}: No steps defined in \`steps\` and no workflow called in \`uses\``] };
  const name = typeof doc['name'] === 'string' ? doc['name'] : file;
  const errors: string[] = [];
  const fail = (p: { line: number; col: number }, message: string): void => {
    errors.push(`${where(p)}: ${message}`);
  };

  for (const k of Object.keys(doc)) if (!ROOT_KEYS.has(k) && k !== 'true') fail(place(lines, k), `Unexpected value '${k}'`);
  const onRaw = doc['on'] ?? doc['true'];
  const on: Workflow['on'] = {};
  if (typeof onRaw === 'string') on[onRaw] = {};
  else if (Array.isArray(onRaw)) for (const e of onRaw) on[String(e)] = {};
  else if (isRecord(onRaw)) {
    for (const [event, spec] of Object.entries(onRaw)) {
      const branches = isRecord(spec) ? strings(spec['branches']) : [];
      on[event] = branches.length > 0 ? { branches } : {};
    }
  } else fail({ line: 1, col: 1 }, 'Required property is missing: on');

  const jobsRaw = doc['jobs'];
  if (!isRecord(jobsRaw) || Object.keys(jobsRaw).length === 0) {
    fail({ line: 1, col: 1 }, 'Required property is missing: jobs');
    return { ok: false, name, errors: [`Invalid workflow file: ${file}`, ...errors] };
  }

  const jobs: WfJob[] = [];
  for (const [key, raw] of Object.entries(jobsRaw)) {
    const at = jobLine(lines, key);
    if (!isRecord(raw)) {
      fail({ line: at + 1, col: 3 }, `Unexpected value '${String(raw)}'`);
      continue;
    }
    for (const k of Object.keys(raw)) if (!JOB_KEYS.has(k)) fail(place(lines, k, at), `Unexpected value '${k}'`);
    if (raw['runs-on'] === undefined && raw['uses'] === undefined) fail({ line: at + 1, col: 3 }, 'Required property is missing: runs-on');
    const stepsRaw = raw['steps'];
    if (!Array.isArray(stepsRaw) || stepsRaw.length === 0) {
      if (raw['uses'] === undefined) fail({ line: at + 1, col: 3 }, 'Required property is missing: steps');
    }
    const steps: WfStep[] = [];
    const starts = stepLines(lines, at);
    for (const [i, s] of (Array.isArray(stepsRaw) ? stepsRaw : []).entries()) {
      const p = starts[i] ?? { line: at + 1, col: 3 };
      if (!isRecord(s)) {
        fail(p, `Unexpected value '${String(s)}'`);
        continue;
      }
      for (const k of Object.keys(s)) if (!STEP_KEYS.has(k)) fail(place(lines, k, p.line - 1), `Unexpected value '${k}'`);
      if (typeof s['run'] !== 'string' && typeof s['uses'] !== 'string') {
        fail(p, "There's not enough info to determine what you meant. Add one of these properties: run, shell, uses, with, working-directory");
        continue;
      }
      steps.push({
        name: stepName(s),
        ...(typeof s['id'] === 'string' ? { id: s['id'] } : {}),
        ...(typeof s['uses'] === 'string' ? { uses: s['uses'] } : {}),
        ...(typeof s['run'] === 'string' ? { run: s['run'].replace(/\n$/, '') } : {}),
        with: stringMap(s['with']),
        env: stringMap(s['env']),
        ...(typeof s['if'] === 'string' ? { if: s['if'] } : {}),
      });
    }
    jobs.push({
      key,
      name: typeof raw['name'] === 'string' ? raw['name'] : key,
      needs: strings(raw['needs']),
      runsOn: strings(raw['runs-on']).join(', '),
      ...(typeof raw['if'] === 'string' ? { if: raw['if'] } : {}),
      env: stringMap(raw['env']),
      steps,
    });
  }

  const keys = new Set(jobs.map((j) => j.key));
  for (const j of jobs) {
    for (const n of j.needs) if (!keys.has(n)) fail(place(lines, 'needs', jobLine(lines, j.key)), `Job '${j.key}' depends on unknown job '${n}'.`);
  }
  const cycle = findCycle(jobs);
  if (cycle) fail(place(lines, 'needs', jobLine(lines, cycle[0])), `Job '${cycle[0]}' depends on job '${cycle[1]}' which creates a cycle in the dependency graph.`);

  if (errors.length > 0) return { ok: false, name, errors: [`Invalid workflow file: ${file}#L${/Line: (\d+)/.exec(errors[0] ?? '')?.[1] ?? '1'}`, ...errors.map((e) => `The workflow is not valid. ${e}`)] };
  return { ok: true, workflow: { name, file, on, env: stringMap(doc['env']), jobs } };
}

/** 依存の輪（あれば、輪の中の job と、その次の job） */
function findCycle(jobs: readonly WfJob[]): [string, string] | null {
  const byKey = new Map(jobs.map((j) => [j.key, j]));
  const state = new Map<string, 'open' | 'done'>();
  let hit: [string, string] | null = null;
  const visit = (key: string): void => {
    if (hit) return;
    state.set(key, 'open');
    for (const n of byKey.get(key)?.needs ?? []) {
      if (!byKey.has(n)) continue;
      if (state.get(n) === 'open') {
        hit = [key, n];
        return;
      }
      if (!state.has(n)) visit(n);
    }
    state.set(key, 'done');
  };
  for (const j of jobs) if (!state.has(j.key)) visit(j.key);
  return hit;
}

/** その枝への push で動くか（branches は * と ** を使える） */
export function triggeredBy(workflow: Workflow, event: string, branch: string): boolean {
  const spec = workflow.on[event];
  if (!spec) return false;
  if (!spec.branches) return true;
  return spec.branches.some((b) => new RegExp(`^${b.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '.*').replace(/(?<!\.)\*/g, '[^/]*')}$`).test(branch));
}
