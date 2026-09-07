import {
  HOOKS_DIR, SPARSE_FILE, WORKTREES_DIR, gitPath, readGitFile, removeGitFile, writeGitFile,
} from '@/engines/git/gitdir';
import { encode } from '@/engines/git/objects';
import { createTag, deleteTag, parseTag, resolveRef, tagNames, TAG_PREFIX } from '@/engines/git/refs';
import { GITLINK_MODE, branches, currentBranch, materialize } from '@/engines/git/repository';
import type { IndexEntry } from '@/engines/git/types';
import { checkoutWorktree } from '@/engines/git/worktree';
import { basename, resolve } from '../path';
import { isDir, list, mkdir, readFile, remove, stat, writeFile } from '../vfs';
import { fromLines, parseArgs } from './args';
import { short, type GitHandler } from './gitShared';

/**
 * 参照まわりと、作業ツリーの切り出し。
 * 状態は全て refs か `.git/` の下のファイルとして持つので、本物と同じ場所を覗ける。
 */
export const refSubcommands: Record<string, GitHandler> = {
  tag: ({ git, rest, nowSeconds }) => {
    const { flags, values, operands } = parseArgs(['tag', ...rest], { withValue: ['m'] });

    if (flags.has('d') || flags.has('delete')) {
      const name = operands[0];
      if (name === undefined) return { stderr: 'fatal: タグ名を指定してください\n', code: 129 };
      const result = deleteTag(git, name);
      if (result.error !== undefined) return { stderr: `${result.error}\n`, code: 1 };
      return { stdout: `Deleted tag '${name}'\n`, patch: { git: result.git } };
    }

    const name = operands[0];
    if (name === undefined) {
      const names = tagNames(git);
      if (!flags.has('n')) return { stdout: fromLines(names) };
      return {
        stdout: fromLines(
          names.map((tag) => {
            const hash = git.refs.get(`${TAG_PREFIX}${tag}`) ?? '';
            const object = git.objects.read(hash);
            const note = object?.type === 'tag' ? parseTag(object.body).message.trim() : '';
            return note === '' ? tag : `${tag}\t${note}`;
          }),
        ),
      };
    }

    const message = values.get('m');
    if (flags.has('a') && message === undefined) {
      return { stderr: 'fatal: 注釈付きタグには -m でメッセージが要ります\n', code: 128 };
    }
    const result = createTag(git, name, operands[1] ?? 'HEAD', {
      message,
      now: nowSeconds,
      force: flags.has('f'),
    });
    if (result.error !== undefined) return { stderr: `${result.error}\n`, code: 128 };
    return { patch: { git: result.git } };
  },

  'sparse-checkout': ({ git, shell, rest }) => {
    const action = rest[0] ?? 'list';
    const head = git.refs.get(`refs/heads/${currentBranch(git) ?? ''}`) ?? null;

    if (action === 'list') {
      const text = readGitFile(shell.vfs, git, SPARSE_FILE);
      if (text === null) {
        return { stderr: 'error: このリポジトリでは sparse-checkout が有効になっていません\n', code: 1 };
      }
      return { stdout: text.endsWith('\n') ? text : `${text}\n` };
    }

    if (action === 'disable') {
      // 無効にしたら、範囲外に置いていたファイルも全部戻す
      const vfs = removeGitFile(shell.vfs, git, SPARSE_FILE);
      return { patch: { vfs: checkoutWorktree(vfs, git, null, head) } };
    }

    if (action === 'set' || action === 'add') {
      const patterns = rest.slice(1);
      if (patterns.length === 0) {
        return { stderr: `usage: git sparse-checkout ${action} <pattern>...\n`, code: 129 };
      }
      const previous = action === 'add' ? (readGitFile(shell.vfs, git, SPARSE_FILE) ?? '') : '';
      const merged = [...previous.split('\n'), ...patterns]
        .map((l) => l.trim())
        .filter((l) => l !== '');
      const vfs = writeGitFile(shell.vfs, git, SPARSE_FILE, `${[...new Set(merged)].join('\n')}\n`);
      // 展開し直して、範囲外のファイルを作業ツリーから外す
      return { patch: { vfs: checkoutWorktree(vfs, git, head, head) } };
    }

    return { stderr: `error: unknown subcommand: ${action}\n`, code: 129 };
  },

  worktree: ({ git, shell, rest }) => {
    const action = rest[0] ?? 'list';
    const root = gitPath(git, WORKTREES_DIR);

    if (action === 'list') {
      const branch = currentBranch(git) ?? 'HEAD';
      const rows = [`${git.root}\t${short(git.refs.get(`refs/heads/${branch}`) ?? '')} [${branch}]`];
      if (isDir(shell.vfs, root)) {
        for (const name of list(shell.vfs, root)) {
          const dir = resolve(root, name);
          const head = stat(shell.vfs, resolve(dir, 'HEAD'));
          const gitdir = stat(shell.vfs, resolve(dir, 'gitdir'));
          if (head?.kind !== 'file' || gitdir?.kind !== 'file') continue;
          const linked = head.content.trim().replace('ref: refs/heads/', '');
          rows.push(
            `${gitdir.content.trim()}\t${short(git.refs.get(`refs/heads/${linked}`) ?? '')} [${linked}]`,
          );
        }
      }
      return { stdout: fromLines(rows) };
    }

    if (action === 'add') {
      const target = rest[1];
      if (target === undefined) return { stderr: 'usage: git worktree add <path> [<branch>]\n', code: 129 };
      const path = resolve(shell.cwd, target);
      const branch = rest[2] ?? basename(path);
      if (!branches(git).includes(branch)) {
        return { stderr: `fatal: invalid reference: ${branch}\n`, code: 128 };
      }
      if (stat(shell.vfs, path) !== undefined) {
        return { stderr: `fatal: '${target}' already exists\n`, code: 128 };
      }
      // 同じリポジトリを、別のディレクトリに別のブランチで展開する
      const head = git.refs.get(`refs/heads/${branch}`) ?? null;
      let vfs = mkdir(shell.vfs, path, true);
      vfs = checkoutWorktree(vfs, git, null, head, { into: path });
      const name = basename(path);
      vfs = writeGitFile(vfs, git, `${WORKTREES_DIR}/${name}/HEAD`, `ref: refs/heads/${branch}\n`);
      vfs = writeGitFile(vfs, git, `${WORKTREES_DIR}/${name}/gitdir`, `${path}\n`);
      return { stdout: `Preparing worktree (checking out '${branch}')\n`, patch: { vfs } };
    }

    if (action === 'remove') {
      const target = rest[1];
      if (target === undefined) return { stderr: 'usage: git worktree remove <path>\n', code: 129 };
      const path = resolve(shell.cwd, target);
      const name = basename(path);
      if (!isDir(shell.vfs, resolve(root, name))) {
        return { stderr: `fatal: '${target}' is not a working tree\n`, code: 128 };
      }
      let vfs = removeGitFile(shell.vfs, git, `${WORKTREES_DIR}/${name}`);
      if (isDir(vfs, path)) vfs = remove(vfs, path, true);
      return { patch: { vfs } };
    }

    return { stderr: 'usage: git worktree <add|list|remove>\n', code: 129 };
  },

  submodule: ({ git, shell, rest }) => {
    const action = rest[0] ?? 'status';

    if (action === 'status') {
      const entries = [...git.index.values()].filter((e) => e.mode === GITLINK_MODE);
      return { stdout: fromLines(entries.map((e) => ` ${e.hash} ${e.path}`)) };
    }

    if (action === 'add') {
      const url = rest[1];
      const target = rest[2] ?? (url === undefined ? undefined : basename(url).replace(/\.git$/, ''));
      if (url === undefined || target === undefined) {
        return { stderr: 'usage: git submodule add <url> [<path>]\n', code: 129 };
      }
      const remote = [...git.remotes.values()].find((r) => r.url === url);
      const pointed = remote?.state.refs.get('refs/heads/main');
      if (remote === undefined || pointed === undefined) {
        return {
          stderr: `fatal: repository '${url}' does not exist（先に git remote add で登録してください）\n`,
          code: 128,
        };
      }

      const gitmodules = resolve(git.root, '.gitmodules');
      const existing = stat(shell.vfs, gitmodules);
      const content =
        (existing?.kind === 'file' ? existing.content : '') +
        `[submodule "${target}"]\n\tpath = ${target}\n\turl = ${url}\n`;

      let vfs = writeFile(shell.vfs, gitmodules, content, true);
      vfs = mkdir(vfs, resolve(git.root, target), true);
      for (const [path, text] of materialize(remote.state, pointed)) {
        vfs = writeFile(vfs, resolve(git.root, `${target}/${path}`), text, true);
      }

      // gitlink（mode 160000）は中身ではなく「相手のコミット1つ」を記録する
      const index = new Map<string, IndexEntry>(git.index);
      index.set(target, { path: target, mode: GITLINK_MODE, hash: pointed });
      index.set('.gitmodules', {
        path: '.gitmodules',
        mode: '100644',
        hash: git.objects.write('blob', encode(content)),
      });
      return {
        stdout: `Adding existing repo at '${target}' to the index\n`,
        patch: { git: { ...git, index }, vfs },
      };
    }

    return { stderr: 'usage: git submodule <add|status>\n', code: 129 };
  },

  hook: ({ git, shell, rest, runLine }) => {
    const action = rest[0] ?? 'list';
    const dir = gitPath(git, HOOKS_DIR);

    if (action === 'list') {
      if (!isDir(shell.vfs, dir)) return { stdout: '' };
      return {
        stdout: fromLines(
          list(shell.vfs, dir).map(
            (name) => `${name}\t${readFile(shell.vfs, resolve(dir, name)).trim()}`,
          ),
        ),
      };
    }

    if (action === 'run') {
      const name = rest[1];
      if (name === undefined) return { stderr: 'usage: git hook run <name>\n', code: 129 };
      const outcome = runHook(shell.vfs, gitPath(git, `${HOOKS_DIR}/${name}`), runLine);
      if (outcome === null) return { code: 0 };
      return { stdout: outcome.stdout, stderr: outcome.stderr, code: outcome.code };
    }

    return { stderr: 'usage: git hook <list|run <name>>\n', code: 129 };
  },

  'rev-parse': ({ git, rest }) => {
    const { operands } = parseArgs(['rev-parse', ...rest]);
    const out: string[] = [];
    for (const ref of operands) {
      const hash = resolveRef(git, ref);
      if (hash === undefined) return { stderr: `fatal: ambiguous argument '${ref}'\n`, code: 128 };
      out.push(hash);
    }
    return { stdout: fromLines(out) };
  },
};

export interface HookOutcome {
  stdout: string;
  stderr: string;
  code: number;
}

/**
 * hook スクリプトを走らせる。
 * 中身は1行1コマンドのシェル。どこかで 0 以外が返ったらそこで止め、その終了コードを返す。
 * hook が無ければ null（＝何も起きなかった）。
 */
export function runHook(
  vfs: Parameters<typeof isDir>[0],
  path: string,
  runLine: (line: string) => { stdout: string; stderr: string; code: number },
): HookOutcome | null {
  const node = stat(vfs, path);
  if (node?.kind !== 'file') return null;
  let stdout = '';
  let stderr = '';
  for (const raw of node.content.split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const result = runLine(line);
    stdout += result.stdout;
    stderr += result.stderr;
    if (result.code !== 0) return { stdout, stderr, code: result.code };
  }
  return { stdout, stderr, code: 0 };
}
