import { formatUnified } from '../diff';
import { resolve } from '../path';
import { compilePattern } from '../regex';
import { changedState, type CommandSpec, type ShellState } from '../registry';
import { appendFile, readFile, stat, writeFile } from '../vfs';
import { fromLines, parseArgs, toLines } from './args';

function readInput(shell: ShellState, stdin: string, files: readonly string[]): string {
  if (files.length === 0) return stdin;
  return files.map((f) => readFile(shell.vfs, resolve(shell.cwd, f))).join('');
}

/**
 * sed のパターンは基本正規表現。
 * 読めなければ本物と同じように、その場で止める。
 */
function compileOrThrow(pattern: string, jsFlags: string): RegExp {
  const compiled = compilePattern(pattern, {
    global: jsFlags.includes('g'),
    ignoreCase: jsFlags.includes('i'),
  });
  if (compiled.regex === null) {
    throw new Error(compiled.error ?? `invalid regex: ${pattern}`);
  }
  return compiled.regex;
}

function unescape(text: string): string {
  return text
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '\r')
    .replace(/\\\\/g, '\\');
}

/** a-z のような範囲を展開する */
function expandSet(set: string): string[] {
  const out: string[] = [];
  const chars = [...unescape(set)];
  for (let i = 0; i < chars.length; i += 1) {
    const c = chars[i] ?? '';
    const next = chars[i + 1];
    const after = chars[i + 2];
    if (next === '-' && after !== undefined) {
      for (let code = c.charCodeAt(0); code <= after.charCodeAt(0); code += 1) {
        out.push(String.fromCharCode(code));
      }
      i += 2;
      continue;
    }
    out.push(c);
  }
  return out;
}

interface SedCommand {
  address?: { kind: 'line'; value: number } | { kind: 'last' } | { kind: 'regex'; value: RegExp };
  action: { kind: 's'; pattern: RegExp; replacement: string } | { kind: 'd' } | { kind: 'p' } | { kind: 'a' | 'i' | 'c'; text: string };
}

/** スクリプトを ; と改行で命令に分ける。s の 3 つの部分（探す・置き換える・印）の中の ; は区切りにしない（本物と同じ） */
function splitSedScript(script: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let i = 0;
  while (i < script.length) {
    // 番地（行番号・$・/正規表現/）を飛ばす
    while (i < script.length && /\s/.test(script[i] ?? '')) i += 1;
    if (script[i] === '/') {
      for (i += 1; i < script.length && script[i] !== '/'; i += script[i] === '\\' ? 2 : 1);
      i += 1;
    } else while (i < script.length && /[\d$]/.test(script[i] ?? '')) i += 1;
    while (i < script.length && /\s/.test(script[i] ?? '')) i += 1;
    // a・i・c の文は行の終わりまで（; も文のうち）。a\ の後ろで改行した形は、次の行が文
    if (/[aic]/.test(script[i] ?? '') && /^[aic](\\?\s|\\$|\\\n|$|[^\w])/.test(script.slice(i))) {
      if (script.startsWith('\\\n', i + 1)) i += 3;
      while (i < script.length && script[i] !== '\n') i += 1;
      parts.push(script.slice(start, i));
      i += 1;
      start = i;
      continue;
    }
    if (script[i] === 's' && i + 1 < script.length) {
      const delimiter = script[i + 1] ?? '/';
      let seen = 0;
      for (i += 2; i < script.length && seen < 2; i += 1) {
        if (script[i] === '\\') i += 1;
        else if (script[i] === delimiter) seen += 1;
      }
    }
    while (i < script.length && script[i] !== ';' && script[i] !== '\n') i += 1;
    parts.push(script.slice(start, i));
    i += 1;
    start = i;
  }
  return parts;
}

