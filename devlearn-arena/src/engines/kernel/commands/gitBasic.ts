import {
  addPaths, branches, commit, createBranch, currentBranch, headCommit, log, materialize, stageTracked, status as statusOf, switchBranch, walkWorktree,
} from '@/engines/git/repository';
import { ignoreRules, ignoredBy } from '@/engines/git/ignore';
import { changedInIndex, changedInWorktree, diffCommits, diffStaged, diffWorktree, unstage } from '@/engines/git/diff';
import { decode, parseCommit } from '@/engines/git/objects';
import { peel, resolveObject, resolveRef } from '@/engines/git/refs';
import { checkoutWorktree } from '@/engines/git/worktree';
import { relative, resolve } from '../path';
import { exists, remove, writeFile } from '../vfs';
import { fromLines, parseArgs } from './args';
import { HOOKS_DIR, gitPath } from '@/engines/git/gitdir';
import { runHook } from './gitRefs';
import { commitOutput, decorationOf, formatGitDate, formatStatus, parseLogArgs, short, type GitHandler } from './gitShared';

/**
 * git checkout [記録] -- ファイル（-- が無くても、記録の後がファイルなら同じ）。そのファイルを、記録（無ければ選んだ物）の版にする。
 * 記録を書いた時は、選んだ物（インデックス）にも入れる（本物と同じ）
 */
function checkoutPaths(ctx: Parameters<GitHandler>[0], source: string | undefined, paths: readonly string[]): ReturnType<GitHandler> {
  const { git, shell } = ctx;
  let vfs = shell.vfs;
  const at = source === undefined ? undefined : resolveRef(git, source);
  if (source !== undefined && at === undefined) return { stderr: `fatal: invalid reference: ${source}\n`, code: 128 };
  const files = at === undefined ? null : materialize(git, at);
  for (const raw of paths) {
    const path = relative(git.root, resolve(shell.cwd, raw));
    let content: string | undefined;
    if (files) content = files.get(path);
    else {
      const entry = git.index.get(path);
      const object = entry ? git.objects.read(entry.hash) : undefined;
      content = object ? decode(object.body) : undefined;
    }
    if (content === undefined) return { stderr: `error: pathspec '${raw}' did not match any file(s) known to git\n`, code: 1 };
    vfs = writeFile(vfs, resolve(git.root, path), content, true);
  }
  if (!files) return { stdout: `Updated ${String(paths.length)} path${paths.length === 1 ? '' : 's'} from the index\n`, patch: { vfs } };
  const staged = addPaths(git, vfs, paths.map((p) => relative(git.root, resolve(shell.cwd, p))), {});
  return { stdout: `Updated ${String(paths.length)} path${paths.length === 1 ? '' : 's'} from ${short(at ?? '')}\n`, patch: { vfs, git: staged.git } };
}

