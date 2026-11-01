/**
 * Python の模擬の値。int は bigint、float は number、bool は boolean、str は string、None は null。
 * それ以外は PyObj の子（リスト・配列・表など）。numpy の数は float・int と同じ物として扱う（print の形は同じ）。
 */

export type Value = null | boolean | bigint | number | string | PyObj;
export type Kw = ReadonlyMap<string, Value>;

export class PyError extends Error {
  constructor(readonly type: string, message: string) { super(message); }
}

export abstract class PyObj {
  abstract readonly typeName: string;
  getAttr(name: string): Value | undefined { void name; return undefined; }
  setAttr(name: string, value: Value): void { void value; throw new PyError('AttributeError', `'${this.typeName}' object has no attribute '${name}'`); }
  repr(): string { return `<${this.typeName} object>`; }
  str(): string { return this.repr(); }
  truthy(): boolean { return true; }
  iter(): Value[] | null { return null; }
  len(): number | null { return null; }
  getItem(i: Value): Value { void i; throw new PyError('TypeError', `'${this.typeName}' object is not subscriptable`); }
  setItem(i: Value, v: Value): void { void [i, v]; throw new PyError('TypeError', `'${this.typeName}' object does not support item assignment`); }
  call(args: Value[], kw: Kw): Value { void [args, kw]; throw new PyError('TypeError', `'${this.typeName}' object is not callable`); }
  /** 演算。扱えなければ undefined（相手か既定の演算へ） */
  binop(op: string, other: Value, reflected: boolean): Value | undefined { void [op, other, reflected]; return undefined; }
  compare(op: string, other: Value): Value | undefined { void [op, other]; return undefined; }
  unary(op: string): Value | undefined { void op; return undefined; }
}

export function typeName(v: Value): string {
  if (v === null) return 'NoneType';
  if (typeof v === 'boolean') return 'bool';
  if (typeof v === 'bigint') return 'int';
  if (typeof v === 'number') return 'float';
  if (typeof v === 'string') return 'str';
  return v.typeName;
}

/** Python の float の書き方（最短の 10 進。指数は -4 より小さいか 16 以上で） */
export function floatRepr(x: number): string {
  if (Number.isNaN(x)) return 'nan';
  if (!Number.isFinite(x)) return x > 0 ? 'inf' : '-inf';
  if (x === 0) return Object.is(x, -0) ? '-0.0' : '0.0';
  const m = /^(-?)(\d)(?:\.(\d+))?e([+-]\d+)$/.exec(x.toExponential());
  if (!m) return String(x);
  const sign = m[1] ?? '';
  const digits = (m[2] ?? '') + (m[3] ?? '');
  const exp = Number(m[4]);
  if (exp < -4 || exp >= 16) {
    const frac = digits.slice(1);
    return `${sign}${digits[0] ?? ''}${frac ? `.${frac}` : ''}e${exp < 0 ? '-' : '+'}${String(Math.abs(exp)).padStart(2, '0')}`;
  }
  if (exp < 0) return `${sign}0.${'0'.repeat(-exp - 1)}${digits}`;
  if (digits.length <= exp + 1) return `${sign}${digits}${'0'.repeat(exp + 1 - digits.length)}.0`;
  return `${sign}${digits.slice(0, exp + 1)}.${digits.slice(exp + 1)}`;
}

function strRepr(s: string): string {
  const q = s.includes("'") && !s.includes('"') ? '"' : "'";
  const body = s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\t/g, '\\t').replace(/\r/g, '\\r');
  return `${q}${q === "'" ? body.replace(/'/g, "\\'") : body}${q}`;
}

export function repr(v: Value): string {
  if (v === null) return 'None';
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  if (typeof v === 'bigint') return v.toString();
  if (typeof v === 'number') return floatRepr(v);
  if (typeof v === 'string') return strRepr(v);
  return v.repr();
}

export function str(v: Value): string {
  if (typeof v === 'string') return v;
  if (v instanceof PyObj) return v.str();
  return repr(v);
}

export function truthy(v: Value): boolean {
  if (v === null) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'bigint') return v !== 0n;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') return v !== '';
  return v.truthy();
}

