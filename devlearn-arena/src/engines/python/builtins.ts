import { NdArray } from './numpy';
import { Series } from './pandas';
import {
  asNumber, bind, fixed, fn, formatValue, iterOf, lessThan, num, PyDict, PyError, PyList, PyObj, PySet, PyTuple, repr, sortValues, str, toInt, truthy, typeName, type Value,
} from './values';
import type { PyHost } from './interp';

/** 組み込みの関数と型（print・len・range など） */

class PyRange extends PyObj {
  readonly typeName = 'range';
  constructor(readonly start: number, readonly stop: number, readonly step: number) { super(); }
  override iter(): Value[] {
    const out: Value[] = [];
    for (let i = this.start; this.step > 0 ? i < this.stop : i > this.stop; i += this.step) out.push(BigInt(i));
    return out;
  }
  override len(): number { return Math.max(0, Math.ceil((this.stop - this.start) / this.step)); }
  override repr(): string { return this.step === 1 ? `range(${String(this.start)}, ${String(this.stop)})` : `range(${String(this.start)}, ${String(this.stop)}, ${String(this.step)})`; }
  override getItem(i: Value): Value { return this.iter()[toInt(i)] ?? null; }
}

/** 型の名前を返す呼び出しの代わり（type(x).__name__ を少しだけ） */
class PyType extends PyObj {
  readonly typeName = 'type';
  constructor(readonly name: string) { super(); }
  override repr(): string { return `<class '${this.name}'>`; }
  override getAttr(n: string): Value | undefined { return n === '__name__' ? this.name : undefined; }
}

function pyRound(x: number, digits: number): number {
  return Number(fixed(x, digits));
}

