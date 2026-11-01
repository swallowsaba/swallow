import { aggregate, broadcast, mean, NdArray, percentile, type DType } from './numpy';
import {
  bind, fn, iterOf, num, PyDict, PyError, PyList, PyModule, PyObj, PySlice, PyTuple, repr, str, toInt, truthy, type Kw, type Value,
} from './values';

/** pandas の模擬: 実戦に要る範囲の Series と DataFrame。表示の形は本物と同じ（右揃え・列の小数の桁を揃える） */

type Label = string | number;

const labelValue = (l: Label): Value => (typeof l === 'number' ? (Number.isInteger(l) ? BigInt(l) : l) : l);

/** df.columns・df.index（並びとして読め、tolist がある） */
class PdIndex extends PyList {
  override getAttr(name: string): Value | undefined {
    if (name === 'tolist') return fn(name, () => new PyList([...this.items]));
    return super.getAttr(name);
  }
  override repr(): string {
    if (this.items.every((x) => typeof x === 'bigint')) {
      const n = this.items.length;
      return `RangeIndex(start=0, stop=${String(n)}, step=1)`;
    }
    return `Index([${this.items.map(repr).join(', ')}], dtype='object')`;
  }
}

/** 欠けた値を除いた組の相関係数 */
function pearson(a: readonly number[], b: readonly number[]): number {
  const keep = a.map((v, i) => [v, b[i] ?? Number.NaN] as const).filter(([p, q]) => !Number.isNaN(p) && !Number.isNaN(q));
  const mx = mean(keep.map(([p]) => p));
  const my = mean(keep.map(([, q]) => q));
  return keep.reduce((s, [p, q]) => s + (p - mx) * (q - my), 0) / Math.sqrt(keep.reduce((s, [p]) => s + (p - mx) ** 2, 0) * keep.reduce((s, [, q]) => s + (q - my) ** 2, 0));
}
const toLabel = (v: Value): Label => (typeof v === 'string' ? v : num(v));
const dtypeName = (d: DType): string => (d === 'str' ? 'object' : d);

/** 列の値を、表示の文字にする（小数は 6 桁までで、列の全てに要る桁に揃える） */
function formatColumn(a: NdArray): string[] {
  if (a.dtype === 'str') return a.data.map(String);
  if (a.dtype === 'bool') return a.nums.map((x) => (x ? 'True' : 'False'));
  if (a.dtype === 'int64') return a.nums.map(String);
  const finite = a.nums.filter((x) => Number.isFinite(x));
  const big = finite.some((x) => Math.abs(x) >= 1e15);
  const small = finite.filter((x) => x !== 0).some((x) => Math.abs(x) < 1e-5);
  if (big || small) {
    return a.nums.map((x) => (Number.isFinite(x) ? x.toExponential(6).replace(/e([+-])(\d)$/, 'e$10$2') : 'NaN'));
  }
  let digits = 0;
  for (const x of finite) {
    const f = x.toFixed(6).split('.')[1]?.replace(/0+$/, '') ?? '';
    digits = Math.max(digits, f.length);
  }
  digits = Math.max(1, digits);
  return a.nums.map((x) => (Number.isNaN(x) ? 'NaN' : x.toFixed(digits)));
}

/** 値の前の 1 字（負の数は符号がその場所に入る） */
const leading = (c: string): string => (c.startsWith('-') ? c : ` ${c}`);

/** 表の行を揃える。1 列目（見出しの列）は左、ほかは右に揃え、列の間は sep */
const pad = (rows: string[][], sep = ' '): string => {
  const widths: number[] = [];
  for (const r of rows) r.forEach((c, i) => { widths[i] = Math.max(widths[i] ?? 0, [...c].length); });
  return rows.map((r) => r.map((c, i) => (i === 0 ? c.padEnd(widths[i] ?? 0) : c.padStart(widths[i] ?? 0))).join(sep)).join('\n');
};

function arrOf(v: Value): NdArray {
  if (v instanceof Series) return v.values;
  return NdArray.from(v);
}

function numericOnly(a: NdArray, what: string): NdArray {
  if (a.dtype === 'str') throw new PyError('TypeError', `agg function failed [how->${what},dtype->object]`);
  return a;
}

