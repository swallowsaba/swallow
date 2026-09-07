import { currentBranch, headCommit, status } from '@/engines/git/repository';
import { aheadBehind } from '@/engines/git/remote';
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
  return {
    stdout: `[${branch} ${short(hash)}] ${message}\n`,
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
