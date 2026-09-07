import type { Repo } from '@/engines/github/types';
import { resolve } from '../path';
import { stat, type VfsState } from '../vfs';
import type { CommandResult, ShellState } from '../registry';

export const NO_REPO = 'リモートのリポジトリがありません。GitHub の任務を選んでください。\n';

export interface GhContext {
  repo: Repo;
  shell: ShellState;
  sub: string;
  rest: readonly string[];
  flags: ReadonlySet<string>;
  values: ReadonlyMap<string, string>;
  operands: readonly string[];
}

export type GhHandler = (ctx: GhContext) => CommandResult;

export function statusMark(status: string): string {
  return status === 'success' ? '✓' : status === 'failure' ? '✗' : status === 'skipped' ? '−' : '…';
}

/** `.github/workflows` にあるファイルを全部拾う。パス → 中身 */
export function workflowFiles(shell: ShellState): Map<string, string> {
  const dir = resolve(shell.cwd, '.github/workflows');
  const out = new Map<string, string>();
  if (stat(shell.vfs, dir)?.kind !== 'dir') return out;
  for (const [path, entry] of shell.vfs.nodes) {
    if (entry.kind === 'file' && path.startsWith(`${dir}/`)) out.set(path, entry.content);
  }
  return out;
}

/** 呼び出し用の索引。`./.github/workflows/x.yml` の形で引けるようにする */
export function workflowLibrary(shell: ShellState): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [path, content] of workflowFiles(shell)) {
    const name = path.slice(path.lastIndexOf('/') + 1);
    out[`./.github/workflows/${name}`] = content;
    out[path] = content;
  }
  return out;
}

/** 名前で1つ選ぶ。指定が無ければ最初の1つ */
export function pickWorkflow(shell: ShellState, name?: string): { path: string; content: string } | null {
  const files = [...workflowFiles(shell)].sort(([a], [b]) => (a < b ? -1 : 1));
  const hit = name === undefined
    ? files[0]
    : files.find(([path]) => path.endsWith(`/${name}`) || path.endsWith(`/${name}.yml`));
  return hit === undefined ? null : { path: hit[0], content: hit[1] };
}

export function readFileOrNull(vfs: VfsState, path: string): string | null {
  const node = stat(vfs, path);
  return node?.kind === 'file' ? node.content : null;
}
