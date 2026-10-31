import { encode, parseCommit, serializeCommit, type CommitData } from '@/engines/git/objects';
import { peel, TAG_PREFIX } from '@/engines/git/refs';
import { FILE_MODE, headCommit, indexOf, materialize, writeTreeFromIndex } from '@/engines/git/repository';
import type { GitState, IndexEntry } from '@/engines/git/types';
import { checkoutWorktree } from '@/engines/git/worktree';
import { fromLines } from './args';
import { formatUtcTime, short, type GitHandler } from './gitShared';
import type { CommandResult } from '../registry';

/**
 * git blame（行ごとの最後の変更）と、履歴の書き換え（git filter-repo・git filter-branch の index-filter）。
 * docs/lessons/git.md の git.a.01・git.a.03 が使う
 */

/** 2 つの行の並びで、new の各行が old のどの行に当たるか（当たらなければ -1）。LCS で合わせる */
function matchLines(oldLines: readonly string[], newLines: readonly string[]): number[] {
  const n = oldLines.length;
  const m = newLines.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array.from({ length: m + 1 }, () => 0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      const row = dp[i] as number[];
      row[j] = oldLines[i] === newLines[j] ? (dp[i + 1]?.[j + 1] ?? 0) + 1 : Math.max(dp[i + 1]?.[j] ?? 0, row[j + 1] ?? 0);
    }
  }
  const out = Array.from({ length: m }, () => -1);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (oldLines[i] === newLines[j]) {
      out[j] = i;
      i += 1;
      j += 1;
    } else if ((dp[i + 1]?.[j] ?? 0) >= (dp[i]?.[j + 1] ?? 0)) i += 1;
    else j += 1;
  }
  return out;
}

function commitOf(git: GitState, hash: string): CommitData {
  const object = git.objects.read(hash);
  if (!object) throw new Error(`無い記録: ${hash}`);
  return parseCommit(object.body);
}

/** blame の時刻（2026-10-03 09:00:00 +0900）。記録の時刻は UTC の秒 */
function blameDate(timestamp: number, timezone: string): string {
  const sign = timezone.startsWith('-') ? -1 : 1;
  const off = sign * (Number(timezone.slice(1, 3)) * 3600 + Number(timezone.slice(3, 5)) * 60);
  return `${formatUtcTime(timestamp + off).replace('T', ' ').replace(/\.\d+Z$|Z$/, '')} ${timezone}`;
}

const blame: GitHandler = ({ git, shell, rest }) => {
  const at = rest.indexOf('-L');
  const range = at >= 0 ? /^(\d+),(\d+)$/.exec(rest[at + 1] ?? '') : null;
  const operands = rest.filter((a, i) => !a.startsWith('-') && !(at >= 0 && i === at + 1));
  const path = operands[operands.length - 1];
  if (path === undefined) return { stderr: 'usage: git blame [<options>] [<rev-opts>] [<rev>] [--] <file>\n', code: 129 };
  const repoPath = `${shell.cwd}/${path}`.slice(git.root.length + 1);
  const head = headCommit(git);
  const text = head === null ? undefined : materialize(git, head).get(repoPath);
  if (head === null || text === undefined) return { stderr: `fatal: no such path '${path}' in HEAD\n`, code: 128 };
  const lines = text.endsWith('\n') ? text.slice(0, -1).split('\n') : text.split('\n');
  // 新しい記録から親へたどり、親に無い行をその記録の変更とする。行の位置は親の位置へ読み替えていく
  const owner: string[] = lines.map(() => '');
  let open = lines.map((_, i) => i);
  let at2 = lines.map((_, i) => i);
  let hash: string | undefined = head;
  let current = lines;
  while (hash !== undefined && open.length > 0) {
    const data = commitOf(git, hash);
    const parent: string | undefined = data.parents[0];
    const before = parent === undefined ? undefined : materialize(git, parent).get(repoPath);
    const oldLines = before === undefined ? [] : before.endsWith('\n') ? before.slice(0, -1).split('\n') : before.split('\n');
    const map = matchLines(oldLines, current);
    const nextOpen: number[] = [];
    const nextAt: number[] = [];
    for (let k = 0; k < open.length; k += 1) {
      const line = open[k] ?? 0;
      const pos = map[at2[k] ?? 0] ?? -1;
      if (pos === -1) owner[line] = hash;
      else {
        nextOpen.push(line);
        nextAt.push(pos);
      }
    }
    open = nextOpen;
    at2 = nextAt;
    current = oldLines;
    hash = parent;
  }
  const authors = owner.map((h) => commitOf(git, h).author);
  const width = Math.max(...authors.map((a) => a.name.length));
  const digits = String(lines.length).length;
  const roots = new Set(owner.filter((h) => commitOf(git, h).parents.length === 0));
  const from = range ? Number(range[1]) : 1;
  const to = range ? Number(range[2]) : lines.length;
  const out: string[] = [];
  lines.forEach((line, i) => {
    if (i + 1 < from || i + 1 > to) return;
    const h = owner[i] ?? '';
    const a = authors[i];
    const id = roots.has(h) ? `^${h.slice(0, 7)}` : h.slice(0, 8);
    out.push(`${id} (${(a?.name ?? '').padEnd(width)} ${blameDate(a?.timestamp ?? 0, a?.timezone ?? '+0000')} ${String(i + 1).padStart(digits)}) ${line}`);
  });
  return { stdout: fromLines(out) };
};

