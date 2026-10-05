import {
  REBASE_CONFLICTED, REBASE_DIR, REBASE_HEAD_NAME, REBASE_ONTO, REBASE_ORIG_HEAD, REBASE_PLAIN, REBASE_STOPPED, REBASE_TODO,
  gitPath, readGitFile, removeGitFile, writeGitFile,
} from '@/engines/git/gitdir';
import { decode, encode, parseCommit } from '@/engines/git/objects';
import { buildTodo, parseTodo, runTodo, type TodoLine } from '@/engines/git/rebaseTodo';
import { resolveRef } from '@/engines/git/refs';
import {
  FILE_MODE, currentBranch, headCommit, indexOf, materialize, status as statusOf,
} from '@/engines/git/repository';
import {
  commitFiles, isAncestor, mergeBase, pickOnto,
} from '@/engines/git/history';
import type { GitState, IndexEntry } from '@/engines/git/types';
import { checkoutWorktree } from '@/engines/git/worktree';
import { resolve } from '../path';
import type { CommandResult } from '../registry';
import { exists, readFile, remove, writeFile, type VfsState } from '../vfs';
import { parseArgs } from './args';
import { short, type GitContext, type GitHandler } from './gitShared';

/** 記録の親 */
function parentsOf(git: GitState, hash: string): readonly string[] {
  const object = git.objects.read(hash);
  return object && object.type === 'commit' ? parseCommit(object.body).parents : [];
}

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

/* ---- 台本を使わない rebase（git rebase <枝>）。衝突したら止まり、解いて --continue で続ける ---- */

const lines = (text: string | null): string[] => (text ?? '').split('\n').map((l) => l.trim()).filter(Boolean);

/** 載せ替えの途中か（衝突で止まっている） */
export function plainRebase(git: GitState, vfs: VfsState): { onto: string; branch: string } | null {
  if (readGitFile(vfs, git, REBASE_PLAIN) === null) return null;
  return { onto: (readGitFile(vfs, git, REBASE_ONTO) ?? '').trim(), branch: (readGitFile(vfs, git, REBASE_HEAD_NAME) ?? '').trim() };
}

/** queue の記録を順に tip へ載せる。衝突すれば止まって途中を .git/rebase-merge に書き、最後まで行けば枝を進める */
function runPlain(ctx: GitContext, start: GitState, vfsStart: VfsState, tip: string, queue: readonly string[], meta: { onto: string; branch: string; orig: string }): CommandResult {
  const { nowSeconds } = ctx;
  let state = start;
  let current = tip;
  for (const [i, hash] of queue.entries()) {
    const picked = pickOnto(state, hash, current, nowSeconds);
    if ('hash' in picked) {
      state = picked.git;
      current = picked.hash;
      continue;
    }
    // 止まる: HEAD は載せ終えた所。衝突の無い変更は選んだ物に入れ、衝突したファイルは今の版のまま（add するまで決まらない）
    const tipFiles = materialize(state, current);
    const index = new Map<string, IndexEntry>();
    for (const [path, content] of picked.files) {
      const chosen = picked.conflicts.includes(path) ? tipFiles.get(path) : content;
      if (chosen !== undefined) index.set(path, { path, mode: FILE_MODE, hash: state.objects.write('blob', encode(chosen)) });
    }
    const stopped: GitState = { ...state, index, head: { type: 'detached', hash: current } };
    let vfs = checkoutWorktree(vfsStart, stopped, headCommit(ctx.git), current);
    for (const [path, content] of picked.files) {
      if (tipFiles.get(path) !== content) vfs = writeFile(vfs, resolve(stopped.root, path), content, true);
    }
    for (const path of tipFiles.keys()) if (!picked.files.has(path)) vfs = remove(vfs, resolve(stopped.root, path));
    vfs = writeGitFile(vfs, stopped, REBASE_PLAIN, queue.slice(i + 1).map((h) => `${h}\n`).join(''));
    vfs = writeGitFile(vfs, stopped, REBASE_STOPPED, `${hash}\n`);
    vfs = writeGitFile(vfs, stopped, REBASE_CONFLICTED, picked.conflicts.map((p) => `${p}\n`).join(''));
    vfs = writeGitFile(vfs, stopped, REBASE_ONTO, `${meta.onto}\n`);
    vfs = writeGitFile(vfs, stopped, REBASE_HEAD_NAME, `${meta.branch}\n`);
    vfs = writeGitFile(vfs, stopped, REBASE_ORIG_HEAD, `${meta.orig}\n`);
    const what = `${short(hash)}... ${messageOf(state, hash).split('\n')[0] ?? ''}`;
    return {
      // 本物と同じ順と言い方（衝突の行・could not apply・続け方の案内）
      stderr: `${picked.conflicts.map((p) => `Auto-merging ${p}\nCONFLICT (content): Merge conflict in ${p}`).join('\n')}\n`
        + `error: could not apply ${what}\n`
        + 'hint: Resolve all conflicts manually, mark them as resolved with\n'
        + 'hint: "git add/rm <conflicted_files>", then run "git rebase --continue".\n'
        + 'hint: You can instead skip this commit: run "git rebase --skip".\n'
        + 'hint: To abort and get back to the state before "git rebase", run "git rebase --abort".\n'
        + `Could not apply ${what}\n`,
      code: 1,
      patch: { git: stopped, vfs },
    };
  }
  const refs = new Map(state.refs);
  refs.set(`refs/heads/${meta.branch}`, current);
  const finished: GitState = {
    ...indexOf({ ...state, refs, head: { type: 'branch', name: meta.branch } }, current),
    origHead: meta.orig,
    reflog: [...state.reflog, { hash: current, message: `rebase (finish): refs/heads/${meta.branch} onto ${meta.onto}` }],
  };
  let vfs = removeGitFile(vfsStart, ctx.git, REBASE_DIR);
  vfs = checkoutWorktree(vfs, finished, headCommit(ctx.git), current);
  return { stdout: `Successfully rebased and updated refs/heads/${meta.branch}.\n`, patch: { git: finished, vfs } };
}

