import {
  checksOf, editPull, findRun, latestReviews, markMerged, mergeBlockers, openPull, pullUrl, requestReview, type Forge, type ForgePull,
} from '@/engines/github/forge';
import { runList, runLog, runView, runWatch } from '@/engines/cicd/ghRun';
import type { RunRecord } from '@/engines/cicd/types';
import { parseCommit } from '@/engines/git/objects';
import { currentBranch, headCommit } from '@/engines/git/repository';
import { START_TIME } from '../cron';
import type { CommandContext, CommandResult, GitServer, ShellState } from '../registry';
import { normalize } from '../path';
import { createShellState } from '../session';
import { exists, readFile } from '../vfs';
import { fromLines, parseArgs } from './args';
import { parseLocalTime } from './gitShared';

/**
 * gh pr・gh run を、Git のサーバの Pull Request の置き場（forge）に向けて打つ（本物の gh と同じ書き方）。
 * 今いるリポジトリの origin が、置き場の付いたサーバの時に使う（src/engines/kernel/commands/gh.ts が振り分ける）。
 */

/** 今いるリポジトリの origin のサーバ（置き場が付いている物だけ） */
export function forgeServer(shell: ShellState): GitServer | null {
  const url = shell.git?.remotes.get('origin')?.url.replace(/\/+$/, '');
  if (url === undefined) return null;
  const server = [...(shell.gitServers?.values() ?? [])].find((g) => g.url === url || g.ssh === url);
  return server?.forge ? server : null;
}

const hostOf = (server: GitServer): string => /^https:\/\/([^/]+)\//.exec(server.url)?.[1] ?? 'git.example';

const withForge = (shell: ShellState, server: GitServer, forge: Forge): Partial<ShellState> => {
  const servers = new Map(shell.gitServers);
  servers.set(server.url, { ...server, forge });
  return { gitServers: servers };
};

const STATE_WORD: Record<string, string> = { COMMENTED: 'Commented', CHANGES_REQUESTED: 'Changes requested', APPROVED: 'Approved' };

