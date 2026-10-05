import { REBASE_HEAD_NAME, REBASE_ONTO, REBASE_PLAIN, readGitFile } from '@/engines/git/gitdir';
import { currentBranch, headCommit, status } from '@/engines/git/repository';
import { aheadBehind } from '@/engines/git/remote';
import { parseCommit } from '@/engines/git/objects';
import { peel } from '@/engines/git/refs';
import { changeStats, summaryLines } from '@/engines/git/stat';
import type { GitState } from '@/engines/git/types';
import type { CommandResult, RunLineResult, ShellState } from '../registry';
import { exists, readFile } from '../vfs';

export const NOT_A_REPO =
  'fatal: not a git repository (or any of the parent directories): .git\n';

/** サブコマンドの実装に渡す文脈 */
export interface GitContext {
  git: GitState;
  shell: ShellState;
  /** サブコマンド名。switch と checkout のように名前で振る舞いが変わるものが使う */
  sub: string;
  /** サブコマンドより後ろの引数 */
  rest: readonly string[];
  nowSeconds: number;
  /** hook のように、別のコマンドを起動する必要があるものが使う */
  runLine: (line: string, from?: ShellState) => RunLineResult;
}

export type GitHandler = (ctx: GitContext) => CommandResult;

export function short(hash: string): string {
  return hash.slice(0, 7);
}

export function commitOutput(
  git: GitState,
  hash: string,
  empty: boolean,
  message: string,
): CommandResult {
  if (empty) {
    return { stdout: 'nothing to commit, working tree clean\n', code: 1 };
  }
  const branch = currentBranch(git) ?? 'HEAD';
  // 親の無い最初の記録は、本物と同じく (root-commit) と出す
  const object = git.objects.read(hash);
  const parents = object?.type === 'commit' ? parseCommit(object.body).parents : [];
  // 本物と同じく、変えたファイルの集計と create mode の行が続く（衝突を解いて記録した合わせる記録には出ない）
  const stats = parents.length > 1 ? '' : summaryLines(changeStats(git, parents[0] ?? null, hash));
  return {
    stdout: `[${branch}${parents.length === 0 ? ' (root-commit)' : ''} ${short(hash)}] ${message}\n${stats}`,
    patch: { git },
  };
}

/** 作業ツリーのファイルの中身（リポジトリの中のパスで。無ければ空） */
function readWorktree(git: GitState, shell: ShellState, path: string): string {
  const full = `${git.root}/${path}`;
  return exists(shell.vfs, full) ? readFile(shell.vfs, full) : '';
}

