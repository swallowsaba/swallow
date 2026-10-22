import { resolve } from '../path';
import { compilePattern } from '../regex';
import type { CommandSpec } from '../registry';
import { appendFile, exists, isDir, readFile, writeFile, type VfsState } from '../vfs';

/**
 * awk（POSIX awk の一部）。列（$1・$NF）・-F・-v・NR・NF・型（/正規表現/・式）・BEGIN・END・print・printf・
 * 変数と配列・+= と ++・if・while・for・for (k in a)・next・exit・length・substr・index・split・sub・gsub・toupper・tolower・sprintf・int
 */

type Val = string | number;

type Expr =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 're'; v: string }
  | { t: 'var'; name: string }
  | { t: 'field'; e: Expr }
  | { t: 'idx'; name: string; key: Expr[] }
  | { t: 'in'; key: Expr; name: string }
  | { t: 'bin'; op: string; a: Expr; b: Expr }
  | { t: 'un'; op: string; e: Expr }
  | { t: 'assign'; op: string; target: Expr; e: Expr }
  | { t: 'incr'; op: '++' | '--'; pre: boolean; target: Expr }
  | { t: 'cond'; c: Expr; a: Expr; b: Expr }
  | { t: 'call'; name: string; args: Expr[] }
  | { t: 'group'; e: Expr[] };

type Stmt =
  | { t: 'print'; args: Expr[]; to?: { append: boolean; file: Expr } }
  | { t: 'printf'; args: Expr[]; to?: { append: boolean; file: Expr } }
  | { t: 'expr'; e: Expr }
  | { t: 'if'; c: Expr; a: Stmt; b?: Stmt }
  | { t: 'while'; c: Expr; body: Stmt }
  | { t: 'for'; init?: Expr; c?: Expr; step?: Expr; body: Stmt }
  | { t: 'forin'; key: string; name: string; body: Stmt }
  | { t: 'block'; body: Stmt[] }
  | { t: 'next' }
  | { t: 'exit'; e?: Expr }
  | { t: 'delete'; name: string; key?: Expr[] };

interface Rule {
  kind: 'begin' | 'end' | 'main';
  pattern?: Expr;
  range?: Expr;
  body?: Stmt[];
}

class AwkError extends Error {}

// ---- 字句 ----

interface Tok { k: 'num' | 'str' | 're' | 'name' | 'func' | 'op' | 'nl' | 'eof'; v: string }

const OPS = ['+=', '-=', '*=', '/=', '%=', '^=', '==', '!=', '<=', '>=', '&&', '||', '++', '--', '!~', '>>', '{', '}', '(', ')', '[', ']', ';', ',', '+', '-', '*', '/', '%', '^', '!', '<', '>', '~', '=', '?', ':', '$'];

function lex(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  // 直前の字句が値で終わるなら / は割り算、そうでなければ正規表現の始まり
  const valueEnd = (): boolean => {
    const p = out[out.length - 1];
    return p !== undefined && (p.k === 'num' || p.k === 'str' || p.k === 'name' || p.k === 're' || (p.k === 'op' && [')', ']', '$', '++', '--'].includes(p.v)));
  };
  while (i < src.length) {
    const c = src[i] ?? '';
    if (c === '\\' && src[i + 1] === '\n') { i += 2; continue; }
    if (c === ' ' || c === '\t') { i += 1; continue; }
    if (c === '#') { while (i < src.length && src[i] !== '\n') i += 1; continue; }
    if (c === '\n') { out.push({ k: 'nl', v: '\n' }); i += 1; continue; }
    if (/[0-9.]/.test(c) && /[0-9]/.test(c === '.' ? (src[i + 1] ?? '') : c)) {
      const m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(src.slice(i));
      const text = m?.[0] ?? c;
      out.push({ k: 'num', v: text });
      i += text.length;
      continue;
    }
    if (c === '"') {
      let s = '';
      i += 1;
      while (i < src.length && src[i] !== '"') {
        if (src[i] === '\\') {
          const n = src[i + 1] ?? '';
          s += ({ n: '\n', t: '\t', '"': '"', '\\': '\\', '/': '/' } as Record<string, string>)[n] ?? `\\${n}`;
          i += 2;
        } else { s += src[i]; i += 1; }
      }
      if (src[i] !== '"') throw new AwkError('non-terminated string');
      out.push({ k: 'str', v: s });
      i += 1;
      continue;
    }
    if (c === '/' && !valueEnd()) {
      let s = '';
      i += 1;
      while (i < src.length && src[i] !== '/') {
        if (src[i] === '\\' && src[i + 1] === '/') { s += '/'; i += 2; continue; }
        if (src[i] === '\\') { s += `\\${src[i + 1] ?? ''}`; i += 2; continue; }
        if (src[i] === '\n') throw new AwkError('newline in regex');
        s += src[i]; i += 1;
      }
      if (src[i] !== '/') throw new AwkError('non-terminated regular expression');
      out.push({ k: 're', v: s });
      i += 1;
      continue;
    }
    const name = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))?.[0];
    if (name !== undefined) {
      i += name.length;
      out.push({ k: src[i] === '(' && FUNCS.has(name) ? 'func' : 'name', v: name });
      continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (op === undefined) throw new AwkError(`syntax error at source line 1: unexpected character '${c}'`);
    out.push({ k: 'op', v: op });
    i += op.length;
  }
  out.push({ k: 'eof', v: '' });
  return out;
}

