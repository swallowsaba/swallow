import { parseCommit } from '@/engines/git/objects';
import { materialize } from '@/engines/git/repository';
import type { GitState } from '@/engines/git/types';
import type { Forge } from '@/engines/github/forge';
import type { GitServer, RunLineResult, ShellState } from '@/engines/kernel/registry';
import { formatLocalTime, formatUtcTime } from '@/engines/kernel/commands/gitShared';
import { createShellState } from '@/engines/kernel/session';
import { exists, isDir, list, mkdir, readFile, writeFile, type VfsState } from '@/engines/kernel/vfs';
import { DEMO_ROOT } from '@/engines/tls/tls';
import { digestOf } from './project';
import type { ActionsSetup } from './setup';
import type { ArtifactRecord, Conclusion, JobRecord, JobShape, RunRecord, StepRecord } from './types';
import { readWorkflow, triggeredBy, type WfJob, type WfStep, type Workflow } from './workflow';

/**
 * GitHub Actions の runner。push でワークフローを動かす（Git のサーバの置き場 forge の setup.actions がある時）。
 *
 * - .github/workflows の YAML を読み、push の枝で動く物を、job の依存（needs）の順に動かす。互いに依存しない job は同じ時刻に並んで動く
 * - job ごとに新しい runner の機械（ubuntu-latest）を作り、actions/checkout で記録の中身を置き、run の行を本物のシェル（bash -e）で動かす
 * - 失敗した手順の後の手順は動かない（if: failure()・always() の物は動く）。依存する job が成功しなければ、その job は動かない
 * - 成果物（actions/upload-artifact・download-artifact）は、同じ実行の中だけで名前で受け渡す
 * - 時刻は push した時から始まり、npm の scripts の模型がかかる秒だけ進む（src/engines/cicd/project.ts）
 */

const CI_SECONDS = '__CI_SECONDS';

export interface PushArgs {
  /** push を受けたサーバ（forge に setup.actions がある） */
  url: string;
  servers: ReadonlyMap<string, GitServer>;
  branch: string;
  sha: string;
  nowSeconds: number;
  runLine: (line: string, from?: ShellState) => RunLineResult;
}

/** 日本時間の「2026-10-15 10:02:03」（runner の __NOW） */
export const localTime = (seconds: number): string => formatLocalTime(seconds);

/** 生のログの時刻（2026-10-15T01:02:03.4567890Z） */
export function stamp(seconds: number, i: number): string {
  // 行ごとに 0.07 秒ほど進める（100 ナノ秒の単位）
  const ticks = i * 731_234 + 4_321;
  const frac = String(ticks % 10_000_000).padStart(7, '0');
  return `${formatUtcTime(seconds + Math.floor(ticks / 10_000_000))}.${frac}Z`;
}

/** 実行の番号から決まる ID（gh run view で引く） */
export const runIdOf = (number: number): number => 4_200_000_000 + number * 1117;

const subjectOf = (git: GitState, sha: string): string => {
  const obj = git.objects.read(sha);
  return obj ? (parseCommit(obj.body).message.split('\n')[0] ?? '') : '';
};

/** ${{ github.sha }} などを置き換える（知らない物は空） */
function expand(text: string, ctx: Readonly<Record<string, string>>): string {
  return text.replace(/\$\{\{\s*([^}]*?)\s*\}\}/g, (_, expr: string) => ctx[expr.trim()] ?? '');
}

/** if: の条件（${{ }} は外す）。job の中で前に失敗した手順があるか・依存が失敗したかで決める */
function allowed(cond: string | undefined, failed: boolean): boolean {
  const c = (cond ?? 'success()').replace(/^\$\{\{\s*/, '').replace(/\s*\}\}$/, '').trim();
  if (c === 'always()' || c === '!cancelled()') return true;
  if (c === 'failure()') return failed;
  if (c === 'cancelled()') return false;
  return !failed;
}

