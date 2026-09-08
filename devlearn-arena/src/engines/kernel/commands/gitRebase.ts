import { REBASE_DIR, REBASE_ONTO, REBASE_TODO, gitPath, readGitFile, removeGitFile, writeGitFile } from '@/engines/git/gitdir';
import { parseCommit } from '@/engines/git/objects';
import { buildTodo, parseTodo, runTodo, type TodoLine } from '@/engines/git/rebaseTodo';
import { resolveRef } from '@/engines/git/refs';
import {
  currentBranch, headCommit,
} from '@/engines/git/repository';
import {
  isAncestor, mergeBase, rebaseOnto,
} from '@/engines/git/history';
import type { GitState } from '@/engines/git/types';
import { checkoutWorktree } from '@/engines/git/worktree';
import type { CommandResult } from '../registry';
import { parseArgs } from './args';
import { short, type GitContext, type GitHandler } from './gitShared';

/** onto から HEAD までの、載せ替える対象のコミット（古い順） */
function commitsToReplay(git: GitState, onto: string): string[] {
  const head = headCommit(git);
  if (head === null) return [];
  const base = mergeBase(git, head, onto);
  const out: string[] = [];
  let current: string | null = head;
  while (current !== null && current !== base) {
    out.push(current);
    const object = git.objects.read(current);
    current = object && object.type === 'commit' ? (parseCommit(object.body).parents[0] ?? null) : null;
  }
  return out.reverse();
}

function messageOf(git: GitState, hash: string): string {
  const object = git.objects.read(hash);
  return object && object.type === 'commit' ? parseCommit(object.body).message.trim() : '';
}

/** 台本を書き出し、編集パネルを開く */
function startInteractive(ctx: GitContext, onto: string): CommandResult {
  const { git, shell } = ctx;
  const targets = commitsToReplay(git, onto);
  if (targets.length === 0) return { stdout: 'Current branch is up to date.\n' };

  const lines: TodoLine[] = targets.map((hash) => ({
    action: 'pick',
    ref: short(hash),
    message: messageOf(git, hash),
  }));
  const todo = buildTodo(lines);
  let vfs = writeGitFile(shell.vfs, git, REBASE_TODO, todo);
  vfs = writeGitFile(vfs, git, REBASE_ONTO, `${onto}\n`);
  return {
    stdout: `${String(targets.length)} 件の台本を作りました。編集して git rebase --continue を実行してください。\n`,
    patch: { vfs },
    editor: { path: gitPath(git, REBASE_TODO), content: todo, tool: 'rebase-todo' },
  };
}

/** 台本を上から実行して、ブランチを付け替える */
function continueInteractive(ctx: GitContext): CommandResult {
  const { git, shell, nowSeconds } = ctx;
  const todoText = readGitFile(shell.vfs, git, REBASE_TODO);
  const ontoText = readGitFile(shell.vfs, git, REBASE_ONTO);
  if (todoText === null || ontoText === null) {
    return { stderr: 'fatal: No rebase in progress?\n', code: 128 };
  }
  const onto = ontoText.trim();
  const todo = parseTodo(todoText);
  if (todo.length === 0) {
    // 全部消したなら、ブランチは onto と同じ位置になる
    return finish(ctx, onto, '台本が空だったので、載せ替え先と同じ位置になりました\n');
  }

  const run = runTodo(git, onto, todo, nowSeconds);
  if (run.stopped === 'conflict') {
    return { stderr: `${run.conflicts.join('\n')}\n`, code: 1 };
  }
  if (run.stopped === 'edit') {
    // 残りの台本を書き戻して、いったん止まる
    let vfs = writeGitFile(shell.vfs, run.git, REBASE_TODO, buildTodo(run.remaining));
    const moved: GitState = { ...run.git, head: { type: 'detached', hash: run.tip } };
    vfs = checkoutWorktree(vfs, moved, headCommit(git), run.tip);
    return {
      stdout: `Stopped at ${short(run.tip)}\n直したら git rebase --continue で続きを流します。\n`,
      patch: { git: moved, vfs },
    };
  }

  const branch = currentBranch(git);
  const refs = new Map(run.git.refs);
  if (branch !== null) refs.set(`refs/heads/${branch}`, run.tip);
  let vfs = removeGitFile(shell.vfs, git, REBASE_DIR);
  const next: GitState = {
    ...run.git,
    refs,
    origHead: headCommit(git),
    head: branch === null ? { type: 'detached', hash: run.tip } : git.head,
    reflog: [...git.reflog, { hash: run.tip, message: `rebase -i (finish): ${branch ?? 'HEAD'}` }],
  };
  vfs = checkoutWorktree(vfs, next, headCommit(git), run.tip);
  const warning = run.conflicts.length === 0 ? '' : `CONFLICT: ${run.conflicts.join(', ')}\n`;
  return {
    stdout: `${warning}Successfully rebased and updated refs/heads/${branch ?? 'HEAD'}.\n`,
    patch: { git: next, vfs },
  };
}

function finish(ctx: GitContext, tip: string, message: string): CommandResult {
  const { git, shell } = ctx;
  const branch = currentBranch(git);
  const refs = new Map(git.refs);
  if (branch !== null) refs.set(`refs/heads/${branch}`, tip);
  const next: GitState = { ...git, refs, origHead: headCommit(git) };
  let vfs = removeGitFile(shell.vfs, git, REBASE_DIR);
  vfs = checkoutWorktree(vfs, next, headCommit(git), tip);
  return { stdout: message, patch: { git: next, vfs } };
}

export const rebaseSubcommands: Record<string, GitHandler> = {
  rebase: (ctx) => {
    const { git, shell, rest, nowSeconds } = ctx;
    const { flags, operands } = parseArgs(['rebase', ...rest]);

    if (flags.has('continue')) return continueInteractive(ctx);
    if (flags.has('abort')) {
      const origin = git.origHead;
      if (readGitFile(shell.vfs, git, REBASE_TODO) === null) {
        return { stderr: 'fatal: No rebase in progress?\n', code: 128 };
      }
      let vfs = removeGitFile(shell.vfs, git, REBASE_DIR);
      if (origin !== null) vfs = checkoutWorktree(vfs, git, headCommit(git), origin);
      return { stdout: '', patch: { vfs } };
    }

    const target = operands[0];
    if (target === undefined) return { stderr: 'fatal: 載せ替え先を指定してください\n', code: 128 };
    const onto = resolveRef(git, target);
    if (onto === undefined) return { stderr: `fatal: invalid upstream '${target}'\n`, code: 128 };

    if (flags.has('i') || flags.has('interactive')) {
      const head = headCommit(git);
      if (head !== null && isAncestor(git, head, onto)) {
        return { stdout: 'Current branch is up to date.\n' };
      }
      return startInteractive(ctx, onto);
    }

    const result = rebaseOnto(git, target, nowSeconds);
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
  },
};
