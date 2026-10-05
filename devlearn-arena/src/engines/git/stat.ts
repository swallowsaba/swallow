import { diffLines, linesOf } from '@/engines/kernel/diff';
import { decode } from './objects';
import { treeFiles } from './repository';
import type { GitState } from './types';

/**
 * 2 つの記録の間で変わったファイルの集計。
 * 本物の git が commit・merge の後に出す「1 file changed, 1 insertion(+)」と create mode の行を作る。
 */
interface FileStat {
  path: string;
  /** 名前を変えた時の元の名前（中身が同じ時だけ。本物の 100% の rename） */
  from?: string;
  kind: 'create' | 'delete' | 'modify' | 'rename';
  insertions: number;
  deletions: number;
}

export function changeStats(git: GitState, before: string | null, after: string): FileStat[] {
  const read = (hash: string | undefined): string[] =>
    hash === undefined ? [] : linesOf(decode(git.objects.read(hash)?.body ?? new Uint8Array()));
  const from = treeFiles(git, before);
  const to = treeFiles(git, after);
  const stats: FileStat[] = [];
  const deleted = new Map<string, string>();
  for (const [path, hash] of from) if (!to.has(path)) deleted.set(path, hash);
  for (const path of [...to.keys()].sort()) {
    const a = from.get(path);
    const b = to.get(path);
    if (a === b) continue;
    if (a === undefined) {
      // 消したファイルと中身が同じなら、名前を変えただけ
      const renamed = [...deleted].find(([, hash]) => hash === b)?.[0];
      if (renamed !== undefined) {
        deleted.delete(renamed);
        stats.push({ path, from: renamed, kind: 'rename', insertions: 0, deletions: 0 });
        continue;
      }
    }
    const ops = diffLines(read(a), read(b));
    stats.push({
      path,
      kind: a === undefined ? 'create' : 'modify',
      insertions: ops.filter((op) => op.kind === 'insert').length,
      deletions: ops.filter((op) => op.kind === 'delete').length,
    });
  }
  for (const [path, hash] of deleted) {
    stats.push({ path, kind: 'delete', insertions: 0, deletions: read(hash).length });
  }
  return stats.sort((x, y) => (x.path < y.path ? -1 : 1));
}

/** merge の +- の列の長さの上限 */
const GRAPH_WIDTH = 40;

const plural =(n: number, word: string): string => `${String(n)} ${word}${n === 1 ? '' : 's'}`;

/** 名前を変えた物の書き方（共通の前と後ろを {} の外に出す。src/{a.ts => b.ts}） */
function renameName(from: string, to: string): string {
  let head = 0;
  for (let i = 0; i < Math.min(from.length, to.length) && from[i] === to[i]; i++) if (from[i] === '/') head = i + 1;
  let tail = 0;
  for (let i = 1; i <= Math.min(from.length, to.length) - head && from[from.length - i] === to[to.length - i]; i++) {
    if (from[from.length - i] === '/') tail = i;
  }
  const mid = (s: string): string => s.slice(head, s.length - tail);
  if (head === 0 && tail === 0) return `${from} => ${to}`;
  return `${from.slice(0, head)}{${mid(from)} => ${mid(to)}}${from.slice(from.length - tail)}`;
}

/** 集計の行（1 file changed, …）と、作った・消した・名前を変えたファイルの行 */
export function summaryLines(stats: readonly FileStat[]): string {
  if (stats.length === 0) return '';
  const ins = stats.reduce((n, s) => n + s.insertions, 0);
  const del = stats.reduce((n, s) => n + s.deletions, 0);
  const parts = [plural(stats.length, 'file') + ' changed'];
  // 本物と同じく、足した行も消した行も無い時は両方を 0 で出す
  if (ins > 0 || del === 0) parts.push(`${plural(ins, 'insertion')}(+)`);
  if (del > 0 || ins === 0) parts.push(`${plural(del, 'deletion')}(-)`);
  const modes = stats.flatMap((s) => {
    if (s.kind === 'create') return [` create mode 100644 ${s.path}\n`];
    if (s.kind === 'delete') return [` delete mode 100644 ${s.path}\n`];
    if (s.kind === 'rename' && s.from !== undefined) return [` rename ${renameName(s.from, s.path)} (100%)\n`];
    return [];
  });
  return ` ${parts.join(', ')}\n${modes.join('')}`;
}

/** merge が出す、ファイルごとの変わった行の数（a.txt | 2 +-）と、その後の集計 */
export function diffstat(stats: readonly FileStat[]): string {
  if (stats.length === 0) return '';
  const names = stats.map((s) => (s.kind === 'rename' && s.from !== undefined ? renameName(s.from, s.path) : s.path));
  const width = Math.max(...names.map((n) => n.length));
  const counts = stats.map((s) => String(s.insertions + s.deletions));
  const countWidth = Math.max(...counts.map((c) => c.length));
  // 本物と同じく、+- の列が長すぎる時は縮める（変えた行があれば 1 字は残す）
  const most = Math.max(...stats.map((s) => s.insertions + s.deletions));
  const scale = (n: number): number => (most <= GRAPH_WIDTH || n === 0 ? n : Math.max(1, Math.round((n * GRAPH_WIDTH) / most)));
  const rows = stats.map((s, i) => {
    const graph = '+'.repeat(scale(s.insertions)) + '-'.repeat(scale(s.deletions));
    return ` ${(names[i] ?? '').padEnd(width)} | ${(counts[i] ?? '').padStart(countWidth)}${graph === '' ? '' : ` ${graph}`}\n`;
  });
  return rows.join('') + summaryLines(stats);
}