/** runs-on のラベルに合う runner。提供される runner は ubuntu-*、自前の runner は全てのラベルを持つ物。無ければ null */
function runnerFor(actions: ActionsSetup | undefined, labels: readonly string[]): { network?: string } | null {
  if (labels.length === 0 || labels.every((l) => /^ubuntu-/.test(l))) return {};
  const hit = actions?.runners.find((r) => labels.every((l) => r.labels.includes(l)));
  return hit ? { ...(hit.network !== undefined ? { network: hit.network } : {}) } : null;
}

/** Secrets の値をログの中で *** に伏せる（本物と同じく、値が短くても長くても文字が同じなら伏せる） */
function masked(log: readonly string[], values: readonly string[]): string[] {
  return log.map((l) => values.reduce((t, v) => (v === '' ? t : t.split(v).join('***')), l));
}

const KNOWN_ACTIONS = ['actions/checkout@', 'actions/setup-node@', 'actions/upload-artifact@', 'actions/download-artifact@'];

/** その場所の下のファイル（場所 → 中身。場所はその場所からの相対） */
function filesUnder(vfs: VfsState, dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string, rel: string): void => {
    for (const name of list(vfs, d)) {
      const full = `${d}/${name}`;
      const r = rel === '' ? name : `${rel}/${name}`;
      if (isDir(vfs, full)) walk(full, r);
      else out[r] = readFile(vfs, full);
    }
  };
  if (exists(vfs, dir) && isDir(vfs, dir)) walk(dir, '');
  else if (exists(vfs, dir)) out[dir.slice(dir.lastIndexOf('/') + 1)] = readFile(vfs, dir);
  return out;
}

function putFiles(vfs: VfsState, root: string, files: Readonly<Record<string, string>>): VfsState {
  let v = mkdir(vfs, root, true);
  for (const [rel, text] of Object.entries(files)) {
    const full = `${root}/${rel}`;
    v = mkdir(v, full.slice(0, full.lastIndexOf('/')), true);
    v = writeFile(v, full, text);
  }
  return v;
}

const sizeOf = (files: Readonly<Record<string, string>>): number =>
  Object.values(files).reduce((n, t) => n + new TextEncoder().encode(t).length, 0);

interface JobRun {
  record: JobRecord;
  servers: ReadonlyMap<string, GitServer>;
  end: number;
}

interface RunContext {
  args: PushArgs;
  forge: Forge;
  repo: string;
  workflow: Workflow;
  number: number;
  id: number;
  files: Map<string, string>;
  artifacts: (ArtifactRecord & { at: number })[];
}