export class Series extends PyObj {
  readonly typeName = 'Series';
  constructor(readonly values: NdArray, readonly index: Label[], readonly name: string | null = null, readonly indexName: string | null = null) { super(); }

  toArray(): NdArray { return this.values; }
  override iter(): Value[] { return this.values.iter(); }
  override len(): number { return this.values.size; }

  override truthy(): boolean {
    throw new PyError('ValueError', 'The truth value of a Series is ambiguous. Use a.empty, a.bool(), a.item(), a.any() or a.all().');
  }

  private same(values: NdArray): Series { return new Series(values, this.index, this.name, this.indexName); }

  override binop(op: string, other: Value, reflected: boolean): Value | undefined {
    if (other instanceof DataFrame) return undefined;
    const o = other instanceof Series ? other.values : other instanceof NdArray ? other : other === null || typeof other === 'string' ? (typeof other === 'string' ? new NdArray([], [other], 'str') : null) : NdArray.from(other);
    if (o === null) return undefined;
    return this.same(reflected ? broadcast(op, o, this.values) : broadcast(op, this.values, o));
  }

  override compare(op: string, other: Value): Value | undefined {
    const o = other instanceof Series ? other.values : typeof other === 'string' ? new NdArray([], [other], 'str') : other === null ? null : NdArray.from(other);
    return o === null ? undefined : this.same(broadcast(op, this.values, o));
  }

  override unary(op: string): Value | undefined {
    if (op === 'abs') return this.same(this.values.mapF(Math.abs));
    if (op === '-') return this.same(this.values.mapF((x) => -x, this.values.dtype));
    if (op === '~') return this.same(this.values.mapF((x) => (x ? 0 : 1), 'bool'));
    return undefined;
  }

  rounded(d: number): Series { return this.same(this.values.rounded(d)); }

  override getItem(i: Value): Value {
    if (i instanceof Series || i instanceof NdArray || i instanceof PyList) {
      const mask = arrOf(i);
      if (mask.dtype === 'bool') {
        const keep: number[] = [];
        mask.nums.forEach((m, at) => { if (m) keep.push(at); });
        return this.pick(keep);
      }
    }
    if (i instanceof PySlice) return this.pick(i.indices(this.values.size));
    const label = toLabel(i);
    const at = this.index.indexOf(label);
    if (at < 0) throw new PyError('KeyError', repr(i));
    return this.values.elem(at);
  }

  pick(at: number[]): Series {
    return new Series(new NdArray([at.length], at.map((p) => this.values.data[p] ?? 0), this.values.dtype), at.map((p) => this.index[p] ?? p), this.name, this.indexName);
  }

  private clean(): number[] { return numericOnly(this.values, 'mean').nums.filter((x) => !Number.isNaN(x)); }