/** 数として読む（bool・int・float）。読めなければ null */
export function asNumber(v: Value): number | null {
  if (typeof v === 'number') return v;
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'boolean') return v ? 1 : 0;
  return null;
}

export function num(v: Value, what = 'value'): number {
  const n = asNumber(v);
  if (n === null) throw new PyError('TypeError', `${what} must be a real number, not ${typeName(v)}`);
  return n;
}

export function toInt(v: Value): number {
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'boolean') return v ? 1 : 0;
  throw new PyError('TypeError', `'${typeName(v)}' object cannot be interpreted as an integer`);
}

export class PyList extends PyObj {
  readonly typeName = 'list';
  constructor(public items: Value[]) { super(); }
  override repr(): string { return `[${this.items.map(repr).join(', ')}]`; }
  override truthy(): boolean { return this.items.length > 0; }
  override iter(): Value[] { return this.items; }
  override len(): number { return this.items.length; }
  override getItem(i: Value): Value {
    if (i instanceof PySlice) return new PyList(i.pick(this.items));
    return this.items[seqIndex(i, this.items.length, 'list')] ?? null;
  }
  override setItem(i: Value, v: Value): void { this.items[seqIndex(i, this.items.length, 'list', 'assignment ')] = v; }
  override getAttr(name: string): Value | undefined {
    const items = this.items;
    switch (name) {
      case 'append': return fn('append', (a) => { items.push(a[0] ?? null); return null; });
      case 'extend': return fn('extend', (a) => { items.push(...iterOf(a[0] ?? null)); return null; });
      case 'pop': return fn('pop', (a) => {
        if (items.length === 0) throw new PyError('IndexError', 'pop from empty list');
        const at = a[0] === undefined ? items.length - 1 : seqIndex(a[0], items.length, 'pop');
        return items.splice(at, 1)[0] ?? null;
      });
      case 'sort': return fn('sort', (_a, kw) => { sortValues(items, kw); return null; });
      case 'reverse': return fn('reverse', () => { items.reverse(); return null; });
      case 'index': return fn('index', (a) => {
        const at = items.findIndex((x) => equal(x, a[0] ?? null));
        if (at < 0) throw new PyError('ValueError', `${repr(a[0] ?? null)} is not in list`);
        return BigInt(at);
      });
      case 'count': return fn('count', (a) => BigInt(items.filter((x) => equal(x, a[0] ?? null)).length));
      default: return undefined;
    }
  }
  override binop(op: string, other: Value, reflected: boolean): Value | undefined {
    if (op === '+' && other instanceof PyList) return new PyList(reflected ? [...other.items, ...this.items] : [...this.items, ...other.items]);
    if (op === '*' && typeof other === 'bigint') return new PyList(Array.from({ length: Math.max(0, Number(other)) }, () => this.items).flat());
    return undefined;
  }
  override compare(op: string, other: Value): Value | undefined {
    if (!(other instanceof PyList)) return op === '==' ? false : op === '!=' ? true : undefined;
    const same = this.items.length === other.items.length && this.items.every((x, i) => equal(x, other.items[i] ?? null));
    return op === '==' ? same : op === '!=' ? !same : undefined;
  }
}

export class PyTuple extends PyObj {
  readonly typeName = 'tuple';
  constructor(public items: Value[]) { super(); }
  override repr(): string { return this.items.length === 1 ? `(${repr(this.items[0] ?? null)},)` : `(${this.items.map(repr).join(', ')})`; }
  override truthy(): boolean { return this.items.length > 0; }
  override iter(): Value[] { return this.items; }
  override len(): number { return this.items.length; }
  override getItem(i: Value): Value {
    if (i instanceof PySlice) return new PyTuple(i.pick(this.items));
    return this.items[seqIndex(i, this.items.length, 'tuple')] ?? null;
  }
  override binop(op: string, other: Value, reflected: boolean): Value | undefined {
    if (op === '+' && other instanceof PyTuple) return new PyTuple(reflected ? [...other.items, ...this.items] : [...this.items, ...other.items]);
    return undefined;
  }
  override compare(op: string, other: Value): Value | undefined {
    if (!(other instanceof PyTuple)) return op === '==' ? false : op === '!=' ? true : undefined;
    const same = this.items.length === other.items.length && this.items.every((x, i) => equal(x, other.items[i] ?? null));
    return op === '==' ? same : op === '!=' ? !same : undefined;
  }
}