function runJob(rc: RunContext, job: WfJob, index: number, start: number, servers: ReadonlyMap<string, GitServer>): JobRun {
  const { args, repo, workflow } = rc;
  const name = repo.split('/')[1] ?? 'repo';
  const workspace = `/home/runner/work/${name}/${name}`;
  const jobId = rc.id * 10 + index + 1;
  const record = (steps: StepRecord[], conclusion: Conclusion, seconds: number, downloaded: string[]): JobRecord => ({
    id: jobId, key: job.key, name: job.name, needs: job.needs, conclusion, startedAt: start, seconds, steps, downloaded,
  });

  const unknown = job.steps.find((s) => s.uses !== undefined && !KNOWN_ACTIONS.some((a) => s.uses?.startsWith(a)));
  const setupLog = [
    "Current runner version: '2.320.0'",
    'Operating System',
    '  Ubuntu',
    '  24.04.1',
    '  LTS',
    'Runner Image',
    '  Image: ubuntu-24.04',
    `  Version: 20241006.1.0`,
  ];
  const labels = job.runsOn.split(',').map((l) => l.trim()).filter((l) => l !== '');
  const runner = runnerFor(rc.forge.setup.actions, labels);
  if (!runner) {
    const failed: StepRecord = { name: 'Set up job', conclusion: 'failure', startedAt: start, seconds: 0, log: [`##[error]No runner matching the specified labels was found: ${labels.join(', ')}.`] };
    return { record: record([failed], 'failure', 0, []), servers, end: start };
  }
  if (unknown) {
    const failed: StepRecord = { name: 'Set up job', conclusion: 'failure', startedAt: start, seconds: 0, log: [...setupLog, `##[error]Unable to resolve action \`${unknown.uses ?? ''}\`, repository or version not found`] };
    return { record: record([failed], 'failure', 0, []), servers, end: start };
  }

  const secrets = rc.forge.setup.actions?.secrets ?? {};
  const secretValues = Object.values(secrets);
  const ghCtx: Record<string, string> = {
    'github.sha': args.sha,
    'github.ref_name': args.branch,
    'github.ref': `refs/heads/${args.branch}`,
    'github.repository': repo,
    'github.run_id': String(rc.id),
    'github.run_number': String(rc.number),
    'github.workflow': workflow.name,
    'github.event_name': 'push',
    'runner.os': 'Linux',
    ...Object.fromEntries(Object.entries(secrets).map(([k, v]) => [`secrets.${k}`, v])),
  };
  const baseVars: Record<string, string> = {
    HOME: '/home/runner',
    USER: 'runner',
    HOSTNAME: `fv-az${String(400 + (rc.number % 97))}-${String(100 + index)}`,
    CI: 'true',
    GITHUB_ACTIONS: 'true',
    GITHUB_WORKSPACE: workspace,
    GITHUB_REPOSITORY: repo,
    GITHUB_SHA: args.sha,
    GITHUB_REF_NAME: args.branch,
    GITHUB_RUN_ID: String(rc.id),
    GITHUB_RUN_NUMBER: String(rc.number),
    RUNNER_OS: 'Linux',
    ...(runner.network !== undefined ? { __RUNNER_NET: runner.network } : {}),
    ...Object.fromEntries(Object.entries({ ...workflow.env, ...job.env }).map(([k, v]) => [k, expand(v, ghCtx)])),
  };
  let state: ShellState = createShellState({
    files: { '/home/runner': null, [workspace]: null, '/tmp': null },
    cwd: workspace,
    vars: baseVars,
    gitServers: servers,
    web: { sites: [], roots: [DEMO_ROOT], today: localTime(start).slice(0, 10), hostname: baseVars['HOSTNAME'] ?? 'runner' },
  });

  const steps: StepRecord[] = [{ name: 'Set up job', conclusion: 'success', startedAt: start, seconds: 0, log: setupLog }];
  let t = start;
  let failed = false;
  const downloaded: string[] = [];

  for (const step of job.steps) {
    const ctx = { ...ghCtx, ...Object.fromEntries(Object.entries({ ...baseVars, ...step.env }).map(([k, v]) => [`env.${k}`, v])) };
    if (!allowed(step.if, failed)) {
      steps.push({ name: expand(step.name, ctx), conclusion: 'skipped', startedAt: t, seconds: 0, log: [], ...(step.uses ? { uses: step.uses } : {}), ...(step.run ? { run: step.run } : {}) });
      continue;
    }
    const out = runStep(rc, step, ctx, state, workspace, t, baseVars);
    state = out.state;
    if (out.downloaded) downloaded.push(...out.downloaded);
    steps.push({ name: expand(step.name, ctx), conclusion: out.ok ? 'success' : 'failure', startedAt: t, seconds: out.seconds, log: masked(out.log, secretValues), ...(step.uses ? { uses: step.uses } : {}), ...(step.run ? { run: step.run } : {}) });
    t += out.seconds;
    if (!out.ok) failed = true;
  }
  steps.push({ name: 'Complete job', conclusion: 'success', startedAt: t, seconds: 0, log: ['Cleaning up orphan processes'] });
  return { record: record(steps, failed ? 'failure' : 'success', t - start, downloaded), servers: state.gitServers ?? servers, end: t };
}

interface StepOut {
  ok: boolean;
  seconds: number;
  log: string[];
  state: ShellState;
  downloaded?: string[];
}