  override getAttr(name: string): Value | undefined {
    const stat = (s: (xs: number[]) => number): Value => fn(name, () => s(this.clean()));
    const wrapInt = (x: number): Value => (this.values.dtype === 'float64' ? x : BigInt(x));
    switch (name) {
      case 'values': return this.values;
      case 'index': return new PdIndex(this.index.map(labelValue));
      case 'name': return this.name;
      case 'dtype': return dtypeName(this.values.dtype);
      case 'shape': return new PyTuple([BigInt(this.values.size)]);
      case 'size': return BigInt(this.values.size);
      case 'to_numpy': return fn(name, () => this.values);
      case 'tolist': return fn(name, () => new PyList(this.values.iter()));
      case 'to_list': return fn(name, () => new PyList(this.values.iter()));
      case 'mean': return stat(mean);
      case 'median': return stat((x) => percentile(x, 50));
      case 'sum': return fn(name, () => wrapInt(this.clean().reduce((a, b) => a + b, 0)));
      case 'min': return fn(name, () => wrapInt(Math.min(...this.clean())));
      case 'max': return fn(name, () => wrapInt(Math.max(...this.clean())));
      case 'count': return fn(name, () => BigInt(this.clean().length));
      case 'std': case 'var': return fn(name, (a, kw) => {
        const dd = a[0] ?? kw.get('ddof');
        const r = aggregate(name, new NdArray([this.clean().length], this.clean(), 'float64'), null, new Map([['ddof', dd ?? 1n]]));
        return r;
      });
      case 'quantile': return fn(name, (a, kw) => {
        const q = a[0] ?? kw.get('q') ?? 0.5;
        return percentile(this.clean(), num(q) * 100);
      });
      case 'describe': return fn(name, () => describe(this));
      case 'value_counts': return fn(name, () => {
        const seen = new Map<number | string, number>();
        for (const v of this.values.data) seen.set(v, (seen.get(v) ?? 0) + 1);
        const pairs = [...seen].sort((a, b) => b[1] - a[1]);
        const shown = (x: number | string): Label => (this.values.dtype === 'bool' ? (x ? 'True' : 'False') : x);
        return new Series(new NdArray([pairs.length], pairs.map((p) => p[1]), 'int64'), pairs.map((p) => shown(p[0])), 'count', this.name);
      });
      case 'unique': return fn(name, () => { const u = [...new Set(this.values.data)]; return new NdArray([u.length], u, this.values.dtype); });
      case 'nunique': return fn(name, () => BigInt(new Set(this.values.data).size));
      case 'isna': case 'isnull': return fn(name, () => this.same(new NdArray([this.values.size], this.values.data.map((x) => (typeof x === 'number' && Number.isNaN(x) ? 1 : 0)), 'bool')));
      case 'notna': return fn(name, () => this.same(new NdArray([this.values.size], this.values.data.map((x) => (typeof x === 'number' && Number.isNaN(x) ? 0 : 1)), 'bool')));
      case 'fillna': return fn(name, (a) => { const v = num(a[0] ?? 0n); return this.same(this.values.mapF((x) => (Number.isNaN(x) ? v : x), 'float64')); });
      case 'dropna': return fn(name, () => { const keep: number[] = []; this.values.data.forEach((x, i) => { if (!(typeof x === 'number' && Number.isNaN(x))) keep.push(i); }); return this.pick(keep); });
      case 'astype': return fn(name, (a) => {
        const t = a[0] instanceof PyObj && 'name' in a[0] ? String((a[0] as unknown as { name: string }).name) : str(a[0] ?? '');
        return this.same(this.values.astype(t.startsWith('int') ? 'int64' : t.startsWith('float') ? 'float64' : 'str'));
      });
      case 'head': return fn(name, (a) => this.pick(Array.from({ length: Math.min(a[0] === undefined ? 5 : toInt(a[0]), this.values.size) }, (_, i) => i)));
      case 'tail': return fn(name, (a) => { const n = Math.min(a[0] === undefined ? 5 : toInt(a[0]), this.values.size); return this.pick(Array.from({ length: n }, (_, i) => this.values.size - n + i)); });
      case 'round': return fn(name, (a) => this.rounded(a[0] === undefined ? 0 : toInt(a[0])));
      case 'abs': return fn(name, () => this.same(this.values.mapF(Math.abs)));
      case 'corr': return fn(name, (a) => pearson(this.values.nums, arrOf(a[0] ?? null).nums));
      case 'sort_values': return fn(name, (_a, kw) => {
        const asc = kw.get('ascending');
        const order = sortOrder(this.values, asc === undefined ? true : truthy(asc));
        return this.pick(order);
      });
      case 'shift': return fn(name, (a) => {
        const k = a[0] === undefined ? 1 : toInt(a[0]);
        const xs = this.values.nums;
        return this.same(new NdArray([xs.length], xs.map((_, i) => (i - k >= 0 && i - k < xs.length ? xs[i - k] ?? Number.NaN : Number.NaN)), 'float64'));
      });
      case 'diff': return fn(name, () => { const xs = this.values.nums; return this.same(new NdArray([xs.length], xs.map((x, i) => (i === 0 ? Number.NaN : x - (xs[i - 1] ?? 0))), 'float64')); });
      case 'rolling': return fn(name, (a, kw) => new Rolling(this, toInt(a[0] ?? kw.get('window') ?? 1n)));
      case 'autocorr': return fn(name, (a, kw) => {
        const k = toInt(a[0] ?? kw.get('lag') ?? 1n);
        const xs = this.values.nums;
        const p = xs.slice(k);
        const q = xs.slice(0, xs.length - k);
        const mp = mean(p);
        const mq = mean(q);
        return p.reduce((s, v, i) => s + (v - mp) * ((q[i] ?? 0) - mq), 0) / Math.sqrt(p.reduce((s, v) => s + (v - mp) ** 2, 0) * q.reduce((s, v) => s + (v - mq) ** 2, 0));
      });
      case 'iloc': return new ILoc((i) => (i instanceof PySlice ? this.pick(i.indices(this.values.size)) : this.values.at(toInt(i) < 0 ? toInt(i) + this.values.size : toInt(i))));
      default: return undefined;
    }
  }