export function formatStatus(git: GitState, shell: ShellState): string {
  const report = status(git, shell.vfs);
  const lines: string[] = [];
  // 載せ替え（rebase）の途中は、本物と同じくどの枝をどこへ載せ替えているかを言う
  const rebasing = readGitFile(shell.vfs, git, REBASE_PLAIN) === null
    ? null
    : { onto: short((readGitFile(shell.vfs, git, REBASE_ONTO) ?? '').trim()), branch: (readGitFile(shell.vfs, git, REBASE_HEAD_NAME) ?? '').trim() };
  lines.push(
    rebasing !== null
      ? `interactive rebase in progress; onto ${rebasing.onto}`
      : report.branch === null
        ? `HEAD detached at ${short(report.detached ?? '')}`
        : `On branch ${report.branch}`,
  );

  const branch = report.branch;
  if (branch !== null && git.refs.has(`refs/remotes/origin/${branch}`)) {
    const gap = aheadBehind(git, 'origin', branch);
    if (gap.ahead > 0 && gap.behind > 0) {
      lines.push(`Your branch and 'origin/${branch}' have diverged,`);
      lines.push(`and have ${String(gap.ahead)} and ${String(gap.behind)} different commits each.`);
    } else if (gap.ahead > 0) {
      lines.push(`Your branch is ahead of 'origin/${branch}' by ${String(gap.ahead)} commit(s).`);
    } else if (gap.behind > 0) {
      lines.push(`Your branch is behind 'origin/${branch}' by ${String(gap.behind)} commit(s).`);
    } else {
      lines.push(`Your branch is up to date with 'origin/${branch}'.`);
    }
  }

  // 取り込みの途中: 印の残るファイルは「両方が変えた（both modified）」として別に出す
  const markers = /^(<{7}|={7}|>{7})( |$)/m;
  const conflicted = git.mergeHead === null && rebasing === null ? [] : report.unstaged.filter((e) => markers.test(readWorktree(git, shell, e.path)));
  const unstaged = report.unstaged.filter((e) => !conflicted.includes(e));
  if (rebasing !== null) {
    lines.push(`You are currently rebasing branch '${rebasing.branch}' on '${rebasing.onto}'.`);
    if (conflicted.length > 0) {
      lines.push('  (fix conflicts and then run "git rebase --continue")');
      lines.push('  (use "git rebase --skip" to skip this patch)');
      lines.push('  (use "git rebase --abort" to check out the original branch)');
    } else {
      lines.push('  (all conflicts fixed: run "git rebase --continue")');
    }
  } else if (git.mergeHead !== null && conflicted.length > 0) {
    lines.push('You have unmerged paths.');
    lines.push('  (fix conflicts and run "git commit")');
  } else if (git.mergeHead !== null) {
    lines.push('All conflicts fixed but you are still merging.');
    lines.push('  (use "git commit" to conclude merge)');
  }

  if (headCommit(git) === null && report.staged.length === 0) {
    lines.push('', 'No commits yet');
  }

  if (report.staged.length > 0) {
    lines.push('', 'Changes to be committed:', '  (use "git restore --staged <file>..." to unstage)');
    for (const entry of report.staged) {
      const label = entry.state === 'added' ? 'new file' : entry.state;
      // 本物と同じく、名前の欄を 12 字にそろえる（deleted: の後は空白 4 つ）
      lines.push(`\t${`${label}:`.padEnd(12)}${entry.path}`);
    }
  }
  if (conflicted.length > 0) {
    lines.push('', 'Unmerged paths:', '  (use "git add <file>..." to mark resolution)');
    for (const entry of conflicted) lines.push(`\tboth modified:   ${entry.path}`);
  }
  if (unstaged.length > 0) {
    lines.push('', 'Changes not staged for commit:', '  (use "git add <file>..." to update what will be committed)');
    for (const entry of unstaged) lines.push(`\t${`${entry.state}:`.padEnd(12)}${entry.path}`);
  }
  if (report.untracked.length > 0) {
    lines.push('', 'Untracked files:', '  (use "git add <file>..." to include in what will be committed)');
    for (const path of report.untracked) lines.push(`\t${path}`);
  }
  if (report.clean) lines.push('', 'nothing to commit, working tree clean');
  // 選んだ物が無い時は、本物と同じく最後に add を促す
  else if (report.staged.length === 0 && git.mergeHead === null && rebasing === null) {
    lines.push('', report.unstaged.length > 0
      ? 'no changes added to commit (use "git add" and/or "git commit -a")'
      : 'nothing added to commit but untracked files present (use "git add" to track)');
  }
  return `${lines.join('\n')}\n`;
}

/* ---- 記録の日付と作者 ---- */