/** 全ての枝とタグの履歴を、drop のパスを除いて作り直す。中身の変わらなくなった記録は無くす */
function rewrite(git: GitState, drop: readonly string[]): { git: GitState; count: number; changed: string[] } {
  const map = new Map<string, string>();
  let count = 0;
  const visit = (hash: string): string => {
    const known = map.get(hash);
    if (known !== undefined) return known;
    const data = commitOf(git, hash);
    const parents = data.parents.map(visit);
    count += 1;
    const files = materialize(git, hash);
    const index = new Map<string, IndexEntry>();
    for (const [path, content] of files) {
      if (drop.some((d) => path === d || path.startsWith(`${d}/`))) continue;
      index.set(path, { path, mode: FILE_MODE, hash: git.objects.write('blob', encode(content)) });
    }
    const tree = writeTreeFromIndex({ ...git, index });
    const only = parents[0];
    // 親と同じ中身になった記録は要らない（--prune-empty・filter-repo の既定）。元から空だった記録と、最初の記録は残す
    if (parents.length === 1 && only !== undefined && commitOf(git, only).tree === tree) {
      map.set(hash, only);
      return only;
    }
    const next = git.objects.write('commit', serializeCommit({ ...data, tree, parents }));
    map.set(hash, next);
    return next;
  };
  const refs = new Map<string, string>();
  const changed: string[] = [];
  for (const [name, hash] of git.refs) {
    if (name.startsWith('refs/remotes/')) continue;
    if (!name.startsWith('refs/heads/') && !name.startsWith(TAG_PREFIX)) {
      refs.set(name, hash);
      continue;
    }
    const next = visit(peel(git, hash));
    refs.set(name, next);
    if (next !== hash) changed.push(name);
  }
  return { git: { ...git, refs, reflog: [], origHead: null }, count, changed };
}

/** 作業ツリーと index を新しい先に合わせる */
function settled(ctx: { git: GitState; shell: { vfs: Parameters<typeof checkoutWorktree>[0] } }, next: GitState): { git: GitState; vfs: Parameters<typeof checkoutWorktree>[0]; tip: string | null } {
  const before = headCommit(ctx.git);
  const tip = headCommit(next);
  if (tip === null) return { git: next, vfs: ctx.shell.vfs, tip };
  return { git: indexOf(next, tip), vfs: checkoutWorktree(ctx.shell.vfs, next, before, tip), tip };
}

const filterRepo: GitHandler = (ctx) => {
  const { git, rest } = ctx;
  const paths = rest.flatMap((a, i) => (a === '--path' && rest[i + 1] !== undefined ? [rest[i + 1] as string] : []));
  if (!rest.includes('--force') && !rest.includes('-f')) {
    return { stderr: 'Aborting: Refusing to destructively overwrite repo history since\nthis does not look like a fresh clone.\n  (expected freshly packed repo)\nNote: when cloning local repositories, you need to pass\n      --no-local to git clone to avoid this issue.\nPlease operate on a fresh clone instead.  If you want to proceed\nanyway, use --force.\n', code: 1 };
  }
  if (paths.length === 0 || !rest.includes('--invert-paths')) return { stderr: 'git-filter-repo: 模擬は --path と --invert-paths でパスを除く使い方だけを受ける\n', code: 2 };
  const done = rewrite(git, paths);
  const origin = git.remotes.get('origin');
  const remotes = new Map(git.remotes);
  remotes.delete('origin');
  const after = settled(ctx, { ...done.git, remotes });
  return {
    stdout: fromLines([
      ...(origin ? ["NOTICE: Removing 'origin' remote; see 'Why is my origin removed?'", '        in the manual if you want to push back there.', `        (was ${origin.url})`] : []),
      `Parsed ${String(done.count)} commits`,
      'New history written in 0.04 seconds; now repacking/cleaning...',
      'Repacking your repo and cleaning out old unneeded objects',
      ...(after.tip === null ? [] : [`HEAD is now at ${short(after.tip)} ${(commitOf(git, after.tip).message.split('\n')[0] ?? '')}`]),
      'Completed the rewrite in 0.09 seconds.',
    ]),
    patch: { git: after.git, vfs: after.vfs },
  };
};

const filterBranch: GitHandler = (ctx) => {
  const { git, rest } = ctx;
  const at = rest.indexOf('--index-filter');
  const filter = at >= 0 ? rest[at + 1] ?? '' : '';
  const m = /^git rm (?:-[-\w]+ )*(\S+)$/.exec(filter.trim());
  if (!m?.[1]) return { stderr: 'usage: git filter-branch --index-filter "git rm --cached --ignore-unmatch <パス>" --prune-empty -- --all\n', code: 1 };
  const done = rewrite(git, [m[1]]);
  const after = settled(ctx, done.git);
  return {
    stdout: fromLines([
      `Rewrite ${after.tip === null ? '' : short(after.tip)} (${String(done.count)}/${String(done.count)}) (0 seconds passed, remaining 0 predicted)`,
      '',
      ...done.changed.map((r) => `Ref '${r}' was rewritten`),
    ]),
    patch: { git: after.git, vfs: after.vfs },
  } satisfies CommandResult;
};

export const rewriteSubcommands: Record<string, GitHandler> = {
  blame,
  'filter-repo': filterRepo,
  'filter-branch': filterBranch,
};
