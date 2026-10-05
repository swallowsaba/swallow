import {
  currentBranch, defaultAuthor, headCommit, indexOf, initRepository,
} from '@/engines/git/repository';
import { HOOKS_DIR, gitPath } from '@/engines/git/gitdir';
import type { GitState } from '@/engines/git/types';
import { cloneFrom, createRemote, fetch as fetchRemote, push as pushRemote, type FetchResult, type Remote } from '@/engines/git/remote';
import { mergeWith } from './gitHistory';
import { checkoutWorktree } from '@/engines/git/worktree';
import { fromLines, parseArgs } from './args';
import { resolve } from '../path';
import type { CommandResult, GitServer, ShellState } from '../registry';
import { exists, list, mkdir, readFile, stat } from '../vfs';
import { short, type GitHandler } from './gitShared';

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
  push: ({ git, shell, rest }) => {
    const { flags, operands } = parseArgs(['push', ...rest]);
    const remoteName = operands[0] ?? 'origin';
    const branch = operands[1] ?? currentBranch(git) ?? 'main';
    const known = git.remotes.get(remoteName);
    if (!known) {
      return { stderr: `fatal: '${remoteName}' does not appear to be a git repository\n`, code: 128 };
    }
    // サーバのリポジトリなら、つなげるかを確かめ、今の履歴（ほかの人の push を含む）に送る
    if (serverOf(shell, known.url)) {
      const denied = accessError(shell, known.url);
      if (denied !== null) return { stderr: denied, code: 128 };
    }
    const remote = withServer(shell, known);
    const result = pushRemote(git, remote, branch, {
      force: flags.has('f') || rest.includes('--force'),
      forceWithLease: rest.includes('--force-with-lease'),
    });
    const remotes = new Map(git.remotes);
    remotes.set(remoteName, result.remote);
    if (!result.ok) {
      return { stderr: result.message, code: 1, patch: { git: { ...git, remotes } } };
    }
    const servers = serversAfterPush(shell, result.remote);
    return { stdout: result.message, patch: { git: { ...result.git, remotes }, ...(servers ? { gitServers: servers } : {}) } };
  },
  fetch: ({ git, shell, rest }) => {
    const { operands } = parseArgs(['fetch', ...rest]);
    const remoteName = operands[0] ?? 'origin';
    const fetched = fetchFrom(git, shell, remoteName);
    if ('error' in fetched) return { stderr: fetched.error, code: 128 };
    return { stdout: fetchReport(git, fetched.result, remoteName, fetched.url), patch: { git: fetched.result.git } };
  },
  /** git pull = fetch して、追跡している枝を取り込む（分かれていれば合わせる記録を作る。pull.rebase=false と同じ） */
  pull: ({ git, shell, rest, nowSeconds }) => {
    const { operands } = parseArgs(['pull', ...rest]);
    const remoteName = operands[0] ?? 'origin';
    const branch = operands[1] ?? currentBranch(git) ?? 'main';
    const fetched = fetchFrom(git, shell, remoteName);
    if ('error' in fetched) return { stderr: fetched.error, code: 128 };
    const next = fetched.result.git;
    const target = next.refs.get(`refs/remotes/${remoteName}/${branch}`);
    const report = fetchReport(git, fetched.result, remoteName, fetched.url);
    if (target === undefined || headCommit(next) === target) return { stdout: `${report}Already up to date.\n`, patch: { git: next } };
    const merged = mergeWith(next, shell, `${remoteName}/${branch}`, nowSeconds, `Merge branch '${branch}' of ${fetched.url.replace(/\.git$/, '')}`);
    // 取り込みが衝突で止まっても、取ってきた履歴（origin/main）は残す
    return { ...merged, stdout: `${report}${merged.stdout ?? ''}`, patch: { git: next, ...merged.patch } };
  },
};

/* ---- サーバのリポジトリ（setup の gitServers） ---- */

/** URL（https か SSH）からサーバのリポジトリを引く */
export function serverOf(shell: ShellState, url: string): GitServer | undefined {
  const want = url.replace(/\/+$/, '');
  return [...(shell.gitServers?.values() ?? [])].find((g) => g.url === want || g.ssh === want);
}

/** SSH の URL は、自分の公開鍵（~/.ssh/*.pub）がサーバに登録されている時だけ使える */
function sshAllowed(shell: ShellState, server: GitServer): boolean {
  const ssh = `${shell.vars.get('HOME') ?? '/home/learner'}/.ssh`;
  if (stat(shell.vfs, ssh)?.kind !== 'dir') return false;
  const mine = list(shell.vfs, ssh)
    .filter((name) => name.endsWith('.pub'))
    .map((name) => readFile(shell.vfs, `${ssh}/${name}`).trim());
  return mine.some((key) => server.keys.includes(key));
}