/** 対応するのは s/// と d と p だけ。それ以外は黙って無視せずエラーにする。 */
export function parseSedScript(script: string): SedCommand[] {
  return splitSedScript(script)
    .map((part) => part.replace(/^\s+/, ''))
    .filter((part) => part.trim() !== '')
    .map((part) => {
      let rest = part;
      let address: SedCommand['address'];

      const lineMatch = /^(\d+)/.exec(rest);
      const lastMatch = /^\$/.exec(rest);
      const regexMatch = /^\/((?:[^/\\]|\\.)*)\//.exec(rest);
      if (lineMatch?.[1] !== undefined) {
        address = { kind: 'line', value: Number(lineMatch[1]) };
        rest = rest.slice(lineMatch[0].length).trim();
      } else if (lastMatch) {
        address = { kind: 'last' };
        rest = rest.slice(1).trim();
      } else if (regexMatch?.[1] !== undefined) {
        address = { kind: 'regex', value: compileOrThrow(regexMatch[1], '') };
        rest = rest.slice(regexMatch[0].length).trim();
      }

      if (rest.startsWith('s')) {
        const delimiter = rest[1] ?? '/';
        const parts: string[] = [];
        let buffer = '';
        for (let i = 2; i < rest.length; i += 1) {
          const ch = rest[i] ?? '';
          if (ch === '\\' && rest[i + 1] === delimiter) {
            buffer += delimiter;
            i += 1;
            continue;
          }
          if (ch === delimiter) {
            parts.push(buffer);
            buffer = '';
            continue;
          }
          buffer += ch;
        }
        parts.push(buffer);
        const [pattern, replacement, flags = ''] = parts;
        if (pattern === undefined || replacement === undefined) {
          throw new Error(`unterminated 's' command: ${part}`);
        }
        const jsFlags = `${flags.includes('g') ? 'g' : ''}${flags.includes('i') ? 'i' : ''}`;
        const command: SedCommand = {
          action: {
            kind: 's',
            pattern: compileOrThrow(pattern, jsFlags),
            replacement: replacement.replace(/\\(\d)/g, '$$$1').replace(/\\n/g, '\n').replace(/\\t/g, '\t'),
          },
        };
        return address === undefined ? command : { ...command, address };
      }

      // a 文・i 文・c 文（GNU の 1 行の形）。a\ の後ろの空白は文のうち、a の後ろの空白は飛ばす
      const text = /^([aic])(\\\n?|\s*)([\s\S]*)$/.exec(rest);
      if (text && (text[2] !== '' || text[3] === '' || !/^\w/.test(text[3] ?? ''))) {
        const kind = text[1] as 'a' | 'i' | 'c';
        const command: SedCommand = { action: { kind, text: (text[3] ?? '').replace(/\\(\s)/g, '$1') } };
        return address === undefined ? command : { ...command, address };
      }

      rest = rest.trim();
      if (rest === 'd' || rest === 'p') {
        const command: SedCommand = { action: { kind: rest } };
        return address === undefined ? command : { ...command, address };
      }

      throw new Error(`unsupported command: ${part}（対応しているのは s/// と d と p）`);
    });
}

export function applySed(lines: readonly string[], commands: readonly SedCommand[], quiet: boolean): string[] {
  const out: string[] = [];
  lines.forEach((original, index) => {
    let line = original;
    let deleted = false;
    const after: string[] = [];

    for (const command of commands) {
      const address = command.address;
      const matches =
        address === undefined ||
        (address.kind === 'line' && address.value === index + 1) ||
        (address.kind === 'last' && index === lines.length - 1) ||
        (address.kind === 'regex' && address.value.test(line));
      if (!matches) continue;

      if (command.action.kind === 'd') {
        deleted = true;
        break;
      }
      if (command.action.kind === 'p') {
        out.push(line);
        continue;
      }
      // i は今の行の前に、a は後ろに出す（-n でも出る）。c は行の代わりに文を出す
      if (command.action.kind === 'i') {
        out.push(command.action.text);
        continue;
      }
      if (command.action.kind === 'a') {
        after.push(command.action.text);
        continue;
      }
      if (command.action.kind === 'c') {
        out.push(command.action.text);
        deleted = true;
        break;
      }
      if (command.action.kind !== 's') continue;
      line = line.replace(command.action.pattern, command.action.replacement);
    }

    if (!deleted && !quiet) out.push(line);
    out.push(...after);
  });
  return out;
}

