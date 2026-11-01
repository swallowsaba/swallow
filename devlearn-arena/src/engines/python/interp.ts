import { parseProgram, PySyntaxError, type Comp, type Expr, type Param, type Pos, type Stmt } from './parser';
import {
  asNumber, equal, fn, formatValue, iterOf, lessThan, type PyBuiltin, PyDict, PyError, PyList, PyModule, PyObj, PySet, PySlice, PyTuple,
  repr, str, toInt, truthy, typeName, type Kw, type Value,
} from './values';
import { makeBuiltins } from './builtins';
import { loadModule } from './modules';

/**
 * Python の模擬の実行（木をたどる）。純粋: ファイルの読み書きと出力は host を通す。
 * 誤りは本物と同じ形の Traceback の文にする（呼び出した先の本物のライブラリの中の行は持たないので、利用者のコードの行と最後の行を出す）。
 */

export interface PyHost {
  /** ファイルを読む（無ければ null） */
  read: (path: string) => string | null;
  write: (path: string, content: string) => void;
}

export interface PyResult { stdout: string; stderr: string; code: number }

const MAX_STEPS = 20_000_000;

class ReturnSignal extends Error { constructor(readonly value: Value) { super('return'); } }
class BreakSignal extends Error {}
class ContinueSignal extends Error {}

type Scope = Map<string, Value>;

interface Frame { name: string; line: number; src: string; pos: Pos | Expr | null }

class PyFunction extends PyObj {
  readonly typeName = 'function';
  constructor(readonly name: string, readonly params: Param[], readonly defaults: (Value | undefined)[], readonly body: Stmt[] | Expr, readonly closure: Scope[], readonly run: (f: PyFunction, args: Value[], kw: Kw) => Value) { super(); }
  override call(args: Value[], kw: Kw): Value { return this.run(this, args, kw); }
  override repr(): string { return `<function ${this.name}>`; }
}

class Interp {
  out = '';
  readonly globals: Scope = new Map();
  private steps = 0;
  readonly stack: Frame[] = [];
  private readonly builtins: Readonly<Record<string, Value>>;

  constructor(readonly host: PyHost) {
    this.builtins = makeBuiltins({ print: (s) => { this.out += s; }, host });
    this.globals.set('__name__', '__main__');
  }

  run(prog: Stmt[], where: string): void {
    this.stack.push({ name: where, line: 0, src: '', pos: null });
    this.block(prog, [this.globals]);
    this.stack.pop();
  }

  private tick(): void {
    this.steps += 1;
    if (this.steps > MAX_STEPS) throw new PyError('KeyboardInterrupt', '');
  }

  private block(body: Stmt[], scopes: Scope[]): void {
    for (const s of body) this.stmt(s, scopes);
  }

