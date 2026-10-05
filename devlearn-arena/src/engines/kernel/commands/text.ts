import { resolve } from '../path';
import { compilePattern } from '../regex';
import type { CommandSpec, ShellState } from '../registry';
import { allows } from '../perm';
import { isDir, list, metaOf, readFile, stat } from '../vfs';
import { currentGroups, currentUser, denied } from './perm';
import { fromLines, parseArgs, toLines } from './args';

/** ファイル引数があればそれを、無ければ標準入力を読む。 */
/** 行の先頭の数（sort -n）。無ければ 0 */
function leadingNumber(line: string): number {
  const m = /^\s*(-?\d+(?:\.\d+)?)/.exec(line);
  return m ? Number(m[1]) : 0;
}

const UNIT_POWER: Record<string, number> = { K: 1, M: 2, G: 3, T: 4 };

/** 行の先頭の、単位の付いた数（sort -h）。4.0K・300M・9.8G */
function humanNumber(line: string): number {
  const m = /^\s*(-?\d+(?:\.\d+)?)([KMGT]?)/.exec(line);
  if (!m) return 0;
  return Number(m[1]) * 1024 ** (UNIT_POWER[m[2] ?? ''] ?? 0);
}

function readInput(shell: ShellState, stdin: string, files: readonly string[]): string {
  if (files.length === 0) return stdin;
  return files.map((f) => readFile(shell.vfs, resolve(shell.cwd, f))).join('');
}