export class PySet extends PyObj {
  readonly typeName = 'set';
  items: Value[] = [];
  constructor(items: readonly Value[]) { super(); for (const x of items) this.add(x); }
  add(x: Value): void { if (!this.items.some((y) => equal(x, y))) this.items.push(x); }
  override repr(): string { return this.items.length === 0 ? 'set()' : `{${this.items.map(repr).join(', ')}}`; }
  override truthy(): boolean { return this.items.length > 0; }
  override iter(): Value[] { return this.items; }
  override len(): number { return this.items.length; }
  override getAttr(name: string): Value | undefined {
    if (name === 'add') return fn('add', (a) => { this.add(a[0] ?? null); return null; });
    return undefined;
  }
}

const keyOf = (k: Value): string => {
  const n = asNumber(k);
  if (n !== null) return `n${String(n)}`;
  if (typeof k === 'string') return `s${k}`;
  if (k === null) return 'none';
  if (k instanceof PyTuple) return `t${k.items.map(keyOf).join('\u0000')}`;
  throw new PyError('TypeError', `unhashable type: '${typeName(k)}'`);
};

export class PyDict extends PyObj {
  readonly typeName = 'dict';
  readonly map = new Map<string, [Value, Value]>();
  constructor(entries: readonly (readonly [Value, Value])[] = []) { super(); for (const [k, v] of entries) this.set(k, v); }
  set(k: Value, v: Value): void { this.map.set(keyOf(k), [k, v]); }
  has(k: Value): boolean { return this.map.has(keyOf(k)); }
  entries(): [Value, Value][] { return [...this.map.values()]; }
  override repr(): string { return `{${this.entries().map(([k, v]) => `${repr(k)}: ${repr(v)}`).join(', ')}}`; }
  override truthy(): boolean { return this.map.size > 0; }
  override iter(): Value[] { return this.entries().map(([k]) => k); }
  override len(): number { return this.map.size; }
  override getItem(i: Value): Value {
    const e = this.map.get(keyOf(i));
    if (!e) throw new PyError('KeyError', repr(i));
    return e[1];
  }
  override setItem(i: Value, v: Value): void { this.set(i, v); }
  override getAttr(name: string): Value | undefined {
    switch (name) {
      case 'keys': return fn('keys', () => new PyList(this.entries().map(([k]) => k)));
      case 'values': return fn('values', () => new PyList(this.entries().map(([, v]) => v)));
      case 'items': return fn('items', () => new PyList(this.entries().map(([k, v]) => new PyTuple([k, v]))));
      case 'get': return fn('get', (a) => this.map.get(keyOf(a[0] ?? null))?.[1] ?? a[1] ?? null);
      default: return undefined;
    }
  }
}

export class PySlice extends PyObj {
  readonly typeName = 'slice';
  constructor(readonly start: Value, readonly stop: Value, readonly step: Value) { super(); }
  /** その長さの列で選ばれる位置 */
  indices(n: number): number[] {
    const step = this.step === null ? 1 : toInt(this.step);
    if (step === 0) throw new PyError('ValueError', 'slice step cannot be zero');
    const clamp = (v: Value, def: number): number => {
      if (v === null) return def;
      const i = toInt(v);
      const at = i < 0 ? i + n : i;
      return step > 0 ? Math.min(Math.max(at, 0), n) : Math.min(Math.max(at, -1), n - 1);
    };
    const a = clamp(this.start, step > 0 ? 0 : n - 1);
    const b = clamp(this.stop, step > 0 ? n : -1);
    const out: number[] = [];
    for (let i = a; step > 0 ? i < b : i > b; i += step) out.push(i);
    return out;
  }
  pick<T>(xs: readonly T[]): T[] { return this.indices(xs.length).map((i) => xs[i] as T); }
}

