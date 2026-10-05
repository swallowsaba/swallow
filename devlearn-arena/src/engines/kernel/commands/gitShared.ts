import { currentBranch, headCommit, status } from '@/engines/git/repository';
import { aheadBehind } from '@/engines/git/remote';
import { parseCommit } from '@/engines/git/objects';
import type { GitState } from '@/engines/git/types';
import type { CommandResult, RunLineResult, ShellState } from '../registry';

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
  const root = object?.type === 'commit' && parseCommit(object.body).parents.length === 0;
  return {
    stdout: `[${branch}${root ? ' (root-commit)' : ''} ${short(hash)}] ${message}\n`,
    patch: { git },
  };
}

export function formatStatus(git: GitState, shell: ShellState): string {
  const report = status(git, shell.vfs);
  const lines: string[] = [];
  lines.push(
    report.branch === null
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
    }
  }

  if (git.mergeHead !== null) {
    lines.push('You have unmerged paths.');
    lines.push('  (fix conflicts and run "git commit")');
  }

  if (headCommit(git) === null && report.staged.length === 0) {
    lines.push('', 'No commits yet');
  }

  if (report.staged.length > 0) {
    lines.push('', 'Changes to be committed:', '  (use "git restore --staged <file>..." to unstage)');
    for (const entry of report.staged) {
      const label = entry.state === 'added' ? 'new file' : entry.state;
      lines.push(`\t${label}:   ${entry.path}`);
    }
  }
  if (report.unstaged.length > 0) {
    lines.push('', 'Changes not staged for commit:', '  (use "git add <file>..." to update what will be committed)');
    for (const entry of report.unstaged) lines.push(`\t${entry.state}:   ${entry.path}`);
  }
  if (report.untracked.length > 0) {
    lines.push('', 'Untracked files:', '  (use "git add <file>..." to include in what will be committed)');
    for (const path of report.untracked) lines.push(`\t${path}`);
  }
  if (report.clean) lines.push('', 'nothing to commit, working tree clean');
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