/** head・tail の -5 は -n 5 と同じ（本物と同じ古い書き方） */
function lineCountArgs(argv: readonly string[]): string[] {
  return argv.flatMap((a, i) => (i > 0 && /^-\d+$/.test(a) ? ['-n', a.slice(1)] : [a]));
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
    summary: 'パターンに一致する行を抜き出す（-r でディレクトリの中まで）',
    handler: ({ argv, shell, stdin }) => {
      const { flags, operands } = parseArgs(argv);
      const pattern = operands[0];
      if (pattern === undefined) return { stderr: 'usage: grep [-invcEFxnrlh] PATTERN [FILE...]\n', code: 2 };
      // 既定は基本正規表現（BRE）。-E で拡張、-F で文字どおり
      const compiled = compilePattern(pattern, {
        extended: flags.has('E'),
        fixed: flags.has('F'),
        ignoreCase: flags.has('i'),
        wholeLine: flags.has('x'),
      });
      if (compiled.regex === null) {
        return { stderr: `grep: ${compiled.error ?? ''}\n`, code: 2 };
      }
      const regex = compiled.regex;
      const invert = flags.has('v');
      const recursive = flags.has('r') || flags.has('R');

      // 探す物: 標準入力か、ファイル（-r ならディレクトリの中の全てのファイル）
      const sources: { name: string; text: string }[] = [];
      const errors: string[] = [];
      const user = currentUser(shell);
      const groups = currentGroups(shell);
      const addFile = (shown: string, full: string): void => {
        if (!allows(metaOf(shell.vfs, full), user, 'read', groups)) errors.push(`grep: ${shown}: Permission denied`);
        else sources.push({ name: shown, text: readFile(shell.vfs, full) });
      };
      const walk = (shown: string, full: string): void => {
        if (!allows(metaOf(shell.vfs, full), user, 'read', groups)) {
          errors.push(`grep: ${shown}: Permission denied`);
          return;
        }
        for (const child of list(shell.vfs, full)) {
          const childFull = full === '/' ? `/${child}` : `${full}/${child}`;
          const childShown = shown.endsWith('/') ? `${shown}${child}` : `${shown}/${child}`;
          if (isDir(shell.vfs, childFull)) walk(childShown, childFull);
          else addFile(childShown, childFull);
        }
      };
      const files = operands.slice(1);
      if (files.length === 0) sources.push({ name: '(standard input)', text: stdin });
      for (const f of files) {
        const full = resolve(shell.cwd, f);
        const node = stat(shell.vfs, full);
        if (!node) errors.push(`grep: ${f}: No such file or directory`);
        else if (node.kind === 'dir') {
          if (recursive) walk(f, full);
          else errors.push(`grep: ${f}: Is a directory`);
        } else addFile(f, full);
      }

      // ファイルが 2 つ以上（または -r）なら、行の前にファイル名を付ける。-h で付けない
      const named = !flags.has('h') && (recursive || files.length > 1);
      const out: string[] = [];
      let total = 0;
      for (const src of sources) {
        const hits = toLines(src.text)
          .map((line, index) => ({ line, index }))
          .filter(({ line }) => regex.test(line) !== invert);
        total += hits.length;
        if (flags.has('l')) {
          if (hits.length > 0) out.push(src.name);
          continue;
        }
        if (flags.has('c')) {
          out.push(named ? `${src.name}:${String(hits.length)}` : String(hits.length));
          continue;
        }
        for (const { line, index } of hits) {
          const numbered = flags.has('n') ? `${String(index + 1)}:${line}` : line;
          out.push(named ? `${src.name}:${numbered}` : numbered);
        }
      }
      const code = errors.length > 0 && total === 0 ? 2 : total > 0 ? 0 : 1;
      return {
        ...(out.length > 0 ? { stdout: fromLines(out) } : {}),
        ...(errors.length > 0 ? { stderr: fromLines(errors) } : {}),
        code,
      };
    },
  },
  {
    name: 'less',
    summary: '中身を頁ごとに見る（ここでは全てを出し、終わりの印を付ける）',
    handler: ({ argv, shell, stdin }) => {
      const withEnd = (text: string): string => `${text}${text.endsWith('\n') || text === '' ? '' : '\n'}`;
      const files = argv.slice(1).filter((a) => !a.startsWith('-'));
      if (files.length === 0) return { stdout: `${withEnd(stdin)}(END)\n` };
      const out: string[] = [];
      for (const f of files) {
        const full = resolve(shell.cwd, f);
        const node = stat(shell.vfs, full);
        if (!node) return { stderr: `less: ${f}: No such file or directory\n`, code: 1 };
        if (node.kind === 'dir') return { stderr: `less: ${f} is a directory\n`, code: 1 };
        const blocked = denied(shell, f, 'read', 'less');
        if (blocked) return blocked;
        out.push(withEnd(node.content));
      }
      return { stdout: `${out.join('')}(END)\n` };
    },
  },
  {
    name: 'head',
    summary: '先頭の行を出す',
    handler: ({ argv, shell, stdin }) => {
      const { values, operands } = parseArgs(lineCountArgs(argv), { withValue: ['n'] });
      const count = Number(values.get('n') ?? 10);
      const text = readInput(shell, stdin, operands);
      return { stdout: fromLines(toLines(text).slice(0, count)) };
    },
  },
  {
    name: 'tail',
    summary: '末尾の行を出す',
    handler: ({ argv, shell, stdin }) => {
      const { values, operands } = parseArgs(lineCountArgs(argv), { withValue: ['n'] });
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
      // 出す数（-l・-w・-c。無ければ 3 つとも）
      const picked = (['l', 'w', 'c'] as const).filter((f) => flags.has(f));
      const fields = picked.length > 0 ? picked : (['l', 'w', 'c'] as const);
      const count = (text: string): number[] => fields.map((f) => (f === 'l' ? toLines(text).length : f === 'w' ? text.split(/\s+/).filter((w) => w !== '').length : text.length));
      if (operands.length === 0) {
        // 標準入力は名前を出さない。数を 2 つ以上出す時は、本物と同じく 7 桁に揃える
        const n = count(stdin);
        return { stdout: `${n.map((v) => String(v).padStart(n.length > 1 ? 7 : 0)).join(' ')}\n` };
      }
      // ファイルは、数の後に名前を出し、複数なら合計の行を足す（本物と同じ）
      const rows: { n: number[]; name: string }[] = [];
      let err = '';
      for (const f of operands) {
        const node = stat(shell.vfs, resolve(shell.cwd, f));
        if (node === undefined) {
          err += `wc: ${f}: No such file or directory\n`;
          continue;
        }
        rows.push({ n: count(node.kind === 'file' ? readFile(shell.vfs, resolve(shell.cwd, f)) : ''), name: f });
      }
      if (operands.length > 1) rows.push({ n: fields.map((_, i) => rows.reduce((s, r) => s + (r.n[i] ?? 0), 0)), name: 'total' });
      const width = Math.max(1, ...rows.flatMap((r) => r.n.map((v) => String(v).length)));
      const out = rows.map((r) => `${r.n.map((v) => String(v).padStart(width)).join(' ')} ${r.name}\n`).join('');
      return { stdout: out, ...(err === '' ? {} : { stderr: err, code: 1 }) };
    },
  },
  {
    name: 'sort',
    summary: '行を並べ替える',
    handler: ({ argv, shell, stdin }) => {
      const { flags, operands } = parseArgs(argv);
      const lines = toLines(readInput(shell, stdin, operands));
      // -n は行の先頭の数、-h は単位の付いた数（4.0K・300M・9.8G）で比べる。数で並ばない行は文字で比べる
      const key = flags.has('h') ? humanNumber : flags.has('n') ? leadingNumber : null;
      const sorted = [...lines].sort((a, b) => {
        if (key) {
          const d = key(a) - key(b);
          if (d !== 0) return d;
        }
        return a < b ? -1 : a > b ? 1 : 0;
      });
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