export class PyBuiltin extends PyObj {
  readonly typeName = 'builtin_function_or_method';
  constructor(readonly name: string, readonly impl: (args: Value[], kw: Kw) => Value) { super(); }
  override call(args: Value[], kw: Kw): Value { return this.impl(args, kw); }
  override repr(): string { return `<built-in function ${this.name}>`; }
}

export const fn = (name: string, impl: (args: Value[], kw: Kw) => Value): PyBuiltin => new PyBuiltin(name, impl);

export class PyModule extends PyObj {
  readonly typeName = 'module';
  constructor(readonly name: string, readonly attrs: Readonly<Record<string, Value>>) { super(); }
  override getAttr(name: string): Value | undefined { return this.attrs[name]; }
  override repr(): string { return `<module '${this.name}'>`; }
}

export function seqIndex(i: Value, n: number, what: string, extra = ''): number {
  if (typeof i !== 'bigint' && typeof i !== 'boolean') throw new PyError('TypeError', `${what} indices must be integers or slices, not ${typeName(i)}`);
  const at = toInt(i);
  const pos = at < 0 ? at + n : at;
  if (pos < 0 || pos >= n) throw new PyError('IndexError', `${what} ${extra}index out of range`);
  return pos;
}

export function iterOf(v: Value): Value[] {
  if (typeof v === 'string') return [...v];
  if (v instanceof PyObj) {
    const it = v.iter();
    if (it !== null) return it;
  }
  throw new PyError('TypeError', `'${typeName(v)}' object is not iterable`);
}

export function equal(a: Value, b: Value): boolean {
  const x = asNumber(a);
  const y = asNumber(b);
  if (x !== null && y !== null) return x === y;
  if (a instanceof PyObj) {
    const r = a.compare('==', b);
    return r === undefined ? a === b : truthy(r);
  }
  return a === b;
}

export function lessThan(a: Value, b: Value): boolean {
  const x = asNumber(a);
  const y = asNumber(b);
  if (x !== null && y !== null) return x < y;
  if (typeof a === 'string' && typeof b === 'string') return a < b;
  if ((a instanceof PyTuple && b instanceof PyTuple) || (a instanceof PyList && b instanceof PyList)) {
    const n = Math.min(a.items.length, b.items.length);
    for (let i = 0; i < n; i += 1) {
      const p = a.items[i] ?? null;
      const q = b.items[i] ?? null;
      if (!equal(p, q)) return lessThan(p, q);
    }
    return a.items.length < b.items.length;
  }
  throw new PyError('TypeError', `'<' not supported between instances of '${typeName(a)}' and '${typeName(b)}'`);
}

export function sortValues(items: Value[], kw: Kw): void {
  const key = kw.get('key') ?? null;
  const keyed = items.map((x) => ({ x, k: key instanceof PyObj ? key.call([x], new Map()) : x }));
  keyed.sort((a, b) => (lessThan(a.k, b.k) ? -1 : lessThan(b.k, a.k) ? 1 : 0));
  if (kw.get('reverse') !== undefined && truthy(kw.get('reverse') ?? null)) keyed.reverse();
  items.splice(0, items.length, ...keyed.map((e) => e.x));
}

/** 引数を名前で受け取る。位置 → 名前の順に並べ、余れば本物と同じ形で断る */
export function bind(fnName: string, names: readonly string[], args: readonly Value[], kw: Kw): (Value | undefined)[] {
  if (args.length > names.length) throw new PyError('TypeError', `${fnName}() takes at most ${String(names.length)} arguments (${String(args.length)} given)`);
  const out: (Value | undefined)[] = names.map((_, i) => args[i]);
  for (const [k, v] of kw) {
    const at = names.indexOf(k);
    if (at < 0) throw new PyError('TypeError', `${fnName}() got an unexpected keyword argument '${k}'`);
    out[at] = v;
  }
  return out;
}