  private body(): string {
    const cells = formatColumn(this.values);
    const rows = this.index.map((l, i) => [String(l), leading(cells[i] ?? '')]);
    return pad(this.indexName === null ? rows : [[this.indexName, ''], ...rows], '   ').split('\n').map((l) => l.trimEnd()).join('\n');
  }

  override str(): string {
    if (this.values.size === 0) return `Series([], ${this.name === null ? '' : `Name: ${this.name}, `}dtype: ${dtypeName(this.values.dtype)})`;
    return `${this.body()}\n${this.name === null ? '' : `Name: ${this.name}, `}dtype: ${dtypeName(this.values.dtype)}`;
  }
  override repr(): string { return this.str(); }
}

function sortOrder(a: NdArray, asc: boolean): number[] {
  const order = a.data.map((x, i) => [x, i] as const).sort((p, q) => {
    const c = typeof p[0] === 'number' && typeof q[0] === 'number' ? p[0] - q[0] : String(p[0]) < String(q[0]) ? -1 : String(p[0]) > String(q[0]) ? 1 : 0;
    return (asc ? c : -c) || p[1] - q[1];
  });
  return order.map((p) => p[1]);
}

class ILoc extends PyObj {
  readonly typeName = '_iLocIndexer';
  constructor(private readonly get: (i: Value) => Value) { super(); }
  override getItem(i: Value): Value { return this.get(i); }
}

class Rolling extends PyObj {
  readonly typeName = 'Rolling';
  constructor(private readonly s: Series, private readonly w: number) { super(); }
  override getAttr(name: string): Value | undefined {
    if (name !== 'mean' && name !== 'sum') return undefined;
    return fn(name, () => {
      const xs = this.s.values.nums;
      const out = xs.map((_, i) => {
        if (i + 1 < this.w) return Number.NaN;
        const part = xs.slice(i + 1 - this.w, i + 1);
        return name === 'mean' ? mean(part) : part.reduce((a, b) => a + b, 0);
      });
      return new Series(new NdArray([out.length], out, 'float64'), this.s.index, this.s.name, this.s.indexName);
    });
  }
}

const DESCRIBE = ['count', 'mean', 'std', 'min', '25%', '50%', '75%', 'max'];

function describeValues(xs: number[]): number[] {
  const m = mean(xs);
  const sd = Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
  return [xs.length, m, sd, Math.min(...xs), percentile(xs, 25), percentile(xs, 50), percentile(xs, 75), Math.max(...xs)];
}

function describe(s: Series): Series {
  const xs = s.values.nums.filter((x) => !Number.isNaN(x));
  return new Series(new NdArray([8], describeValues(xs), 'float64'), DESCRIBE, s.name);
}

export class DataFrame extends PyObj {
  readonly typeName = 'DataFrame';
  constructor(readonly columns: string[], readonly cols: Map<string, NdArray>, readonly index: Label[], readonly indexName: string | null = null, readonly columnsName: string | null = null) { super(); }

  toArray(): NdArray {
    const n = this.index.length;
    const parts = this.columns.map((c) => this.cols.get(c) as NdArray);
    const str_ = parts.some((p) => p.dtype === 'str');
    const float = parts.some((p) => p.dtype === 'float64');
    const data: (number | string)[] = [];
    for (let i = 0; i < n; i += 1) for (const p of parts) data.push(p.data[i] ?? 0);
    return new NdArray([n, this.columns.length], data, str_ ? 'str' : float ? 'float64' : 'int64');
  }