/** switch と checkout はブランチ切り替えとしては同じ振る舞いをする */
const switchTo: GitHandler = (ctx) => {
  const { git, shell, rest, sub } = ctx;
  if (sub === 'checkout') {
    const dash = rest.indexOf('--');
    if (dash >= 0) {
      const before = rest.slice(0, dash).filter((a) => !a.startsWith('-'));
      return checkoutPaths(ctx, before[0], rest.slice(dash + 1));
    }
    const plain = rest.filter((a) => !a.startsWith('-'));
    // git checkout 記録 ファイル…（記録の名前の後に、作業ツリーのファイルが続く）
    if (plain.length >= 2 && resolveRef(git, plain[0] ?? '') !== undefined && plain.slice(1).every((p) => exists(shell.vfs, resolve(shell.cwd, p)) || materialize(git, resolveRef(git, plain[0] ?? '') ?? '').has(relative(git.root, resolve(shell.cwd, p))))) {
      return checkoutPaths(ctx, plain[0], plain.slice(1));
    }
  }
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
    const parsed = parseArgs(['add', ...rest]);
    const { flags } = parsed;
    // -A・--all は、リポジトリの全て（git add . と同じに、変えた物と新しい物を選ぶ）
    const all = flags.has('A') || flags.has('all') || rest.includes('--all');
    const operands = all && parsed.operands.length === 0 ? ['.'] : parsed.operands;
    if (operands.length === 0) {
      return { stderr: 'Nothing specified, nothing added.\n', code: 1 };
    }
    const result = addPaths(git, shell.vfs, operands, { force: flags.has('f') || flags.has('force') });
    if (result.missing.length > 0) {
      return {
        stderr: `fatal: pathspec '${result.missing[0] ?? ''}' did not match any files\n`,
        code: 128,
      };
    }
    if (result.ignored.length > 0) {
      // 本物と同じく、ほかの名前は選んだ上で断る
      return {
        stderr: `The following paths are ignored by one of your .gitignore files:\n${result.ignored.join('\n')}\nhint: Use -f if you really want to add them.\n`,
        code: 1,
        patch: { git: result.git },
      };
    }
    return { patch: { git: result.git } };
  },
  /** git rm [--cached] [-r] <パス>。選んだ物から外す（--cached でなければファイルも消す） */
  rm: ({ git, shell, rest }) => {
    const { operands, flags } = parseArgs(['rm', ...rest]);
    if (operands.length === 0) return { stderr: 'usage: git rm [--cached] [-r] <pathspec>...\n', code: 129 };
    const cached = flags.has('cached');
    const recursive = flags.has('r');
    const index = new Map(git.index);
    let vfs = shell.vfs;
    const removed: string[] = [];
    for (const raw of operands) {
      const target = raw.replace(/^\.\//, '').replace(/\/+$/, '');
      const exact = index.has(target);
      const under = [...index.keys()].filter((p) => p.startsWith(`${target}/`));
      if (!exact && under.length === 0) return { stderr: `fatal: pathspec '${raw}' did not match any files\n`, code: 128 };
      if (!exact && !recursive) return { stderr: `fatal: not removing '${target}' recursively without -r\n`, code: 128 };
      for (const path of exact ? [target] : under) {
        index.delete(path);
        removed.push(path);
        const full = resolve(git.root, path);
        if (!cached && exists(vfs, full)) vfs = remove(vfs, full);
      }
    }
    return { stdout: removed.map((p) => `rm '${p}'\n`).join(''), patch: { git: { ...git, index }, vfs } };
  },
  /** git check-ignore [-v] <パス>。.gitignore で無視される名前を出す（追跡している物は出さない） */
  'check-ignore': ({ git, shell, rest }) => {
    const { operands, flags } = parseArgs(['check-ignore', ...rest]);
    if (operands.length === 0) return { stderr: 'fatal: no path specified\n', code: 128 };
    const rules = ignoreRules(walkWorktree(shell.vfs, git.root));
    const out: string[] = [];
    for (const raw of operands) {
      const path = raw.replace(/^\.\//, '').replace(/\/+$/, '');
      if (git.index.has(path)) continue;
      const rule = ignoredBy(rules, path);
      if (rule === null) continue;
      out.push(flags.has('v') ? `${rule.source}:${String(rule.line)}:${rule.text}\t${raw}` : raw);
    }
    return { stdout: fromLines(out), code: out.length > 0 ? 0 : 1 };
  },
  commit: ({ git: base, shell, rest, nowSeconds, runLine }) => {
    const { values, flags } = parseArgs(['commit', ...rest], { withValue: ['m', 'author'] });
    // --author='名前 <メール>': この記録の作者だけを変える
    const who = /^(.+?) <(.+)>$/.exec(values.get('author') ?? '');
    const git: typeof base = who ? { ...base, author: { ...base.author, name: who[1] ?? '', email: who[2] ?? '' } } : base;
    const after = (r: typeof base): typeof base => (who ? { ...r, author: base.author } : r);
    // 取り込みの途中は、本物と同じく既定の文（Merge branch '枝'）がある。--no-edit はそれを使う（-m が無ければ同じ）
    const message = values.get('m') ?? (git.mergeHead !== null ? mergeMessage(git, git.mergeHead) : undefined);
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
      return commitOutput(after(result.git), result.hash, result.empty, message);
    }
    if (git.index.size === 0 && headCommit(git) === null) {
      // 本物と同じく、追跡していないファイルがあれば add を促す
      const untracked = statusOf(git, shell.vfs).untracked.length > 0;
      return untracked
        ? { stdout: 'nothing added to commit but untracked files present (use "git add" to track)\n', code: 1 }
        : { stdout: 'nothing to commit (create/copy files and use "git add" to track)\n', code: 1 };
    }
    const result = commit(git, message, nowSeconds, flags.has('allow-empty'));
    if (result.empty) {
      // 選んでいない変更が残っていれば、本物と同じく add を促す
      const report = statusOf(git, shell.vfs);
      if (report.unstaged.length > 0) return { stdout: 'no changes added to commit (use "git add" and/or "git commit -a")\n', code: 1 };
      if (report.untracked.length > 0) return { stdout: 'nothing added to commit but untracked files present (use "git add" to track)\n', code: 1 };
    }
    return commitOutput(after(result.git), result.hash, result.empty, message);
  },
  log: ({ git, shell, rest, nowSeconds }) => {
    const opts = parseLogArgs(rest, nowSeconds);
    if ('error' in opts) return { stderr: opts.error, code: 128 };
    // 起点（origin/main など）と、A..B の A（そこから辿れる記録は出さない）
    const starts: string[] = [];
    const hidden: string[] = [];
    const head = headCommit(git);
    const paths = [...opts.paths];
    for (const rev of opts.revs) {
      // 記録の名前でなく、作業ツリーか今の記録にあるファイルなら、パス（git log plan.txt）
      const inRepo = relative(git.root, resolve(shell.cwd, rev));
      if (!rev.includes('..') && resolveRef(git, rev) === undefined && (exists(shell.vfs, resolve(shell.cwd, rev)) || (head !== null && materialize(git, head).has(inRepo)))) {
        paths.push(rev);
        continue;
      }
      const [from, to] = rev.includes('..') ? rev.split('..') : [undefined, rev];
      for (const [name, into] of [[from, hidden], [to, starts]] as const) {
        if (name === undefined) continue;
        const hash = resolveRef(git, name === '' ? 'HEAD' : name);
        if (hash === undefined) return { stderr: `fatal: ambiguous argument '${rev}': unknown revision or path not in the working tree.\n`, code: 128 };
        into.push(hash);
      }
    }
    const wanted = paths.map((p) => relative(git.root, resolve(shell.cwd, p)));
    // そのファイルを変えた記録・-S の文字の数が変わった記録だけ
    const touches = (e: { hash: string; parents: readonly string[] }): boolean => {
      if (wanted.length === 0 && opts.pickaxe === null) return true;
      const after = materialize(git, e.hash);
      const before = e.parents[0] === undefined ? new Map<string, string>() : materialize(git, e.parents[0]);
      const files = [...new Set([...after.keys(), ...before.keys()])].filter((p) => wanted.length === 0 || wanted.some((w) => p === w || p.startsWith(`${w}/`)));
      const count = (text: string | undefined, word: string): number => (text === undefined || word === '' ? 0 : text.split(word).length - 1);
      return files.some((p) => (opts.pickaxe === null ? after.get(p) !== before.get(p) : count(after.get(p), opts.pickaxe) !== count(before.get(p), opts.pickaxe)));
    };
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
      .filter(touches)
      .filter((e) => opts.since === null || e.author.timestamp >= opts.since)
      .filter((e) => opts.until === null || e.author.timestamp <= opts.until)
      .filter((e) => opts.author === null || `${e.author.name} <${e.author.email}>`.includes(opts.author))
      .filter((e) => opts.grep === undefined || e.message.includes(opts.grep))
      .slice(0, opts.max ?? undefined);
    if (opts.format !== undefined) {
      const format = opts.format;
      return { stdout: entries.map((e) => `${format.replace(/%H/g, e.hash).replace(/%h/g, short(e.hash)).replace(/%s/g, e.message.split('\n')[0] ?? '').replace(/%an/g, e.author.name)}\n`).join('') };
    }
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
    if (rest.includes('--name-only') || rest.includes('--name-status')) {
      const files = [...(staged ? changedInIndex(git) : changedInWorktree(git, shell.vfs))].sort(([a], [b]) => (a < b ? -1 : 1));
      // --diff-filter=U は、取り込みの途中で衝突したまま（印が残る）のファイルだけ
      const unmerged = rest.some((a) => /^--diff-filter=.*U/.test(a));
      const picked = unmerged ? files.filter(([, content]) => git.mergeHead !== null && /^(<{7}|={7}|>{7})( |$)/m.test(content)) : files;
      return { stdout: fromLines(picked.map(([path]) => (rest.includes('--name-status') ? `${unmerged ? 'U' : 'M'}\t${path}` : path))) };
    }
    const out = staged ? diffStaged(git) : diffWorktree(git, shell.vfs);
    return { stdout: out, code: 0 };
  },
  restore: ({ git, shell, rest }) => {
    const { flags, operands, values } = parseArgs(['restore', ...rest], { withValue: ['source', 's'] });
    if (operands.length === 0) {
      return { stderr: 'fatal: 対象のパスを指定してください\n', code: 128 };
    }
    // --source（-s）: 作業ツリーのファイルを、その記録の版に戻す（本物と同じく、インデックスは変えない）
    const source = values.get('source') ?? values.get('s');
    if (source !== undefined) {
      const at = resolveRef(git, source);
      if (at === undefined) return { stderr: `fatal: could not resolve ${source}\n`, code: 128 };
      const files = materialize(git, at);
      let vfs = shell.vfs;
      for (const path of operands) {
        const content = files.get(path);
        if (content === undefined) return { stderr: `error: pathspec '${path}' did not match any file(s) known to git\n`, code: 1 };
        vfs = writeFile(vfs, resolve(git.root, path), content, true);
      }
      return { patch: { vfs } };
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

/** 取り込みの既定の文（本物の MERGE_MSG の 1 行目。枝なら Merge branch '枝'、リモートの枝なら Merge remote-tracking branch 'origin/main'） */
function mergeMessage(git: Parameters<GitHandler>[0]['git'], theirs: string): string {
  const refs = [...git.refs].filter(([, h]) => h === theirs).map(([r]) => r);
  const branch = refs.find((r) => r.startsWith('refs/heads/'));
  if (branch) return `Merge branch '${branch.slice('refs/heads/'.length)}'`;
  const remote = refs.find((r) => r.startsWith('refs/remotes/'));
  if (remote) return `Merge remote-tracking branch '${remote.slice('refs/remotes/'.length)}'`;
  return `Merge commit '${short(theirs)}'`;
}