function runStep(rc: RunContext, step: WfStep, ctx: Readonly<Record<string, string>>, state: ShellState, workspace: string, t: number, baseVars: Readonly<Record<string, string>>): StepOut {
  const uses = step.uses ?? '';
  const withLines = Object.keys(step.with).length === 0 ? [] : ['with:', ...Object.entries(step.with).map(([k, v]) => `  ${k}: ${expand(v, ctx)}`)];
  const head = (title: string, body: string[]): string[] => [`##[group]${title}`, ...body, '##[endgroup]'];
  const w = (k: string): string | undefined => (step.with[k] === undefined ? undefined : expand(step.with[k] ?? '', ctx));

  if (uses.startsWith('actions/checkout@')) {
    const vfs = putFiles(state.vfs, workspace, Object.fromEntries(rc.files));
    return {
      ok: true, seconds: 0, state: { ...state, vfs },
      log: [...head(`Run ${uses}`, ['with:', `  repository: ${rc.repo}`, ...withLines.slice(1)]), `Syncing repository: ${rc.repo}`, `HEAD is now at ${rc.args.sha.slice(0, 7)} ${subjectOf(serverOf(rc).state, rc.args.sha)}`],
    };
  }
  if (uses.startsWith('actions/setup-node@')) {
    const version = w('node-version') ?? '20';
    return { ok: true, seconds: 0, state, log: [...head(`Run ${uses}`, withLines), `Found in cache @ /opt/hostedtoolcache/node/${version.replace(/\.x$/, '')}.18.0/x64`, 'Environment details', '  node: v20.18.0', '  npm: 10.8.2'] };
  }
  if (uses.startsWith('actions/upload-artifact@')) {
    const name = w('name') ?? 'artifact';
    const path = (w('path') ?? '').trim().replace(/\/+$/, '');
    const full = path.startsWith('/') ? path : `${workspace}/${path}`;
    const files = path === '' ? {} : filesUnder(state.vfs, full);
    const log = head(`Run ${uses}`, withLines);
    if (Object.keys(files).length === 0) {
      return { ok: true, seconds: 0, state, log: [...log, `##[warning]No files were found with the provided path: ${w('path') ?? ''}. No artifacts will be uploaded.`] };
    }
    if (rc.artifacts.some((a) => a.name === name)) {
      return { ok: false, seconds: 0, state, log: [...log, '##[error]Failed to CreateArtifact: Received non-retryable error: Failed request: (409) Conflict: an artifact with this name already exists on the workflow run'] };
    }
    const digest = digestOf(files);
    const artifactId = rc.id + rc.artifacts.length + 1;
    rc.artifacts.push({ name, job: '', files, digest, at: t });
    const count = Object.keys(files).length;
    return {
      ok: true, seconds: 0, state,
      log: [
        ...log,
        `With the provided path, there will be ${String(count)} file${count === 1 ? '' : 's'} uploaded`,
        'Artifact name is valid!',
        'Root directory input is valid!',
        `Uploaded bytes ${String(sizeOf(files))}`,
        'Finished uploading artifact content to blob storage!',
        `SHA256 digest of uploaded artifact zip is ${digest}`,
        `Artifact ${name}.zip successfully finalized. Artifact ID ${String(artifactId)}`,
        `Artifact ${name} has been successfully uploaded! Final size is ${String(sizeOf(files))} bytes. Artifact ID is ${String(artifactId)}`,
      ],
    };
  }
  if (uses.startsWith('actions/download-artifact@')) {
    const name = w('name');
    const path = (w('path') ?? '').trim().replace(/\/+$/, '');
    const root = path === '' ? workspace : path.startsWith('/') ? path : `${workspace}/${path}`;
    const log = head(`Run ${uses}`, withLines);
    const ready = rc.artifacts.filter((a) => a.at <= t);
    if (name !== undefined) {
      const hit = ready.find((a) => a.name === name);
      if (!hit) {
        return {
          ok: false, seconds: 0, state,
          log: [
            ...log,
            'Downloading single artifact',
            `##[error]Unable to download artifact(s): Artifact not found for name: ${name}`,
            '        Please ensure that your artifact is not expired and the artifact was uploaded using a compatible version of toolkit/upload-artifact.',
            '        For more information, visit the GitHub Artifacts FAQ: https://github.com/actions/toolkit/blob/main/packages/artifact/docs/faq.md',
          ],
        };
      }
      return {
        ok: true, seconds: 0, downloaded: [name], state: { ...state, vfs: putFiles(state.vfs, root, hit.files) },
        log: [...log, 'Downloading single artifact', 'Preparing to download the following artifacts:', `- ${name} (Size: ${String(sizeOf(hit.files))}, Expected Digest: sha256:${hit.digest})`, `Starting download of artifact to: ${root}`, `SHA256 digest of downloaded artifact is ${hit.digest}`, 'Artifact download completed successfully.', 'Total of 1 artifact(s) downloaded', 'Download artifact has finished successfully'],
      };
    }
    let vfs = state.vfs;
    for (const a of ready) vfs = putFiles(vfs, `${root}/${a.name}`, a.files);
    return {
      ok: true, seconds: 0, downloaded: ready.map((a) => a.name), state: { ...state, vfs },
      log: [...log, 'No input name, artifact-ids or pattern filtered specified, downloading all artifacts', `Preparing to download the following artifacts:`, ...ready.map((a) => `- ${a.name} (Size: ${String(sizeOf(a.files))}, Expected Digest: sha256:${a.digest})`), `Total of ${String(ready.length)} artifact(s) downloaded`, 'Download artifact has finished successfully'],
    };
  }

  // run: 本物のシェルで、set -e（1 つでも失敗すれば、そこで止まる）として動かす
  const script = expand(step.run ?? '', ctx);
  const env = Object.entries(step.env);
  const log = head(`Run ${script.split('\n')[0] ?? ''}`, [
    ...script.split('\n'),
    'shell: /usr/bin/bash -e {0}',
    ...(env.length === 0 ? [] : ['env:', ...env.map(([k, v]) => `  ${k}: ${expand(v, ctx)}`)]),
  ]);
  const vars = new Map(Object.entries({ ...baseVars, ...Object.fromEntries(env.map(([k, v]) => [k, expand(v, ctx)])) }));
  vars.set('__NOW', localTime(t));
  vars.set(CI_SECONDS, '0');
  const r = rc.args.runLine(`set -e\n${script}`, { ...state, cwd: workspace, vars });
  const seconds = Number(r.state.vars.get(CI_SECONDS) ?? '0') || 0;
  const said = `${r.stdout}${r.stderr}`.replace(/\n$/, '');
  const lines = said === '' ? [] : said.split('\n');
  const ok = r.code === 0;
  return {
    ok, seconds,
    state: { ...r.state, cwd: workspace, vars: new Map(Object.entries(baseVars)) },
    log: [...log, ...lines, ...(ok ? [] : [`##[error]Process completed with exit code ${String(r.code)}.`])],
  };
}