  private column(name: string): Series {
    const c = this.cols.get(name);
    if (!c) throw new PyError('KeyError', repr(name));
    return new Series(c, this.index, name, this.indexName);
  }

  override iter(): Value[] { return this.columns; }
  override len(): number { return this.index.length; }

  pick(at: number[]): DataFrame {
    const cols = new Map([...this.cols].map(([k, v]) => [k, new NdArray([at.length], at.map((i) => v.data[i] ?? 0), v.dtype)] as const));
    return new DataFrame(this.columns, cols, at.map((i) => this.index[i] ?? i), this.indexName, this.columnsName);
  }

  select(names: string[]): DataFrame {
    for (const n of names) if (!this.cols.has(n)) throw new PyError('KeyError', `"['${n}'] not in index"`);
    return new DataFrame(names, new Map(names.map((n) => [n, this.cols.get(n) as NdArray] as const)), this.index, this.indexName, this.columnsName);
  }

  override getItem(i: Value): Value {
    if (typeof i === 'string') return this.column(i);
    if (i instanceof PyList) return this.select(i.items.map((x) => str(x)));
    if (i instanceof Series || i instanceof NdArray) {
      const mask = arrOf(i);
      if (mask.dtype === 'bool') {
        if (mask.size !== this.index.length) throw new PyError('ValueError', `Item wrong length ${String(mask.size)} instead of ${String(this.index.length)}.`);
        const keep: number[] = [];
        mask.nums.forEach((m, at) => { if (m) keep.push(at); });
        return this.pick(keep);
      }
    }
    if (i instanceof PySlice) return this.pick(i.indices(this.index.length));
    throw new PyError('KeyError', repr(i));
  }

  override setItem(i: Value, v: Value): void {
    const name = str(i);
    const n = this.index.length;
    let col: NdArray;
    if (v instanceof Series || v instanceof NdArray || v instanceof PyList) {
      col = arrOf(v);
      if (col.size !== n) throw new PyError('ValueError', `Length of values (${String(col.size)}) does not match length of index (${String(n)})`);
    } else {
      const one = NdArray.from(new PyList([v]));
      col = new NdArray([n], new Array<number | string>(n).fill(one.data[0] ?? 0), one.dtype);
    }
    if (!this.cols.has(name)) this.columns.push(name);
    this.cols.set(name, col);
  }

  private numericNames(): string[] { return this.columns.filter((c) => this.cols.get(c)?.dtype !== 'str'); }

  private perColumn(name: string, kw: Kw): Series {
    const onlyNumeric = kw.get('numeric_only');
    const names = onlyNumeric !== undefined && truthy(onlyNumeric) ? this.numericNames() : this.columns;
    for (const c of names) if (this.cols.get(c)?.dtype === 'str' && !['min', 'max', 'count', 'sum'].includes(name)) throw new PyError('TypeError', `Could not convert ${(this.cols.get(c)?.data ?? []).join('')} to numeric`);
    const values = names.map((c) => {
      const xs = (this.cols.get(c) as NdArray).nums.filter((x) => !Number.isNaN(x));
      if (name === 'count') return xs.length;
      const r = aggregate(name, new NdArray([xs.length], xs, 'float64'), null, name === 'std' || name === 'var' ? new Map([['ddof', 1n]]) : new Map());
      return num(r);
    });
    const allInt = names.every((c) => this.cols.get(c)?.dtype !== 'float64') && ['sum', 'min', 'max', 'count'].includes(name);
    return new Series(new NdArray([values.length], values, allInt || name === 'count' ? 'int64' : 'float64'), names);
  }

