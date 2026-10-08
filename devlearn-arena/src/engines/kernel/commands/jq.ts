import { resolve } from '../path';
import type { CommandSpec } from '../registry';
import { exists, isDir, readFile } from '../vfs';

/**
 * jq（JSON から値を取り出す）の小さな模型。純粋な関数。docs/lessons/web.md の web.i.02 と、構造化ログ（mon.b.02）が使う。
 *
 * - 式: `.`・`.名前`・`.[番号]`（負の番号は後ろから）・`.[]`・`|`・`,`・`( )`・`[ … ]`（集める）・文字列と数と true・false・null
 * - 比べる: `==` `!=` `<` `<=` `>` `>=`・`and` `or`・`not`
 * - 関数: `select(式)`・`map(式)`・`length`・`keys`
 * - 入力は JSON の値の並び（JSON Lines のログなど）。値ごとに式を当てる
 * - 出力は 2 字下げで整える（-c で 1 行、-r で文字列を引用符なし）
 * - 誤りは本物と同じ言い方と終了の値（式が読めない 3・入力が JSON でない 2・たどれない 5）
 */

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

type Node =
  | { k: 'id' }
  | { k: 'field'; of: Node; name: string }
  | { k: 'index'; of: Node; at: Node }
  | { k: 'iter'; of: Node }
  | { k: 'pipe' | 'comma' | 'and' | 'or'; a: Node; b: Node }
  | { k: 'cmp'; op: string; a: Node; b: Node }
  | { k: 'lit'; v: Json }
  | { k: 'array'; of: Node | null }
  | { k: 'call'; name: string; args: Node[] };

class CompileError extends Error {}
class RunError extends Error {}

/* ---------- 式を読む ---------- */

type Tok = { t: 'op' | 'ident' | 'str' | 'num' | 'field'; v: string };

function lex(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i] ?? '';
    if (/\s/.test(c)) { i += 1; continue; }
    const two = src.slice(i, i + 2);
    if (['==', '!=', '<=', '>='].includes(two)) { out.push({ t: 'op', v: two }); i += 2; continue; }
    if (c === '"') {
      let j = i + 1;
      let s = '';
      for (; j < src.length && src[j] !== '"'; j += 1) s += src[j] === '\\' ? (src[(j += 1)] ?? '') : (src[j] ?? '');
      if (j >= src.length) throw new CompileError('unterminated string');
      out.push({ t: 'str', v: s });
      i = j + 1;
      continue;
    }
    if (c === '.' && /[A-Za-z_]/.test(src[i + 1] ?? '')) {
      let j = i + 1;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j] ?? '')) j += 1;
      out.push({ t: 'field', v: src.slice(i + 1, j) });
      i = j;
      continue;
    }
    if (/\d/.test(c) || (c === '-' && /\d/.test(src[i + 1] ?? ''))) {
      let j = i + 1;
      while (j < src.length && /[\d.]/.test(src[j] ?? '')) j += 1;
      out.push({ t: 'num', v: src.slice(i, j) });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j] ?? '')) j += 1;
      out.push({ t: 'ident', v: src.slice(i, j) });
      i = j;
      continue;
    }
    if ('.[]|,()<>;'.includes(c)) { out.push({ t: 'op', v: c }); i += 1; continue; }
    throw new CompileError(`'${c}'`);
  }
  return out;
}

const FUNCTIONS: Record<string, number> = { select: 1, map: 1, length: 0, keys: 0, not: 0 };