export const textToolCommands: CommandSpec[] = [
  {
    name: 'printf',
    summary: '書式を指定して出力する',
    handler: ({ argv }) => {
      const format = argv[1];
      if (format === undefined) return { stderr: 'printf: usage: printf format [arguments]\n', code: 2 };
      const args = argv.slice(2);
      let index = 0;
      const text = unescape(format).replace(/%[sdi%]/g, (token) => {
        if (token === '%%') return '%';
        const value = args[index] ?? '';
        index += 1;
        if (token === '%s') return value;
        const n = Number(value);
        return Number.isFinite(n) ? String(Math.trunc(n)) : '0';
      });
      return { stdout: text };
    },
  },
  {
    name: 'sed',
    summary: '行を置換・削除する（s/// と d と p）',
    handler: ({ argv, shell, stdin }) => {
      // -e は何度も書ける（全ての式を、書いた順に 1 つのスクリプトにする）
      const scripts: string[] = [];
      const rest: string[] = [argv[0] ?? 'sed'];
      for (let i = 1; i < argv.length; i += 1) {
        const a = argv[i] ?? '';
        if (a === '-e' || a === '--expression') scripts.push(argv[(i += 1)] ?? '');
        else if (a.startsWith('--expression=')) scripts.push(a.slice('--expression='.length));
        else rest.push(a);
      }
      const { flags, operands } = parseArgs(rest);
      const script = scripts.length > 0 ? scripts.join('\n') : operands[0];
      if (script === undefined) return { stderr: 'sed: no script specified\n', code: 1 };
      const files = scripts.length > 0 ? operands : operands.slice(1);
      // 読めないファイルは、本物と同じく can't read と言って 2 で終わる
      const missing = files.find((f) => stat(shell.vfs, resolve(shell.cwd, f)) === undefined);
      if (missing !== undefined) return { stderr: `sed: can't read ${missing}: No such file or directory\n`, code: 2 };
      const commands = parseSedScript(script);
      const text = readInput(shell, stdin, files);
      const result = applySed(toLines(text), commands, flags.has('n'));

      const target = files[0];
      if (flags.has('i')) {
        if (target === undefined) return { stderr: 'sed: -i requires a file\n', code: 1 };
        const vfs = writeFile(shell.vfs, resolve(shell.cwd, target), fromLines(result));
        return { patch: { vfs } };
      }
      return { stdout: fromLines(result) };
    },
  },
  {
    name: 'cut',
    summary: '列を切り出す',
    handler: ({ argv, shell, stdin }) => {
      const { values, operands } = parseArgs(argv, { withValue: ['d', 'f', 'c'] });
      const delimiter = values.get('d') ?? '\t';
      const fieldSpec = values.get('f');
      const charSpec = values.get('c');
      if (fieldSpec === undefined && charSpec === undefined) {
        return { stderr: 'cut: you must specify a list of bytes, characters, or fields\n', code: 1 };
      }
      const indexes = (spec: string): number[] =>
        spec.split(',').flatMap((part) => {
          const range = /^(\d+)-(\d+)$/.exec(part);
          if (range?.[1] !== undefined && range[2] !== undefined) {
            const from = Number(range[1]);
            const to = Number(range[2]);
            return Array.from({ length: to - from + 1 }, (_, i) => from + i);
          }
          return [Number(part)];
        });

      const lines = toLines(readInput(shell, stdin, operands));
      const out = lines.map((line) => {
        if (charSpec !== undefined) {
          return indexes(charSpec).map((i) => line[i - 1] ?? '').join('');
        }
        const parts = line.split(delimiter);
        return indexes(fieldSpec ?? '1').map((i) => parts[i - 1] ?? '').join(delimiter);
      });
      return { stdout: fromLines(out) };
    },
  },
  {
    name: 'tr',
    summary: '文字を置き換える・削除する',
    handler: ({ argv, stdin }) => {
      const { flags, operands } = parseArgs(argv);
      const from = expandSet(operands[0] ?? '');
      if (flags.has('d')) {
        const set = new Set(from);
        return { stdout: [...stdin].filter((c) => !set.has(c)).join('') };
      }
      const to = expandSet(operands[1] ?? '');
      const map = new Map<string, string>();
      from.forEach((c, i) => map.set(c, to[i] ?? to[to.length - 1] ?? c));
      return { stdout: [...stdin].map((c) => map.get(c) ?? c).join('') };
    },
  },
  {
    name: 'tee',
    summary: '標準入力をファイルにも書きつつ流す',
    handler: ({ argv, shell, stdin }) => {
      const { flags, operands } = parseArgs(argv);
      let vfs = shell.vfs;
      for (const file of operands) {
        const path = resolve(shell.cwd, file);
        vfs = flags.has('a') ? appendFile(vfs, path, stdin) : writeFile(vfs, path, stdin);
      }
      return { stdout: stdin, patch: { vfs } };
    },
  },
  {
    name: 'xargs',
    summary: '標準入力を引数にしてコマンドを実行する',
    handler: ({ argv, stdin, shell, runLine }) => {
      // xargs の旗は、動かすコマンドより前の物だけ（xargs -n 1 curl -I の -I は curl の物）
      const at = argv.findIndex((a, i) => i > 0 && !a.startsWith('-') && !['-n', '-I', '-L', '-P', '-d'].includes(argv[i - 1] ?? ''));
      const { values } = parseArgs(at === -1 ? argv : argv.slice(0, at), { withValue: ['n', 'I', 'L', 'P', 'd'] });
      const operands = at === -1 ? [] : argv.slice(at);
      const items = stdin.split(/\s+/).filter((s) => s !== '');
      if (items.length === 0) return { code: 0 };
      const base = operands.length > 0 ? operands.join(' ') : 'echo';
      const placeholder = values.get('I');
      const batchSize = placeholder !== undefined ? 1 : Number(values.get('n') ?? items.length);

      let state = shell;
      let stdout = '';
      let stderr = '';
      let code = 0;
      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const line =
          placeholder === undefined
            ? `${base} ${batch.join(' ')}`
            : base.replaceAll(placeholder, batch[0] ?? '');
        const result = runLine(line, state);
        state = result.state;
        stdout += result.stdout;
        stderr += result.stderr;
        if (result.code !== 0) code = result.code;
      }
      return { stdout, stderr, code, patch: changedState(shell, state) };
    },
  },
  {
    name: 'diff',
    summary: '2つのファイルの差分を unified 形式で出す',
    handler: ({ argv, shell }) => {
      const { operands, flags } = parseArgs(argv);
      const left = operands[0];
      const right = operands[1];
      if (left === undefined || right === undefined) {
        return { stderr: 'diff: missing operand\n', code: 2 };
      }
      // -s: 同じ時も、同じと言う
      if ((flags.has('s') || flags.has('report-identical-files')) && readFile(shell.vfs, resolve(shell.cwd, left)) === readFile(shell.vfs, resolve(shell.cwd, right))) {
        return { stdout: `Files ${left} and ${right} are identical\n` };
      }
      const a = toLines(readFile(shell.vfs, resolve(shell.cwd, left)));
      const b = toLines(readFile(shell.vfs, resolve(shell.cwd, right)));
      const out = formatUnified(a, b, { from: left, to: right });
      return { stdout: out, code: out === '' ? 0 : 1 };
    },
  },
  {
    name: 'seq',
    summary: '連番を出力する',
    handler: ({ argv }) => {
      const nums = argv.slice(1).map(Number);
      const [a, b, c] = nums;
      let start = 1;
      let step = 1;
      let end = 0;
      if (nums.length === 1 && a !== undefined) end = a;
      else if (nums.length === 2 && a !== undefined && b !== undefined) {
        start = a;
        end = b;
      } else if (nums.length === 3 && a !== undefined && b !== undefined && c !== undefined) {
        start = a;
        step = b;
        end = c;
      } else return { stderr: 'seq: usage: seq [first [incr]] last\n', code: 1 };

      if (step === 0) return { stderr: 'seq: step must not be zero\n', code: 1 };
      const out: string[] = [];
      for (let v = start; step > 0 ? v <= end : v >= end; v += step) out.push(String(v));
      return { stdout: fromLines(out) };
    },
  },
  {
    name: 'sleep',
    summary: '仮想時計を進める（実時間は止めない）',
    handler: ({ argv, clock }) => {
      const seconds = Number(argv[1] ?? '0');
      if (!Number.isFinite(seconds) || seconds < 0) {
        return { stderr: `sleep: invalid time interval '${argv[1] ?? ''}'\n`, code: 1 };
      }
      clock.advance(Math.ceil((seconds * 1000) / clock.tickDurationMs));
      return { code: 0 };
    },
  },
];
