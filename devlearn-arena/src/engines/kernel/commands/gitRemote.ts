import {
  addPaths, currentBranch, headCommit, initRepository,
} from '@/engines/git/repository';
import {
  fastForwardTo,
} from '@/engines/git/history';
import { createRemote, fetch as fetchRemote, push as pushRemote } from '@/engines/git/remote';
import { checkoutWorktree } from '@/engines/git/worktree';
import { fromLines, parseArgs } from './args';
import { type GitHandler } from './gitShared';

/** 別インスタンスの仮想リモートとやり取りする操作 */
export const remoteSubcommands: Record<string, GitHandler> = {
  remote: ({ git, rest }) => {
    const { flags, operands } = parseArgs(['remote', ...rest]);
    if (operands[0] === 'add') {
      const name = operands[1];
      const url = operands[2] ?? `https://example.invalid/${name ?? 'repo'}.git`;
      if (name === undefined) return { stderr: 'usage: git remote add <name> <url>\n', code: 129 };
      if (git.remotes.has(name)) {
        return { stderr: `error: remote ${name} already exists.\n`, code: 3 };
      }
      const bare = initRepository(`/remote/${name}`, git.author);
      const remotes = new Map(git.remotes);
      remotes.set(name, createRemote(name, url, bare));
      return { patch: { git: { ...git, remotes } } };
    }
    const names = [...git.remotes.values()];
    if (flags.has('v')) {
      return {
        stdout: fromLines(
          names.flatMap((r) => [`${r.name}\t${r.url} (fetch)`, `${r.name}\t${r.url} (push)`]),
        ),
      };
    }
    return { stdout: fromLines(names.map((r) => r.name)) };
  },
  push: ({ git, rest }) => {
    const { flags, operands } = parseArgs(['push', ...rest]);
    const remoteName = operands[0] ?? 'origin';
    const branch = operands[1] ?? currentBranch(git) ?? 'main';
    const remote = git.remotes.get(remoteName);
    if (!remote) {
      return { stderr: `fatal: '${remoteName}' does not appear to be a git repository\n`, code: 128 };
    }
    const result = pushRemote(git, remote, branch, {
      force: flags.has('f') || rest.includes('--force'),
      forceWithLease: rest.includes('--force-with-lease'),
    });
    const remotes = new Map(git.remotes);
    remotes.set(remoteName, result.remote);
    if (!result.ok) {
      return { stderr: result.message, code: 1, patch: { git: { ...git, remotes } } };
    }
    return { stdout: result.message, patch: { git: { ...result.git, remotes } } };
  },
  fetch: ({ git, rest }) => {
    const { operands } = parseArgs(['fetch', ...rest]);
    const remoteName = operands[0] ?? 'origin';
    const remote = git.remotes.get(remoteName);
    if (!remote) {
      return { stderr: `fatal: '${remoteName}' does not appear to be a git repository\n`, code: 128 };
    }
    const result = fetchRemote(git, remote);
    return {
      stdout:
        result.updated.length === 0
          ? ''
          : `From ${remote.url}\n${result.updated.map((b) => `   ${b} -> ${remoteName}/${b}`).join('\n')}\n`,
      patch: { git: result.git },
    };
  },
  pull: ({ git, shell, rest }) => {
    const { operands } = parseArgs(['pull', ...rest]);
    const remoteName = operands[0] ?? 'origin';
    const branch = operands[1] ?? currentBranch(git) ?? 'main';
    const remote = git.remotes.get(remoteName);
    if (!remote) {
      return { stderr: `fatal: '${remoteName}' does not appear to be a git repository\n`, code: 128 };
    }
    const fetched = fetchRemote(git, remote);
    const target = fetched.git.refs.get(`refs/remotes/${remoteName}/${branch}`);
    if (target === undefined) return { stdout: 'Already up to date.\n', patch: { git: fetched.git } };

    const head = headCommit(fetched.git);
    if (head === target) return { stdout: 'Already up to date.\n', patch: { git: fetched.git } };

    const moved = fastForwardTo(fetched.git, target);
    const vfs = checkoutWorktree(shell.vfs, moved, head, target);
    const staged = addPaths(moved, vfs, ['.']);
    return { stdout: 'Fast-forward\n', patch: { git: staged.git, vfs } };
  },
};