const JST_OFFSET = 9 * 3600;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 1970-01-01 からの日数（グレゴリオ暦）。Date を使わずに数える */
function daysFromCivil(y: number, m: number, d: number): number {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** daysFromCivil の逆 */
function civilFromDays(z: number): { y: number; m: number; d: number } {
  const zz = z + 719468;
  const era = Math.floor(zz / 146097);
  const doe = zz - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  return { y: yoe + era * 400 + (m <= 2 ? 1 : 0), m, d };
}

/** 「2026-09-29 14:30」「2026-09-29 14:30:05」「2026-09-29T14:30」を、日本時間の UNIX 秒にする。読めなければ null */
export function parseLocalTime(text: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(text.trim());
  if (!m) return null;
  const n = (i: number): number => Number(m[i] ?? 0);
  return daysFromCivil(n(1), n(2), n(3)) * 86400 + n(4) * 3600 + n(5) * 60 + n(6) - JST_OFFSET;
}

/** 本物の git log の日付の形（Sat Oct 3 09:00:00 2026 +0900）。時刻は記録の時差で出す */
export function formatGitDate(timestamp: number, timezone: string): string {
  const sign = timezone.startsWith('-') ? -1 : 1;
  const offset = sign * (Number(timezone.slice(1, 3)) * 3600 + Number(timezone.slice(3, 5)) * 60);
  const local = timestamp + (Number.isNaN(offset) ? 0 : offset);
  const days = Math.floor(local / 86400);
  const secs = local - days * 86400;
  const { y, m, d } = civilFromDays(days);
  const pad = (n: number): string => String(n).padStart(2, '0');
  const clock = `${pad(Math.floor(secs / 3600))}:${pad(Math.floor((secs % 3600) / 60))}:${pad(secs % 60)}`;
  // 1970-01-01 は木曜
  const weekday = DAYS[(((days + 4) % 7) + 7) % 7] ?? '';
  return `${weekday} ${MONTHS[m - 1] ?? ''} ${String(d)} ${clock} ${String(y)} ${timezone}`;
}

/* ---- git log の絞り込み ---- */

export interface LogOptions {
  oneline: boolean;
  /** --all: 全ての枝（とタグ・リモートの枝）の先から辿る */
  all: boolean;
  patch: boolean;
  max: number | null;
  since: number | null;
  until: number | null;
  author: string | null;
  /** 辿り始める記録（origin/main・HEAD~1 など）。A..B は B から辿れて A から辿れない記録 */
  revs: string[];
}

/** --since・--until の日付。「2026-10-01」（その日の 0 時）・「2026-10-01 14:30」・yesterday・「3 days ago」「2.hours.ago」 */
export function parseApproxDate(text: string, now: number): number | null {
  const t = text.trim().toLowerCase();
  if (t === 'yesterday') return now - 86400;
  if (t === 'now') return now;
  const ago = /^(\d+)[ .](second|minute|hour|day|week)s?[ .]ago$/.exec(t);
  if (ago) {
    const unit = { second: 1, minute: 60, hour: 3600, day: 86400, week: 604800 }[ago[2] as 'second'];
    return now - Number(ago[1]) * unit;
  }
  return parseLocalTime(t) ?? parseLocalTime(`${t} 00:00`);
}

/** git log の引数（-1・-n 2・--max-count=2・-p・--oneline・--author・--since/--after・--until/--before） */
export function parseLogArgs(rest: readonly string[], now: number): LogOptions | { error: string } {
  const opts: LogOptions = { oneline: false, all: false, patch: false, max: null, since: null, until: null, author: null, revs: [] };
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i] ?? '';
    const [name = '', inline] = arg.startsWith('--') ? arg.split(/=(.*)/s) : [arg];
    const value = (): string => inline ?? rest[(i += 1)] ?? '';
    // -- の後はパス（ここでは絞らない）
    if (arg === '--') break;
    if (arg === '--oneline') opts.oneline = true;
    else if (arg === '--all') opts.all = true;
    else if (arg === '-p' || arg === '--patch') opts.patch = true;
    else if (/^-\d+$/.test(arg)) opts.max = Number(arg.slice(1));
    else if (/^-n\d+$/.test(arg)) opts.max = Number(arg.slice(2));
    else if (arg === '-n' || name === '--max-count') opts.max = Number(value());
    else if (name === '--author') opts.author = value();
    else if (name === '--since' || name === '--after' || name === '--until' || name === '--before') {
      const raw = value();
      const when = parseApproxDate(raw, now);
      if (when === null) return { error: `fatal: invalid date format: ${raw}\n` };
      if (name === '--since' || name === '--after') opts.since = when;
      else opts.until = when;
    } else if (!arg.startsWith('-')) opts.revs.push(arg);
  }
  return opts;
}

/** git log の枝の印（本物と同じく、端末では既定で付く）。「 (HEAD -> main, tag: v1.0, origin/main, feature)」か空 */
export function decorationOf(git: GitState, hash: string): string {
  const current = currentBranch(git);
  const names: string[] = [];
  if (current !== null && git.refs.get(`refs/heads/${current}`) === hash) names.push(`HEAD -> ${current}`);
  else if (current === null && headCommit(git) === hash) names.push('HEAD');
  // 注釈付きタグは、指している記録まで剥がして比べる
  const refs = [...git.refs].filter(([, h]) => peel(git, h) === hash).map(([r]) => r).sort();
  for (const r of refs) if (r.startsWith('refs/tags/')) names.push(`tag: ${r.slice('refs/tags/'.length)}`);
  for (const r of refs) if (r.startsWith('refs/remotes/')) names.push(r.slice('refs/remotes/'.length));
  for (const r of refs) if (r.startsWith('refs/heads/') && r !== `refs/heads/${current ?? ''}`) names.push(r.slice('refs/heads/'.length));
  return names.length === 0 ? '' : ` (${names.join(', ')})`;
}