  private stmt(s: Stmt, scopes: Scope[]): void {
    this.tick();
    const frame = this.stack[this.stack.length - 1];
    if (frame) { frame.line = s.line; frame.src = s.src; frame.pos = null; }
    switch (s.k) {
      case 'expr': this.eval(s.expr, scopes); return;
      case 'assign': {
        const v = this.eval(s.value, scopes);
        for (const t of s.targets) this.assign(t, v, scopes);
        return;
      }
      case 'aug': {
        const cur = this.eval(s.target, scopes);
        const r = this.binary(s.op, cur, this.eval(s.value, scopes), `${s.op}=`);
        this.assign(s.target, r, scopes);
        return;
      }
      case 'import':
        for (const n of s.names) {
          const mod = this.importModule(n.name, s);
          const top = n.name.split('.')[0] ?? n.name;
          this.setName(n.as ?? top, n.as === undefined ? this.importModule(top, s) : mod, scopes);
        }
        return;
      case 'from': {
        const mod = this.importModule(s.module, s);
        for (const n of s.names) {
          const v = mod.getAttr(n.name);
          if (v === undefined) throw new PyError('ImportError', `cannot import name '${n.name}' from '${s.module}'`);
          this.setName(n.as ?? n.name, v, scopes);
        }
        return;
      }
      case 'if':
        for (const [test, body] of s.tests) {
          if (this.isTrue(this.eval(test, scopes))) { this.block(body, scopes); return; }
        }
        if (s.other) this.block(s.other, scopes);
        return;
      case 'for':
        for (const item of this.iterate(this.eval(s.iter, scopes))) {
          this.tick();
          this.assign(s.target, item, scopes);
          try { this.block(s.body, scopes); } catch (e) {
            if (e instanceof BreakSignal) break;
            if (e instanceof ContinueSignal) continue;
            throw e;
          }
        }
        return;
      case 'while':
        while (this.isTrue(this.eval(s.test, scopes))) {
          this.tick();
          try { this.block(s.body, scopes); } catch (e) {
            if (e instanceof BreakSignal) break;
            if (e instanceof ContinueSignal) continue;
            throw e;
          }
          if (frame) { frame.line = s.line; frame.src = s.src; }
        }
        return;
      case 'def': {
        const defaults = s.params.map((p) => (p.def ? this.eval(p.def, scopes) : undefined));
        this.setName(s.name, new PyFunction(s.name, s.params, defaults, s.body, scopes, (f, a, k) => this.callFunction(f, a, k)), scopes);
        return;
      }
      case 'return': throw new ReturnSignal(s.value ? this.eval(s.value, scopes) : null);
      case 'pass': return;
      case 'break': throw new BreakSignal();
      case 'continue': throw new ContinueSignal();
    }
  }

  private importModule(name: string, s: Stmt): PyModule {
    const m = loadModule(name, { read: this.host.read });
    if (m === null) {
      const frame = this.stack[this.stack.length - 1];
      if (frame) { frame.line = s.line; frame.src = s.src; }
      throw new PyError('ModuleNotFoundError', `No module named '${name}'`);
    }
    return m;
  }

  /** 関数の中の代入は、その関数の中の名前にする */
  private setName(name: string, v: Value, scopes: Scope[]): void { (scopes[scopes.length - 1] ?? this.globals).set(name, v); }

  private assign(t: Expr, v: Value, scopes: Scope[]): void {
    switch (t.k) {
      case 'name': this.setName(t.name, v, scopes); return;
      case 'attr': {
        const o = this.eval(t.obj, scopes);
        if (!(o instanceof PyObj)) throw new PyError('AttributeError', `'${typeName(o)}' object has no attribute '${t.name}'`);
        o.setAttr(t.name, v);
        return;
      }
      case 'index': {
        const o = this.eval(t.obj, scopes);
        if (!(o instanceof PyObj)) throw new PyError('TypeError', `'${typeName(o)}' object does not support item assignment`);
        o.setItem(this.eval(t.idx, scopes), v);
        return;
      }
      case 'tuple': case 'list': {
        const items = this.iterate(v);
        if (items.length < t.items.length) throw new PyError('ValueError', `not enough values to unpack (expected ${String(t.items.length)}, got ${String(items.length)})`);
        if (items.length > t.items.length) throw new PyError('ValueError', `too many values to unpack (expected ${String(t.items.length)}, got ${String(items.length)})`);
        t.items.forEach((x, i) => { this.assign(x, items[i] ?? null, scopes); });
        return;
      }
      default: throw new PyError('SyntaxError', 'cannot assign');
    }
  }

  private iterate(v: Value): Value[] { return iterOf(v); }

  private isTrue(v: Value): boolean { return truthy(v); }

  private lookup(name: string, scopes: Scope[]): Value {
    for (let i = scopes.length - 1; i >= 0; i -= 1) {
      const s = scopes[i];
      if (s?.has(name)) return s.get(name) ?? null;
    }
    const b = this.builtins[name];
    if (b !== undefined) return b;
    throw new PyError('NameError', `name '${name}' is not defined`);
  }