function startPlain(ctx: GitContext, target: string): CommandResult {
  const { git, shell } = ctx;
  const onto = resolveRef(git, target);
  if (onto === undefined) return { stderr: `fatal: invalid upstream '${target}'\n`, code: 128 };
  const head = headCommit(git);
  const branch = currentBranch(git);
  if (head === null || branch === null) return { stderr: 'fatal: 載せ替える枝にいない\n', code: 128 };
  if (isAncestor(git, onto, head)) return { stdout: `Current branch ${branch} is up to date.\n` };
  if (!statusOf(git, shell.vfs).clean) {
    return { stderr: 'error: cannot rebase: You have unstaged changes.\nerror: Please commit or stash them.\n', code: 1 };
  }
  // 合流の記録は載せ替えない（本物の既定と同じ）
  const queue = commitsToReplay(git, onto).filter((h) => parentsOf(git, h).length <= 1);
  return runPlain(ctx, git, shell.vfs, onto, queue, { onto, branch, orig: head });
}

function continuePlain(ctx: GitContext): CommandResult {
  const { git, shell, nowSeconds } = ctx;
  const stopped = (readGitFile(shell.vfs, git, REBASE_STOPPED) ?? '').trim();
  const meta = { ...(plainRebase(git, shell.vfs) ?? { onto: '', branch: '' }), orig: (readGitFile(shell.vfs, git, REBASE_ORIG_HEAD) ?? '').trim() };
  // 衝突したファイルは、直して add するまで続けられない
  const pending = lines(readGitFile(shell.vfs, git, REBASE_CONFLICTED)).filter((p) => {
    const entry = git.index.get(p);
    const path = resolve(git.root, p);
    const here = exists(shell.vfs, path) ? readFile(shell.vfs, path) : undefined;
    const staged = entry === undefined ? undefined : decode(git.objects.read(entry.hash)?.body ?? new Uint8Array());
    return here !== staged;
  });
  if (pending.length > 0) {
    return { stderr: 'error: you must edit all merge conflicts and then mark them as resolved using git add\n', code: 1 };
  }
  const tip = headCommit(git) ?? meta.onto;
  const files = new Map<string, string>();
  for (const [p, e] of git.index) files.set(p, decode(git.objects.read(e.hash)?.body ?? new Uint8Array()));
  const object = git.objects.read(stopped);
  const parsed = object ? parseCommit(object.body) : null;
  const made = parsed === null ? { git, hash: tip } : commitFiles(git, files, tip, parsed.message, parsed.author, nowSeconds);
  return runPlain(ctx, made.git, shell.vfs, made.hash, lines(readGitFile(shell.vfs, git, REBASE_PLAIN)), meta);
}

function skipPlain(ctx: GitContext): CommandResult {
  const { git, shell } = ctx;
  const meta = { ...(plainRebase(git, shell.vfs) ?? { onto: '', branch: '' }), orig: (readGitFile(shell.vfs, git, REBASE_ORIG_HEAD) ?? '').trim() };
  const tip = headCommit(git) ?? meta.onto;
  // 止まった記録を捨て、作業ツリーを載せ終えた所に戻してから続ける
  const vfs = checkoutWorktree(shell.vfs, indexOf(git, tip), tip, tip);
  return runPlain(ctx, indexOf(git, tip), vfs, tip, lines(readGitFile(shell.vfs, git, REBASE_PLAIN)), meta);
}

function abortPlain(ctx: GitContext): CommandResult {
  const { git, shell } = ctx;
  const branch = (readGitFile(shell.vfs, git, REBASE_HEAD_NAME) ?? '').trim();
  const orig = (readGitFile(shell.vfs, git, REBASE_ORIG_HEAD) ?? '').trim();
  // 枝は最後まで動かしていないので、枝に戻って元の版を出すだけ
  const back = indexOf({ ...git, head: { type: 'branch', name: branch } }, orig);
  let vfs = removeGitFile(shell.vfs, git, REBASE_DIR);
  vfs = checkoutWorktree(vfs, back, headCommit(git), orig);
  return { stdout: '', patch: { git: back, vfs } };
}

export const rebaseSubcommands: Record<string, GitHandler> = {
  rebase: (ctx) => {
    const { git, shell, rest, nowSeconds } = ctx;
    const { flags, operands } = parseArgs(['rebase', ...rest]);
    const plain = plainRebase(git, shell.vfs) !== null;

    if (flags.has('continue')) {
      if (plain) return continuePlain(ctx);
      return continueInteractive(ctx);
    }
    if (flags.has('skip')) {
      if (plain) return skipPlain(ctx);
      return { stderr: 'fatal: No rebase in progress?\n', code: 128 };
    }
    if (flags.has('abort') && plain) return abortPlain(ctx);
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

    if (plain) return { stderr: 'fatal: It seems that there is already a rebase-merge directory.\n', code: 128 };
    void nowSeconds;
    return startPlain(ctx, target);
  },
};