/** 四捨五入でなく、Python と同じく 2 進の正確な値で丸めた小数の文字列（ちょうど真ん中は偶数へ） */
export function fixed(x: number, digits: number): string {
  if (!Number.isFinite(x)) return Number.isNaN(x) ? 'nan' : x > 0 ? 'inf' : '-inf';
  const s = x.toFixed(digits);
  // ちょうど真ん中（2 進で表せる 0.125 など）だけ、toFixed は上へ丸めるので偶数へ直す
  if (digits <= 15) {
    const scaled = Math.abs(x) * 10 ** digits;
    const floor = Math.floor(scaled);
    if (scaled - floor === 0.5 && scaled / 10 ** digits === Math.abs(x) && floor % 2 === 0) {
      const r = (floor / 10 ** digits).toFixed(digits);
      return x < 0 ? `-${r}` : r;
    }
  }
  return s;
}

/** 書式の小さな言語（[[埋める字]揃え][符号][0][幅][,][.桁][種類]） */
export function formatValue(v: Value, spec: string): string {
  if (spec === '') return str(v);
  const m = /^(?:(.)?([<>^=]))?([-+ ])?(#)?(0)?(\d+)?([,_])?(?:\.(\d+))?([bcdeEfFgGnosxX%])?$/su.exec(spec);
  if (!m) throw new PyError('ValueError', `Invalid format specifier '${spec}' for object of type '${typeName(v)}'`);
  const [, fill, align, sign, , zero, widthS, group, precS, type] = m;
  const width = widthS ? Number(widthS) : 0;
  const prec = precS === undefined ? undefined : Number(precS);
  let body: string;
  const isNum = asNumber(v) !== null;
  if (!isNum) {
    if (type !== undefined && type !== 's') throw new PyError('ValueError', `Unknown format code '${type}' for object of type '${typeName(v)}'`);
    body = str(v);
    if (prec !== undefined) body = body.slice(0, prec);
  } else {
    const n = asNumber(v) ?? 0;
    const isIntVal = typeof v === 'bigint' || typeof v === 'boolean';
    switch (type) {
      case undefined: body = prec !== undefined ? generalFormat(n, prec) : str(typeof v === 'boolean' ? (v ? 1n : 0n) : v); break;
      case 'd': {
        if (!isIntVal) throw new PyError('ValueError', "Unknown format code 'd' for object of type 'float'");
        body = String(n);
        break;
      }
      case 'f': case 'F': body = fixed(n, prec ?? 6); break;
      case '%': body = `${fixed(n * 100, prec ?? 6)}%`; break;
      case 'e': case 'E': {
        const t = n.toExponential(prec ?? 6).replace(/e([+-])(\d)$/, 'e$10$2');
        body = type === 'E' ? t.toUpperCase() : t;
        break;
      }
      case 'g': case 'G': body = generalFormat(n, prec ?? 6); break;
      default: throw new PyError('ValueError', `Unknown format code '${type ?? ''}' for object of type '${typeName(v)}'`);
    }
    if (group) {
      const [i = '', f] = body.replace('-', '').split('.');
      const neg = body.startsWith('-');
      body = `${neg ? '-' : ''}${i.replace(/\B(?=(\d{3})+(?!\d))/g, group)}${f === undefined ? '' : `.${f}`}`;
    }
    if (n >= 0 && !body.startsWith('-')) { if (sign === '+') body = `+${body}`; else if (sign === ' ') body = ` ${body}`; }
  }
  const pad = Math.max(0, width - [...body].length);
  if (zero && isNum && !align) {
    const signChar = /^[-+ ]/.test(body) ? body[0] ?? '' : '';
    return signChar + '0'.repeat(pad) + body.slice(signChar.length);
  }
  const f = fill ?? ' ';
  const a = align ?? (isNum ? '>' : '<');
  if (a === '<') return body + f.repeat(pad);
  if (a === '^') return f.repeat(Math.floor(pad / 2)) + body + f.repeat(Math.ceil(pad / 2));
  return f.repeat(pad) + body;
}

function generalFormat(x: number, precision: number): string {
  if (x === 0) return '0';
  const p = precision === 0 ? 1 : precision;
  const exp = Math.floor(Math.log10(Math.abs(Number(x.toPrecision(p)))));
  if (exp < -4 || exp >= p) {
    return x.toExponential(p - 1).replace(/\.?0+e/, 'e').replace(/e([+-])(\d)$/, 'e$10$2');
  }
  const s = fixed(x, Math.max(0, p - 1 - exp));
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}
