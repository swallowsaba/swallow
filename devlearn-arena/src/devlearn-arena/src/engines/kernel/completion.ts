import { basename, dirname, resolve } from './path';
import type { CommandRegistry, ShellState } from './registry';
import { isDir, list, stat } from './vfs';

export interface CompletionResult {
  /** 候補（共通接頭辞の計算済み） */
  candidates: string[];
  /** 置換を始める位置（line の index） */
  start: number;
  /** すべての候補に共通する接頭辞 */
  commonPrefix: string;
}

function currentWord(line: string, cursor: number): { word: string; start: number; index: number } {
  const before = line.slice(0, cursor);
  const start = before.search(/[^\s]*$/);
  const word = before.slice(start);
  // 何番目の単語か（0 = コマンド名）
  const index = before.slice(0, start).trim() === '' ? 0 : before.trim().split(/\s+/).length - (word === '' ? 0 : 1);
  return { word, start, index };
}

function longestCommonPrefix(items: readonly string[]): string {
  const first = items[0];
  if (first === undefined) return '';
  let prefix = first;
  for (const item of items) {
    while (!item.startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
      if (prefix === '') return '';
    }
  }
  return prefix;
}

function completePath(shell: ShellState, word: string): string[] {
  const hasSlash = word.includes('/');
  const dirPart = hasSlash ? (word.endsWith('/') ? word : dirname(word)) : '.';
  const namePart = word.endsWith('/') ? '' : basename(word);
  const absolute = resolve(shell.cwd, dirPart);
  if (!stat(shell.vfs, absolute)) return [];
  const prefix = hasSlash ? (word.endsWith('/') ? word : `${dirPart === '.' ? '' : dirPart}/`) : '';

  return list(shell.vfs, absolute)
    .filter((name) => name.startsWith(namePart))
    .map((name) => {
      const full = `${prefix}${name}`;
      return isDir(shell.vfs, resolve(absolute, name)) ? `${full}/` : full;
    });
}

/**
 * Tab 補完。0 番目の単語はコマンド名、それ以降は
 * コマンド固有の補完（あれば）→ 無ければパス補完。
 */
export function complete(
  line: string,
  cursor: number,
  deps: { shell: ShellState; registry: CommandRegistry },
): CompletionResult {
  const { word, start, index } = currentWord(line, cursor);

  let candidates: string[];
  if (index === 0) {
    candidates = deps.registry.names().filter((n) => n.startsWith(word));
  } else {
    const argv = line.slice(0, cursor).trim().split(/\s+/);
    const commandName = argv[0] ?? '';
    const spec = deps.registry.get(commandName);
    const custom = spec?.complete?.({ shell: deps.shell, argv, prefix: word });
    candidates = custom && custom.length > 0 ? custom.filter((c) => c.startsWith(word)) : completePath(deps.shell, word);
  }

  candidates.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return { candidates, start, commonPrefix: longestCommonPrefix(candidates) };
}