const serverOf = (rc: RunContext): GitServer => rc.args.servers.get(rc.args.url) as GitServer;

/** 1 つのワークフローを動かした記録と、動かした後のサーバ（配った版が変わる） */
function runWorkflow(args: PushArgs, forge: Forge, workflow: Workflow, number: number, files: Map<string, string>, servers: ReadonlyMap<string, GitServer>): { run: RunRecord; servers: ReadonlyMap<string, GitServer> } {
  const id = runIdOf(number);
  const rc: RunContext = { args: { ...args, servers }, forge, repo: forge.setup.repo, workflow, number, id, files, artifacts: [] };
  const done = new Map<string, JobRun>();
  const order = workflow.jobs.map((j, i) => ({ j, i }));
  let current = servers;
  while (done.size < order.length) {
    // 依存が全て終わった job のうち、始まる時刻が一番早い物から（同じなら書いた順）
    const ready = order
      .filter(({ j }) => !done.has(j.key) && j.needs.every((n) => done.has(n)))
      .map(({ j, i }) => ({ j, i, start: Math.max(args.nowSeconds, ...j.needs.map((n) => done.get(n)?.end ?? args.nowSeconds)) }))
      .sort((a, b) => a.start - b.start || a.i - b.i);
    const next = ready[0];
    if (!next) break;
    const needsFailed = next.j.needs.some((n) => done.get(n)?.record.conclusion !== 'success');
    if (!allowed(next.j.if, needsFailed)) {
      const failedNeed = next.j.needs.find((n) => done.get(n)?.record.conclusion !== 'success');
      done.set(next.j.key, {
        record: { id: id * 10 + next.i + 1, key: next.j.key, name: next.j.name, needs: next.j.needs, conclusion: 'skipped', startedAt: next.start, seconds: 0, steps: [], downloaded: [], ...(failedNeed ? { skippedBecause: failedNeed } : {}) },
        servers: current, end: next.start,
      });
      continue;
    }
    const reviewers = next.j.environment !== undefined ? (rc.forge.setup.actions?.environments[next.j.environment]?.reviewers ?? []) : [];
    if (next.j.environment !== undefined && reviewers.length > 0) {
      done.set(next.j.key, {
        record: { id: id * 10 + next.i + 1, key: next.j.key, name: next.j.name, needs: next.j.needs, conclusion: 'waiting', startedAt: next.start, seconds: 0, steps: [], downloaded: [], waitingFor: next.j.environment },
        servers: current, end: next.start,
      });
      continue;
    }
    const before = rc.artifacts.length;
    const r = runJob({ ...rc, args: { ...rc.args, servers: current } }, next.j, next.i, next.start, current);
    for (const a of rc.artifacts.slice(before)) a.job = next.j.key;
    current = r.servers;
    done.set(next.j.key, r);
  }
  const jobs = workflow.jobs.map((j) => done.get(j.key)?.record).filter((x): x is JobRecord => x !== undefined);
  const end = Math.max(args.nowSeconds, ...[...done.values()].map((d) => d.end));
  const shape: JobShape[] = workflow.jobs.map((j) => ({ key: j.key, needs: j.needs, steps: j.steps.map((s) => s.uses ?? s.run ?? '') }));
  return {
    run: {
      id, number, workflow: workflow.name, file: workflow.file, title: subjectOf(serverOf(rc).state, args.sha), branch: args.branch, sha: args.sha, event: 'push',
      startedAt: args.nowSeconds, conclusion: jobs.some((j) => j.conclusion === 'failure') ? 'failure' : jobs.some((j) => j.conclusion === 'waiting') ? 'waiting' : 'success', seconds: end - args.nowSeconds,
      jobs, artifacts: rc.artifacts.map((a) => ({ name: a.name, job: a.job, files: a.files, digest: a.digest })), shape, triggers: Object.keys(workflow.on),
    },
    servers: current,
  };
}