  override getAttr(name: string): Value | undefined {
    switch (name) {
      case 'columns': return new PdIndex([...this.columns]);
      case 'index': return new PdIndex(this.index.map(labelValue));
      case 'shape': return new PyTuple([BigInt(this.index.length), BigInt(this.columns.length)]);
      case 'values': return this.toArray();
      case 'to_numpy': return fn(name, () => this.toArray());
      case 'head': return fn(name, (a) => this.pick(Array.from({ length: Math.min(a[0] === undefined ? 5 : toInt(a[0]), this.index.length) }, (_, i) => i)));
      case 'tail': return fn(name, (a) => { const n = Math.min(a[0] === undefined ? 5 : toInt(a[0]), this.index.length); return this.pick(Array.from({ length: n }, (_, i) => this.index.length - n + i)); });
      case 'mean': case 'median': case 'std': case 'var': case 'sum': case 'min': case 'max': case 'count':
        return fn(name, (_a, kw) => this.perColumn(name, kw));
      case 'describe': return fn(name, () => {
        const names = this.numericNames();
        const cols = new Map(names.map((c) => [c, new NdArray([8], describeValues((this.cols.get(c) as NdArray).nums.filter((x) => !Number.isNaN(x))), 'float64')] as const));
        return new DataFrame(names, cols, DESCRIBE);
      });
      case 'corr': return fn(name, () => {
        const names = this.numericNames();
        const cols = new Map(names.map((c) => [c, new NdArray([names.length], names.map((d) => {
          if (c === d) return 1;
          return pearson((this.cols.get(c) as NdArray).nums, (this.cols.get(d) as NdArray).nums);
        }), 'float64')] as const));
        return new DataFrame(names, cols, names);
      });
      case 'groupby': return fn(name, (a, kw) => new GroupBy(this, str(a[0] ?? kw.get('by') ?? '')));
      case 'isna': case 'isnull': return fn(name, () => new DataFrame(this.columns, new Map(this.columns.map((c) => [c, new NdArray([this.index.length], (this.cols.get(c) as NdArray).data.map((x) => (typeof x === 'number' && Number.isNaN(x) ? 1 : 0)), 'bool')] as const)), this.index));
      case 'dropna': return fn(name, () => {
        const keep: number[] = [];
        this.index.forEach((_, i) => { if (this.columns.every((c) => { const x = this.cols.get(c)?.data[i]; return !(typeof x === 'number' && Number.isNaN(x)); })) keep.push(i); });
        return this.pick(keep);
      });
      case 'fillna': return fn(name, (a) => {
        const v = a[0] ?? 0n;
        return new DataFrame(this.columns, new Map(this.columns.map((c) => {
          const col = this.cols.get(c) as NdArray;
          const fill = v instanceof Series ? v.values.data[v.index.indexOf(c)] ?? 0 : num(v);
          return [c, col.dtype === 'float64' ? new NdArray([col.size], col.nums.map((x) => (Number.isNaN(x) ? fill as number : x)), 'float64') : col] as const;
        })), this.index);
      });
      case 'drop': return fn(name, (_a, kw) => {
        const c = kw.get('columns') ?? null;
        const names = c instanceof PyList ? c.items.map((x) => str(x)) : [str(c)];
        for (const n of names) if (!this.cols.has(n)) throw new PyError('KeyError', `"['${n}'] not found in axis"`);
        return this.select(this.columns.filter((x) => !names.includes(x)));
      });
      case 'sort_values': return fn(name, (a, kw) => {
        const by = str(a[0] ?? kw.get('by') ?? '');
        const asc = kw.get('ascending');
        return this.pick(sortOrder(this.column(by).values, asc === undefined ? true : truthy(asc)));
      });
      case 'iloc': return new ILoc((i) => {
        if (i instanceof PySlice) return this.pick(i.indices(this.index.length));
        if (i instanceof PyTuple) {
          const [r = null, c = null] = i.items;
          const rows = r instanceof PySlice ? this.pick(r.indices(this.index.length)) : this.pick([toInt(r)]);
          if (c instanceof PySlice) return rows.select(c.pick(this.columns));
          const at = toInt(c);
          const col = rows.column(this.columns[at < 0 ? at + this.columns.length : at] ?? '');
          return r instanceof PySlice ? col : col.values.elem(0);
        }
        const row = toInt(i);
        const data = this.columns.map((c) => this.cols.get(c)?.data[row] ?? 0);
        return new Series(new NdArray([data.length], data, this.columns.every((c) => this.cols.get(c)?.dtype === 'int64') ? 'int64' : this.columns.some((c) => this.cols.get(c)?.dtype === 'str') ? 'str' : 'float64'), this.columns);
      });
      case 'round': return fn(name, (a) => new DataFrame(this.columns, new Map(this.columns.map((c) => [c, (this.cols.get(c) as NdArray).dtype === 'float64' ? (this.cols.get(c) as NdArray).rounded(a[0] === undefined ? 0 : toInt(a[0])) : this.cols.get(c) as NdArray] as const)), this.index, this.indexName, this.columnsName));
      default: return this.cols.has(name) ? this.column(name) : undefined;
    }
  }