  private mark(e: Pos): void {
    const f = this.stack[this.stack.length - 1];
    if (f) f.pos = e;
  }

  eval(e: Expr, scopes: Scope[]): Value {
    this.tick();
    switch (e.k) {
      case 'num': case 'str': case 'const': return e.value;
      case 'fstr': return e.parts.map((p) => {
        if (typeof p === 'string') return p;
        const v = this.eval(p.expr, scopes);
        const shown = p.conv === 'r' ? repr(v) : p.conv === 's' ? str(v) : v;
        return this.format(shown, p.spec ?? '', scopes);
      }).join('');
      case 'name':
        try { return this.lookup(e.name, scopes); } catch (err) { this.mark(e); throw err; }
      case 'list': return new PyList(e.items.map((x) => this.eval(x, scopes)));
      case 'tuple': return new PyTuple(e.items.map((x) => this.eval(x, scopes)));
      case 'set': return new PySet(e.items.map((x) => this.eval(x, scopes)));
      case 'dict': return new PyDict(e.items.map(([k, v]) => [this.eval(k, scopes), this.eval(v, scopes)] as const));
      case 'comp': {
        const out: Value[] = [];
        this.comprehend(e.clauses, 0, [...scopes, new Map<string, Value>()], (s) => { out.push(this.eval(e.elt, s)); });
        return e.kind === 'set' ? new PySet(out) : new PyList(out);
      }
      case 'dictcomp': {
        const out = new PyDict();
        this.comprehend(e.clauses, 0, [...scopes, new Map<string, Value>()], (s) => { out.set(this.eval(e.key, s), this.eval(e.value, s)); });
        return out;
      }
      case 'unary': return this.unary(e, scopes);
      case 'binary': {
        const a = this.eval(e.left, scopes);
        const b = this.eval(e.right, scopes);
        try { return this.binary(e.op, a, b, e.op); } catch (err) { if (err instanceof PyError) this.mark(e); throw err; }
      }
      case 'compare': {
        let left = this.eval(e.first, scopes);
        let result: Value = true;
        for (const [op, r] of e.rest) {
          const right = this.eval(r, scopes);
          try { result = this.compare(op, left, right); } catch (err) { if (err instanceof PyError) this.mark(e); throw err; }
          // 比べが 1 つなら結果をそのまま返す（配列の比べは配列のまま）
          if (e.rest.length === 1) return result;
          if (!this.isTrue(result)) return result;
          left = right;
        }
        return result;
      }
      case 'logic': {
        const a = this.eval(e.left, scopes);
        if (e.op === 'and') return this.isTrue(a) ? this.eval(e.right, scopes) : a;
        return this.isTrue(a) ? a : this.eval(e.right, scopes);
      }
      case 'ternary': return this.isTrue(this.eval(e.test, scopes)) ? this.eval(e.then, scopes) : this.eval(e.other, scopes);
      case 'call': return this.call(e, scopes);
      case 'attr': {
        const o = this.eval(e.obj, scopes);
        try { return this.getAttr(o, e.name); } catch (err) { if (err instanceof PyError) this.mark(e); throw err; }
      }
      case 'index': {
        const o = this.eval(e.obj, scopes);
        const i = this.eval(e.idx, scopes);
        try { return this.getItem(o, i); } catch (err) { if (err instanceof PyError) this.mark(e); throw err; }
      }
      case 'slice': return new PySlice(e.start ? this.eval(e.start, scopes) : null, e.stop ? this.eval(e.stop, scopes) : null, e.step ? this.eval(e.step, scopes) : null);
      case 'lambda': {
        const defaults = e.params.map((p) => (p.def ? this.eval(p.def, scopes) : undefined));
        return new PyFunction('<lambda>', e.params, defaults, e.body, scopes, (f, a, k) => this.callFunction(f, a, k));
      }
    }
  }