/** push を受けて、動くワークフローを全て動かす。記録はサーバの forge の runs に足す */
export function runOnPush(args: PushArgs): ReadonlyMap<string, GitServer> {
  const server = args.servers.get(args.url);
  const forge = server?.forge;
  if (!server || !forge?.setup.actions) return args.servers;
  const files = materialize(server.state, args.sha);
  const flows = [...files.keys()].filter((p) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(p)).sort();
  let servers = args.servers;
  for (const file of flows) {
    const read = readWorkflow(file, files.get(file) ?? '');
    const now = servers.get(args.url);
    const f = now?.forge;
    if (!now || !f) break;
    const number = (f.setup.actions?.firstRun ?? 1) + (f.runs?.length ?? 0);
    let run: RunRecord;
    if (!read.ok) {
      run = {
        id: runIdOf(number), number, workflow: read.name, file, title: subjectOf(now.state, args.sha), branch: args.branch, sha: args.sha, event: 'push',
        startedAt: args.nowSeconds, conclusion: 'failure', seconds: 0, jobs: [], artifacts: [], shape: [], invalid: read.errors,
      };
    } else {
      if (!triggeredBy(read.workflow, 'push', args.branch)) continue;
      const out = runWorkflow({ ...args, servers }, f, read.workflow, number, files, servers);
      run = out.run;
      servers = out.servers;
    }
    const latest = servers.get(args.url) ?? now;
    const forgeNow = latest.forge ?? f;
    const next = new Map(servers);
    next.set(args.url, { ...latest, forge: { ...forgeNow, runs: [...(forgeNow.runs ?? []), run] } });
    servers = next;
  }
  return servers;
}