  override str(): string {
    if (this.columns.length === 0 || this.index.length === 0) return `Empty DataFrame\nColumns: [${this.columns.join(', ')}]\nIndex: []`;
    const cells = this.columns.map((c) => formatColumn(this.cols.get(c) as NdArray));
    const header = [this.columnsName ?? '', ...this.columns.map((c) => (this.cols.get(c)?.dtype === 'str' ? c : ` ${c}`))];
    const rows: string[][] = [header];
    if (this.indexName !== null) rows.push([this.indexName, ...this.columns.map(() => '')]);
    this.index.forEach((l, i) => { rows.push([String(l), ...cells.map((c) => leading(c[i] ?? ''))]); });
    return pad(rows);
  }
  override repr(): string { return this.str(); }
}

class GroupBy extends PyObj {
  readonly typeName = 'DataFrameGroupBy';
  constructor(private readonly df: DataFrame, private readonly key: string, private readonly only?: string) { super(); }

  private groups(): { label: Label; at: number[] }[] {
    const col = this.df.cols.get(this.key);
    if (!col) throw new PyError('KeyError', repr(this.key));
    const seen = new Map<Label, number[]>();
    col.data.forEach((x, i) => { const l = x; const g = seen.get(l); if (g) g.push(i); else seen.set(l, [i]); });
    return [...seen].sort((a, b) => (typeof a[0] === 'number' && typeof b[0] === 'number' ? a[0] - b[0] : String(a[0]) < String(b[0]) ? -1 : 1)).map(([label, at]) => ({ label, at }));
  }

  override getItem(i: Value): Value { return new GroupBy(this.df, this.key, str(i)); }

  private apply(name: string): Value {
    const groups = this.groups();
    const labels = groups.map((g) => g.label);
    const calc = (col: NdArray, at: number[]): number => {
      const xs = at.map((i) => col.nums[i] ?? 0).filter((x) => !Number.isNaN(x));
      if (name === 'count') return xs.length;
      return num(aggregate(name, new NdArray([xs.length], xs, 'float64'), null, name === 'std' || name === 'var' ? new Map([['ddof', 1n]]) : new Map()));
    };
    const typed = (col: NdArray): DType => (name === 'count' || (col.dtype === 'int64' && ['sum', 'min', 'max'].includes(name)) ? 'int64' : 'float64');
    if (this.only !== undefined) {
      const col = this.df.cols.get(this.only);
      if (!col) throw new PyError('KeyError', `Column not found: ${this.only}`);
      return new Series(new NdArray([labels.length], groups.map((g) => calc(col, g.at)), typed(col)), labels, this.only, this.key);
    }
    const names = this.df.columns.filter((c) => c !== this.key && this.df.cols.get(c)?.dtype !== 'str');
    return new DataFrame(names, new Map(names.map((c) => {
      const col = this.df.cols.get(c) as NdArray;
      return [c, new NdArray([labels.length], groups.map((g) => calc(col, g.at)), typed(col))] as const;
    })), labels, this.key);
  }

  override getAttr(name: string): Value | undefined {
    if (['mean', 'median', 'sum', 'std', 'var', 'min', 'max', 'count'].includes(name)) return fn(name, () => this.apply(name));
    if (name === 'size') return fn(name, () => { const g = this.groups(); return new Series(new NdArray([g.length], g.map((x) => x.at.length), 'int64'), g.map((x) => x.label), null, this.key); });
    return undefined;
  }
}

function parseCell(s: string): number | string | null {
  const t = s.trim();
  if (t === '' || t === 'NA' || t === 'NaN' || t === 'nan') return null;
  const n = Number(t);
  return Number.isNaN(n) ? t : n;
}

