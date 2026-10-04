import { resolve } from '../path';
import { allows } from '../perm';
import type { CommandResult, CommandSpec, ShellState } from '../registry';
import { fileSize, metaOf, stat } from '../vfs';
import { currentGroups, currentUser } from './perm';

/**
 * シェルの組み込み: test と [ ]、true・false、exit、set（-e）。
 * exit と set -e の印は、模擬の機械の中の変数（__EXIT・__ERREXIT）に置く。動かし方は src/engines/kernel/shell.ts
 */

type Truth = { ok: boolean } | { error: string };

const INT = /^-?\d+$/;

/** test の式を判定する。誤りは本物と同じ文言で返す */
function evaluate(args: readonly string[], shell: ShellState, name: string): Truth {
  if (args.length === 0) return { ok: false };
  if (args[0] === '!') {
    const inner = evaluate(args.slice(1), shell, name);
    return 'error' in inner ? inner : { ok: !inner.ok };
  }
  // -a（かつ）・-o（または）で分ける。-o の方が弱い
  const or = args.indexOf('-o');
  if (or > 0) {
    const a = evaluate(args.slice(0, or), shell, name);
    const b = evaluate(args.slice(or + 1), shell, name);
    if ('error' in a) return a;
    if ('error' in b) return b;
    return { ok: a.ok || b.ok };
  }
  const and = args.indexOf('-a');
  if (and > 0 && args.length > 3) {
    const a = evaluate(args.slice(0, and), shell, name);
    const b = evaluate(args.slice(and + 1), shell, name);
    if ('error' in a) return a;
    if ('error' in b) return b;
    return { ok: a.ok && b.ok };
  }
  if (args.length === 1) return { ok: (args[0] ?? '') !== '' };
  if (args.length === 2) {
    const [op = '', value = ''] = args;
    const path = resolve(shell.cwd, value);
    const node = stat(shell.vfs, path);
    const can = (kind: 'read' | 'write' | 'exec'): boolean =>
      node !== undefined && allows(metaOf(shell.vfs, path), currentUser(shell), kind, currentGroups(shell));
    switch (op) {
      case '-z': return { ok: value === '' };
      case '-n': return { ok: value !== '' };
      case '-e': return { ok: node !== undefined };
      case '-f': return { ok: node?.kind === 'file' };
      case '-d': return { ok: node?.kind === 'dir' };
      case '-s': return { ok: node?.kind === 'file' && fileSize(node) > 0 };
      case '-r': return { ok: can('read') };
      case '-w': return { ok: can('write') };
      case '-x': return { ok: can('exec') };
      default: return { error: `${name}: ${op}: unary operator expected` };
    }
  }
  if (args.length === 3) {
    const [a = '', op = '', b = ''] = args;
    if (op === '=' || op === '==') return { ok: a === b };
    if (op === '!=') return { ok: a !== b };
    const cmp: Record<string, (x: number, y: number) => boolean> = {
      '-eq': (x, y) => x === y, '-ne': (x, y) => x !== y, '-lt': (x, y) => x < y,
      '-le': (x, y) => x <= y, '-gt': (x, y) => x > y, '-ge': (x, y) => x >= y,
    };
    const f = cmp[op];
    if (!f) return { error: `${name}: ${op}: binary operator expected` };
    for (const v of [a, b]) if (!INT.test(v.trim())) return { error: `${name}: ${v}: integer expression expected` };
    return { ok: f(Number(a), Number(b)) };
  }
  return { error: `${name}: too many arguments` };
}

function test(args: readonly string[], shell: ShellState, name: string): CommandResult {
  const r = evaluate(args, shell, name);
  if ('error' in r) return { stderr: `${r.error}\n`, code: 2 };
  return { code: r.ok ? 0 : 1 };
}

const setVar = (shell: ShellState, name: string, value: string | null): Partial<ShellState> => {
  const vars = new Map(shell.vars);
  if (value === null) vars.delete(name);
  else vars.set(name, value);
  return { vars };
};

export const builtinCommands: CommandSpec[] = [
  {
    name: 'test',
    summary: '条件を確かめる（-f ファイルがある・-d ディレクトリ・-z 空・= 同じ・-gt 大きい など）。成り立てば 0 で終わる',
    handler: ({ argv, shell }) => test(argv.slice(1), shell, 'test'),
  },
  {
    name: '[',
    summary: 'test と同じ。最後に ] を書く（[ -f a.txt ]）',
    handler: ({ argv, shell }) => {
      if (argv[argv.length - 1] !== ']') return { stderr: "[: missing `]'\n", code: 2 };
      return test(argv.slice(1, -1), shell, '[');
    },
  },
  { name: 'true', summary: '何もせず、成功（0）で終わる', handler: () => ({ code: 0 }) },
  { name: 'false', summary: '何もせず、失敗（1）で終わる', handler: () => ({ code: 1 }) },
  {
    name: 'exit',
    summary: 'スクリプトを、その番号で終える（書かなければ直前の終了コード）',
    handler: ({ argv, shell }) => {
      const raw = argv[1];
      if (raw !== undefined && !INT.test(raw)) return { stderr: `exit: ${raw}: numeric argument required\n`, code: 2, patch: setVar(shell, '__EXIT', '2') };
      const code = raw === undefined ? shell.lastExit : Number(raw) & 255;
      return { code, patch: setVar(shell, '__EXIT', String(code)) };
    },
  },
  {
    name: 'set',
    summary: 'シェルの動き方を決める（set -e で、失敗したらそこで止まる）',
    handler: ({ argv, shell }) => {
      const opt = argv[1];
      if (opt === '-e') return { patch: setVar(shell, '__ERREXIT', '1') };
      if (opt === '+e') return { patch: setVar(shell, '__ERREXIT', null) };
      if (opt === undefined) return { stdout: [...shell.vars].filter(([k]) => !k.startsWith('__')).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}=${v}\n`).join('') };
      return { stderr: `set: ${opt}: invalid option\n`, code: 2 };
    },
  },
];