export function makeBuiltins(io: { print: (s: string) => void; host: PyHost }): Readonly<Record<string, Value>> {
  const conv = (name: string, impl: (v: Value) => Value, none: Value): Value => fn(name, (a) => (a.length === 0 ? none : impl(a[0] ?? null)));
  const numericArg = (name: string, v: Value): number => {
    if (v instanceof PyObj && (v.len() ?? 0) === 1) return num(v.iter()?.[0] ?? null, name);
    return num(v, `${name}() argument`);
  };
  return {
    print: fn('print', (a, kw) => {
      const sep = kw.get('sep');
      const end = kw.get('end');
      io.print(a.map(str).join(sep === undefined || sep === null ? ' ' : str(sep)) + (end === undefined || end === null ? '\n' : str(end)));
      return null;
    }),
    len: fn('len', (a) => {
      const v = a[0] ?? null;
      if (typeof v === 'string') return BigInt([...v].length);
      const n = v instanceof PyObj ? v.len() : null;
      if (n === null) throw new PyError('TypeError', `object of type '${typeName(v)}' has no len()`);
      return BigInt(n);
    }),
    range: fn('range', (a) => {
      const n = a.map(toInt);
      if (n.length === 0) throw new PyError('TypeError', 'range expected at least 1 argument, got 0');
      const [x = 0, y, z = 1] = n;
      return y === undefined ? new PyRange(0, x, 1) : new PyRange(x, y, z);
    }),
    int: conv('int', (v) => {
      if (typeof v === 'string') {
        if (!/^\s*[-+]?\d+\s*$/.test(v)) throw new PyError('ValueError', `invalid literal for int() with base 10: ${repr(v)}`);
        return BigInt(v.trim());
      }
      return BigInt(Math.trunc(numericArg('int', v)));
    }, 0n),
    float: conv('float', (v) => {
      if (typeof v === 'string') {
        const n = Number(v);
        if (v.trim() === '' || Number.isNaN(n)) throw new PyError('ValueError', `could not convert string to float: ${repr(v)}`);
        return n;
      }
      return numericArg('float', v);
    }, 0),
    str: conv('str', (v) => str(v), ''),
    bool: conv('bool', (v) => truthy(v), false),
    list: conv('list', (v) => new PyList([...iterOf(v)]), new PyList([])),
    tuple: conv('tuple', (v) => new PyTuple([...iterOf(v)]), new PyTuple([])),
    set: conv('set', (v) => new PySet(iterOf(v)), new PySet([])),
    dict: fn('dict', (a, kw) => {
      const d = new PyDict();
      if (a[0] instanceof PyDict) for (const [k, v] of a[0].entries()) d.set(k, v);
      else if (a[0] !== undefined) for (const p of iterOf(a[0])) { const [k = null, v = null] = iterOf(p); d.set(k, v); }
      for (const [k, v] of kw) d.set(k, v);
      return d;
    }),
    abs: fn('abs', (a) => {
      const v = a[0] ?? null;
      if (typeof v === 'bigint') return v < 0n ? -v : v;
      if (v instanceof NdArray || v instanceof Series) return v.unary('abs') ?? null;
      return Math.abs(num(v, 'abs() argument'));
    }),
    sum: fn('sum', (a) => {
      let total: Value = a[1] ?? 0n;
      for (const x of iterOf(a[0] ?? null)) {
        if (typeof total === 'bigint' && (typeof x === 'bigint' || typeof x === 'boolean')) total += typeof x === 'boolean' ? (x ? 1n : 0n) : x;
        else {
          const n = asNumber(x);
          if (n === null) throw new PyError('TypeError', `unsupported operand type(s) for +: '${typeName(total)}' and '${typeName(x)}'`);
          total = num(total) + n;
        }
      }
      return total;
    }),
    min: fn('min', (a, kw) => extreme('min', a, kw, false)),
    max: fn('max', (a, kw) => extreme('max', a, kw, true)),
    round: fn('round', (a, kw) => {
      const [x = null, d] = bind('round', ['number', 'ndigits'], a, kw);
      if (x instanceof NdArray) return x.rounded(d === undefined || d === null ? 0 : toInt(d));
      if (x instanceof Series) return x.rounded(d === undefined || d === null ? 0 : toInt(d));
      if (typeof x === 'bigint') return x;
      const n = num(x, 'round() argument');
      if (d === undefined || d === null) {
        if (!Number.isFinite(n)) throw new PyError('ValueError', 'cannot convert float NaN to integer');
        return BigInt(fixed(n, 0).replace('-0', '0'));
      }
      return pyRound(n, toInt(d));
    }),
    sorted: fn('sorted', (a, kw) => {
      const items = [...iterOf(a[0] ?? null)];
      sortValues(items, kw);
      return new PyList(items);
    }),
    reversed: fn('reversed', (a) => new PyList([...iterOf(a[0] ?? null)].reverse())),
    enumerate: fn('enumerate', (a, kw) => {
      const start = a[1] ?? kw.get('start') ?? 0n;
      return new PyList(iterOf(a[0] ?? null).map((x, i) => new PyTuple([BigInt(i + toInt(start)), x])));
    }),
    zip: fn('zip', (a) => {
      const lists = a.map(iterOf);
      const n = lists.length === 0 ? 0 : Math.min(...lists.map((l) => l.length));
      return new PyList(Array.from({ length: n }, (_, i) => new PyTuple(lists.map((l) => l[i] ?? null))));
    }),
    map: fn('map', (a) => {
      const f = a[0] ?? null;
      if (!(f instanceof PyObj)) throw new PyError('TypeError', `'${typeName(f)}' object is not callable`);
      return new PyList(iterOf(a[1] ?? null).map((x) => f.call([x], new Map())));
    }),
    filter: fn('filter', (a) => {
      const f = a[0] ?? null;
      return new PyList(iterOf(a[1] ?? null).filter((x) => (f instanceof PyObj ? truthy(f.call([x], new Map())) : truthy(x))));
    }),
    any: fn('any', (a) => iterOf(a[0] ?? null).some(truthy)),
    all: fn('all', (a) => iterOf(a[0] ?? null).every(truthy)),
    isinstance: fn('isinstance', (a) => {
      const t = a[1];
      const name = t instanceof PyType ? t.name : t instanceof PyObj && 'name' in t ? String((t as unknown as { name: unknown }).name) : '';
      return typeName(a[0] ?? null) === name;
    }),
    type: fn('type', (a) => new PyType(typeName(a[0] ?? null))),
    repr: fn('repr', (a) => repr(a[0] ?? null)),
    hasattr: fn('hasattr', (a) => { const o = a[0] ?? null; return o instanceof PyObj && o.getAttr(str(a[1] ?? '')) !== undefined; }),
    format: fn('format', (a) => formatValue(a[0] ?? null, str(a[1] ?? ''))),
    pow: fn('pow', (a) => num(a[0] ?? null) ** num(a[1] ?? null)),
    divmod: fn('divmod', (a) => {
      const x = num(a[0] ?? null);
      const y = num(a[1] ?? null);
      if (y === 0) throw new PyError('ZeroDivisionError', 'integer division or modulo by zero');
      return new PyTuple([BigInt(Math.floor(x / y)), BigInt(x - Math.floor(x / y) * y)]);
    }),
    open: fn('open', (a) => {
      const path = str(a[0] ?? '');
      const mode = a[1] === undefined ? 'r' : str(a[1]);
      if (mode.startsWith('r') && io.host.read(path) === null) throw new PyError('FileNotFoundError', `[Errno 2] No such file or directory: ${repr(path)}`);
      throw new PyError('NotImplementedError', 'open() is not available in this practice');
    }),
  };
}

function extreme(name: string, a: Value[], kw: ReadonlyMap<string, Value>, wantMax: boolean): Value {
  const key = kw.get('key') ?? null;
  const items = a.length === 1 ? iterOf(a[0] ?? null) : a;
  if (items.length === 0) throw new PyError('ValueError', `${name}() iterable argument is empty`);
  const keyOf = (x: Value): Value => (key instanceof PyObj ? key.call([x], new Map()) : x);
  let best = items[0] ?? null;
  let bestKey = keyOf(best);
  for (const x of items.slice(1)) {
    const k = keyOf(x);
    if (wantMax ? lessThan(bestKey, k) : lessThan(k, bestKey)) { best = x; bestKey = k; }
  }
  return best;
}