function parse(src: string): Node {
  const toks = lex(src);
  let i = 0;
  const peek = (): Tok | undefined => toks[i];
  const isOp = (v: string): boolean => peek()?.t === 'op' && peek()?.v === v;
  const unexpected = (): never => {
    const t = peek();
    throw new CompileError(t ? `'${t.v}'` : '$end');
  };
  const expect = (v: string): void => {
    if (!isOp(v)) unexpected();
    i += 1;
  };

  const pipe = (): Node => {
    let a = comma();
    while (isOp('|')) { i += 1; a = { k: 'pipe', a, b: comma() }; }
    return a;
  };
  const comma = (): Node => {
    let a = or();
    while (isOp(',')) { i += 1; a = { k: 'comma', a, b: or() }; }
    return a;
  };
  const or = (): Node => {
    let a = and();
    while (peek()?.t === 'ident' && peek()?.v === 'or') { i += 1; a = { k: 'or', a, b: and() }; }
    return a;
  };
  const and = (): Node => {
    let a = cmp();
    while (peek()?.t === 'ident' && peek()?.v === 'and') { i += 1; a = { k: 'and', a, b: cmp() }; }
    return a;
  };
  const cmp = (): Node => {
    const a = postfix();
    const t = peek();
    if (t?.t === 'op' && ['==', '!=', '<', '<=', '>', '>='].includes(t.v)) {
      i += 1;
      return { k: 'cmp', op: t.v, a, b: postfix() };
    }
    return a;
  };
  /** 後ろに続く .名前・[番号]・[] */
  const suffixes = (base: Node): Node => {
    let n = base;
    for (;;) {
      const t = peek();
      if (t?.t === 'field') { i += 1; n = { k: 'field', of: n, name: t.v }; continue; }
      if (isOp('[')) {
        i += 1;
        if (isOp(']')) { i += 1; n = { k: 'iter', of: n }; continue; }
        const at = pipe();
        expect(']');
        n = { k: 'index', of: n, at };
        continue;
      }
      return n;
    }
  };
  const postfix = (): Node => {
    const t = peek();
    if (!t) return unexpected();
    if (t.t === 'field') { i += 1; return suffixes({ k: 'field', of: { k: 'id' }, name: t.v }); }
    if (t.t === 'op' && t.v === '.') { i += 1; return suffixes({ k: 'id' }); }
    if (t.t === 'str') { i += 1; return { k: 'lit', v: t.v }; }
    if (t.t === 'num') { i += 1; return { k: 'lit', v: Number(t.v) }; }
    if (t.t === 'op' && t.v === '(') {
      i += 1;
      const inner = pipe();
      expect(')');
      return suffixes(inner);
    }
    if (t.t === 'op' && t.v === '[') {
      i += 1;
      if (isOp(']')) { i += 1; return { k: 'array', of: null }; }
      const inner = pipe();
      expect(']');
      return suffixes({ k: 'array', of: inner });
    }
    if (t.t === 'ident') {
      i += 1;
      if (t.v === 'true' || t.v === 'false') return { k: 'lit', v: t.v === 'true' };
      if (t.v === 'null') return { k: 'lit', v: null };
      const args: Node[] = [];
      if (isOp('(')) {
        i += 1;
        args.push(pipe());
        while (isOp(';')) { i += 1; args.push(pipe()); }
        expect(')');
      }
      if (FUNCTIONS[t.v] !== args.length) throw new CompileError(`${t.v}/${String(args.length)} is not defined`);
      return suffixes({ k: 'call', name: t.v, args });
    }
    return unexpected();
  };

  const node = pipe();
  if (i < toks.length) unexpected();
  return node;
}

/* ---------- 値をたどる ---------- */

const typeOf = (v: Json): string => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
const truthy = (v: Json): boolean => v !== null && v !== false;
const TYPE_ORDER = ['null', 'boolean', 'number', 'string', 'array', 'object'];