const FUNCS = new Set(['length', 'substr', 'index', 'split', 'sub', 'gsub', 'match', 'toupper', 'tolower', 'sprintf', 'int', 'sqrt', 'exp', 'log', 'sin', 'cos', 'atan2', 'rand', 'srand', 'system']);
const KEYWORDS = new Set(['BEGIN', 'END', 'print', 'printf', 'if', 'else', 'while', 'for', 'in', 'next', 'exit', 'delete', 'getline', 'function', 'return', 'do', 'break', 'continue']);

// ---- 構文 ----

function parse(src: string): Rule[] {
  const toks = lex(src);
  let p = 0;
  const peek = (o = 0): Tok => toks[p + o] ?? { k: 'eof', v: '' };
  const is = (v: string, o = 0): boolean => { const t = peek(o); return (t.k === 'op' || t.k === 'name') && t.v === v; };
  const fail = (): never => { throw new AwkError(`syntax error at source line 1 near '${peek().v || 'end'}'`); };
  const eat = (v: string): void => { if (!is(v)) fail(); p += 1; };
  const nls = (): void => { while (peek().k === 'nl' || is(';')) p += 1; };
  const optNl = (): void => { while (peek().k === 'nl') p += 1; };

  // 式（優先順の低い方から）。noIn: for (k in a) の in を式にしない。noGt: print の > を出力先にする
  interface Opt { noIn?: boolean; noGt?: boolean }
  const expr = (o: Opt = {}): Expr => ternary(o);
  const ternary = (o: Opt): Expr => {
    const c = orE(o);
    if (is('?')) { p += 1; optNl(); const a = ternary(o); optNl(); eat(':'); optNl(); return { t: 'cond', c, a, b: ternary(o) }; }
    if (peek().k === 'op' && ['=', '+=', '-=', '*=', '/=', '%=', '^='].includes(peek().v) && (c.t === 'var' || c.t === 'field' || c.t === 'idx')) {
      const op = peek().v; p += 1; optNl();
      return { t: 'assign', op, target: c, e: ternary(o) };
    }
    return c;
  };
  const orE = (o: Opt): Expr => { let a = andE(o); while (is('||')) { p += 1; optNl(); a = { t: 'bin', op: '||', a, b: andE(o) }; } return a; };
  const andE = (o: Opt): Expr => { let a = inE(o); while (is('&&')) { p += 1; optNl(); a = { t: 'bin', op: '&&', a, b: inE(o) }; } return a; };
  const inE = (o: Opt): Expr => {
    let a = matchE(o);
    while (!o.noIn && is('in') && peek(1).k === 'name') { p += 1; const name = peek().v; p += 1; a = { t: 'in', key: a, name }; }
    return a;
  };
  const matchE = (o: Opt): Expr => {
    let a = cmpE(o);
    while (is('~') || is('!~')) { const op = peek().v; p += 1; a = { t: 'bin', op, a, b: cmpE(o) }; }
    return a;
  };
  const cmpE = (o: Opt): Expr => {
    const a = concatE(o);
    const t = peek();
    if (t.k === 'op' && ['<', '<=', '==', '!=', '>=', '>'].includes(t.v) && !(o.noGt && (t.v === '>'))) { p += 1; return { t: 'bin', op: t.v, a, b: concatE(o) }; }
    return a;
  };
  const startsValue = (): boolean => {
    const t = peek();
    if (t.k === 'num' || t.k === 'str' || t.k === 're' || t.k === 'func') return true;
    if (t.k === 'name') return !KEYWORDS.has(t.v);
    return t.k === 'op' && ['$', '(', '!', '-', '+', '++', '--'].includes(t.v);
  };
  const concatE = (o: Opt): Expr => {
    let a = addE(o);
    // 並べて書いた値はつなぐ（- と + は引き算・足し算として addE が取る）
    while (startsValue() && !(peek().k === 'op' && ['-', '+'].includes(peek().v)) && !(o.noIn && is('in'))) a = { t: 'bin', op: 'cat', a, b: addE(o) };
    return a;
  };
  const addE = (o: Opt): Expr => { let a = mulE(o); while (is('+') || is('-')) { const op = peek().v; p += 1; a = { t: 'bin', op, a, b: mulE(o) }; } return a; };
  const mulE = (o: Opt): Expr => { let a = unE(o); while (is('*') || is('/') || is('%')) { const op = peek().v; p += 1; a = { t: 'bin', op, a, b: unE(o) }; } return a; };
  const unE = (o: Opt): Expr => {
    if (is('!')) { p += 1; return { t: 'un', op: '!', e: unE(o) }; }
    if (is('-')) { p += 1; return { t: 'un', op: '-', e: unE(o) }; }
    if (is('+')) { p += 1; return { t: 'un', op: '+', e: unE(o) }; }
    return powE(o);
  };
  const powE = (o: Opt): Expr => { const a = postE(o); if (is('^')) { p += 1; return { t: 'bin', op: '^', a, b: unE(o) }; } return a; };
  const postE = (o: Opt): Expr => {
    if (is('++') || is('--')) { const op = peek().v as '++' | '--'; p += 1; return { t: 'incr', op, pre: true, target: postE(o) }; }
    const e = primary(o);
    if ((is('++') || is('--')) && (e.t === 'var' || e.t === 'field' || e.t === 'idx')) { const op = peek().v as '++' | '--'; p += 1; return { t: 'incr', op, pre: false, target: e }; }
    return e;
  };
  const primary = (o: Opt): Expr => {
    const t = peek();
    if (t.k === 'num') { p += 1; return { t: 'num', v: Number(t.v) }; }
    if (t.k === 'str') { p += 1; return { t: 'str', v: t.v }; }
    if (t.k === 're') { p += 1; return { t: 're', v: t.v }; }
    if (is('$')) { p += 1; return { t: 'field', e: postE(o) }; }
    if (is('(')) {
      p += 1;
      const list = [expr()];
      while (is(',')) { p += 1; optNl(); list.push(expr()); }
      eat(')');
      if (list.length > 1 && is('in') && peek(1).k === 'name') { p += 1; const name = peek().v; p += 1; return { t: 'in', key: { t: 'group', e: list }, name }; }
      return { t: 'group', e: list };
    }
    if (t.k === 'func') {
      p += 1; eat('(');
      const args: Expr[] = [];
      if (!is(')')) { args.push(expr()); while (is(',')) { p += 1; optNl(); args.push(expr()); } }
      eat(')');
      return { t: 'call', name: t.v, args };
    }
    if (t.k === 'name' && t.v === 'length') { p += 1; return { t: 'call', name: 'length', args: [] }; }
    if (t.k === 'name' && !KEYWORDS.has(t.v)) {
      p += 1;
      if (is('[')) {
        p += 1;
        const key = [expr()];
        while (is(',')) { p += 1; key.push(expr()); }
        eat(']');
        return { t: 'idx', name: t.v, key };
      }
      return { t: 'var', name: t.v };
    }
    return fail();
  };

  const output = (): { append: boolean; file: Expr } | undefined => {
    if (is('>') || is('>>')) { const append = peek().v === '>>'; p += 1; return { append, file: concatE({}) }; }
    return undefined;
  };
  const simple = (): Stmt => {
    if (is('print') || is('printf')) {
      const kind = peek().v as 'print' | 'printf';
      p += 1;
      const args: Expr[] = [];
      const ends = (): boolean => peek().k === 'nl' || peek().k === 'eof' || is(';') || is('}') || is('>') || is('>>');
      if (!ends()) {
        args.push(expr({ noGt: true }));
        while (is(',')) { p += 1; optNl(); args.push(expr({ noGt: true })); }
      }
      // print (a, b) は a, b と同じ
      const flat = args.length === 1 && args[0]?.t === 'group' ? args[0].e : args;
      const to = output();
      return { t: kind, args: flat, ...(to ? { to } : {}) };
    }
    if (is('next')) { p += 1; return { t: 'next' }; }
    if (is('exit')) { p += 1; const ends = peek().k === 'nl' || peek().k === 'eof' || is(';') || is('}'); return ends ? { t: 'exit' } : { t: 'exit', e: expr() }; }
    if (is('delete')) {
      p += 1;
      const name = peek().v; p += 1;
      if (is('[')) { p += 1; const key = [expr()]; while (is(',')) { p += 1; key.push(expr()); } eat(']'); return { t: 'delete', name, key }; }
      return { t: 'delete', name };
    }
    return { t: 'expr', e: expr() };
  };
  const stmt = (): Stmt => {
    optNl();
    if (is('{')) { p += 1; const body = stmts(); eat('}'); return { t: 'block', body }; }
    if (is('if')) {
      p += 1; eat('('); const c = expr(); eat(')'); optNl();
      const a = stmt();
      const save = p;
      nls();
      if (is('else')) { p += 1; optNl(); return { t: 'if', c, a, b: stmt() }; }
      p = save;
      return { t: 'if', c, a };
    }
    if (is('while')) { p += 1; eat('('); const c = expr(); eat(')'); optNl(); return { t: 'while', c, body: stmt() }; }
    if (is('for')) {
      p += 1; eat('(');
      if (peek().k === 'name' && peek(1).k === 'name' && peek(1).v === 'in' && peek(2).k === 'name' && toks[p + 3]?.v === ')') {
        const key = peek().v; const name = peek(2).v; p += 4; optNl();
        return { t: 'forin', key, name, body: stmt() };
      }
      const init = is(';') ? undefined : expr({ noIn: true }); eat(';'); optNl();
      const c = is(';') ? undefined : expr(); eat(';'); optNl();
      const step = is(')') ? undefined : expr(); eat(')'); optNl();
      return { t: 'for', ...(init ? { init } : {}), ...(c ? { c } : {}), ...(step ? { step } : {}), body: stmt() };
    }
    if (is(';')) { p += 1; return { t: 'block', body: [] }; }
    const s = simple();
    if (is(';') || peek().k === 'nl') p += 1;
    return s;
  };
  const stmts = (): Stmt[] => {
    const out: Stmt[] = [];
    nls();
    while (!is('}') && peek().k !== 'eof') { out.push(stmt()); nls(); }
    return out;
  };
  const block = (): Stmt[] => { eat('{'); const body = stmts(); eat('}'); return body; };

  const rules: Rule[] = [];
  nls();
  while (peek().k !== 'eof') {
    if (is('BEGIN')) { p += 1; optNl(); rules.push({ kind: 'begin', body: block() }); }
    else if (is('END')) { p += 1; optNl(); rules.push({ kind: 'end', body: block() }); }
    else if (is('{')) rules.push({ kind: 'main', body: block() });
    else {
      const pattern = expr();
      let range: Expr | undefined;
      if (is(',')) { p += 1; optNl(); range = expr(); }
      rules.push({ kind: 'main', pattern, ...(range ? { range } : {}), ...(is('{') ? { body: block() } : {}) });
    }
    nls();
  }
  return rules;
}