  private format(v: Value, spec: string, scopes: Scope[]): string {
    // 書式の中の {幅} は、その場で読む
    const s = spec.replace(/\{([^}]*)\}/g, (_, src: string) => str(this.lookup(src, scopes)));
    return formatValue(v, s);
  }

  private comprehend(clauses: Comp[], at: number, scopes: Scope[], emit: (s: Scope[]) => void): void {
    const c = clauses[at];
    if (!c) { emit(scopes); return; }
    for (const item of this.iterate(this.eval(c.iter, scopes))) {
      this.tick();
      this.assign(c.target, item, scopes);
      if (c.ifs.every((t) => this.isTrue(this.eval(t, scopes)))) this.comprehend(clauses, at + 1, scopes, emit);
    }
  }

  private unary(e: Extract<Expr, { k: 'unary' }>, scopes: Scope[]): Value {
    const v = this.eval(e.arg, scopes);
    if (e.op === 'not') return !this.isTrue(v);
    if (v instanceof PyObj) {
      const r = v.unary(e.op);
      if (r !== undefined) return r;
    }
    if (typeof v === 'bigint') return e.op === '-' ? -v : e.op === '~' ? ~v : v;
    if (typeof v === 'boolean') return e.op === '-' ? BigInt(v ? -1 : 0) : e.op === '~' ? BigInt(v ? -2 : -1) : BigInt(v ? 1 : 0);
    if (typeof v === 'number' && e.op !== '~') return e.op === '-' ? -v : v;
    this.mark(e);
    throw new PyError('TypeError', `bad operand type for unary ${e.op}: '${typeName(v)}'`);
  }

  binary(op: string, a: Value, b: Value, shown: string): Value {
    if (a instanceof PyObj) {
      const r = a.binop(op, b, false);
      if (r !== undefined) return r;
    }
    if (b instanceof PyObj) {
      const r = b.binop(op, a, true);
      if (r !== undefined) return r;
    }
    const x = typeof a === 'boolean' ? BigInt(a ? 1 : 0) : a;
    const y = typeof b === 'boolean' ? BigInt(b ? 1 : 0) : b;
    if (typeof x === 'bigint' && typeof y === 'bigint') {
      switch (op) {
        case '+': return x + y;
        case '-': return x - y;
        case '*': return x * y;
        case '/':
          if (y === 0n) throw new PyError('ZeroDivisionError', 'division by zero');
          return Number(x) / Number(y);
        case '//': {
          if (y === 0n) throw new PyError('ZeroDivisionError', 'integer division or modulo by zero');
          const q = x / y;
          return (x % y !== 0n && (x < 0n) !== (y < 0n)) ? q - 1n : q;
        }
        case '%': {
          if (y === 0n) throw new PyError('ZeroDivisionError', 'integer modulo by zero');
          const m = x % y;
          return m !== 0n && (m < 0n) !== (y < 0n) ? m + y : m;
        }
        case '**': return y >= 0n ? x ** y : Number(x) ** Number(y);
        case '&': return x & y;
        case '|': return x | y;
        case '^': return x ^ y;
        default: break;
      }
    }
    const p = asNumber(x);
    const q = asNumber(y);
    if (p !== null && q !== null) {
      switch (op) {
        case '+': return p + q;
        case '-': return p - q;
        case '*': return p * q;
        case '/':
          if (q === 0) throw new PyError('ZeroDivisionError', 'division by zero');
          return p / q;
        case '//':
          if (q === 0) throw new PyError('ZeroDivisionError', 'division by zero');
          return Math.floor(p / q);
        case '%': {
          if (q === 0) throw new PyError('ZeroDivisionError', 'float modulo');
          const m = p % q;
          return m !== 0 && (m < 0) !== (q < 0) ? m + q : m;
        }
        case '**':
          if (p === 0 && q < 0) throw new PyError('ZeroDivisionError', 'zero to a negative power');
          return p ** q;
        default: break;
      }
    }
    if (typeof x === 'string') {
      if (op === '+' && typeof y === 'string') return x + y;
      if (op === '*' && typeof y === 'bigint') return x.repeat(Math.max(0, Number(y)));
      if (op === '%') return percentFormat(x, y);
    }
    if (typeof y === 'string' && op === '*' && typeof x === 'bigint') return y.repeat(Math.max(0, Number(x)));
    if (op === '+' && (typeof x === 'string' || typeof y === 'string')) {
      if (typeof x === 'string') throw new PyError('TypeError', `can only concatenate str (not "${typeName(y)}") to str`);
    }
    throw new PyError('TypeError', `unsupported operand type(s) for ${shown}: '${typeName(a)}' and '${typeName(b)}'`);
  }

  compare(op: string, a: Value, b: Value): Value {
    if (op === 'is') return a === b || (a === null && b === null);
    if (op === 'is not') return !(a === b || (a === null && b === null));
    if (op === 'in' || op === 'not in') {
      const found = typeof b === 'string' && typeof a === 'string' ? b.includes(a) : this.iterate(b).some((x) => equal(x, a));
      return op === 'in' ? found : !found;
    }
    if (a instanceof PyObj) {
      const r = a.compare(op, b);
      if (r !== undefined) return r;
    }
    if (b instanceof PyObj) {
      const flip: Record<string, string> = { '<': '>', '>': '<', '<=': '>=', '>=': '<=', '==': '==', '!=': '!=' };
      const r = b.compare(flip[op] ?? op, a);
      if (r !== undefined) return r;
    }
    if (op === '==') return equal(a, b);
    if (op === '!=') return !equal(a, b);
    const bad = (): PyError => new PyError('TypeError', `'${op}' not supported between instances of '${typeName(a)}' and '${typeName(b)}'`);
    const numeric = asNumber(a) !== null && asNumber(b) !== null;
    const sameStr = typeof a === 'string' && typeof b === 'string';
    if (!numeric && !sameStr && !(a instanceof PyObj && b instanceof PyObj)) throw bad();
    if (op === '<') return lessThan(a, b);
    if (op === '>') return lessThan(b, a);
    if (op === '<=') return !lessThan(b, a);
    return !lessThan(a, b);
  }

  private getAttr(o: Value, name: string): Value {
    const v = o instanceof PyObj ? o.getAttr(name) : typeof o === 'string' ? strMethod(o, name) : undefined;
    if (v !== undefined) return v;
    if (o instanceof PyModule) throw new PyError('AttributeError', `module '${o.name}' has no attribute '${name}'`);
    throw new PyError('AttributeError', `'${typeName(o)}' object has no attribute '${name}'`);
  }

  private getItem(o: Value, i: Value): Value {
    if (typeof o === 'string') {
      if (i instanceof PySlice) return i.pick([...o]).join('');
      const chars = [...o];
      const at = toInt(i);
      const pos = at < 0 ? at + chars.length : at;
      if (pos < 0 || pos >= chars.length) throw new PyError('IndexError', 'string index out of range');
      return chars[pos] ?? '';
    }
    if (o instanceof PyObj) return o.getItem(i);
    throw new PyError('TypeError', `'${typeName(o)}' object is not subscriptable`);
  }

  private call(e: Extract<Expr, { k: 'call' }>, scopes: Scope[]): Value {
    const f = this.eval(e.fn, scopes);
    const args = e.args.map((a) => this.eval(a, scopes));
    if (e.star) args.push(...this.iterate(this.eval(e.star, scopes)));
    const kw = new Map(e.kwargs.map(([k, v]) => [k, this.eval(v, scopes)] as const));
    if (!(f instanceof PyObj)) { this.mark(e); throw new PyError('TypeError', `'${typeName(f)}' object is not callable`); }
    const frame = this.stack[this.stack.length - 1];
    try {
      const r = f.call(args, kw);
      if (frame) frame.pos = null;
      return r;
    } catch (err) {
      if (err instanceof PyError && frame && frame.pos === null) frame.pos = e;
      throw err;
    }
  }

  private callFunction(f: PyFunction, args: Value[], kw: Kw): Value {
    if (args.length > f.params.length) {
      const req = f.params.length;
      throw new PyError('TypeError', `${f.name}() takes ${String(req)} positional argument${req === 1 ? '' : 's'} but ${String(args.length)} ${args.length === 1 ? 'was' : 'were'} given`);
    }
    const local: Scope = new Map();
    f.params.forEach((p, i) => {
      const v = args[i] ?? kw.get(p.name) ?? f.defaults[i];
      if (v !== undefined) local.set(p.name, v);
    });
    for (const k of kw.keys()) if (!f.params.some((p) => p.name === k)) throw new PyError('TypeError', `${f.name}() got an unexpected keyword argument '${k}'`);
    const missing = f.params.filter((p) => !local.has(p.name)).map((p) => `'${p.name}'`);
    if (missing.length > 0) throw new PyError('TypeError', `${f.name}() missing ${String(missing.length)} required positional argument${missing.length === 1 ? '' : 's'}: ${missing.join(' and ')}`);
    const scopes = [...f.closure, local];
    if (!Array.isArray(f.body)) return this.eval(f.body, scopes);
    if (this.stack.length > 900) throw new PyError('RecursionError', 'maximum recursion depth exceeded');
    this.stack.push({ name: f.name, line: 0, src: '', pos: null });
    try {
      this.block(f.body, scopes);
      this.stack.pop();
      return null;
    } catch (s) {
      if (s instanceof ReturnSignal) { this.stack.pop(); return s.value; }
      throw s;
    }
  }
}