export function readCsv(text: string): DataFrame {
  const lines = text.split(/\r?\n/).filter((l) => l !== '');
  const header = (lines[0] ?? '').split(',').map((x) => x.trim());
  const rows = lines.slice(1).map((l) => l.split(','));
  const cols = new Map<string, NdArray>();
  header.forEach((h, c) => {
    const raw = rows.map((r) => parseCell(r[c] ?? ''));
    if (raw.some((x) => typeof x === 'string')) {
      if (raw.every((x) => x === 'True' || x === 'False')) { cols.set(h, new NdArray([raw.length], raw.map((x) => (x === 'True' ? 1 : 0)), 'bool')); return; }
      cols.set(h, new NdArray([raw.length], raw.map((x) => (x === null ? 'NaN' : String(x))), 'str'));
      return;
    }
    const isInt = raw.every((x) => typeof x === 'number' && Number.isInteger(x) && !/[.eE]/.test(''));
    const hasDot = rows.some((r) => /[.eE]/.test(r[c] ?? ''));
    cols.set(h, new NdArray([raw.length], raw.map((x) => (x === null ? Number.NaN : x as number)), isInt && !hasDot ? 'int64' : 'float64'));
  });
  return new DataFrame(header, cols, rows.map((_, i) => i));
}

export function pandasModule(read: (path: string) => string | null): PyModule {
  return new PyModule('pandas', {
    __version__: '2.2.3',
    read_csv: fn('read_csv', (a) => {
      const path = str(a[0] ?? '');
      const text = read(path);
      if (text === null) throw new PyError('FileNotFoundError', `[Errno 2] No such file or directory: '${path}'`);
      return readCsv(text);
    }),
    DataFrame: fn('DataFrame', (a, kw) => {
      const v = a[0] ?? null;
      if (v instanceof PyDict) {
        const entries = v.entries();
        const columns = entries.map(([k]) => str(k));
        const cols = new Map(entries.map(([k, x]) => [str(k), arrOf(x)] as const));
        const n = cols.get(columns[0] ?? '')?.size ?? 0;
        return new DataFrame(columns, cols, Array.from({ length: n }, (_, i) => i));
      }
      const x = NdArray.from(v);
      const rows = x.shape[0] ?? 0;
      const w = x.shape[1] ?? 1;
      const given = kw.get('columns');
      const columns = given === undefined ? Array.from({ length: w }, (_, i) => String(i)) : iterOf(given).map((c) => str(c));
      const cols = new Map(columns.map((c, j) => [c, new NdArray([rows], Array.from({ length: rows }, (_, i) => x.data[i * w + j] ?? 0), x.dtype)] as const));
      return new DataFrame(columns, cols, Array.from({ length: rows }, (_, i) => i));
    }),
    Series: fn('Series', (a, kw) => {
      const [v, index, , name] = bind('Series', ['data', 'index', 'dtype', 'name'], a, kw);
      const x = arrOf(v ?? null);
      return new Series(x, index === undefined || index === null ? Array.from({ length: x.size }, (_, i) => i) : iterOf(index).map(toLabel), name === undefined || name === null ? null : str(name));
    }),
    crosstab: fn('crosstab', (a) => {
      const r = a[0] ?? null;
      const c = a[1] ?? null;
      const rows = arrOf(r);
      const colsA = arrOf(c);
      const sortLabels = (d: readonly (number | string)[]): (number | string)[] => [...new Set(d)].sort((x, y) => (typeof x === 'number' && typeof y === 'number' ? x - y : String(x) < String(y) ? -1 : 1));
      const rl = sortLabels(rows.data);
      const cl = sortLabels(colsA.data);
      const names = cl.map(String);
      const cols = new Map(cl.map((cv, j) => [names[j] ?? '', new NdArray([rl.length], rl.map((rv) => rows.data.filter((x, i) => x === rv && colsA.data[i] === cv).length), 'int64')] as const));
      return new DataFrame(names, cols, rl, r instanceof Series ? r.name ?? 'row_0' : 'row_0', c instanceof Series ? c.name ?? 'col_0' : 'col_0');
    }),
    isna: fn('isna', (a) => typeof a[0] === 'number' && Number.isNaN(a[0])),
  });
}
