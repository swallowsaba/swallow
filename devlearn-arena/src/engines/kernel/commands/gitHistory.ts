import { mergeThreeWay } from '@/engines/git/merge';
import {
  addPaths, currentBranch, headCommit,
} from '@/engines/git/repository';
import {
  commitMerge, fastForwardTo, planMerge, popStash, pushStash, replayCommit, reset, revertCommit, type ResetMode,
} from '@/engines/git/history';
import { resolveRef } from '@/engines/git/refs';
import { checkoutWorktree } from '@/engines/git/worktree';
import { resolve } from '../path';
import { exists, remove, writeFile } from '../vfs';
import { fromLines, parseArgs } from './args';
import { short, type GitHandler } from './gitShared';

/** 履歴を作り直す側の操作 */
export const historySubcommands: Record<string, GitHandler> = {
  reset: ({ git, shell, rest }) => {
    const { flags, operands } = parseArgs(['reset', ...rest]);
    const mode: ResetMode = flags.has('hard')
      ? 'hard'
      : flags.has('soft')
        ? 'soft'
        : 'mixed';
    const target = operands[0] ?? 'HEAD';
    const resolved = resolveRef(git, target);
    if (resolved === undefined) {
      return { stderr: `fatal: ambiguous argument '${target}'\n`, code: 128 };
    }
    const before = headCommit(git);
    const result = reset(git, resolved, mode);
    if (result.error !== undefined) return { stderr: `${result.error}\n`, code: 128 };
    const vfs = result.worktree === null
      ? shell.vfs
      : checkoutWorktree(shell.vfs, result.git, before, headCommit(result.git));
    return { patch: { git: result.git, vfs }, stdout: '' };
  },
  merge: ({ git, shell, rest, nowSeconds }) => {
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
  },
  'cherry-pick': ({ git, shell, rest, nowSeconds }) => {
    const { operands } = parseArgs(['cherry-pick', ...rest]);
    const ref = operands[0];
    if (ref === undefined) return { stderr: 'fatal: コミットを指定してください\n', code: 128 };
    const target = resolveRef(git, ref);
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
  },
  revert: ({ git, shell, rest, nowSeconds }) => {
    const { operands } = parseArgs(['revert', ...rest]);
    const ref = operands[0];
    if (ref === undefined) return { stderr: 'fatal: コミットを指定してください\n', code: 128 };
    const target = resolveRef(git, ref);
    if (target === undefined) return { stderr: `fatal: bad revision '${ref}'\n`, code: 128 };
    const result = revertCommit(git, target, nowSeconds);
    if (result.error !== undefined) return { stderr: `${result.error}\n`, code: 128 };
    const vfs = checkoutWorktree(shell.vfs, result.git, headCommit(git), result.hash);
    return { stdout: `[${currentBranch(result.git) ?? 'HEAD'} ${short(result.hash)}] Revert\n`, patch: { git: result.git, vfs } };
  },
  stash: ({ git, shell, rest }) => {
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
    // push: 退避して HEAD の状態に戻す（本物も内部で hard reset している）
    const head = headCommit(git);
    if (head === null) return { stderr: 'You do not have the initial commit yet\n', code: 1 };
    const saved = pushStash(git, shell.vfs, `WIP on ${currentBranch(git) ?? 'HEAD'}`);
    const cleared = reset(saved, head, 'hard');
    if (cleared.error !== undefined) return { stderr: `${cleared.error}\n`, code: 128 };

    let vfs = checkoutWorktree(shell.vfs, cleared.git, head, head);
    // 索引に載っていたが、まだコミットされていなかったものは作業ツリーからも消える
    for (const path of git.index.keys()) {
      if (cleared.git.index.has(path)) continue;
      const full = resolve(git.root, path);
      if (exists(vfs, full)) vfs = remove(vfs, full);
    }
    return { stdout: 'Saved working directory\n', patch: { git: cleared.git, vfs } };
  },
};