function percentFormat(fmt: string, args: Value): string {
  const list = args instanceof PyTuple ? args.items : [args];
  let i = 0;
  return fmt.replace(/%(%|[-+ 0]*\d*(?:\.\d+)?[dsfrge])/g, (all, spec: string) => {
    if (spec === '%') return '%';
    const v = list[i] ?? null;
    i += 1;
    const type = spec[spec.length - 1] ?? 's';
    const body = spec.slice(0, -1);
    if (type === 's') return formatValue(str(v), body.replace('-', '<'));
    if (type === 'r') return repr(v);
    const n = asNumber(v);
    if (n === null) throw new PyError('TypeError', `%${type} format: a real number is required, not ${typeName(v)}`);
    return formatValue(type === 'd' ? BigInt(Math.trunc(n)) : n, body.replace('-', '<') + type) || all;
  });
}

function strMethod(s: string, name: string): Value | undefined {
  const m = (impl: (a: Value[], k: Kw) => Value): PyBuiltin => fn(name, impl);
  switch (name) {
    case 'upper': return m(() => s.toUpperCase());
    case 'lower': return m(() => s.toLowerCase());
    case 'strip': return m(() => s.trim());
    case 'lstrip': return m(() => s.trimStart());
    case 'rstrip': return m(() => s.trimEnd());
    case 'split': return m((a) => new PyList((a[0] === undefined || a[0] === null ? s.trim().split(/\s+/).filter((x) => x !== '') : s.split(str(a[0])))));
    case 'join': return m((a) => iterOf(a[0] ?? null).map((x) => {
      if (typeof x !== 'string') throw new PyError('TypeError', `sequence item 0: expected str instance, ${typeName(x)} found`);
      return x;
    }).join(s));
    case 'replace': return m((a) => s.split(str(a[0] ?? '')).join(str(a[1] ?? '')));
    case 'startswith': return m((a) => s.startsWith(str(a[0] ?? '')));
    case 'endswith': return m((a) => s.endsWith(str(a[0] ?? '')));
    case 'count': return m((a) => BigInt(s.split(str(a[0] ?? '')).length - 1));
    case 'find': return m((a) => BigInt(s.indexOf(str(a[0] ?? ''))));
    case 'format': return m((a, k) => {
      let auto = 0;
      return s.replace(/\{([^{}:]*)(?::([^{}]*))?\}/g, (_, key: string, spec: string | undefined) => {
        const v = key === '' ? a[auto++] : /^\d+$/.test(key) ? a[Number(key)] : k.get(key);
        return formatValue(v ?? null, spec ?? '');
      });
    });
    default: return undefined;
  }
}

