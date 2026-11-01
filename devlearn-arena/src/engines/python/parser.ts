/**
 * Python の模擬（docs/learning-design.md 6 章）の字句と構文。実戦に要る範囲の文法だけを読む。純粋な関数。
 * 読めない文法は、本物と同じ形の SyntaxError にする（class・try・with などは、この実戦では使わないので読まない）。
 */

export interface Pos { line: number; col: number; endLine: number; endCol: number }

export type Expr = Pos & (
  | { k: 'num'; value: bigint | number }
  | { k: 'str'; value: string }
  | { k: 'fstr'; parts: (string | { expr: Expr; conv?: string; spec?: string })[] }
  | { k: 'name'; name: string }
  | { k: 'const'; value: null | boolean }
  | { k: 'list'; items: Expr[] }
  | { k: 'tuple'; items: Expr[] }
  | { k: 'set'; items: Expr[] }
  | { k: 'dict'; items: [Expr, Expr][] }
  | { k: 'comp'; kind: 'list' | 'set' | 'gen'; elt: Expr; clauses: Comp[] }
  | { k: 'dictcomp'; key: Expr; value: Expr; clauses: Comp[] }
  | { k: 'unary'; op: string; arg: Expr }
  | { k: 'binary'; op: string; left: Expr; right: Expr }
  | { k: 'compare'; first: Expr; rest: [string, Expr][] }
  | { k: 'logic'; op: 'and' | 'or'; left: Expr; right: Expr }
  | { k: 'ternary'; test: Expr; then: Expr; other: Expr }
  | { k: 'call'; fn: Expr; args: Expr[]; kwargs: [string, Expr][]; star?: Expr }
  | { k: 'attr'; obj: Expr; name: string }
  | { k: 'index'; obj: Expr; idx: Expr }
  | { k: 'slice'; start?: Expr; stop?: Expr; step?: Expr }
  | { k: 'lambda'; params: Param[]; body: Expr }
);

export interface Comp { target: Expr; iter: Expr; ifs: Expr[] }
export interface Param { name: string; def?: Expr }

export type Stmt = { line: number; src: string } & (
  | { k: 'expr'; expr: Expr }
  | { k: 'assign'; targets: Expr[]; value: Expr }
  | { k: 'aug'; op: string; target: Expr; value: Expr }
  | { k: 'import'; names: { name: string; as?: string }[] }
  | { k: 'from'; module: string; names: { name: string; as?: string }[] }
  | { k: 'if'; tests: [Expr, Stmt[]][]; other?: Stmt[] }
  | { k: 'for'; target: Expr; iter: Expr; body: Stmt[] }
  | { k: 'while'; test: Expr; body: Stmt[] }
  | { k: 'def'; name: string; params: Param[]; body: Stmt[] }
  | { k: 'return'; value?: Expr }
  | { k: 'pass' } | { k: 'break' } | { k: 'continue' }
);

export class PySyntaxError extends Error {
  constructor(message: string, readonly line: number, readonly col: number, readonly endCol: number = col + 1, readonly kind: string = 'SyntaxError') { super(message); }
}

type TokKind = 'name' | 'num' | 'str' | 'fstr' | 'op' | 'nl' | 'indent' | 'dedent' | 'end';
interface Tok { t: TokKind; v: string; line: number; col: number; endLine: number; endCol: number; raw?: string }

const KEYWORDS = new Set(['and', 'or', 'not', 'if', 'elif', 'else', 'for', 'while', 'in', 'is', 'def', 'return', 'pass', 'break', 'continue', 'import', 'from', 'as', 'lambda', 'None', 'True', 'False']);
const OPS3 = ['**=', '//=', '>>=', '<<=', '...'];
const OPS2 = ['**', '//', '==', '!=', '<=', '>=', '+=', '-=', '*=', '/=', '%=', '@=', '<<', '>>', '->', ':='];
const OPS1 = '+-*/%@<>=()[]{},:.;~&|^';