function compare(a: Json, b: Json): number {
  const ta = TYPE_ORDER.indexOf(typeOf(a));
  const tb = TYPE_ORDER.indexOf(typeOf(b));
  if (ta !== tb) return ta - tb;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  const sa = JSON.stringify(a);
  const sb = JSON.stringify(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

function index(v: Json, key: Json): Json {
  if (v === null) return null;
  if (typeof key === 'string') {
    if (typeof v === 'object' && !Array.isArray(v)) return v[key] ?? null;
    throw new RunError(`Cannot index ${typeOf(v)} with "${key}"`);
  }
  if (typeof key === 'number') {
    if (Array.isArray(v)) return v[key < 0 ? v.length + key : key] ?? null;
    throw new RunError(`Cannot index ${typeOf(v)} with number`);
  }
  throw new RunError(`Cannot index ${typeOf(v)} with ${typeOf(key)}`);
}

function evaluate(n: Node, input: Json): Json[] {
  switch (n.k) {
    case 'id': return [input];
    case 'lit': return [n.v];
    case 'field': return evaluate(n.of, input).map((v) => index(v, n.name));
    case 'index': return evaluate(n.of, input).flatMap((v) => evaluate(n.at, input).map((key) => index(v, key)));
    case 'iter': return evaluate(n.of, input).flatMap((v) => {
      if (Array.isArray(v)) return v;
      if (v !== null && typeof v === 'object') return Object.values(v);
      throw new RunError(v === null ? 'Cannot iterate over null' : `Cannot iterate over ${typeOf(v)} (${JSON.stringify(v)})`);
    });
    case 'pipe': return evaluate(n.a, input).flatMap((v) => evaluate(n.b, v));
    case 'comma': return [...evaluate(n.a, input), ...evaluate(n.b, input)];
    case 'and': return evaluate(n.a, input).flatMap((a) => (truthy(a) ? evaluate(n.b, input).map(truthy) : [false]));
    case 'or': return evaluate(n.a, input).flatMap((a) => (truthy(a) ? [true] : evaluate(n.b, input).map(truthy)));
    case 'cmp': return evaluate(n.b, input).flatMap((b) => evaluate(n.a, input).map((a) => {
      const c = compare(a, b);
      return n.op === '==' ? c === 0 : n.op === '!=' ? c !== 0 : n.op === '<' ? c < 0 : n.op === '<=' ? c <= 0 : n.op === '>' ? c > 0 : c >= 0;
    }));
    case 'array': return [n.of ? evaluate(n.of, input) : []];
    case 'call': return call(n, input);
  }
}

function call(n: Extract<Node, { k: 'call' }>, input: Json): Json[] {
  const [f] = n.args;
  switch (n.name) {
    case 'select': return f && evaluate(f, input).some(truthy) ? [input] : [];
    case 'map': {
      if (!Array.isArray(input)) throw new RunError(`Cannot iterate over ${typeOf(input)}${input === null ? '' : ` (${JSON.stringify(input)})`}`);
      return [input.flatMap((v) => (f ? evaluate(f, v) : []))];
    }
    case 'not': return [!truthy(input)];
    case 'length': {
      if (input === null) return [0];
      if (typeof input === 'string' || Array.isArray(input)) return [input.length];
      if (typeof input === 'number') return [Math.abs(input)];
      if (typeof input === 'object') return [Object.keys(input).length];
      throw new RunError(`boolean (${String(input)}) has no length`);
    }
    case 'keys': {
      if (Array.isArray(input)) return [input.map((_, i) => i)];
      if (input !== null && typeof input === 'object') return [Object.keys(input).sort()];
      throw new RunError(`${typeOf(input)} (${JSON.stringify(input)}) has no keys`);
    }
    default: return [];
  }
}

/* ---------- 入口 ---------- */

export interface JqOptions {
  raw?: boolean;
  compact?: boolean;
  /** 誤りの文に出す入力の名前（ファイル名。無ければ <stdin>） */
  source?: string;
}

/** 式を入力の JSON に当てる。出力と標準エラーと終了の値 */
export function runJq(filter: string, text: string, opts: JqOptions): { out: string; err?: string; code: number } {
  let program: Node;
  try {
    program = parse(filter);
  } catch (e) {
    const what = e instanceof Error ? e.message : String(e);
    const head = /is not defined$/.test(what) ? `jq: error: ${what}` : `jq: error: syntax error, unexpected ${what} (Unix shell quoting issues?)`;
    return { out: '', err: `${head} at <top-level>, line 1:\n${filter}\njq: 1 compile error\n`, code: 3 };
  }
  if (text.trim() === '') return { out: '', code: 0 };
  // 本物と同じく、入力は JSON の値の並び（1 行に 1 つの JSON Lines など）。値ごとに式を当て、読めない所に来たらそこで止まる
  let out = '';
  let end = 0;
  for (;;) {
    const next = nextValue(text, end);
    if (next === null) break;
    if ('error' in next) {
      const before = text.slice(0, next.error);
      const line = before.split('\n').length;
      const column = next.error - before.lastIndexOf('\n');
      return { out, err: `parse error: Invalid literal at line ${String(line)}, column ${String(column)}\n`, code: 2 };
    }
    end = next.end;
    // 誤りの文の行は、本物と同じく値の後ろの空白（改行）まで読んだ所
    let after = end;
    while (after < text.length && /\s/.test(text[after] ?? '')) after += 1;
    const lines = (text.slice(0, after).match(/\n/g) ?? []).length;
    try {
      for (const v of evaluate(program, next.value)) {
        out += `${opts.raw && typeof v === 'string' ? v : opts.compact ? JSON.stringify(v) : JSON.stringify(v, null, 2)}\n`;
      }
    } catch (e) {
      if (!(e instanceof RunError)) throw e;
      return { out, err: `jq: error (at ${opts.source ?? '<stdin>'}:${String(lines)}): ${e.message}\n`, code: 5 };
    }
  }
  return { out, code: 0 };
}

/** from から次の JSON の値を 1 つ読む（無ければ null。読めなければ誤りの位置） */
function nextValue(text: string, from: number): { value: Json; end: number } | { error: number } | null {
  let i = from;
  while (i < text.length && /\s/.test(text[i] ?? '')) i += 1;
  if (i >= text.length) return null;
  const start = i;
  const c = text[i] ?? '';
  if (c === '{' || c === '[' || c === '"') {
    // 括弧の深さと文字列をたどって、値の終わりを探す
    let depth = 0;
    let inString = false;
    for (; i < text.length; i += 1) {
      const ch = text[i] ?? '';
      if (inString) {
        if (ch === '\\') i += 1;
        else if (ch === '"') {
          inString = false;
          if (depth === 0) break;
        }
      } else if (ch === '"') inString = true;
      else if (ch === '{' || ch === '[') depth += 1;
      else if (ch === '}' || ch === ']') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    i += 1;
  } else {
    while (i < text.length && !/[\s{}[\],"]/.test(text[i] ?? '')) i += 1;
  }
  try {
    return { value: JSON.parse(text.slice(start, i)) as Json, end: i };
  } catch (e) {
    const at = /position (\d+)/.exec(e instanceof Error ? e.message : '')?.[1];
    return { error: at === undefined ? Math.min(i, text.length) : start + Number(at) };
  }
}

export const jqCommands: CommandSpec[] = [
  {
    name: 'jq',
    summary: 'JSON から値を取り出す（. .名前 .[番号] .[] | select map length keys）',
    handler: ({ argv, shell, stdin }) => {
      const opts: JqOptions = {};
      const rest: string[] = [];
      for (const a of argv.slice(1)) {
        if (/^-[a-zA-Z]+$/.test(a)) {
          for (const ch of a.slice(1)) {
            if (ch === 'r') opts.raw = true;
            else if (ch === 'c') opts.compact = true;
            else return { stderr: `jq: Unknown option: ${a}\nUse jq --help for help with command-line options,\nor see the jq manpage, or online docs  at https://jqlang.github.io/jq\n`, code: 2 };
          }
        } else if (a === '--raw-output') opts.raw = true;
        else if (a === '--compact-output') opts.compact = true;
        else rest.push(a);
      }
      const [filter, file] = rest;
      if (filter === undefined) return { stderr: 'Usage:\tjq [OPTIONS] FILTER [FILES...]\n', code: 2 };
      let text = stdin;
      if (file !== undefined) {
        const path = resolve(shell.cwd, file);
        if (!exists(shell.vfs, path) || isDir(shell.vfs, path)) return { stderr: `jq: error: Could not open ${file}: No such file or directory\n`, code: 2 };
        text = readFile(shell.vfs, path);
        opts.source = file;
      }
      const r = runJq(filter, text, opts);
      return { stdout: r.out, ...(r.err ? { stderr: r.err } : {}), code: r.code };
    },
  },
];