/** Traceback の場所の 3 行目（本物は、行の全体でない時だけ ^ を出す） */
function caretLine(src: string, pos: Pos | Expr | null, line: number): string | null {
  if (pos === null || pos.line !== line || pos.endLine !== line) return null;
  const lead = src.length - src.trimStart().length;
  const trimmedEnd = src.trimEnd().length;
  const width = Math.max(1, pos.endCol - pos.col);
  const at = (s: string): string => `    ${' '.repeat(pos.col - lead)}${s}`;
  // 本物（3.13）は、演算・添字・呼び出しの、効いた所を ^ で、ほかを ~ で示す
  const e = pos as Partial<Expr>;
  if (e.k === 'binary' && e.left && e.right) {
    const text = src.slice(e.left.endCol, e.right.col);
    const opAt = e.left.endCol + (text.length - text.trimStart().length);
    return at('~'.repeat(opAt - pos.col) + '^'.repeat(e.op?.length ?? 1) + '~'.repeat(Math.max(0, pos.endCol - opAt - (e.op?.length ?? 1))));
  }
  if (e.k === 'index' && e.obj) return at('~'.repeat(e.obj.endCol - pos.col) + '^'.repeat(pos.endCol - e.obj.endCol));
  if (e.k === 'call' && e.fn) return at('~'.repeat(e.fn.endCol - pos.col) + '^'.repeat(pos.endCol - e.fn.endCol));
  if (pos.col === lead && pos.endCol >= trimmedEnd) return null;
  return at('^'.repeat(width));
}

