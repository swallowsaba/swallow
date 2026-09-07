import { HOOKS_DIR, gitPath } from '@/engines/git/gitdir';
import { defaultAuthor, initRepository } from '@/engines/git/repository';
import { mkdir } from '../vfs';
import type { CommandResult, CommandSpec, RunLineResult, ShellState } from '../registry';
import { basicSubcommands } from './gitBasic';
import { bisectSubcommands } from './gitBisect';
import { historySubcommands } from './gitHistory';
import { rebaseSubcommands } from './gitRebase';
import { refSubcommands } from './gitRefs';
import { remoteSubcommands } from './gitRemote';
import { NOT_A_REPO, type GitHandler } from './gitShared';

/**
 * git のサブコマンド表。
 * 実装は役割ごとに別ファイルへ分けてある（読む / 作り直す / リモート）。
 */
const subcommands: Record<string, GitHandler> = {
  ...basicSubcommands,
  ...historySubcommands,
  ...rebaseSubcommands,
  ...refSubcommands,
  ...bisectSubcommands,
  ...remoteSubcommands,
};

const SUBCOMMAND_NAMES = ['init', ...Object.keys(subcommands)].sort();

function runSubcommand(
  sub: string,
  argv: readonly string[],
  shell: ShellState,
  nowSeconds: number,
  runLine: (line: string, from?: ShellState) => RunLineResult,
): CommandResult {
  const rest = argv.slice(2);

  if (sub === 'init') {
    if (shell.git !== null) {
      return { stdout: `Reinitialized existing Git repository in ${shell.git.root}/.git/\n` };
    }
    const git = initRepository(shell.cwd, { ...defaultAuthor, timestamp: nowSeconds });
    // 本物と同じく hooks の置き場を先に作っておく
    const vfs = mkdir(shell.vfs, gitPath(git, HOOKS_DIR), true);
    return {
      stdout: `Initialized empty Git repository in ${shell.cwd}/.git/\n`,
      patch: { git, vfs },
    };
  }

  const git = shell.git;
  if (git === null) return { stderr: NOT_A_REPO, code: 128 };

  const handler = subcommands[sub];
  if (handler === undefined) {
    return { stderr: `git: '${sub}' is not a git command. See 'git help'.\n`, code: 1 };
  }
  return handler({ git, shell, sub, rest, nowSeconds, runLine });
}

function usage(): string {
  const lines: string[] = ['usage: git <command>'];
  for (let i = 0; i < SUBCOMMAND_NAMES.length; i += 8) {
    lines.push(`  ${SUBCOMMAND_NAMES.slice(i, i + 8).join(' ')}`);
  }
  return `${lines.join('\n')}\n`;
}

export const gitCommands: CommandSpec[] = [
  {
    name: 'git',
    summary: 'バージョン管理（init/add/commit/status/log/branch/switch ほか）',
    complete: ({ prefix }) => SUBCOMMAND_NAMES.filter((s) => s.startsWith(prefix)),
    handler: ({ argv, shell, clock, runLine }) => {
      const sub = argv[1];
      if (sub === undefined) return { stdout: usage() };
      return runSubcommand(sub, argv, shell, Math.floor(clock.nowMs / 1000), runLine);
    },
  },
];
