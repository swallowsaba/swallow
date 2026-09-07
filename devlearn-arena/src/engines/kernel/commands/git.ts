import { mergeThreeWay } from '@/engines/git/merge';
import {
  aheadBehind, createRemote, fetch as fetchRemote, push as pushRemote,
} from '@/engines/git/remote';
import {
  addPaths, branches, commit, commitMerge, createBranch, currentBranch, defaultAuthor,
  diffStaged, diffWorktree, fastForwardTo, headCommit, initRepository, log,
  planMerge, popStash, pushStash, rebaseOnto, replayCommit, reset, revertCommit, status,
  switchBranch, unstage, type ResetMode,
} from '@/engines/git/repository';
import type { GitState } from '@/engines/git/types';
import { checkoutWorktree } from '@/engines/git/worktree';
import { decode } from '@/engines/git/objects';
import { resolve } from '../path';
import type { CommandResult, CommandSpec, ShellState } from '../registry';
import { writeFile } from '../vfs';
import { fromLines, parseArgs } from './args';

const NOT_A_REPO =
  'fatal: not a git repository (or any of the parent directories): .git\n';

function short(hash: string): string {
  return hash.slice(0, 7);
}

function requireRepo(shell: ShellState): GitState | null {
  return shell.git;
}

function formatStatus(git: GitState, shell: ShellState): string {
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

function runSubcommand(
  sub: string,
  argv: readonly string[],
  shell: ShellState,
  nowSeconds: number,
): CommandResult {
  const rest = argv.slice(2);

  if (sub === 'init') {
    if (shell.git !== null) {
      return { stdout: `Reinitialized existing Git repository in ${shell.git.root}/.git/\n` };
    }
    const git = initRepository(shell.cwd, { ...defaultAuthor, timestamp: nowSeconds });
    return {
      stdout: `Initialized empty Git repository in ${shell.cwd}/.git/\n`,
      patch: { git },
    };
  }

  const git = requireRepo(shell);
  if (!git) return { stderr: NOT_A_REPO, code: 128 };

  switch (sub) {
    case 'status':
      return { stdout: formatStatus(git, shell) };


    case 'add': {
      const { operands } = parseArgs(['add', ...rest]);
      if (operands.length === 0) {
        return { stderr: 'Nothing specified, nothing added.\n', code: 1 };
      }
      const result = addPaths(git, shell.vfs, operands);
      if (result.missing.length > 0) {
        return {
          stderr: `fatal: pathspec '${result.missing[0] ?? ''}' did not match any files\n`,
          code: 128,
        };
      }
      return { patch: { git: result.git } };
    }

    case 'commit': {
      const { values, flags } = parseArgs(['commit', ...rest], { withValue: ['m'] });
      const message = values.get('m');
      if (message === undefined) {
        return { stderr: 'error: メッセージが要ります。git commit -m "..." の形で指定してください\n', code: 1 };
      }
      if (flags.has('a')) {
        const staged = addPaths(git, shell.vfs, ['.']);
        const result = commit(staged.git, message, nowSeconds);
        return commitOutput(result.git, result.hash, result.empty, message);
      }
      if (git.index.size === 0 && headCommit(git) === null) {
        return { stderr: 'nothing to commit (create/copy files and use "git add" to track)\n', code: 1 };
      }
      const result = commit(git, message, nowSeconds);
      return commitOutput(result.git, result.hash, result.empty, message);
    }

    case 'log': {
      const { flags } = parseArgs(['log', ...rest]);
      const entries = log(git);
      if (entries.length === 0) {
        return { stderr: 'fatal: your current branch does not have any commits yet\n', code: 128 };
      }
      const oneline = flags.has('oneline') || rest.includes('--oneline');
      if (oneline) {
        return { stdout: fromLines(entries.map((e) => `${short(e.hash)} ${e.message}`)) };
      }
      const lines: string[] = [];
      for (const entry of entries) {
        lines.push(`commit ${entry.hash}`);
        lines.push(`Author: ${git.author.name} <${git.author.email}>`);
        lines.push(`Date:   ${String(entry.timestamp)}`);
        lines.push('');
        lines.push(`    ${entry.message}`);
        lines.push('');
      }
      return { stdout: `${lines.join('\n')}\n` };
    }

    case 'branch': {
      const { operands } = parseArgs(['branch', ...rest]);
      const name = operands[0];
      if (name === undefined) {
        const current = currentBranch(git);
        return {
          stdout: fromLines(branches(git).map((b) => (b === current ? `* ${b}` : `  ${b}`))),
        };
      }
      const made = createBranch(git, name);
      if (made.error !== undefined) return { stderr: `${made.error}\n`, code: 128 };
      return { patch: { git: made.git } };
    }

    case 'switch':
    case 'checkout': {
      const { operands, flags } = parseArgs([sub, ...rest]);
      const name = operands[0];
      if (name === undefined) return { stderr: `fatal: 切り替え先を指定してください\n`, code: 128 };

      let target = git;
      if (flags.has('b') || flags.has('c')) {
        const made = createBranch(git, name);
        if (made.error !== undefined) return { stderr: `${made.error}\n`, code: 128 };
        target = made.git;
      }
      const moved = switchBranch(target, name);
      if (moved.error !== undefined) return { stderr: `${moved.error}\n`, code: 128 };

      // 作業ツリーを切り替え先の内容に合わせる
      const vfs = checkoutWorktree(shell.vfs, moved.git, headCommit(git), headCommit(moved.git));
      return {
        stdout: `Switched to branch '${name}'\n`,
        patch: { git: moved.git, vfs },
      };
    }

    case 'cat-file': {
      const { operands, flags } = parseArgs(['cat-file', ...rest]);
      const ref = operands[operands.length - 1];
      if (ref === undefined) return { stderr: 'fatal: オブジェクトを指定してください\n', code: 128 };
      const hash = git.objects.resolve(ref);
      if (hash === undefined) {
        return { stderr: `fatal: Not a valid object name ${ref}\n`, code: 128 };
      }
      if (flags.has('t')) return { stdout: `${git.objects.read(hash)?.type ?? ''}\n` };
      return { stdout: git.objects.pretty(hash) ?? '' };
    }

    case 'hash-object': {
      const { operands } = parseArgs(['hash-object', ...rest]);
      const target = operands[0];
      if (target === undefined) return { stderr: 'fatal: ファイルを指定してください\n', code: 128 };
      const node = shell.vfs.nodes.get(resolve(shell.cwd, target));
      if (!node || node.kind !== 'file') {
        return { stderr: `fatal: could not open '${target}' for reading\n`, code: 128 };
      }
      return { stdout: `${git.objects.write('blob', new TextEncoder().encode(node.content))}\n` };
    }

    case 'diff': {
      const { flags } = parseArgs(['diff', ...rest]);
      const staged = flags.has('staged') || rest.includes('--staged') || rest.includes('--cached');
      const out = staged ? diffStaged(git) : diffWorktree(git, shell.vfs);
      return { stdout: out, code: 0 };
    }

    case 'restore': {
      const { flags, operands } = parseArgs(['restore', ...rest]);
      if (operands.length === 0) {
        return { stderr: 'fatal: 対象のパスを指定してください\n', code: 128 };
      }
      if (flags.has('staged') || rest.includes('--staged')) {
        return { patch: { git: unstage(git, operands) } };
      }
      // 作業ツリーをインデックスの内容に戻す
      let vfs = shell.vfs;
      for (const path of operands) {
        const entry = git.index.get(path);
        if (!entry) continue;
        const object = git.objects.read(entry.hash);
        if (object) vfs = writeFile(vfs, resolve(git.root, path), decode(object.body), true);
      }
      return { patch: { vfs } };
    }

    case 'reset': {
      const { flags, operands } = parseArgs(['reset', ...rest]);
      const mode: ResetMode = flags.has('hard')
        ? 'hard'
        : flags.has('soft')
          ? 'soft'
          : 'mixed';
      const target = operands[0] ?? 'HEAD';
      const before = headCommit(git);
      const result = reset(git, target, mode);
      if (result.error !== undefined) return { stderr: `${result.error}\n`, code: 128 };
      const vfs = result.worktree === null
        ? shell.vfs
        : checkoutWorktree(shell.vfs, result.git, before, headCommit(result.git));
      return { patch: { git: result.git, vfs }, stdout: '' };
    }

    case 'merge': {
      const { operands } = parseArgs(['merge', ...rest]);
      const name = operands[0];
      if (name === undefined) return { stderr: 'fatal: マージ元を指定してください\n', code: 128 };
      const plan = planMerge(git, name);
      if ('error' in plan) return { stderr: `${plan.error}\n`, code: 128 };

      if (plan.fastForward !== null) {
        const moved = fastForwardTo(git, plan.fastForward);
        const vfs = checkoutWorktree(shell.vfs, moved, headCommit(git), plan.fastForward);
        const staged = addPaths(moved, vfs, ['.']);
        return { stdout: 'Fast-forward\n', patch: { git: staged.git, vfs } };
      }
      if (plan.files.size === 0) {
        return { stdout: 'Already up to date.\n' };
      }

      let vfs = shell.vfs;
      const conflicts: string[] = [];
      for (const [path, versions] of plan.files) {
        const merged = mergeThreeWay(versions.base, versions.ours, versions.theirs, {
          ours: 'HEAD',
          theirs: name,
        });
        vfs = writeFile(vfs, resolve(git.root, path), merged.content, true);
        if (merged.conflicted) conflicts.push(path);
      }

      if (conflicts.length > 0) {
        return {
          stdout: `${conflicts.map((p) => `CONFLICT (content): Merge conflict in ${p}`).join('\n')}\n`,
          stderr: 'Automatic merge failed; fix conflicts and then commit the result.\n',
          code: 1,
          // MERGE_HEAD を覚えておき、解決後の commit をマージコミットにする
          patch: { vfs, git: { ...git, mergeHead: plan.theirs } },
        };
      }

      const staged = addPaths(git, vfs, ['.']);
      const result = commitMerge(staged.git, plan.theirs, `Merge branch '${name}'`, nowSeconds);
      return { stdout: `Merge made by the 'ort' strategy.\n`, patch: { git: result.git, vfs } };
    }

    case 'rebase': {
      const { operands } = parseArgs(['rebase', ...rest]);
      const onto = operands[0];
      if (onto === undefined) return { stderr: 'fatal: 載せ替え先を指定してください\n', code: 128 };
      const result = rebaseOnto(git, onto, nowSeconds);
      if (result.error !== undefined) return { stderr: `${result.error}\n`, code: 128 };

      const vfs = checkoutWorktree(shell.vfs, result.git, headCommit(git), headCommit(result.git));
      if (result.conflicts.length > 0) {
        return {
          stderr: `CONFLICT: ${result.conflicts.join(', ')} で衝突しました\n`,
          code: 1,
          patch: { git: result.git, vfs },
        };
      }
      return {
        stdout:
          result.replayed === 0
            ? 'Current branch is up to date.\n'
            : `Successfully rebased and updated refs/heads/${currentBranch(result.git) ?? 'HEAD'}.\n`,
        patch: { git: result.git, vfs },
      };
    }

    case 'cherry-pick': {
      const { operands } = parseArgs(['cherry-pick', ...rest]);
      const ref = operands[0];
      if (ref === undefined) return { stderr: 'fatal: コミットを指定してください\n', code: 128 };
      const target = git.refs.get(`refs/heads/${ref}`) ?? git.objects.resolve(ref);
      const head = headCommit(git);
      if (target === undefined || head === null) {
        return { stderr: `fatal: bad revision '${ref}'\n`, code: 128 };
      }
      const result = replayCommit(git, target, head, nowSeconds);
      const refs = new Map(git.refs);
      const branch = currentBranch(git);
      if (branch !== null) refs.set(`refs/heads/${branch}`, result.hash);
      const next = { ...result.git, refs, head: git.head };

      const vfs = checkoutWorktree(shell.vfs, next, head, result.hash);
      if (result.conflicts.length > 0) {
        return {
          stderr: `CONFLICT: ${result.conflicts.join(', ')}\n`,
          code: 1,
          patch: { git: next, vfs },
        };
      }
      return { stdout: `[${branch ?? 'HEAD'} ${short(result.hash)}] cherry-pick\n`, patch: { git: next, vfs } };
    }

    case 'revert': {
      const { operands } = parseArgs(['revert', ...rest]);
      const ref = operands[0];
      if (ref === undefined) return { stderr: 'fatal: コミットを指定してください\n', code: 128 };
      const target = git.objects.resolve(ref);
      if (target === undefined) return { stderr: `fatal: bad revision '${ref}'\n`, code: 128 };
      const result = revertCommit(git, target, nowSeconds);
      if (result.error !== undefined) return { stderr: `${result.error}\n`, code: 128 };
      const vfs = checkoutWorktree(shell.vfs, result.git, headCommit(git), result.hash);
      return { stdout: `[${currentBranch(result.git) ?? 'HEAD'} ${short(result.hash)}] Revert\n`, patch: { git: result.git, vfs } };
    }

    case 'stash': {
      const action = rest[0] ?? 'push';
      if (action === 'list') {
        return {
          stdout: fromLines(
            git.stash.map((e, i) => `stash@{${String(git.stash.length - 1 - i)}}: ${e.message}`).reverse(),
          ),
        };
      }
      if (action === 'pop' || action === 'apply') {
        const result = popStash(git);
        if (result.files === null) return { stderr: 'No stash entries found.\n', code: 1 };
        let vfs = shell.vfs;
        for (const [path, content] of result.files) {
          vfs = writeFile(vfs, resolve(git.root, path), content, true);
        }
        return {
          stdout: 'Dropped stash\n',
          patch: { git: action === 'pop' ? result.git : git, vfs },
        };
      }
      // push: 退避して HEAD の状態に戻す
      const head = headCommit(git);
      if (head === null) return { stderr: 'You do not have the initial commit yet\n', code: 1 };
      const next = pushStash(git, shell.vfs, `WIP on ${currentBranch(git) ?? 'HEAD'}`);
      const vfs = checkoutWorktree(shell.vfs, git, head, head);
      return { stdout: 'Saved working directory\n', patch: { git: next, vfs } };
    }

    case 'remote': {
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
    }

    case 'push': {
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
    }

    case 'fetch': {
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
    }

    case 'pull': {
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
    }

    case 'ls-files':
      return { stdout: fromLines([...git.index.keys()].sort()) };

    case 'reflog':
      return {
        stdout: fromLines(
          [...git.reflog].reverse().map((e, i) => `${short(e.hash)} HEAD@{${String(i)}}: ${e.message}`),
        ),
      };

    default:
      return { stderr: `git: '${sub}' is not a git command. See 'git help'.\n`, code: 1 };
  }
}

function commitOutput(git: GitState, hash: string, empty: boolean, message: string): CommandResult {
  if (empty) {
    return { stdout: 'nothing to commit, working tree clean\n', code: 1 };
  }
  const branch = currentBranch(git) ?? 'HEAD';
  return {
    stdout: `[${branch} ${short(hash)}] ${message}\n`,
    patch: { git },
  };
}

export const gitCommands: CommandSpec[] = [
  {
    name: 'git',
    summary: 'バージョン管理（init/add/commit/status/log/branch/switch ほか）',
    complete: ({ prefix }) =>
      [
        'init', 'add', 'commit', 'status', 'log', 'branch', 'switch', 'checkout',
        'diff', 'restore', 'reset', 'merge', 'rebase', 'cherry-pick', 'revert', 'stash',
        'remote', 'push', 'fetch', 'pull',
        'cat-file', 'hash-object', 'ls-files', 'reflog',
      ].filter((s) => s.startsWith(prefix)),
    handler: ({ argv, shell, clock }) => {
      const sub = argv[1];
      if (sub === undefined) {
        return {
          stdout:
            'usage: git <command>\n' +
            '  init add commit status log branch switch checkout diff restore reset merge\n' +
            '  rebase cherry-pick revert stash remote push fetch pull\n' +
            '  cat-file hash-object ls-files reflog\n',
        };
      }
      return runSubcommand(sub, argv, shell, Math.floor(clock.nowMs / 1000));
    },
  },
];