/** プログラムを動かす。file は Traceback に出す名前（-c なら <string>） */
export function runPython(source: string, file: string, host: PyHost): PyResult {
  let prog: Stmt[];
  try {
    prog = parseProgram(source);
  } catch (e) {
    if (e instanceof PySyntaxError) {
      const src = source.split('\n')[e.line - 1] ?? '';
      const lead = src.length - src.trimStart().length;
      const carets = e.message === 'unexpected indent' ? '' : `    ${' '.repeat(Math.max(0, e.col - lead))}${'^'.repeat(Math.max(1, e.endCol - e.col))}\n`;
      return { stdout: '', stderr: `  File "${file}", line ${String(e.line)}\n    ${src.trim()}\n${carets}${e.kind}: ${e.message}\n`, code: 1 };
    }
    throw e;
  }
  const interp = new Interp(host);
  try {
    interp.run(prog, '<module>');
    return { stdout: interp.out, stderr: '', code: 0 };
  } catch (e) {
    if (e instanceof PyError) {
      if (e.type === 'SystemExit') return { stdout: interp.out, stderr: '', code: Number(e.message) || 0 };
      const frames = interp.stack.map((f) => {
        const caret = caretLine(f.src, f.pos, f.line);
        return `  File "${file}", line ${String(f.line)}, in ${f.name}\n    ${f.src.trim()}\n${caret === null ? '' : `${caret}\n`}`;
      }).join('');
      const last = e.message === '' ? e.type : `${e.type}: ${e.message}`;
      return { stdout: interp.out, stderr: `Traceback (most recent call last):\n${frames}${last}\n`, code: 1 };
    }
    if (e instanceof BreakSignal || e instanceof ContinueSignal) return { stdout: interp.out, stderr: `  File "${file}", line 1\nSyntaxError: 'break' outside loop\n`, code: 1 };
    if (e instanceof ReturnSignal) return { stdout: interp.out, stderr: `  File "${file}", line 1\nSyntaxError: 'return' outside function\n`, code: 1 };
    throw e;
  }
}
