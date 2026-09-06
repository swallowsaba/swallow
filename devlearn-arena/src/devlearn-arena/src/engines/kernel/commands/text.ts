import { resolve } from '../path';
import type { CommandSpec, ShellState } from '../registry';
import { readFile } from '../vfs';
import { fromLines, parseArgs, toLines } from './args';

/** ファイル引数があればそれを、無ければ標準入力を読む。 */
function readInput(shell: ShellState, stdin: string, files: readonly string[]): string {
  if (files.length === 0) return stdin;
  return files.map((f) => readFile(shell.vfs, resolve(shell.cwd, f))).join('');
}

export const textCommands: CommandSpec[] = [
  {
    name: 'echo',
    summary: '引数を出力する',
    handler: ({ argv }) => {
      const noNewline = argv[1] === '-n';
      const words = argv.slice(noNewline ? 2 : 1);
      return { stdout: words.join(' ') + (noNewline ? '' : '\n') };
    },
  },
  {
    name: 'grep',
    summary: 'パターンに一致する行を抜き出す',
    handler: ({ argv, shell, stdin }) => {
      const { flags, operands } = parseArgs(argv);
      const pattern = operands[0];
      if (pattern === undefined) return { stderr: 'usage: grep [-invc] PATTERN [FILE...]\n', code: 2 };
      const files = operands.slice(1);
      const text = readInput(shell, stdin, files);
      const regex = new RegExp(pattern, flags.has('i') ? 'i' : '');
      const invert = flags.has('v');

      const hits = toLines(text)
        .map((line, index) => ({ line, index }))
        .filter(({ line }) => regex.test(line) !== invert);

      if (flags.has('c')) return { stdout: `${String(hits.length)}\n`, code: hits.length > 0 ? 0 : 1 };
      const out = hits.map(({ line, index }) => (flags.has('n') ? `${String(index + 1)}:${line}` : line));
      return { stdout: fromLines(out), code: hits.length > 0 ? 0 : 1 };
    },
  },
  {
    name: 'head',
    summary: '先頭の行を出す',
    handler: ({ argv, shell, stdin }) => {
      const { values, operands } = parseArgs(argv, { withValue: ['n'] });
      const count = Number(values.get('n') ?? 10);
      const text = readInput(shell, stdin, operands);
      return { stdout: fromLines(toLines(text).slice(0, count)) };
    },
  },
  {
    name: 'tail',
    summary: '末尾の行を出す',
    handler: ({ argv, shell, stdin }) => {
      const { values, operands } = parseArgs(argv, { withValue: ['n'] });
      const count = Number(values.get('n') ?? 10);
      const lines = toLines(readInput(shell, stdin, operands));
      return { stdout: fromLines(count >= lines.length ? lines : lines.slice(lines.length - count)) };
    },
  },
  {
    name: 'wc',
    summary: '行数・単語数・バイト数を数える',
    handler: ({ argv, shell, stdin }) => {
      const { flags, operands } = parseArgs(argv);
      const text = readInput(shell, stdin, operands);
      const lines = toLines(text).length;
      const words = text.split(/\s+/).filter((w) => w !== '').length;
      const chars = text.length;
      if (flags.has('l')) return { stdout: `${String(lines)}\n` };
      if (flags.has('w')) return { stdout: `${String(words)}\n` };
      if (flags.has('c')) return { stdout: `${String(chars)}\n` };
      return { stdout: `${String(lines)} ${String(words)} ${String(chars)}\n` };
    },
  },
  {
    name: 'sort',
    summary: '行を並べ替える',
    handler: ({ argv, shell, stdin }) => {
      const { flags, operands } = parseArgs(argv);
      const lines = toLines(readInput(shell, stdin, operands));
      const sorted = [...lines].sort((a, b) =>
        flags.has('n') ? Number(a) - Number(b) : a < b ? -1 : a > b ? 1 : 0,
      );
      if (flags.has('r')) sorted.reverse();
      return { stdout: fromLines(sorted) };
    },
  },
  {
    name: 'uniq',
    summary: '連続する重複行をまとめる',
    handler: ({ argv, shell, stdin }) => {
      const { flags, operands } = parseArgs(argv);
      const lines = toLines(readInput(shell, stdin, operands));
      const out: string[] = [];
      const counts: number[] = [];
      for (const line of lines) {
        if (out[out.length - 1] === line) {
          counts[counts.length - 1] = (counts[counts.length - 1] ?? 1) + 1;
          continue;
        }
        out.push(line);
        counts.push(1);
      }
      if (!flags.has('c')) return { stdout: fromLines(out) };
      return { stdout: fromLines(out.map((line, i) => `${String(counts[i] ?? 1).padStart(7)} ${line}`)) };
    },
  },
];