const CANNOT_READ = 'fatal: Could not read from remote repository.\n\nPlease make sure you have the correct access rights\nand the repository exists.\n';

/** つなげない時の文（本物の git と同じ言い方）。つなげれば null */
export function accessError(shell: ShellState, url: string): string | null {
  const server = serverOf(shell, url);
  const ssh = /^git@([^:]+):/.exec(url);
  if (!server) return ssh ? `ERROR: Repository not found.\n${CANNOT_READ}` : `fatal: repository '${url.replace(/\/+$/, '')}/' not found\n`;
  if (ssh && !sshAllowed(shell, server)) return `git@${ssh[1] ?? ''}: Permission denied (publickey).\n${CANNOT_READ}`;
  return null;
}

/** git clone <URL> [ディレクトリ]。サーバのリポジトリを履歴ごと複製し、origin がその URL を指す */
export function cloneRepository(shell: ShellState, rest: readonly string[], nowSeconds: number): CommandResult {
  const { operands } = parseArgs(['clone', ...rest]);
  const url = operands[0];
  if (url === undefined) return { stderr: 'fatal: You must specify a repository to clone.\n', code: 129 };
  const denied = accessError(shell, url);
  const server = serverOf(shell, url);
  if (denied !== null || !server) return { stderr: denied ?? '', code: 128 };
  const name = operands[1] ?? (url.replace(/\/+$/, '').split(/[/:]/).pop() ?? 'repo').replace(/\.git$/, '');
  const root = resolve(shell.cwd, name);
  if (exists(shell.vfs, root) && (stat(shell.vfs, root)?.kind !== 'dir' || list(shell.vfs, root).length > 0)) {
    return { stderr: `fatal: destination path '${name}' already exists and is not an empty directory.\n`, code: 128 };
  }
  const origin = createRemote('origin', url, server.state);
  const fresh = initRepository(root, { ...defaultAuthor, timestamp: nowSeconds });
  const cloned = cloneFrom(origin, root, fresh);
  const head = headCommit(cloned);
  const git: GitState = { ...(head === null ? cloned : indexOf(cloned, head)), remotes: new Map([['origin', origin]]) };
  let vfs = mkdir(shell.vfs, root, true);
  vfs = mkdir(vfs, gitPath(git, HOOKS_DIR), true);
  vfs = checkoutWorktree(vfs, git, null, head);
  // 本物は Cloning into を標準エラーに出すが、ここでは成功の知らせとして出力に出す（エラーの解説を開かない）
  return { stdout: `Cloning into '${name}'...\n`, patch: { git, vfs } };
}

/** push・fetch の前に、サーバの今の履歴を見る（ほかの人の push を反映する） */
export function withServer(shell: ShellState, remote: Remote): Remote {
  const server = serverOf(shell, remote.url);
  return server ? { ...remote, state: server.state } : remote;
}

/** push の後、サーバの履歴を進める */
export function serversAfterPush(shell: ShellState, remote: Remote): ReadonlyMap<string, GitServer> | undefined {
  const server = serverOf(shell, remote.url);
  if (!server || !shell.gitServers) return shell.gitServers;
  const next = new Map(shell.gitServers);
  next.set(server.url, { ...server, state: remote.state });
  return next;
}

/** fetch の知らせ（本物と同じく、From URL と、取ってきた枝ごとに前と後の番号） */
function fetchReport(before: GitState, result: FetchResult, remoteName: string, url: string): string {
  if (result.updated.length === 0) return '';
  const lines = result.updated.map((b) => {
    const ref = `refs/remotes/${remoteName}/${b}`;
    const old = before.refs.get(ref);
    const now = result.git.refs.get(ref) ?? '';
    return old === undefined
      ? ` * [new branch]      ${b.padEnd(10)} -> ${remoteName}/${b}`
      : `   ${short(old)}..${short(now)}  ${b.padEnd(10)} -> ${remoteName}/${b}`;
  });
  return `From ${url}\n${lines.join('\n')}\n`;
}

/** サーバの今の履歴を取ってくる（つなげなければエラーの文） */
function fetchFrom(git: GitState, shell: ShellState, remoteName: string): { result: FetchResult; url: string } | { error: string } {
  const known = git.remotes.get(remoteName);
  if (!known) return { error: `fatal: '${remoteName}' does not appear to be a git repository\n` };
  if (serverOf(shell, known.url)) {
    const denied = accessError(shell, known.url);
    if (denied !== null) return { error: denied };
  }
  const remote = withServer(shell, known);
  const result = fetchRemote(git, remote);
  const remotes = new Map(result.git.remotes);
  remotes.set(remoteName, remote);
  return { result: { ...result, git: { ...result.git, remotes } }, url: remote.url };
}