function pickPull(forge: Forge, shell: ShellState, operand: string | undefined): ForgePull | string {
  if (operand !== undefined) {
    const n = Number(operand.replace(/^#/, ''));
    const hit = Number.isInteger(n) ? forge.pulls.find((p) => p.number === n) : forge.pulls.find((p) => p.head === operand);
    return hit ?? `no pull requests found for branch "${operand}"`;
  }
  // 番号を書かなければ、今いる枝の依頼
  const branch = shell.git ? currentBranch(shell.git) : null;
  const hit = [...forge.pulls].reverse().find((p) => p.head === branch);
  return hit ?? `no pull requests found for branch "${branch ?? ''}"`;
}

function viewPull(forge: Forge, server: GitServer, pull: ForgePull): string {
  const reviews = latestReviews(pull);
  const checks = checksOf(forge, server.state, pull);
  const failing = checks.filter((c) => !c.ok).length;
  return fromLines([
    `${pull.title} ${forge.setup.repo}#${String(pull.number)}`,
    `${pull.state === 'OPEN' ? 'Open' : pull.state === 'MERGED' ? 'Merged' : 'Closed'} • ${pull.author} wants to merge into ${pull.base} from ${pull.head}`,
    `Reviewers: ${reviews.length === 0 ? '（まだいない）' : reviews.map((r) => `${r.login} (${STATE_WORD[r.state] ?? r.state})`).join(', ')}`,
    `Checks: ${checks.length === 0 ? '（無し）' : failing > 0 ? `${String(failing)} failing` : 'all passing'}`,
    '',
    ...(pull.body === '' ? ['  No description provided'] : pull.body.split('\n').map((l) => `  ${l}`)),
    '',
    ...(reviews.length === 0 ? [] : ['——— レビュー ———', ...pull.reviews.flatMap((r) => [`${r.login} (${STATE_WORD[r.state] ?? r.state})`, `  ${r.body}`, ''])]),
    `View this pull request on the web: ${pullUrl(forge, hostOf(server), pull.number)}`,
  ]);
}

/** 取り込む: サーバの履歴で、base に head を取り込む記録を作る（git の merge と push をサーバの控えで打つ） */
function mergeOnServer(ctx: CommandContext, server: GitServer, pull: ForgePull): { servers: ReadonlyMap<string, GitServer> | undefined; error: string | null } {
  let state = createShellState({ files: { '/srv': null }, cwd: '/srv', gitServers: ctx.shell.gitServers });
  for (const line of [
    `git clone ${server.url} merge`,
    'cd merge',
    `git switch ${pull.base}`,
    `git merge --no-ff origin/${pull.head} -m "Merge pull request #${String(pull.number)} from ${pull.head}"`,
    `git push origin ${pull.base}`,
  ]) {
    const r = ctx.runLine(line, state);
    if (r.code !== 0) return { servers: undefined, error: r.stderr.trim() || `${line} が失敗した` };
    state = r.state;
  }
  return { servers: state.gitServers, error: null };
}

/** gh api: 枝の保護の API だけを、本物の形で受ける（repos/持ち主/名前/branches/枝/protection） */
export function ghApiForge(ctx: CommandContext, server: GitServer): CommandResult {
  const { argv, shell } = ctx;
  const { values, operands } = parseArgs(argv.slice(1), { withValue: ['X', 'method', 'input'] });
  const method = (values.get('X') ?? values.get('method') ?? 'GET').toUpperCase();
  const m = /^\/?repos\/([^/]+\/[^/]+)\/branches\/([^/]+)\/protection$/.exec(operands[0] ?? '');
  const forge = server.forge;
  if (!forge) return { stderr: 'gh: Not Found (HTTP 404)\n', code: 1 };
  if (m?.[1] !== forge.setup.repo || m[2] === undefined) return { stderr: 'gh: Not Found (HTTP 404)\n', code: 1 };
  const branch = m[2];
  const json = (o: unknown): string => `${JSON.stringify(o, null, 2)}\n`;
  const shown = (p: NonNullable<typeof forge.setup.protect>): string => json({
    url: `https://api.github.com/repos/${forge.setup.repo}/branches/${branch}/protection`,
    required_status_checks: { strict: true, contexts: p.checks },
    required_pull_request_reviews: { required_approving_review_count: p.approvals },
    enforce_admins: { enabled: p.admins === true },
  });
  const held = forge.setup.protect?.branch === branch ? forge.setup.protect : undefined;
  if (method === 'GET') return held ? { stdout: shown(held) } : { stderr: 'gh: Branch not protected (HTTP 404)\n', code: 1 };
  const save = (protect: typeof forge.setup.protect): Partial<ShellState> => {
    const setup = { ...forge.setup };
    delete setup.protect;
    return withForge(shell, server, { ...forge, setup: { ...setup, ...(protect ? { protect } : {}) } });
  };
  if (method === 'DELETE') return held ? { patch: save(undefined) } : { stderr: 'gh: Branch not protected (HTTP 404)\n', code: 1 };
  if (method !== 'PUT') return { stderr: 'gh: Not Found (HTTP 404)\n', code: 1 };
  const file = values.get('input');
  if (file === undefined) return { stderr: 'gh: Invalid request.\n\nFor \'links/0/schema\', nil is not an object. (HTTP 422)\n', code: 1 };
  const path = normalize(file.startsWith('/') ? file : `${shell.cwd}/${file}`);
  if (!exists(shell.vfs, path)) return { stderr: `open ${file}: no such file or directory\n`, code: 1 };
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(readFile(shell.vfs, path)) as Record<string, unknown>;
  } catch {
    return { stderr: 'gh: Problems parsing JSON (HTTP 400)\n', code: 1 };
  }
  const missing = ['required_status_checks', 'enforce_admins', 'required_pull_request_reviews', 'restrictions'].find((k) => !(k in body));
  if (missing !== undefined) return { stderr: `gh: Invalid request.\n\n"${missing}" wasn't supplied. (HTTP 422)\n`, code: 1 };
  const checks = (body['required_status_checks'] as { contexts?: string[] } | null)?.contexts ?? [];
  const admins = body['enforce_admins'] === true;
  const approvals = (body['required_pull_request_reviews'] as { required_approving_review_count?: number } | null)?.required_approving_review_count ?? 0;
  const next = { branch, approvals, checks, enforce: true, admins };
  return { stdout: shown(next), patch: save(next) };
}

export function ghPrForge(ctx: CommandContext, server: GitServer): CommandResult {
  const forge = server.forge;
  if (!forge) return { stderr: 'この置き場には Pull Request がありません\n', code: 1 };
  const shell = ctx.shell;
  const parsed = parseArgs(['pr', ...ctx.argv.slice(2)], {
    withValue: ['base', 'B', 'head', 'H', 'title', 't', 'body', 'b', 'reviewer', 'r', 'add-reviewer'],
  });
  const action = parsed.operands[0] ?? 'status';
  const v = (long: string, short?: string): string | undefined => parsed.values.get(long) ?? (short ? parsed.values.get(short) : undefined);

  if (action === 'create') {
    const head = v('head', 'H') ?? (shell.git ? currentBranch(shell.git) : null) ?? '';
    const base = v('base', 'B') ?? 'main';
    // --fill: 題と説明を、枝の最後の記録の文から作る（本物と同じ）
    const tipHash = parsed.flags.has('fill') && shell.git ? headCommit(shell.git) : null;
    const tipObject = tipHash === null ? undefined : shell.git?.objects.read(tipHash);
    const filled = tipObject ? parseCommit(tipObject.body).message.trimEnd() : undefined;
    const title = v('title', 't') ?? filled?.split('\n')[0];
    if (title === undefined) return { stderr: 'must provide `--title` and `--body` (or `--fill`) when not running interactively\n', code: 1 };
    const user = shell.vars.get('USER') ?? 'learner';
    const opened = openPull(forge, server.state, { title, body: v('body', 'b') ?? filled ?? '', head, base, author: user });
    if (opened.error !== undefined || !opened.pull) return { stderr: `${opened.error ?? '依頼を作れない'}\n`, code: 1 };
    let next = opened.forge;
    const reviewers = (v('reviewer', 'r') ?? '').split(',').filter((x) => x !== '');
    if (reviewers.length > 0) {
      const r = requestReview(next, server.state, opened.pull.number, reviewers);
      if (r.error !== undefined) return { stderr: `${r.error}\n`, code: 1 };
      next = r.forge;
    }
    return {
      stdout: `\nCreating pull request for ${head} into ${base} in ${forge.setup.repo}\n\n${pullUrl(forge, hostOf(server), opened.pull.number)}\n`,
      patch: withForge(shell, server, next),
    };
  }

  if (action === 'list') {
    const open = forge.pulls.filter((p) => p.state === 'OPEN');
    if (open.length === 0) return { stdout: `no open pull requests in ${forge.setup.repo}\n` };
    return { stdout: fromLines([`Showing ${String(open.length)} of ${String(open.length)} open pull request in ${forge.setup.repo}`, '', ...open.map((p) => `#${String(p.number)}\t${p.title}\t${p.head}\tOPEN`)]) };
  }

  if (action === 'status') {
    return { stdout: fromLines([`Relevant pull requests in ${forge.setup.repo}`, '', ...forge.pulls.map((p) => `#${String(p.number)}  ${p.title} [${p.head}]  ${p.state}`)]) };
  }

  const pick = pickPull(forge, shell, parsed.operands[1]);
  if (typeof pick === 'string') return { stderr: `${pick}\n`, code: 1 };
  const pull = pick;

  if (action === 'view') return { stdout: viewPull(forge, server, pull) };

  if (action === 'checks') {
    const checks = checksOf(forge, server.state, pull);
    if (checks.length === 0) return { stdout: `no checks reported on the '${pull.head}' branch\n` };
    const failing = checks.filter((c) => !c.ok).length;
    const url = (run: number): string => `https://${hostOf(server)}/${forge.setup.repo}/actions/runs/${String(run)}`;
    return {
      stdout: fromLines([
        failing > 0 ? 'Some checks were not successful' : 'All checks were successful',
        `${String(checks.length - failing)} successful, ${String(failing)} failing, 0 pending checks`,
        '',
        ...checks.map((c) => `${c.ok ? '✓' : 'X'}  ${c.name}\t${c.ok ? 'pass' : 'fail'}\t${url(c.run)}`),
      ]),
      code: failing > 0 ? 1 : 0,
    };
  }

  if (action === 'edit') {
    const body = v('body', 'b');
    const title = v('title', 't');
    let next = forge;
    if (body !== undefined || title !== undefined) {
      const e = editPull(next, pull.number, { ...(body !== undefined ? { body } : {}), ...(title !== undefined ? { title } : {}) });
      if (e.error !== undefined) return { stderr: `${e.error}\n`, code: 1 };
      next = e.forge;
    }
    const add = (v('add-reviewer') ?? '').split(',').filter((x) => x !== '');
    if (add.length > 0) {
      const r = requestReview(next, server.state, pull.number, add);
      if (r.error !== undefined) return { stderr: `${r.error}\n`, code: 1 };
      next = r.forge;
    }
    return { stdout: `${pullUrl(forge, hostOf(server), pull.number)}\n`, patch: withForge(shell, server, next) };
  }

  if (action === 'merge') {
    const blockers = mergeBlockers(forge, server.state, pull);
    if (blockers.length > 0) {
      return {
        stderr: fromLines([
          `X Pull request ${forge.setup.repo}#${String(pull.number)} is not mergeable: the base branch policy prohibits the merge.`,
          ...blockers.map((b) => `  - ${b}`),
        ]),
        code: 1,
      };
    }
    const merged = mergeOnServer(ctx, server, pull);
    if (merged.error !== null || !merged.servers) return { stderr: `X 取り込めない: ${merged.error ?? ''}\n`, code: 1 };
    const servers = new Map(merged.servers);
    const after = servers.get(server.url);
    if (after) servers.set(server.url, { ...after, forge: markMerged(forge, pull.number) });
    return { stdout: `✓ Merged pull request ${forge.setup.repo}#${String(pull.number)} (${pull.title})\n`, patch: { gitServers: servers } };
  }

  return { stderr: `unknown command "${action}" for "gh pr"\n`, code: 1 };
}

/** gh run list・view・watch: GitHub Actions の実行（置き場に setup.actions がある時。src/engines/cicd） */
function ghRunActions(ctx: CommandContext, server: GitServer, forge: Forge, runs: readonly RunRecord[]): CommandResult {
  const parsed = parseArgs(['run', ...ctx.argv.slice(2)], { withValue: ['workflow', 'w', 'branch', 'b', 'limit', 'L', 'job', 'j'] });
  const [action, id] = parsed.operands;
  const v = (long: string, short: string): string | undefined => parsed.values.get(long) ?? parsed.values.get(short);
  const now = (parseLocalTime(ctx.shell.vars.get('__NOW') ?? START_TIME) ?? 0) + Math.floor(ctx.clock.nowMs / 1000);
  const host = hostOf(server);
  const repo = forge.setup.repo;
  if (action === 'list' || action === 'ls') {
    const limit = Number(v('limit', 'L') ?? '20');
    const workflow = v('workflow', 'w');
    const branch = v('branch', 'b');
    return { stdout: runList(runs, now, { ...(workflow !== undefined ? { workflow } : {}), ...(branch !== undefined ? { branch } : {}), limit: Number.isFinite(limit) ? limit : 20 }) };
  }
  if (action !== 'view' && action !== 'watch') return { stderr: `unknown command "${action ?? ''}" for "gh run"\n\nUsage:  gh run <command> [flags]\n\nAvailable commands:\n  list\n  view\n  watch\n`, code: 1 };
  // ID を書かなければ、一番新しい実行（本物の gh は選ぶ画面を出す）
  const run = id === undefined ? runs.at(-1) : runs.find((r) => String(r.id) === id);
  if (!run) return { stderr: id === undefined ? 'found no runs to view\n' : `could not find any workflow run with ID ${id}\n`, code: 1 };
  const exit = parsed.flags.has('exit-status') && run.conclusion === 'failure' ? 1 : 0;
  if (action === 'watch') return { stdout: runWatch(run, now, host, repo), code: exit };
  const job = v('job', 'j');
  if (parsed.flags.has('log-failed') || parsed.flags.has('log')) {
    const jobId = job === undefined ? undefined : Number(job);
    return { stdout: runLog(run, parsed.flags.has('log-failed'), jobId), code: exit };
  }
  return { stdout: runView(run, now, host, repo, { verbose: parsed.flags.has('verbose') || parsed.flags.has('v') }), code: exit };
}

/** gh run view <番号> [--log-failed | --log]: 自動の検査の実行のログ */
export function ghRunForge(ctx: CommandContext, server: GitServer): CommandResult {
  const forge = server.forge;
  if (!forge) return { stderr: 'この置き場には検査の実行がありません\n', code: 1 };
  if (forge.runs) return ghRunActions(ctx, server, forge, forge.runs);
  const parsed = parseArgs(['run', ...ctx.argv.slice(2)]);
  const [action, id] = parsed.operands;
  if (action !== 'view') return { stderr: `unknown command "${action ?? ''}" for "gh run"\n`, code: 1 };
  if (id === undefined) return { stderr: 'run or job ID required when not running interactively\n', code: 1 };
  const run = findRun(forge, server.state, Number(id));
  if (!run) return { stderr: `could not find any workflow run with ID ${id}\n`, code: 1 };
  if (parsed.flags.has('log-failed')) return { stdout: run.ok ? '' : fromLines(run.log.map((l) => `${run.name}\t${l}`)) };
  if (parsed.flags.has('log')) return { stdout: fromLines(run.log.map((l) => `${run.name}\t${l}`)) };
  return { stdout: fromLines([`${run.ok ? '✓' : 'X'} ${run.name} · ${String(run.run)}`, '', `JOBS`, `${run.ok ? '✓' : 'X'} ${run.name}`, '', run.ok ? '' : 'To see what failed, try: gh run view ' + String(run.run) + ' --log-failed']) };
}
