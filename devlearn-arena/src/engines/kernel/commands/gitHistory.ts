import { mergeThreeWay } from '@/engines/git/merge';
import {
  addPaths, currentBranch, headCommit, indexOf,
} from '@/engines/git/repository';
import {
  commitMerge, fastForwardTo, planMerge, popStash, pushStash, replayCommit, reset, revertCommit, type ResetMode,
} from '@/engines/git/history';
import { parseCommit } from '@/engines/git/objects';
import { resolveRef } from '@/engines/git/refs';
import { changeStats, diffstat, summaryLines } from '@/engines/git/stat';
import { checkoutWorktree } from '@/engines/git/worktree';
import { resolve } from '../path';
import { exists, remove, writeFile } from '../vfs';
import { fromLines, parseArgs } from './args';
import { short, type GitHandler } from './gitShared';
import type { GitState } from '@/engines/git/types';
import type { CommandResult, ShellState } from '../registry';

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
    // --hard は本物と同じく、移った先の記録を言う
    return { patch: { git: result.git, vfs }, stdout: mode === 'hard' ? `HEAD is now at ${short(resolved)} ${subjectOf(git, resolved)}\n` : '' };
  },
  merge: ({ git, shell, rest, nowSeconds }) => {
    const { operands, flags, values } = parseArgs(['merge', ...rest], { withValue: ['m'] });
    const name = operands[0];
    if (name === undefined) return { stderr: 'fatal: マージ元を指定してください\n', code: 128 };
    // --no-ff: 早送りできる時も、合わせる記録を作る（GitHub の「Create a merge commit」と同じ）。-m で合わせる記録の説明
    return mergeWith(git, shell, name, nowSeconds, values.get('m'), flags.has('no-ff'));
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
    // 衝突で打ち消せない時は、本物と同じく 1 で終わる
    if (result.error !== undefined) return { stderr: `${result.error}\n`, code: result.error.startsWith('CONFLICT') ? 1 : 128 };
    const vfs = checkoutWorktree(shell.vfs, result.git, headCommit(git), result.hash);
    const stats = summaryLines(changeStats(result.git, headCommit(git), result.hash));
    return { stdout: `[${currentBranch(result.git) ?? 'HEAD'} ${short(result.hash)}] Revert "${subjectOf(git, target)}"\n${stats}`, patch: { git: result.git, vfs } };
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

/**
 * 今いる枝に name（枝・origin/main など）を取り込む。早送り・合わせる記録・衝突のどれかになる。
 * label は合わせる記録の説明（無ければ Merge branch 'name'。git pull は Merge branch 'main' of URL）
 */
export function mergeWith(git: GitState, shell: ShellState, name: string, nowSeconds: number, label?: string, noFastForward = false): CommandResult {
  const plan = planMerge(git, name);
  if ('error' in plan) return { stderr: `${plan.error}\n`, code: 128 };

  if (plan.fastForward !== null && noFastForward) {
    // 早送りできるが、取り込んだ先の中身で、親を 2 つ持つ合わせる記録を作る
    const vfs = checkoutWorktree(shell.vfs, git, headCommit(git), plan.fastForward);
    const into = currentBranch(git);
    const message = `${label ?? `Merge branch '${name}'`}${label !== undefined || into === null || into === 'main' || into === 'master' ? '' : ` into ${into}`}`;
    const result = commitMerge(indexOf(git, plan.fastForward), plan.fastForward, message, nowSeconds);
    const stats = diffstat(changeStats(result.git, headCommit(git), result.hash));
    return { stdout: `Merge made by the 'ort' strategy.\n${stats}`, patch: { git: result.git, vfs } };
  }
  if (plan.fastForward !== null) {
    const moved = fastForwardTo(git, plan.fastForward);
    const vfs = checkoutWorktree(shell.vfs, moved, headCommit(git), plan.fastForward);
    // 選んだ物は進めた先の記録と同じにする（追跡していないファイルは選ばない）
    // 本物と同じく、動いた範囲と、取り込んだファイルごとの変わった行の数を出す
    const from = headCommit(git);
    const stats = diffstat(changeStats(git, from, plan.fastForward));
    return {
      stdout: `Updating ${short(from ?? '')}..${short(plan.fastForward)}\nFast-forward\n${stats}`,
      patch: { git: indexOf(moved, plan.fastForward), vfs },
    };
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
      // 本物と同じ順に出す（衝突の行の後に、止まったことを言う）
      stderr: `${conflicts.map((p) => `Auto-merging ${p}\nCONFLICT (content): Merge conflict in ${p}`).join('\n')}\nAutomatic merge failed; fix conflicts and then commit the result.\n`,
      code: 1,
      // MERGE_HEAD を覚えておき、解決後の commit をマージコミットにする
      patch: { vfs, git: { ...git, mergeHead: plan.theirs } },
    };
  }

  // 取り込んだファイルだけを選ぶ（追跡していないファイルは記録に入れない）
  const staged = addPaths(git, vfs, [...plan.files.keys()]);
  // 本物と同じく、main（master）以外の枝へ取り込んだ時は「into 枝」を付ける
  const into = currentBranch(git);
  const message = `${label ?? `Merge branch '${name}'`}${into === null || into === 'main' || into === 'master' ? '' : ` into ${into}`}`;
  const result = commitMerge(staged.git, plan.theirs, message, nowSeconds);
  const stats = diffstat(changeStats(result.git, headCommit(git), result.hash));
  return { stdout: `Merge made by the 'ort' strategy.\n${stats}`, patch: { git: result.git, vfs } };
}

/** 記録の説明の 1 行目 */
function subjectOf(git: GitState, hash: string): string {
  const object = git.objects.read(hash);
  return object?.type === 'commit' ? (parseCommit(object.body).message.trim().split('\n')[0] ?? '') : '';
}
