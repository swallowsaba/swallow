import { resolve, ROOT } from './path';
import { isDir, list, stat, type VfsState } from './vfs';

const MAGIC = /[*?[]/;

export function hasMagic(pattern: string): boolean {
  return MAGIC.test(pattern);
}

/** glob パターンを正規表現に変換する。* は / を跨がない。 */
export function globToRegExp(pattern: string): RegExp {
  let out = '';
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i] ?? '';
    if (ch === '*') {
      out += '[^/]*';
      i += 1;
      continue;
    }
    if (ch === '?') {
      out += '[^/]';
      i += 1;
      continue;
    }
    if (ch === '[') {
      const close = pattern.indexOf(']', i + 1);
      if (close === -1) {
        out += '\\[';
        i += 1;
        continue;
      }
      let set = pattern.slice(i + 1, close);
      const negated = set.startsWith('!') || set.startsWith('^');
      if (negated) set = set.slice(1);
      out += `[${negated ? '^' : ''}${set.replace(/\\/g, '\\\\')}]`;
      i = close + 1;
      continue;
    }
    out += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    i += 1;
  }
  return new RegExp(`^${out}$`);
}

export function globMatch(pattern: string, text: string): boolean {
  return globToRegExp(pattern).test(text);
}

/**
 * パス名展開。セグメントごとに候補を広げていく。
 * 一致が無ければ空配列を返す（呼び出し側でパターンをそのまま残す）。
 */
export function expandGlob(vfs: VfsState, cwd: string, pattern: string): string[] {
  if (!hasMagic(pattern)) return [];
  const absolute = pattern.startsWith('/');
  const segments = pattern.split('/').filter((s) => s !== '');
  const startAbs = absolute ? ROOT : cwd;

  let candidates: { abs: string; display: string }[] = [{ abs: startAbs, display: '' }];

  for (const segment of segments) {
    const next: { abs: string; display: string }[] = [];
    for (const candidate of candidates) {
      if (!isDir(vfs, candidate.abs)) continue;
      if (!hasMagic(segment)) {
        const abs = resolve(candidate.abs, segment);
        if (stat(vfs, abs)) {
          next.push({ abs, display: joinDisplay(candidate.display, segment, absolute) });
        }
        continue;
      }
      const re = globToRegExp(segment);
      for (const name of list(vfs, candidate.abs)) {
        // 隠しファイルはパターンが . で始まるときだけ対象にする
        if (name.startsWith('.') && !segment.startsWith('.')) continue;
        if (!re.test(name)) continue;
        next.push({
          abs: resolve(candidate.abs, name),
          display: joinDisplay(candidate.display, name, absolute),
        });
      }
    }
    candidates = next;
    if (candidates.length === 0) return [];
  }

  return candidates.map((c) => c.display).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function joinDisplay(prefix: string, segment: string, absolute: boolean): string {
  if (prefix === '') return absolute ? `/${segment}` : segment;
  return `${prefix}/${segment}`;
}