function unescape(s: string): string {
  return s.replace(/\\(n|t|r|\\|'|"|0|\n)/g, (_, c: string) => ({ n: '\n', t: '\t', r: '\r', '\\': '\\', "'": "'", '"': '"', '0': '\0', '\n': '' })[c] ?? c);
}

function tokenize(src: string): Tok[] {
  const lines = src.split('\n');
  const toks: Tok[] = [];
  const indents = [0];
  const opens: Tok[] = [];
  let depth = 0;
  let ln = 0;
  let col = 0;
  let atStart = true;
  const push = (t: TokKind, v: string, l: number, c: number, el: number, ec: number, raw?: string): void => { toks.push({ t, v, line: l + 1, col: c, endLine: el + 1, endCol: ec, ...(raw === undefined ? {} : { raw }) }); };
  while (ln < lines.length) {
    const text = lines[ln] ?? '';
    if (atStart && depth === 0) {
      const ws = /^[ \t]*/.exec(text)?.[0].length ?? 0;
      const rest = text.slice(ws);
      if (rest === '' || rest.startsWith('#')) { ln += 1; col = 0; continue; }
      const top = indents[indents.length - 1] ?? 0;
      if (ws > top) { indents.push(ws); push('indent', '', ln, 0, ln, ws); }
      while (ws < (indents[indents.length - 1] ?? 0)) {
        indents.pop();
        if (ws > (indents[indents.length - 1] ?? 0)) throw new PySyntaxError('unindent does not match any outer indentation level', ln + 1, ws, ws + 1, 'IndentationError');
        push('dedent', '', ln, 0, ln, ws);
      }
      col = ws;
      atStart = false;
    }
    if (col >= text.length || text[col] === '#') {
      if (depth === 0) { push('nl', '', ln, text.length, ln, text.length + 1); atStart = true; }
      ln += 1; col = 0;
      continue;
    }
    const ch = text[col] ?? '';
    if (ch === ' ' || ch === '\t') { col += 1; continue; }
    if (ch === '\\' && col === text.length - 1) { ln += 1; col = 0; continue; }
    // 文字列（接頭辞 f・r）
    const pm = /^([fFrRbBuU]{0,2})("""|'''|"|')/.exec(text.slice(col));
    if (pm) {
      const prefix = (pm[1] ?? '').toLowerCase();
      const q = pm[2] ?? '"';
      const startLn = ln;
      const startCol = col;
      let i = col + (pm[0] ?? '').length;
      let body = '';
      for (;;) {
        const cur = lines[ln] ?? '';
        if (i >= cur.length) {
          if (q.length === 1 || ln === lines.length - 1) {
            if (q.length === 3) throw new PySyntaxError(`unterminated triple-quoted string literal (detected at line ${String(lines.length)})`, startLn + 1, startCol);
            throw new PySyntaxError(`unterminated string literal (detected at line ${String(startLn + 1)})`, startLn + 1, startCol);
          }
          body += '\n'; ln += 1; i = 0;
          continue;
        }
        if (cur[i] === '\\') { body += cur.slice(i, i + 2); i += 2; continue; }
        if (cur.startsWith(q, i)) { i += q.length; break; }
        body += cur[i]; i += 1;
      }
      const value = prefix.includes('r') ? body : prefix.includes('f') ? body : unescape(body);
      push(prefix.includes('f') ? 'fstr' : 'str', value, startLn, startCol, ln, i);
      col = i;
      continue;
    }
    const nm = /^[A-Za-z_\u0080-￿][A-Za-z0-9_\u0080-￿]*/.exec(text.slice(col));
    if (nm) { const v = nm[0]; push('name', v, ln, col, ln, col + v.length); col += v.length; continue; }
    const num = /^(?:0[xX][0-9a-fA-F_]+|(?:\d[\d_]*)?\.?\d[\d_]*(?:\.\d*)?(?:[eE][+-]?\d+)?\.?)/.exec(text.slice(col));
    if (/\d/.test(ch) || (ch === '.' && /\d/.test(text[col + 1] ?? ''))) {
      const v = num?.[0] ?? ch;
      push('num', v.replace(/_/g, ''), ln, col, ln, col + v.length);
      col += v.length;
      continue;
    }
    const three = text.slice(col, col + 3);
    const two = text.slice(col, col + 2);
    const op = OPS3.includes(three) ? three : OPS2.includes(two) ? two : OPS1.includes(ch) ? ch : null;
    if (op === null) throw new PySyntaxError(`invalid character '${ch}' (U+${(ch.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')})`, ln + 1, col);
    if ('([{'.includes(op)) depth += 1;
    if (')]}'.includes(op)) depth = Math.max(0, depth - 1);
    push('op', op, ln, col, ln, col + op.length);
    if ('([{'.includes(op)) opens.push(toks[toks.length - 1] as Tok);
    if (')]}'.includes(op)) opens.pop();
    col += op.length;
  }
  if (depth > 0) {
    const open = opens[opens.length - 1];
    throw new PySyntaxError(`'${open?.v ?? '('}' was never closed`, open?.line ?? lines.length, open?.col ?? 0);
  }
  while (indents.length > 1) { indents.pop(); push('dedent', '', ln, 0, ln, 0); }
  push('end', '', ln, 0, ln, 0);
  return toks;
}

export function parseProgram(src: string): Stmt[] {
  return new Parser(tokenize(src), src.split('\n')).program();
}

class Parser {
  private i = 0;
  constructor(private readonly toks: Tok[], private readonly lines: string[]) {}

  private get cur(): Tok { return this.toks[this.i] ?? { t: 'end', v: '', line: 1, col: 0, endLine: 1, endCol: 0 }; }
  private isOp(v: string): boolean { return this.cur.t === 'op' && this.cur.v === v; }
  private isKw(v: string): boolean { return this.cur.t === 'name' && this.cur.v === v; }
  private eatOp(v: string): boolean { if (this.isOp(v)) { this.i += 1; return true; } return false; }
  private eatKw(v: string): boolean { if (this.isKw(v)) { this.i += 1; return true; } return false; }
  private fail(msg = 'invalid syntax', t: Tok = this.cur): never { throw new PySyntaxError(msg, t.line, t.col, Math.max(t.endCol, t.col + 1)); }
  private needOp(v: string): void {
    if (!this.eatOp(v)) {
      if (v === ':') this.fail("expected ':'");
      this.fail();
    }
  }

  program(): Stmt[] {
    const out: Stmt[] = [];
    while (this.cur.t !== 'end') {
      if (this.cur.t === 'nl') { this.i += 1; continue; }
      if (this.cur.t === 'indent') throw new PySyntaxError('unexpected indent', this.cur.line, this.cur.endCol, this.cur.endCol + 1, 'IndentationError');
      out.push(...this.statement());
    }
    return out;
  }

  private block(owner: string, line: number): Stmt[] {
    this.needOp(':');
    if (this.cur.t !== 'nl') return this.simpleLine();
    this.i += 1;
    while (this.cur.t === 'nl') this.i += 1;
    if (this.cur.t !== 'indent') throw new PySyntaxError(`expected an indented block after ${owner} on line ${String(line)}`, this.cur.line, this.cur.col, this.cur.endCol, 'IndentationError');
    this.i += 1;
    const out: Stmt[] = [];
    while (this.cur.t !== 'dedent' && this.cur.t !== 'end') {
      if (this.cur.t === 'nl') { this.i += 1; continue; }
      if (this.cur.t === 'indent') throw new PySyntaxError('unexpected indent', this.cur.line, this.cur.endCol, this.cur.endCol + 1, 'IndentationError');
      out.push(...this.statement());
    }
    if (this.cur.t === 'dedent') this.i += 1;
    return out;
  }

  private statement(): Stmt[] {
    const t = this.cur;
    const base = { line: t.line, src: this.lines[t.line - 1] ?? '' };
    if (t.t === 'name') {
      if (t.v === 'if') {
        this.i += 1;
        const tests: [Expr, Stmt[]][] = [];
        const test = this.expr();
        tests.push([test, this.block("'if' statement", t.line)]);
        let other: Stmt[] | undefined;
        for (;;) {
          if (this.isKw('elif')) { const l = this.cur.line; this.i += 1; const e = this.expr(); tests.push([e, this.block("'elif' statement", l)]); continue; }
          if (this.isKw('else')) { const l = this.cur.line; this.i += 1; other = this.block("'else' statement", l); }
          break;
        }
        return [{ ...base, k: 'if', tests, ...(other ? { other } : {}) }];
      }
      if (t.v === 'for') {
        this.i += 1;
        const target = this.targetList();
        if (!this.eatKw('in')) this.fail();
        const iter = this.exprList();
        return [{ ...base, k: 'for', target, iter, body: this.block("'for' statement", t.line) }];
      }
      if (t.v === 'while') {
        this.i += 1;
        const test = this.expr();
        return [{ ...base, k: 'while', test, body: this.block("'while' statement", t.line) }];
      }
      if (t.v === 'def') {
        this.i += 1;
        const name = this.cur.v;
        if (this.cur.t !== 'name') this.fail();
        this.i += 1;
        this.needOp('(');
        const params = this.params(')');
        this.needOp(')');
        return [{ ...base, k: 'def', name, params, body: this.block(`function definition`, t.line) }];
      }
    }
    return this.simpleLine();
  }

  private simpleLine(): Stmt[] {
    const out: Stmt[] = [this.simple()];
    while (this.eatOp(';')) { if (this.cur.t === 'nl' || this.cur.t === 'end') break; out.push(this.simple()); }
    if (this.cur.t === 'nl') this.i += 1;
    else if (this.cur.t !== 'end' && this.cur.t !== 'dedent') this.fail();
    return out;
  }

  private simple(): Stmt {
    const t = this.cur;
    const base = { line: t.line, src: this.lines[t.line - 1] ?? '' };
    if (t.t === 'name') {
      if (this.eatKw('pass')) return { ...base, k: 'pass' };
      if (this.eatKw('break')) return { ...base, k: 'break' };
      if (this.eatKw('continue')) return { ...base, k: 'continue' };
      if (this.eatKw('return')) {
        if (this.cur.t === 'nl' || this.cur.t === 'end' || this.isOp(';')) return { ...base, k: 'return' };
        return { ...base, k: 'return', value: this.exprList() };
      }
      if (this.eatKw('import')) {
        const names: { name: string; as?: string }[] = [];
        do {
          const name = this.dotted();
          names.push(this.eatKw('as') ? { name, as: this.ident() } : { name });
        } while (this.eatOp(','));
        return { ...base, k: 'import', names };
      }
      if (this.eatKw('from')) {
        const module = this.dotted();
        if (!this.eatKw('import')) this.fail();
        const paren = this.eatOp('(');
        const names: { name: string; as?: string }[] = [];
        do {
          if (paren && this.isOp(')')) break;
          const name = this.ident();
          names.push(this.eatKw('as') ? { name, as: this.ident() } : { name });
        } while (this.eatOp(','));
        if (paren) this.needOp(')');
        return { ...base, k: 'from', module, names };
      }
    }
    const first = this.exprList();
    if (this.cur.t === 'op' && /^(\*\*|\/\/|[-+*/%@])=$/.test(this.cur.v)) {
      const op = this.cur.v.slice(0, -1);
      this.i += 1;
      this.assignable(first);
      return { ...base, k: 'aug', op, target: first, value: this.exprList() };
    }
    if (this.isOp('=')) {
      const targets: Expr[] = [first];
      let value = first;
      while (this.eatOp('=')) {
        value = this.exprList();
        targets.push(value);
      }
      targets.pop();
      for (const x of targets) this.assignable(x);
      return { ...base, k: 'assign', targets, value };
    }
    return { ...base, k: 'expr', expr: first };
  }

  private assignable(e: Expr): void {
    if (e.k === 'name' || e.k === 'attr' || e.k === 'index') return;
    if (e.k === 'tuple' || e.k === 'list') { for (const x of e.items) this.assignable(x); return; }
    const what = e.k === 'num' || e.k === 'str' || e.k === 'const' ? 'literal' : e.k === 'call' ? 'function call' : 'expression';
    throw new PySyntaxError(`cannot assign to ${what} here. Maybe you meant '==' instead of '='?`, e.line, e.col, e.endCol);
  }

  private ident(): string {
    if (this.cur.t !== 'name' || KEYWORDS.has(this.cur.v)) this.fail();
    const v = this.cur.v;
    this.i += 1;
    return v;
  }

  private dotted(): string {
    let s = this.ident();
    while (this.eatOp('.')) s += `.${this.ident()}`;
    return s;
  }

  private params(close: string): Param[] {
    const out: Param[] = [];
    while (!this.isOp(close)) {
      const name = this.ident();
      out.push(this.eatOp('=') ? { name, def: this.expr() } : { name });
      if (!this.eatOp(',')) break;
    }
    return out;
  }

  private span(a: Pos, b: Pos): Pos { return { line: a.line, col: a.col, endLine: b.endLine, endCol: b.endCol }; }
  private tokPos(t: Tok): Pos { return { line: t.line, col: t.col, endLine: t.endLine, endCol: t.endCol }; }

  private targetList(): Expr {
    const first = this.postfixOnly();
    if (!this.isOp(',')) return first;
    const items = [first];
    while (this.eatOp(',')) { if (this.isKw('in')) break; items.push(this.postfixOnly()); }
    return { k: 'tuple', items, ...this.span(first, items[items.length - 1] ?? first) };
  }

  private postfixOnly(): Expr { return this.postfix(this.atom()); }

  private exprList(): Expr {
    const first = this.expr();
    if (!this.isOp(',')) return first;
    const items = [first];
    while (this.eatOp(',')) {
      if (this.cur.t === 'nl' || this.cur.t === 'end' || this.isOp('=') || this.isOp(')') || this.isOp(':')) break;
      items.push(this.expr());
    }
    return { k: 'tuple', items, ...this.span(first, items[items.length - 1] ?? first) };
  }

  expr(): Expr {
    if (this.isKw('lambda')) {
      const t = this.cur;
      this.i += 1;
      const params = this.params(':');
      this.needOp(':');
      const body = this.expr();
      return { k: 'lambda', params, body, ...this.span(this.tokPos(t), body) };
    }
    const test = this.or();
    if (this.isKw('if')) {
      this.i += 1;
      const cond = this.or();
      if (!this.eatKw('else')) this.fail("expected 'else' after 'if' expression");
      const other = this.expr();
      return { k: 'ternary', test: cond, then: test, other, ...this.span(test, other) };
    }
    return test;
  }

  private or(): Expr {
    let left = this.and();
    while (this.eatKw('or')) { const right = this.and(); left = { k: 'logic', op: 'or', left, right, ...this.span(left, right) }; }
    return left;
  }

  private and(): Expr {
    let left = this.not();
    while (this.eatKw('and')) { const right = this.not(); left = { k: 'logic', op: 'and', left, right, ...this.span(left, right) }; }
    return left;
  }

  private not(): Expr {
    if (this.isKw('not')) {
      const t = this.cur;
      this.i += 1;
      const arg = this.not();
      return { k: 'unary', op: 'not', arg, ...this.span(this.tokPos(t), arg) };
    }
    return this.comparison();
  }

  private comparison(): Expr {
    const first = this.bitor();
    const rest: [string, Expr][] = [];
    for (;;) {
      let op: string | null = null;
      if (this.cur.t === 'op' && ['==', '!=', '<', '>', '<=', '>='].includes(this.cur.v)) { op = this.cur.v; this.i += 1; }
      else if (this.isKw('in')) { op = 'in'; this.i += 1; }
      else if (this.isKw('is')) { this.i += 1; op = this.eatKw('not') ? 'is not' : 'is'; }
      else if (this.isKw('not') && this.toks[this.i + 1]?.v === 'in') { this.i += 2; op = 'not in'; }
      if (op === null) break;
      rest.push([op, this.bitor()]);
    }
    if (rest.length === 0) return first;
    return { k: 'compare', first, rest, ...this.span(first, rest[rest.length - 1]?.[1] ?? first) };
  }

  private binaryLevel(ops: readonly string[], next: () => Expr): Expr {
    let left = next();
    while (this.cur.t === 'op' && ops.includes(this.cur.v)) {
      const op = this.cur.v;
      this.i += 1;
      const right = next();
      left = { k: 'binary', op, left, right, ...this.span(left, right) };
    }
    return left;
  }

  private bitor(): Expr { return this.binaryLevel(['|'], () => this.bitxor()); }
  private bitxor(): Expr { return this.binaryLevel(['^'], () => this.bitand()); }
  private bitand(): Expr { return this.binaryLevel(['&'], () => this.additive()); }
  private additive(): Expr { return this.binaryLevel(['+', '-'], () => this.term()); }
  private term(): Expr { return this.binaryLevel(['*', '/', '//', '%', '@'], () => this.unary()); }

  private unary(): Expr {
    if (this.cur.t === 'op' && ['-', '+', '~'].includes(this.cur.v)) {
      const t = this.cur;
      this.i += 1;
      const arg = this.unary();
      return { k: 'unary', op: t.v, arg, ...this.span(this.tokPos(t), arg) };
    }
    return this.power();
  }

  private power(): Expr {
    const base = this.postfix(this.atom());
    if (this.eatOp('**')) {
      const right = this.unary();
      return { k: 'binary', op: '**', left: base, right, ...this.span(base, right) };
    }
    return base;
  }

  private postfix(start: Expr): Expr {
    let e = start;
    for (;;) {
      if (this.isOp('(')) {
        this.i += 1;
        const args: Expr[] = [];
        const kwargs: [string, Expr][] = [];
        let star: Expr | undefined;
        while (!this.isOp(')')) {
          if (this.eatOp('*')) { star = this.expr(); }
          else if (this.cur.t === 'name' && this.toks[this.i + 1]?.t === 'op' && this.toks[this.i + 1]?.v === '=') {
            const name = this.cur.v;
            this.i += 2;
            kwargs.push([name, this.expr()]);
          } else {
            if (kwargs.length > 0) this.fail('positional argument follows keyword argument');
            const a = this.expr();
            if (this.isKw('for')) {
              const clauses = this.compClauses();
              args.push({ k: 'comp', kind: 'gen', elt: a, clauses, line: a.line, col: a.col, endLine: a.endLine, endCol: a.endCol });
            } else args.push(a);
          }
          if (!this.eatOp(',')) break;
        }
        const close = this.cur;
        if (!this.eatOp(')')) this.fail("invalid syntax. Perhaps you forgot a comma?", close);
        e = { k: 'call', fn: e, args, kwargs, ...(star ? { star } : {}), ...this.span(e, this.tokPos(close)) };
        continue;
      }
      if (this.isOp('[')) {
        this.i += 1;
        const idx = this.subscript();
        const close = this.cur;
        this.needOp(']');
        e = { k: 'index', obj: e, idx, ...this.span(e, this.tokPos(close)) };
        continue;
      }
      if (this.isOp('.')) {
        this.i += 1;
        const t = this.cur;
        if (t.t !== 'name') this.fail();
        this.i += 1;
        e = { k: 'attr', obj: e, name: t.v, ...this.span(e, this.tokPos(t)) };
        continue;
      }
      return e;
    }
  }

  private subscript(): Expr {
    const one = (): Expr => {
      const t = this.cur;
      let start: Expr | undefined;
      if (!this.isOp(':')) start = this.expr();
      if (!this.isOp(':')) return start ?? this.fail();
      this.i += 1;
      let stop: Expr | undefined;
      let step: Expr | undefined;
      if (!this.isOp(':') && !this.isOp(']') && !this.isOp(',')) stop = this.expr();
      if (this.eatOp(':') && !this.isOp(']') && !this.isOp(',')) step = this.expr();
      return { k: 'slice', ...(start ? { start } : {}), ...(stop ? { stop } : {}), ...(step ? { step } : {}), ...this.tokPos(t) };
    };
    const first = one();
    if (!this.isOp(',')) return first;
    const items = [first];
    while (this.eatOp(',')) { if (this.isOp(']')) break; items.push(one()); }
    return { k: 'tuple', items, ...this.span(first, items[items.length - 1] ?? first) };
  }

  private compClauses(): Comp[] {
    const out: Comp[] = [];
    while (this.eatKw('for')) {
      const target = this.targetList();
      if (!this.eatKw('in')) this.fail();
      const iter = this.or();
      const ifs: Expr[] = [];
      while (this.eatKw('if')) ifs.push(this.or());
      out.push({ target, iter, ifs });
    }
    return out;
  }

  private atom(): Expr {
    const t = this.cur;
    const pos = this.tokPos(t);
    switch (t.t) {
      case 'num': {
        this.i += 1;
        const isFloat = /[.eE]/.test(t.v) && !/^0[xX]/.test(t.v);
        return { k: 'num', value: isFloat ? Number(t.v) : BigInt(t.v), ...pos };
      }
      case 'str': {
        this.i += 1;
        let value = t.v;
        let end = pos;
        while (this.cur.t === 'str') { value += this.cur.v; end = this.tokPos(this.cur); this.i += 1; }
        return { k: 'str', value, ...this.span(pos, end) };
      }
      case 'fstr': {
        this.i += 1;
        return { k: 'fstr', parts: this.fstringParts(t), ...pos };
      }
      case 'name': {
        if (t.v === 'None' || t.v === 'True' || t.v === 'False') { this.i += 1; return { k: 'const', value: t.v === 'None' ? null : t.v === 'True', ...pos }; }
        if (KEYWORDS.has(t.v)) this.fail();
        this.i += 1;
        return { k: 'name', name: t.v, ...pos };
      }
      case 'op': break;
      default: this.fail();
    }
    if (this.eatOp('(')) {
      if (this.isOp(')')) { const c = this.cur; this.i += 1; return { k: 'tuple', items: [], ...this.span(pos, this.tokPos(c)) }; }
      const first = this.expr();
      if (this.isKw('for')) {
        const clauses = this.compClauses();
        const c = this.cur;
        this.needOp(')');
        return { k: 'comp', kind: 'gen', elt: first, clauses, ...this.span(pos, this.tokPos(c)) };
      }
      if (this.isOp(',')) {
        const items = [first];
        while (this.eatOp(',')) { if (this.isOp(')')) break; items.push(this.expr()); }
        const c = this.cur;
        this.needOp(')');
        return { k: 'tuple', items, ...this.span(pos, this.tokPos(c)) };
      }
      const c = this.cur;
      if (!this.eatOp(')')) this.fail("invalid syntax. Perhaps you forgot a comma?", c);
      return { ...first, ...this.span(pos, this.tokPos(c)) };
    }
    if (this.eatOp('[')) {
      if (this.isOp(']')) { const c = this.cur; this.i += 1; return { k: 'list', items: [], ...this.span(pos, this.tokPos(c)) }; }
      const first = this.expr();
      if (this.isKw('for')) {
        const clauses = this.compClauses();
        const c = this.cur;
        this.needOp(']');
        return { k: 'comp', kind: 'list', elt: first, clauses, ...this.span(pos, this.tokPos(c)) };
      }
      const items = [first];
      while (this.eatOp(',')) { if (this.isOp(']')) break; items.push(this.expr()); }
      const c = this.cur;
      if (!this.eatOp(']')) this.fail("invalid syntax. Perhaps you forgot a comma?", c);
      return { k: 'list', items, ...this.span(pos, this.tokPos(c)) };
    }
    if (this.eatOp('{')) {
      if (this.isOp('}')) { const c = this.cur; this.i += 1; return { k: 'dict', items: [], ...this.span(pos, this.tokPos(c)) }; }
      const first = this.expr();
      if (this.eatOp(':')) {
        const value = this.expr();
        if (this.isKw('for')) {
          const clauses = this.compClauses();
          const c = this.cur;
          this.needOp('}');
          return { k: 'dictcomp', key: first, value, clauses, ...this.span(pos, this.tokPos(c)) };
        }
        const items: [Expr, Expr][] = [[first, value]];
        while (this.eatOp(',')) {
          if (this.isOp('}')) break;
          const key = this.expr();
          this.needOp(':');
          items.push([key, this.expr()]);
        }
        const c = this.cur;
        this.needOp('}');
        return { k: 'dict', items, ...this.span(pos, this.tokPos(c)) };
      }
      if (this.isKw('for')) {
        const clauses = this.compClauses();
        const c = this.cur;
        this.needOp('}');
        return { k: 'comp', kind: 'set', elt: first, clauses, ...this.span(pos, this.tokPos(c)) };
      }
      const items = [first];
      while (this.eatOp(',')) { if (this.isOp('}')) break; items.push(this.expr()); }
      const c = this.cur;
      this.needOp('}');
      return { k: 'set', items, ...this.span(pos, this.tokPos(c)) };
    }
    return this.fail();
  }

  /** f 文字列の {式!変換:書式} を読む */
  private fstringParts(t: Tok): (string | { expr: Expr; conv?: string; spec?: string })[] {
    const s = t.v;
    const parts: (string | { expr: Expr; conv?: string; spec?: string })[] = [];
    let lit = '';
    let i = 0;
    while (i < s.length) {
      const c = s[i] ?? '';
      if (c === '{' && s[i + 1] === '{') { lit += '{'; i += 2; continue; }
      if (c === '}' && s[i + 1] === '}') { lit += '}'; i += 2; continue; }
      if (c === '}') throw new PySyntaxError("f-string: single '}' is not allowed", t.line, t.col);
      if (c !== '{') { lit += c; i += 1; continue; }
      if (lit !== '') { parts.push(unescape(lit)); lit = ''; }
      i += 1;
      let depth = 0;
      let quote: string | null = null;
      let j = i;
      let colon = -1;
      let bang = -1;
      for (; j < s.length; j += 1) {
        const d = s[j] ?? '';
        if (quote !== null) { if (d === quote) quote = null; continue; }
        if (d === '"' || d === "'") { quote = d; continue; }
        if ('([{'.includes(d)) depth += 1;
        if (')]'.includes(d)) depth -= 1;
        if (d === '}') { if (depth === 0) break; depth -= 1; }
        if (depth === 0 && d === ':' && colon < 0) { colon = j; break; }
        if (depth === 0 && d === '!' && s[j + 1] !== '=') bang = j;
      }
      let end = j;
      if (colon >= 0) {
        let k = colon + 1;
        let nest = 0;
        for (; k < s.length; k += 1) {
          if (s[k] === '{') nest += 1;
          if (s[k] === '}') { if (nest === 0) break; nest -= 1; }
        }
        end = k;
      }
      if (end >= s.length) throw new PySyntaxError("f-string: expecting '}'", t.line, t.col);
      const exprEnd = bang >= 0 ? bang : colon >= 0 ? colon : end;
      const source = s.slice(i, exprEnd).trim();
      if (source === '') throw new PySyntaxError('f-string: valid expression required before \'}\'', t.line, t.col);
      const sub = new Parser(tokenize(source), [source]);
      const expr = sub.expr();
      parts.push({ expr: { ...expr, line: t.line }, ...(bang >= 0 ? { conv: s[bang + 1] ?? 's' } : {}), ...(colon >= 0 ? { spec: s.slice(colon + 1, end) } : {}) });
      i = end + 1;
    }
    if (lit !== '') parts.push(unescape(lit));
    return parts;
  }
}