// ---- 実行 ----

const looksNumeric = (s: string): boolean => /^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?\s*$/.test(s);
const num = (v: Val): number => {
  if (typeof v === 'number') return v;
  const m = /^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(v);
  return m ? Number(m[0]) : 0;
};
const str = (v: Val): string => {
  if (typeof v === 'string') return v;
  if (Number.isInteger(v)) return String(v);
  return String(Number(v.toPrecision(6)));
};

/** sprintf の書式（%d %i %s %f %e %g %x %o %c %% と、幅・精度・- 0 +） */
function format(fmt: string, args: readonly Val[]): string {
  let k = 0;
  const next = (): Val => args[k++] ?? '';
  return fmt.replace(/%([-+ 0#]*)(\*|\d+)?(?:\.(\*|\d+))?([diouxXeEfgGcs%])/g, (_, flags: string, w: string | undefined, prec: string | undefined, conv: string) => {
    if (conv === '%') return '%';
    const width = w === '*' ? num(next()) : w === undefined ? 0 : Number(w);
    const precision = prec === '*' ? num(next()) : prec === undefined ? undefined : Number(prec);
    const v = next();
    let body: string;
    switch (conv) {
      case 'd': case 'i': { const n = Math.trunc(num(v)); body = `${n < 0 ? '-' : flags.includes('+') ? '+' : ''}${String(Math.abs(n))}`; break; }
      case 'o': body = Math.trunc(num(v)).toString(8); break;
      case 'u': body = String(Math.trunc(Math.abs(num(v)))); break;
      case 'x': body = Math.trunc(num(v)).toString(16); break;
      case 'X': body = Math.trunc(num(v)).toString(16).toUpperCase(); break;
      case 'e': case 'E': body = num(v).toExponential(precision ?? 6).replace(/e([+-])(\d)$/, 'e$10$2'); if (conv === 'E') body = body.toUpperCase(); break;
      case 'f': body = num(v).toFixed(precision ?? 6); if (flags.includes('+') && num(v) >= 0) body = `+${body}`; break;
      case 'g': case 'G': body = String(Number(num(v).toPrecision(precision === 0 ? 1 : precision ?? 6))); break;
      case 'c': body = typeof v === 'number' ? String.fromCharCode(v) : v.slice(0, 1); break;
      default: body = precision === undefined ? str(v) : str(v).slice(0, precision);
    }
    if (body.length >= width) return body;
    if (flags.includes('-')) return body.padEnd(width);
    if (flags.includes('0') && conv !== 's' && conv !== 'c') { const sign = /^[+-]/.test(body) ? body[0] ?? '' : ''; return sign + body.slice(sign.length).padStart(width - sign.length, '0'); }
    return body.padStart(width);
  });
}

class Next extends Error {}
class Exit extends Error { constructor(readonly code: number) { super('exit'); } }

interface Run {
  vars: Map<string, Val>;
  arrays: Map<string, Map<string, Val>>;
  fields: string[];
  out: string;
  files: Map<string, string>;
  appendTo: Set<string>;
}

function runAwk(rules: readonly Rule[], inputs: readonly { name: string; text: string }[], init: Map<string, Val>): { out: string; files: Map<string, string>; appendTo: Set<string>; code: number } {
  const r: Run = { vars: new Map<string, Val>([['FS', ' '], ['OFS', ' '], ['ORS', '\n'], ['NR', 0], ['NF', 0], ['FNR', 0], ['FILENAME', ''], ['SUBSEP', '\x1c'], ['RSTART', 0], ['RLENGTH', -1], ...init]), arrays: new Map(), fields: [''], out: '', files: new Map(), appendTo: new Set() };
  const regex = (src: string, global = false): RegExp => {
    const c = compilePattern(src, { extended: true, global });
    if (!c.regex) throw new AwkError(`syntax error in regular expression ${src}`);
    return c.regex;
  };
  const split = (line: string, fs: string): string[] => {
    if (fs === ' ') return line.split(/[ \t\n]+/).filter((f) => f !== '');
    if (line === '') return [];
    if (fs.length === 1 && fs !== '\\') return line.split(fs);
    return line.split(regex(fs));
  };
  const setRecord = (line: string): void => {
    const fs = split(line, str(r.vars.get('FS') ?? ' '));
    r.fields = [line, ...fs];
    r.vars.set('NF', fs.length);
  };
  const rebuild = (): void => { r.fields[0] = r.fields.slice(1).join(str(r.vars.get('OFS') ?? ' ')); };
  const getField = (i: number): Val => {
    if (i < 0) throw new AwkError(`trying to access out of range field ${String(i)}`);
    return r.fields[i] ?? '';
  };
  const setField = (i: number, v: string): void => {
    if (i === 0) { setRecord(v); return; }
    while (r.fields.length <= i) r.fields.push('');
    r.fields[i] = v;
    r.vars.set('NF', r.fields.length - 1);
    rebuild();
  };
  const arr = (name: string): Map<string, Val> => {
    let a = r.arrays.get(name);
    if (!a) { a = new Map(); r.arrays.set(name, a); }
    return a;
  };
  const keyOf = (key: readonly Expr[]): string => key.map((k) => str(ev(k))).join(str(r.vars.get('SUBSEP') ?? '\x1c'));
  const get = (target: Expr): Val => ev(target);
  const set = (target: Expr, v: Val): void => {
    if (target.t === 'var') {
      r.vars.set(target.name, v);
      if (target.name === 'NF') { r.fields = r.fields.slice(0, num(v) + 1); while (r.fields.length <= num(v)) r.fields.push(''); rebuild(); }
    } else if (target.t === 'field') setField(num(ev(target.e)), str(v));
    else if (target.t === 'idx') arr(target.name).set(keyOf(target.key), v);
    else if (target.t === 'group' && target.e.length === 1 && target.e[0]) set(target.e[0], v);
    else throw new AwkError('assignment to non-variable');
  };
  // 比べ方: どちらも数に見える（数か、数の形の入力の値）なら数で、そうでなければ文字で
  const isNumish = (e: Expr, v: Val): boolean => typeof v === 'number' || ((e.t === 'field' || e.t === 'idx' || e.t === 'var') && looksNumeric(v));
  const truth = (e: Expr, v: Val): boolean => (typeof v === 'number' ? v !== 0 : isNumish(e, v) ? num(v) !== 0 : v !== '');
  const matches = (v: Val, re: Expr): boolean => regex(re.t === 're' ? re.v : str(ev(re))).test(str(v));
  const ev = (e: Expr): Val => {
    switch (e.t) {
      case 'num': return e.v;
      case 'str': return e.v;
      case 're': return regex(e.v).test(r.fields[0] ?? '') ? 1 : 0;
      case 'var': return r.vars.get(e.name) ?? '';
      case 'field': return getField(num(ev(e.e)));
      case 'idx': { const a = arr(e.name); const k = keyOf(e.key); if (!a.has(k)) a.set(k, ''); return a.get(k) ?? ''; }
      case 'in': return arr(e.name).has(e.key.t === 'group' ? keyOf(e.key.e) : str(ev(e.key))) ? 1 : 0;
      case 'group': return ev(e.e[e.e.length - 1] ?? { t: 'str', v: '' });
      case 'cond': { const c = ev(e.c); return truth(e.c, c) ? ev(e.a) : ev(e.b); }
      case 'un': {
        const v = ev(e.e);
        if (e.op === '!') return truth(e.e, v) ? 0 : 1;
        return e.op === '-' ? -num(v) : num(v);
      }
      case 'incr': {
        const old = num(get(e.target));
        const now = e.op === '++' ? old + 1 : old - 1;
        set(e.target, now);
        return e.pre ? now : old;
      }
      case 'assign': {
        const v = ev(e.e);
        if (e.op === '=') { set(e.target, v); return v; }
        const a = num(get(e.target));
        const b = num(v);
        const out = e.op === '+=' ? a + b : e.op === '-=' ? a - b : e.op === '*=' ? a * b : e.op === '/=' ? a / b : e.op === '%=' ? a % b : a ** b;
        set(e.target, out);
        return out;
      }
      case 'bin': {
        if (e.op === '&&') return truth(e.a, ev(e.a)) && truth(e.b, ev(e.b)) ? 1 : 0;
        if (e.op === '||') return truth(e.a, ev(e.a)) || truth(e.b, ev(e.b)) ? 1 : 0;
        if (e.op === '~') return matches(ev(e.a), e.b) ? 1 : 0;
        if (e.op === '!~') return matches(ev(e.a), e.b) ? 0 : 1;
        const a = ev(e.a);
        const b = ev(e.b);
        if (e.op === 'cat') return str(a) + str(b);
        if (['<', '<=', '==', '!=', '>=', '>'].includes(e.op)) {
          const numeric = isNumish(e.a, a) && isNumish(e.b, b);
          const x = numeric ? num(a) : str(a);
          const y = numeric ? num(b) : str(b);
          const res = e.op === '<' ? x < y : e.op === '<=' ? x <= y : e.op === '==' ? x === y : e.op === '!=' ? x !== y : e.op === '>=' ? x >= y : x > y;
          return res ? 1 : 0;
        }
        const x = num(a);
        const y = num(b);
        if ((e.op === '/' || e.op === '%') && y === 0) throw new AwkError('division by zero');
        return e.op === '+' ? x + y : e.op === '-' ? x - y : e.op === '*' ? x * y : e.op === '/' ? x / y : e.op === '%' ? x % y : x ** y;
      }
      case 'call': return call(e.name, e.args);
    }
  };
  const call = (name: string, args: readonly Expr[]): Val => {
    const a = (i: number): Val => (args[i] ? ev(args[i]) : '');
    switch (name) {
      case 'length': return args.length === 0 ? (r.fields[0] ?? '').length : args[0]?.t === 'var' && r.arrays.has(args[0].name) ? arr(args[0].name).size : [...str(a(0))].length;
      case 'substr': {
        const s = [...str(a(0))];
        const start = Math.round(num(a(1)));
        const len = args.length > 2 ? Math.round(num(a(2))) : s.length;
        const from = Math.max(start, 1);
        const to = Math.min(start + len, s.length + 1);
        return to > from ? s.slice(from - 1, to - 1).join('') : '';
      }
      case 'index': { const i = str(a(0)).indexOf(str(a(1))); return i + 1; }
      case 'split': {
        const target = args[1];
        if (target?.t !== 'var') throw new AwkError('split: second argument must be an array');
        const sep = args[2] ? (args[2].t === 're' ? args[2].v : str(ev(args[2]))) : str(r.vars.get('FS') ?? ' ');
        const parts = split(str(a(0)), sep);
        const m = new Map<string, Val>(parts.map((v, i) => [String(i + 1), v]));
        r.arrays.set(target.name, m);
        return parts.length;
      }
      case 'sub': case 'gsub': {
        const re = args[0]?.t === 're' ? args[0].v : str(a(0));
        const repl = str(a(1));
        const target: Expr = args[2] ?? { t: 'field', e: { t: 'num', v: 0 } };
        const before = str(get(target));
        let count = 0;
        const after = before.replace(regex(re, name === 'gsub'), (m) => {
          count += 1;
          return repl.replace(/\\&|&/g, (x) => (x === '&' ? m : '&'));
        });
        if (count > 0) set(target, after);
        return count;
      }
      case 'match': {
        const m = regex(args[1]?.t === 're' ? args[1].v : str(a(1))).exec(str(a(0)));
        r.vars.set('RSTART', m ? m.index + 1 : 0);
        r.vars.set('RLENGTH', m ? m[0].length : -1);
        return m ? m.index + 1 : 0;
      }
      case 'toupper': return str(a(0)).toUpperCase();
      case 'tolower': return str(a(0)).toLowerCase();
      case 'sprintf': return format(str(a(0)), args.slice(1).map((x) => ev(x)));
      case 'int': return Math.trunc(num(a(0)));
      case 'sqrt': return Math.sqrt(num(a(0)));
      case 'exp': return Math.exp(num(a(0)));
      case 'log': return Math.log(num(a(0)));
      case 'sin': return Math.sin(num(a(0)));
      case 'cos': return Math.cos(num(a(0)));
      case 'atan2': return Math.atan2(num(a(0)), num(a(1)));
      case 'rand': return 0.237788;
      case 'srand': return 0;
      default: throw new AwkError(`calling undefined function ${name}`);
    }
  };
  const emit = (text: string, to: { append: boolean; file: Expr } | undefined): void => {
    if (!to) { r.out += text; return; }
    const file = str(ev(to.file));
    if (to.append) r.appendTo.add(file);
    r.files.set(file, (r.files.get(file) ?? '') + text);
  };
  const exec = (s: Stmt): void => {
    switch (s.t) {
      case 'print': {
        const ofs = str(r.vars.get('OFS') ?? ' ');
        const text = s.args.length === 0 ? (r.fields[0] ?? '') : s.args.map((x) => { const v = ev(x); return typeof v === 'number' ? str(v) : v; }).join(ofs);
        emit(text + str(r.vars.get('ORS') ?? '\n'), s.to);
        return;
      }
      case 'printf': {
        const [f, ...rest] = s.args;
        if (!f) throw new AwkError('printf: no format');
        emit(format(str(ev(f)), rest.map((x) => ev(x))), s.to);
        return;
      }
      case 'expr': ev(s.e); return;
      case 'if': if (truth(s.c, ev(s.c))) exec(s.a); else if (s.b) exec(s.b); return;
      case 'while': { let guard = 0; while (truth(s.c, ev(s.c))) { exec(s.body); if ((guard += 1) > 100000) throw new AwkError('loop too long'); } return; }
      case 'for': {
        if (s.init) ev(s.init);
        let guard = 0;
        while (!s.c || truth(s.c, ev(s.c))) { exec(s.body); if (s.step) ev(s.step); if ((guard += 1) > 100000) throw new AwkError('loop too long'); }
        return;
      }
      case 'forin': for (const k of [...arr(s.name).keys()]) { r.vars.set(s.key, k); exec(s.body); } return;
      case 'block': for (const x of s.body) exec(x); return;
      case 'next': throw new Next();
      case 'exit': throw new Exit(s.e ? num(ev(s.e)) : 0);
      case 'delete': if (s.key) arr(s.name).delete(keyOf(s.key)); else r.arrays.set(s.name, new Map()); return;
    }
  };
  const body = (b: readonly Stmt[] | undefined): void => { if (b) for (const s of b) exec(s); else r.out += (r.fields[0] ?? '') + str(r.vars.get('ORS') ?? '\n'); };

  let code = 0;
  const inRange = new Set<Rule>();
  try {
    for (const rule of rules.filter((x) => x.kind === 'begin')) body(rule.body);
    const main = rules.filter((x) => x.kind === 'main');
    if (main.length > 0 || rules.some((x) => x.kind === 'end')) {
      for (const input of inputs) {
        r.vars.set('FILENAME', input.name);
        r.vars.set('FNR', 0);
        const lines = input.text.split('\n');
        if (lines[lines.length - 1] === '') lines.pop();
        for (const line of lines) {
          r.vars.set('NR', num(r.vars.get('NR') ?? 0) + 1);
          r.vars.set('FNR', num(r.vars.get('FNR') ?? 0) + 1);
          setRecord(line);
          try {
            for (const rule of main) {
              let ok: boolean;
              if (rule.range && rule.pattern) {
                if (inRange.has(rule)) { ok = true; if (truth(rule.range, ev(rule.range))) inRange.delete(rule); }
                else if (truth(rule.pattern, ev(rule.pattern))) { ok = true; if (!truth(rule.range, ev(rule.range))) inRange.add(rule); }
                else ok = false;
              } else ok = !rule.pattern || truth(rule.pattern, ev(rule.pattern));
              if (ok) body(rule.body);
            }
          } catch (err) {
            if (!(err instanceof Next)) throw err;
          }
        }
      }
    }
    for (const rule of rules.filter((x) => x.kind === 'end')) body(rule.body);
  } catch (err) {
    if (!(err instanceof Exit)) throw err;
    code = err.code;
    // exit の後も END は動く（END の中の exit なら終わる）
    try { for (const rule of rules.filter((x) => x.kind === 'end')) body(rule.body); } catch (again) { if (!(again instanceof Exit)) throw again; }
  }
  return { out: r.out, files: r.files, appendTo: r.appendTo, code };
}

export const awkCommands: CommandSpec[] = [
  {
    name: 'awk',
    summary: '行を列に分けて選び・計算して出す（awk \'{print $1}\'・-F・NR・BEGIN・END）',
    handler: ({ argv, shell, stdin }) => {
      const init = new Map<string, Val>();
      let program: string | undefined;
      const files: string[] = [];
      for (let i = 1; i < argv.length; i += 1) {
        const a = argv[i] ?? '';
        if (program === undefined && a === '-F') { const v = argv[(i += 1)] ?? ' '; init.set('FS', v === 't' ? '\t' : v.replace(/\\t/g, '\t')); }
        else if (program === undefined && a.startsWith('-F')) { const v = a.slice(2); init.set('FS', v === 't' ? '\t' : v.replace(/\\t/g, '\t')); }
        else if (program === undefined && a === '-v') { const [k = '', ...v] = (argv[(i += 1)] ?? '').split('='); init.set(k, v.join('=')); }
        else if (program === undefined && a === '--') continue;
        else if (program === undefined) program = a;
        else if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(a)) { const [k = '', ...v] = a.split('='); init.set(k, v.join('=')); }
        else files.push(a);
      }
      if (program === undefined) return { stderr: "usage: awk [-F fs][-v var=value][prog | -f progfile][file ...]\n", code: 2 };
      const inputs: { name: string; text: string }[] = [];
      for (const f of files) {
        if (f === '-') { inputs.push({ name: '', text: stdin }); continue; }
        const path = resolve(shell.cwd, f);
        if (!exists(shell.vfs, path)) return { stderr: `awk: cannot open "${f}" (No such file or directory)\n`, code: 2 };
        if (isDir(shell.vfs, path)) return { stderr: `awk: warning: command line argument \`${f}' is a directory: skipped\n`, code: 0 };
        inputs.push({ name: f, text: readFile(shell.vfs, path) });
      }
      if (files.length === 0) inputs.push({ name: '', text: stdin });
      try {
        const result = runAwk(parse(program), inputs, init);
        let vfs: VfsState = shell.vfs;
        for (const [file, text] of result.files) {
          const path = resolve(shell.cwd, file);
          vfs = result.appendTo.has(file) ? appendFile(vfs, path, text) : writeFile(vfs, path, text);
        }
        return { ...(result.out ? { stdout: result.out } : {}), code: result.code, ...(vfs !== shell.vfs ? { patch: { vfs } } : {}) };
      } catch (err) {
        if (err instanceof AwkError) return { stderr: `awk: ${err.message}\n awk: ${program.split('\n')[0] ?? ''}\n`, code: 2 };
        throw err;
      }
    },
  },
];
