import {
  addPaths, branches, commit, createBranch, currentBranch, headCommit, log, stageTracked, status as statusOf, switchBranch,
} from '@/engines/git/repository';
import { changedInIndex, changedInWorktree, diffCommits, diffStaged, diffWorktree, unstage } from '@/engines/git/diff';
import { decode, parseCommit } from '@/engines/git/objects';
import { peel, resolveObject, resolveRef } from '@/engines/git/refs';
import { checkoutWorktree } from '@/engines/git/worktree';
import { resolve } from '../path';
import { writeFile } from '../vfs';
import { fromLines, parseArgs } from './args';
import { HOOKS_DIR, gitPath } from '@/engines/git/gitdir';
import { runHook } from './gitRefs';
import { commitOutput, decorationOf, formatGitDate, formatStatus, parseLogArgs, short, type GitHandler } from './gitShared';

/** switch と checkout はブランチ切り替えとしては同じ振る舞いをする */
const switchTo: GitHandler = ({ git, shell, rest, sub }) => {
  const { operands, flags } = parseArgs([sub, ...rest]);
  const name = operands[0];
  if (name === undefined) return { stderr: 'fatal: 切り替え先を指定してください\n', code: 128 };

  let target = git;
  const creating = flags.has('b') || flags.has('c');
  if (creating) {
    // git switch -c 名前 起点（HEAD~1・枝・記録の番号）
    const start = operands[1] === undefined ? undefined : resolveRef(git, operands[1]);
    if (operands[1] !== undefined && start === undefined) return { stderr: `fatal: invalid reference: ${operands[1]}\n`, code: 128 };
    const made = createBranch(git, name, start);
    if (made.error !== undefined) return { stderr: `${made.error}\n`, code: 128 };
    target = made.git;
  }
  const moved = switchBranch(target, name);
  if (moved.error !== undefined) return { stderr: `${moved.error}\n`, code: 128 };

  // 作業ツリーを切り替え先の内容に合わせる
  const vfs = checkoutWorktree(shell.vfs, moved.git, headCommit(git), headCommit(moved.git));
  return {
    stdout: creating ? `Switched to a new branch '${name}'\n` : `Switched to branch '${name}'\n`,
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
      const result = commit(stageTracked(git, shell.vfs), message, nowSeconds);
      return commitOutput(result.git, result.hash, result.empty, message);
    }
    if (git.index.size === 0 && headCommit(git) === null) {
      // 本物と同じく、追跡していないファイルがあれば add を促す
      const untracked = statusOf(git, shell.vfs).untracked.length > 0;
      return untracked
        ? { stdout: 'nothing added to commit but untracked files present (use "git add" to track)\n', code: 1 }
        : { stdout: 'nothing to commit (create/copy files and use "git add" to track)\n', code: 1 };
    }
    const result = commit(git, message, nowSeconds);
    if (result.empty) {
      // 選んでいない変更が残っていれば、本物と同じく add を促す
      const report = statusOf(git, shell.vfs);
      if (report.unstaged.length > 0) return { stdout: 'no changes added to commit (use "git add" and/or "git commit -a")\n', code: 1 };
      if (report.untracked.length > 0) return { stdout: 'nothing added to commit but untracked files present (use "git add" to track)\n', code: 1 };
    }
    return commitOutput(result.git, result.hash, result.empty, message);
  },
  log: ({ git, rest, nowSeconds }) => {
    const opts = parseLogArgs(rest, nowSeconds);
    if ('error' in opts) return { stderr: opts.error, code: 128 };
    // 起点（origin/main など）と、A..B の A（そこから辿れる記録は出さない）
    const starts: string[] = [];
    const hidden: string[] = [];
    for (const rev of opts.revs) {
      const [from, to] = rev.includes('..') ? rev.split('..') : [undefined, rev];
      for (const [name, into] of [[from, hidden], [to, starts]] as const) {
        if (name === undefined) continue;
        const hash = resolveRef(git, name === '' ? 'HEAD' : name);
        if (hash === undefined) return { stderr: `fatal: ambiguous argument '${rev}': unknown revision or path not in the working tree.\n`, code: 128 };
        into.push(hash);
      }
    }
    // --all は、全ての参照（枝・タグ・リモートの枝）の先から辿る
    const tips = opts.all ? [...new Set([...git.refs.values()].map((h) => peel(git, h)))] : starts.length > 0 ? starts : undefined;
    const exclude = new Set(hidden.length > 0 ? log(git, Number.MAX_SAFE_INTEGER, hidden).map((e) => e.hash) : []);
    const all = log(git, 50, tips).filter((e) => !exclude.has(e.hash));
    // 範囲の中に記録が無いのは誤りではない（本物も何も出さずに終わる）
    if (all.length === 0 && hidden.length > 0) return { stdout: '' };
    if (all.length === 0) {
      return { stderr: 'fatal: your current branch does not have any commits yet\n', code: 128 };
    }
    const entries = all
      .filter((e) => opts.since === null || e.author.timestamp >= opts.since)
      .filter((e) => opts.until === null || e.author.timestamp <= opts.until)
      .filter((e) => opts.author === null || `${e.author.name} <${e.author.email}>`.includes(opts.author))
      .slice(0, opts.max ?? undefined);
    const patchOf = (hash: string, parents: readonly string[]): string =>
      // マージの記録は、本物と同じく -p でも差分を出さない
      parents.length > 1 ? '' : diffCommits(git, parents[0] ?? null, hash);
    if (opts.oneline) {
      // 本物と同じく、--oneline は件名（メッセージの1行目）だけを出す
      return {
        stdout: entries.map((e) => `${short(e.hash)}${decorationOf(git, e.hash)} ${e.message.split('\n')[0] ?? ''}\n${opts.patch ? patchOf(e.hash, e.parents) : ''}`).join(''),
      };
    }
    const out: string[] = [];
    for (const entry of entries) {
      const lines = [`commit ${entry.hash}${decorationOf(git, entry.hash)}`];
      if (entry.parents.length > 1) lines.push(`Merge: ${entry.parents.map(short).join(' ')}`);
      lines.push(`Author: ${entry.author.name} <${entry.author.email}>`);
      lines.push(`Date:   ${formatGitDate(entry.author.timestamp, entry.author.timezone)}`);
      lines.push('');
      for (const line of entry.message.split('\n')) lines.push(`    ${line}`);
      lines.push('');
      out.push(`${lines.join('\n')}\n${opts.patch ? patchOf(entry.hash, entry.parents) : ''}`);
    }
    return { stdout: out.join('') };
  },
  /** git show <rev>。コミットの説明と、1つ前からの差分を出す */
  show: ({ git, rest }) => {
    const { operands } = parseArgs(['show', ...rest]);
    const ref = operands[0] ?? 'HEAD';
    // HEAD~1・main^ のような親をたどる書き方は、たどった先の記録（タグそのものは剥がさずに見せる）
    const hash = /[~^]/.test(ref) ? resolveRef(git, ref) : resolveObject(git, ref);
    const object = hash === undefined ? undefined : git.objects.read(hash);
    if (hash === undefined || object === undefined) {
      if (ref === 'HEAD') return { stderr: 'fatal: your current branch does not have any commits yet\n', code: 128 };
      return {
        stderr: `fatal: ambiguous argument '${ref}': unknown revision or path not in the working tree.\n`,
        code: 128,
      };
    }
    if (object.type !== 'commit') return { stdout: git.objects.pretty(hash) ?? '' };
    const parsed = parseCommit(object.body);
    const lines = [`commit ${hash}`];
    if (parsed.parents.length > 1) lines.push(`Merge: ${parsed.parents.map(short).join(' ')}`);
    lines.push(`Author: ${parsed.author.name} <${parsed.author.email}>`);
    lines.push(`Date:   ${formatGitDate(parsed.author.timestamp, parsed.author.timezone)}`);
    lines.push('');
    for (const line of parsed.message.trim().split('\n')) lines.push(`    ${line}`);
    lines.push('');
    // マージコミットは親が2つあるので、どちらかとの差分にはしない（本物も既定では出さない）
    const diff = parsed.parents.length > 1 ? '' : diffCommits(git, parsed.parents[0] ?? null, hash);
    return { stdout: `${lines.join('\n')}\n${diff}` };
  },
  branch: ({ git, rest }) => {
    const { operands, flags } = parseArgs(['branch', ...rest]);
    const name = operands[0];
    if (name === undefined) {
      const current = currentBranch(git);
      const names = branches(git);
      const width = Math.max(0, ...names.map((b) => b.length));
      // -v は、本物と同じく枝ごとに先の記録の番号と説明の 1 行目を並べる
      const verbose = (b: string): string => {
        const tip = git.refs.get(`refs/heads/${b}`) ?? '';
        const object = git.objects.read(tip);
        const subject = object?.type === 'commit' ? (parseCommit(object.body).message.trim().split('\n')[0] ?? '') : '';
        return ` ${b.padEnd(width)} ${short(tip)} ${subject}`;
      };
      return {
        stdout: fromLines(names.map((b) => `${b === current ? '*' : ' '}${flags.has('v') ? verbose(b) : ` ${b}`}`)),
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
    if (rest.includes('--check')) {
      // 変えたファイルに、衝突の印（<<<<<<< ======= >>>>>>>）の行が残っていないか（本物と同じく、残れば 2 で終わる）
      const files = staged ? changedInIndex(git) : changedInWorktree(git, shell.vfs);
      const found = [...files].sort(([a], [b]) => (a < b ? -1 : 1)).flatMap(([path, content]) =>
        content.split('\n').flatMap((line, i) => (/^(<{7}|={7}|>{7})( |$)/.test(line) ? [`${path}:${String(i + 1)}: leftover conflict marker`] : [])));
      return { stdout: fromLines(found), code: found.length > 0 ? 2 : 0 };
    }
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
