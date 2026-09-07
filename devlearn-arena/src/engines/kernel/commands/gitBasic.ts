import {
  addPaths, branches, commit, createBranch, currentBranch, diffStaged, diffWorktree,
  headCommit, log, switchBranch, unstage,
} from '@/engines/git/repository';
import { decode } from '@/engines/git/objects';
import { resolveObject } from '@/engines/git/refs';
import { checkoutWorktree } from '@/engines/git/worktree';
import { resolve } from '../path';
import { writeFile } from '../vfs';
import { fromLines, parseArgs } from './args';
import { HOOKS_DIR, gitPath } from '@/engines/git/gitdir';
import { runHook } from './gitRefs';
import { commitOutput, formatStatus, short, type GitHandler } from './gitShared';

/** switch と checkout はブランチ切り替えとしては同じ振る舞いをする */
const switchTo: GitHandler = ({ git, shell, rest, sub }) => {
  const { operands, flags } = parseArgs([sub, ...rest]);
  const name = operands[0];
  if (name === undefined) return { stderr: 'fatal: 切り替え先を指定してください\n', code: 128 };

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
};

/** 履歴を読む・作る側の基本操作 */
export const basicSubcommands: Record<string, GitHandler> = {
  status: ({ git, shell }) => {
    return { stdout: formatStatus(git, shell) };
  },
  add: ({ git, shell, rest }) => {
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
  },
  commit: ({ git, shell, rest, nowSeconds, runLine }) => {
    const { values, flags } = parseArgs(['commit', ...rest], { withValue: ['m'] });
    const message = values.get('m');
    if (message === undefined) {
      return { stderr: 'error: メッセージが要ります。git commit -m "..." の形で指定してください\n', code: 1 };
    }
    // pre-commit hook。0 以外を返したらコミットしない（本物と同じ）
    if (!flags.has('no-verify')) {
      const hook = runHook(shell.vfs, gitPath(git, `${HOOKS_DIR}/pre-commit`), (line) => runLine(line));
      if (hook !== null && hook.code !== 0) {
        return {
          stdout: hook.stdout,
          stderr: `${hook.stderr}error: pre-commit hook が失敗したので、コミットを中止しました\n`,
          code: hook.code,
        };
      }
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
  },
  log: ({ git, rest }) => {
    const { flags } = parseArgs(['log', ...rest]);
    const entries = log(git);
    if (entries.length === 0) {
      return { stderr: 'fatal: your current branch does not have any commits yet\n', code: 128 };
    }
    const oneline = flags.has('oneline') || rest.includes('--oneline');
    if (oneline) {
      // 本物と同じく、--oneline は件名（メッセージの1行目）だけを出す
      return {
        stdout: fromLines(
          entries.map((e) => `${short(e.hash)} ${e.message.split('\n')[0] ?? ''}`),
        ),
      };
    }
    const lines: string[] = [];
    for (const entry of entries) {
      lines.push(`commit ${entry.hash}`);
      lines.push(`Author: ${git.author.name} <${git.author.email}>`);
      lines.push(`Date:   ${String(entry.timestamp)}`);
      lines.push('');
      for (const line of entry.message.split('\n')) lines.push(`    ${line}`);
      lines.push('');
    }
    return { stdout: `${lines.join('\n')}\n` };
  },
  branch: ({ git, rest }) => {
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
  },
  switch: switchTo,
  checkout: switchTo,
  'cat-file': ({ git, rest }) => {
    const { operands, flags } = parseArgs(['cat-file', ...rest]);
    const ref = operands[operands.length - 1];
    if (ref === undefined) return { stderr: 'fatal: オブジェクトを指定してください\n', code: 128 };
    const hash = resolveObject(git, ref);
    if (hash === undefined) {
      return { stderr: `fatal: Not a valid object name ${ref}\n`, code: 128 };
    }
    if (flags.has('t')) return { stdout: `${git.objects.read(hash)?.type ?? ''}\n` };
    return { stdout: git.objects.pretty(hash) ?? '' };
  },
  'hash-object': ({ git, shell, rest }) => {
    const { operands } = parseArgs(['hash-object', ...rest]);
    const target = operands[0];
    if (target === undefined) return { stderr: 'fatal: ファイルを指定してください\n', code: 128 };
    const node = shell.vfs.nodes.get(resolve(shell.cwd, target));
    if (!node || node.kind !== 'file') {
      return { stderr: `fatal: could not open '${target}' for reading\n`, code: 128 };
    }
    return { stdout: `${git.objects.write('blob', new TextEncoder().encode(node.content))}\n` };
  },
  diff: ({ git, shell, rest }) => {
    const { flags } = parseArgs(['diff', ...rest]);
    const staged = flags.has('staged') || rest.includes('--staged') || rest.includes('--cached');
    const out = staged ? diffStaged(git) : diffWorktree(git, shell.vfs);
    return { stdout: out, code: 0 };
  },
  restore: ({ git, shell, rest }) => {
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
  },
  'ls-files': ({ git }) => {
    return { stdout: fromLines([...git.index.keys()].sort()) };
  },
  reflog: ({ git }) => {
    return {
      stdout: fromLines(
        [...git.reflog].reverse().map((e, i) => `${short(e.hash)} HEAD@{${String(i)}}: ${e.message}`),
      ),
    };
  },
};
