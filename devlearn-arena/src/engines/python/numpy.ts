import { RandomState } from './mt19937';
import {
  asNumber, bind, fn, iterOf, num, PyError, PyList, PyModule, PyObj, PySlice, PyTuple, toInt, truthy, typeName, type Kw, type Value,
} from './values';

/** numpy の模擬: 実戦に要る範囲の配列と関数。表示の形は本物と同じ（FloatingFormat の考え方） */

export type DType = 'int64' | 'float64' | 'bool' | 'str';

const product = (xs: readonly number[]): number => xs.reduce((a, b) => a * b, 1);

export class NdArray extends PyObj {
  readonly typeName = 'ndarray';
  constructor(readonly shape: number[], readonly data: (number | string)[], readonly dtype: DType) { super(); }

  get nums(): number[] { return this.data as number[]; }

  static from(v: Value, dtype?: DType): NdArray {
    if (v instanceof NdArray) return dtype && dtype !== v.dtype ? v.astype(dtype) : v;
    const toArr = (v as { toArray?: () => NdArray } | null)?.toArray;
    if (toArr !== undefined && v !== null) return toArr.call(v);
    const shape: number[] = [];
    const flat: Value[] = [];
    const walk = (x: Value, depth: number): void => {
      if (x instanceof NdArray) {
        if (depth >= shape.length) shape.push(...x.shape);
        for (let i = 0; i < x.size; i += 1) flat.push(x.elem(i));
        return;
      }
      if (x instanceof PyList || x instanceof PyTuple) {
        if (depth === shape.length) shape.push(x.items.length);
        else if (shape[depth] !== x.items.length) throw new PyError('ValueError', `setting an array element with a sequence. The requested array has an inhomogeneous shape after ${String(depth)} dimensions. The detected shape was (${shape.slice(0, depth).join(', ')},) + inhomogeneous part.`);
        for (const y of x.items) walk(y, depth + 1);
        return;
      }
      if (x instanceof PyObj) {
        const it = x.iter();
        if (it !== null) { walk(new PyList(it), depth); return; }
      }
      flat.push(x);
    };
    walk(v, 0);
    const kind: DType = dtype ?? (flat.every((x) => typeof x === 'boolean') && flat.length > 0 ? 'bool'
      : flat.some((x) => typeof x === 'string') ? 'str'
        : flat.every((x) => typeof x === 'bigint' || typeof x === 'boolean') && flat.length > 0 ? 'int64' : 'float64');
    const data = flat.map((x) => {
      if (kind === 'str') return typeof x === 'string' ? x : String(asNumber(x));
      const n = asNumber(x);
      if (n !== null) return n;
      if (x === null) return Number.NaN;
      if (typeof x === 'string') {
        const parsed = Number(x);
        if (x.trim() === '' || Number.isNaN(parsed)) throw new PyError('ValueError', `could not convert string to float: '${x}'`);
        return parsed;
      }
      throw new PyError('TypeError', `float() argument must be a string or a real number, not '${typeName(x)}'`);
    });
    return new NdArray(shape, data, kind);
  }

  get size(): number { return this.data.length; }
  get ndim(): number { return this.shape.length; }

  /** 0 から数えた位置の要素を、Python の値にする */
  elem(i: number): Value {
    const x = this.data[i] ?? 0;
    if (this.dtype === 'str') return String(x);
    if (this.dtype === 'bool') return x !== 0;
    if (this.dtype === 'int64') return BigInt(x);
    return x;
  }

  astype(t: DType): NdArray {
    if (t === 'str') return new NdArray([...this.shape], this.data.map(String), t);
    const f = t === 'int64' ? (x: number): number => Math.trunc(x) : t === 'bool' ? (x: number): number => (x !== 0 ? 1 : 0) : (x: number): number => x;
    return new NdArray([...this.shape], this.nums.map(f), t);
  }

  override len(): number {
    if (this.ndim === 0) throw new PyError('TypeError', 'len() of unsized object');
    return this.shape[0] ?? 0;
  }

  override iter(): Value[] {
    const n = this.len();
    return Array.from({ length: n }, (_, i) => this.at(i));
  }

  /** 最初の軸の i 番目（1 次元なら要素、2 次元なら行） */
  at(i: number): Value {
    if (this.ndim === 1) return this.elem(i);
    const rest = this.shape.slice(1);
    const w = product(rest);
    return new NdArray(rest, this.data.slice(i * w, (i + 1) * w), this.dtype);
  }

  rows(): number[][] {
    const [r = 0, c = 1] = this.shape;
    if (this.ndim === 1) return this.nums.map((x) => [x]);
    return Array.from({ length: r }, (_, i) => this.nums.slice(i * c, (i + 1) * c));
  }

  override truthy(): boolean {
    if (this.size === 1) return truthy(this.elem(0));
    throw new PyError('ValueError', 'The truth value of an array with more than one element is ambiguous. Use a.any() or a.all()');
  }

  private indices(idx: Value): { shape: number[]; flat: number[] } {
    const parts: Value[] = idx instanceof PyTuple ? idx.items : [idx];
    if (parts.length > this.ndim) throw new PyError('IndexError', `too many indices for array: array is ${String(this.ndim)}-dimensional, but ${String(parts.length)} were indexed`);
    // 1 つの真偽の配列（全ての軸を覆う）
    const only = parts[0];
    if (parts.length === 1 && only !== undefined) {
      const mask = maskOf(only);
      if (mask !== null && mask.ndim === this.ndim && this.ndim > 1) {
        const flat: number[] = [];
        mask.nums.forEach((m, i) => { if (m) flat.push(i); });
        return { shape: [flat.length], flat };
      }
    }
    const sel: { pick: number[]; keep: boolean }[] = [];
    this.shape.forEach((n, axis) => {
      const p = parts[axis];
      if (p === undefined) { sel.push({ pick: Array.from({ length: n }, (_, i) => i), keep: true }); return; }
      if (p instanceof PySlice) { sel.push({ pick: p.indices(n), keep: true }); return; }
      const mask = maskOf(p);
      if (mask !== null) {
        if (mask.size !== n) throw new PyError('IndexError', `boolean index did not match indexed array along axis ${String(axis)}; size of axis is ${String(n)} but size of corresponding boolean axis is ${String(mask.size)}`);
        const pick: number[] = [];
        mask.nums.forEach((m, i) => { if (m) pick.push(i); });
        sel.push({ pick, keep: true });
        return;
      }
      if (p instanceof PyList || p instanceof NdArray) {
        const list = NdArray.from(p).nums.map((x) => (x < 0 ? x + n : x));
        sel.push({ pick: list, keep: true });
        return;
      }
      if (p === null) { sel.push({ pick: Array.from({ length: n }, (_, i) => i), keep: true }); return; }
      if (typeof p !== 'bigint' && typeof p !== 'boolean') throw new PyError('IndexError', 'only integers, slices (`:`), ellipsis (`...`), numpy.newaxis (`None`) and integer or boolean arrays are valid indices');
      const at = toInt(p);
      const pos = at < 0 ? at + n : at;
      if (pos < 0 || pos >= n) throw new PyError('IndexError', `index ${String(at)} is out of bounds for axis ${String(axis)} with size ${String(n)}`);
      sel.push({ pick: [pos], keep: false });
    });
    const strides: number[] = [];
    let s = 1;
    for (let i = this.ndim - 1; i >= 0; i -= 1) { strides[i] = s; s *= this.shape[i] ?? 1; }
    let flat = [0];
    sel.forEach((x, axis) => { flat = flat.flatMap((base) => x.pick.map((p) => base + p * (strides[axis] ?? 1))); });
    return { shape: sel.filter((x) => x.keep).map((x) => x.pick.length), flat };
  }

  override getItem(idx: Value): Value {
    const { shape, flat } = this.indices(idx);
    if (shape.length === 0) return this.elem(flat[0] ?? 0);
    return new NdArray(shape, flat.map((i) => this.data[i] ?? 0), this.dtype);
  }

  override setItem(idx: Value, v: Value): void {
    const { flat } = this.indices(idx);
    if (v instanceof PyObj) {
      const src = NdArray.from(v);
      flat.forEach((at, i) => { this.data[at] = src.data[src.size === 1 ? 0 : i] ?? 0; });
      return;
    }
    const x = typeof v === 'string' ? v : num(v);
    for (const at of flat) this.data[at] = this.dtype === 'int64' && typeof x === 'number' ? Math.trunc(x) : x;
  }

  override binop(op: string, other: Value, reflected: boolean): Value | undefined {
    if (op === '@') {
      const o = NdArray.from(other);
      return reflected ? matmul(o, this) : matmul(this, o);
    }
    const o = toArrayOrNull(other);
    if (o === null) return undefined;
    return reflected ? broadcast(op, o, this) : broadcast(op, this, o);
  }

  override compare(op: string, other: Value): Value | undefined {
    const o = toArrayOrNull(other);
    return o === null ? undefined : broadcast(op, this, o);
  }

  override unary(op: string): Value | undefined {
    if (op === 'abs') return this.mapF(Math.abs);
    if (op === '-') return new NdArray([...this.shape], this.nums.map((x) => -x), this.dtype === 'bool' ? 'int64' : this.dtype);
    if (op === '+') return this;
    return undefined;
  }

  mapF(f: (x: number) => number, dtype: DType = this.dtype === 'int64' && f === Math.abs ? 'int64' : 'float64'): NdArray {
    return new NdArray([...this.shape], this.nums.map(f), dtype);
  }

  rounded(d: number): NdArray {
    if (this.dtype === 'int64') return this;
    return this.mapF((x) => npRound(x, d));
  }

  reshape(shape: number[]): NdArray {
    const known = shape.filter((x) => x !== -1);
    const missing = this.size / product(known);
    const next = shape.map((x) => (x === -1 ? missing : x));
    if (product(next) !== this.size) throw new PyError('ValueError', `cannot reshape array of size ${String(this.size)} into shape (${shape.join(',')}${shape.length === 1 ? ',' : ''})`);
    return new NdArray(next, this.data, this.dtype);
  }

  transpose(): NdArray {
    if (this.ndim < 2) return this;
    const [r = 0, c = 0] = this.shape;
    const data: (number | string)[] = [];
    for (let j = 0; j < c; j += 1) for (let i = 0; i < r; i += 1) data.push(this.data[i * c + j] ?? 0);
    return new NdArray([c, r], data, this.dtype);
  }

  override getAttr(name: string): Value | undefined {
    switch (name) {
      case 'shape': return new PyTuple(this.shape.map((x) => BigInt(x)));
      case 'ndim': return BigInt(this.ndim);
      case 'size': return BigInt(this.size);
      case 'dtype': return this.dtype;
      case 'T': return this.transpose();
      case 'tolist': return fn(name, () => toList(this));
      case 'copy': return fn(name, () => new NdArray([...this.shape], [...this.data], this.dtype));
      case 'flatten': case 'ravel': return fn(name, () => new NdArray([this.size], [...this.data], this.dtype));
      case 'reshape': return fn(name, (a) => this.reshape((a.length === 1 && a[0] instanceof PyTuple ? a[0].items : a).map(toInt)));
      case 'astype': return fn(name, (a) => this.astype(dtypeOf(a[0] ?? null)));
      case 'round': return fn(name, (a) => this.rounded(a[0] === undefined ? 0 : toInt(a[0])));
      case 'item': return fn(name, () => {
        if (this.size !== 1) throw new PyError('ValueError', 'can only convert an array of size 1 to a Python scalar');
        return this.elem(0);
      });
      case 'dot': return fn(name, (a) => matmul(this, NdArray.from(a[0] ?? null)));
      case 'sum': case 'mean': case 'std': case 'var': case 'min': case 'max': case 'argmax': case 'argmin': case 'any': case 'all': case 'prod': case 'cumsum':
        return fn(name, (a, kw) => aggregate(name, this, a[0] ?? kw.get('axis') ?? null, kw));
      case 'sort': return fn(name, () => {
        const sorted = [...this.nums].sort((x, y) => x - y);
        sorted.forEach((x, i) => { this.data[i] = x; });
        return null;
      });
      case 'argsort': return fn(name, () => argsort(this));
      case 'clip': return fn(name, (a) => { const lo = num(a[0] ?? null); const hi = num(a[1] ?? null); return this.mapF((x) => Math.min(Math.max(x, lo), hi), this.dtype); });
      default: return undefined;
    }
  }

  override repr(): string {
    const body = formatArray(this, 'array(');
    const suffix = this.dtype === 'float64' || this.dtype === 'int64' || this.dtype === 'bool' ? '' : `, dtype='<U${String(Math.max(...this.data.map((x) => String(x).length)))}'`;
    return `array(${body}${suffix})`;
  }

  override str(): string { return formatArray(this, ''); }
}

function maskOf(v: Value): NdArray | null {
  const a = toArrayOrNull(v);
  if (a?.dtype === 'bool') return a;
  if (v instanceof PyList && v.items.length > 0 && v.items.every((x) => typeof x === 'boolean')) return NdArray.from(v);
  return null;
}

function toArrayOrNull(v: Value): NdArray | null {
  if (v instanceof NdArray) return v;
  if (v instanceof PyList || v instanceof PyTuple) return NdArray.from(v);
  if (v instanceof PyObj && 'toArray' in v) return (v as unknown as { toArray: () => NdArray }).toArray();
  if (typeof v === 'string') return new NdArray([], [v], 'str');
  const n = asNumber(v);
  if (n === null) return null;
  return new NdArray([], [n], typeof v === 'boolean' ? 'bool' : typeof v === 'bigint' ? 'int64' : 'float64');
}

function npRound(x: number, d: number): number {
  const p = 10 ** d;
  const y = x * p;
  const f = Math.floor(y);
  const diff = y - f;
  const r = diff > 0.5 ? f + 1 : diff < 0.5 ? f : f % 2 === 0 ? f : f + 1;
  return r / p;
}

function dtypeOf(v: Value): DType {
  if (v instanceof PyObj && 'name' in v) {
    const n = String((v as unknown as { name: unknown }).name);
    return n === 'int' ? 'int64' : n === 'float' ? 'float64' : n === 'bool' ? 'bool' : 'str';
  }
  const s = v === null ? '' : typeof v === 'string' ? v : String(asNumber(v));
  if (s.startsWith('int')) return 'int64';
  if (s.startsWith('float')) return 'float64';
  if (s === 'bool') return 'bool';
  return 'str';
}

export function toList(a: NdArray): Value {
  if (a.ndim === 0) return a.elem(0);
  if (a.ndim === 1) return new PyList(Array.from({ length: a.size }, (_, i) => a.elem(i)));
  return new PyList(a.iter().map((x) => toList(x as NdArray)));
}

function applyOp(op: string, x: number, y: number): number {
  switch (op) {
    case '+': return x + y;
    case '-': return x - y;
    case '*': return x * y;
    case '/': return x / y;
    case '//': return Math.floor(x / y);
    case '%': { const m = x % y; return m !== 0 && (m < 0) !== (y < 0) ? m + y : m; }
    case '**': return x ** y;
    case '&': return x && y ? 1 : 0;
    case '|': return x || y ? 1 : 0;
    case '^': return (x ? 1 : 0) !== (y ? 1 : 0) ? 1 : 0;
    case '==': return x === y ? 1 : 0;
    case '!=': return x !== y ? 1 : 0;
    case '<': return x < y ? 1 : 0;
    case '>': return x > y ? 1 : 0;
    case '<=': return x <= y ? 1 : 0;
    case '>=': return x >= y ? 1 : 0;
    default: throw new PyError('TypeError', `unsupported operand type(s) for ${op}`);
  }
}

const COMPARE = new Set(['==', '!=', '<', '>', '<=', '>=']);

export function broadcast(op: string, a: NdArray, b: NdArray): NdArray {
  const n = Math.max(a.ndim, b.ndim);
  const sa = [...Array.from({ length: n - a.ndim }, () => 1), ...a.shape];
  const sb = [...Array.from({ length: n - b.ndim }, () => 1), ...b.shape];
  const shape = sa.map((x, i) => {
    const y = sb[i] ?? 1;
    if (x !== y && x !== 1 && y !== 1) throw new PyError('ValueError', `operands could not be broadcast together with shapes (${a.shape.join(',')}${a.ndim === 1 ? ',' : ''}) (${b.shape.join(',')}${b.ndim === 1 ? ',' : ''}) `);
    return Math.max(x, y);
  });
  const size = product(shape);
  const out: number[] = new Array<number>(size);
  const strides = (s: number[]): number[] => { const r: number[] = []; let k = 1; for (let i = s.length - 1; i >= 0; i -= 1) { r[i] = (s[i] ?? 1) === 1 ? 0 : k; k *= s[i] ?? 1; } return r; };
  const ra = strides(sa);
  const rb = strides(sb);
  const counter = shape.map(() => 0);
  let ia = 0;
  let ib = 0;
  if (a.dtype === 'str' || b.dtype === 'str') {
    if (op !== '==' && op !== '!=') throw new PyError('TypeError', `ufunc 'add' did not contain a loop with signature matching types`);
    const eq = a.data.map(String);
    const eq2 = b.data.map(String);
    const r = Array.from({ length: Math.max(eq.length, eq2.length) }, (_, i) => ((eq[eq.length === 1 ? 0 : i] === eq2[eq2.length === 1 ? 0 : i]) === (op === '==') ? 1 : 0));
    return new NdArray(shape, r, 'bool');
  }
  for (let i = 0; i < size; i += 1) {
    out[i] = applyOp(op, a.nums[ia] ?? 0, b.nums[ib] ?? 0);
    for (let d = n - 1; d >= 0; d -= 1) {
      counter[d] = (counter[d] ?? 0) + 1;
      ia += ra[d] ?? 0;
      ib += rb[d] ?? 0;
      if ((counter[d] ?? 0) < (shape[d] ?? 1)) break;
      ia -= (ra[d] ?? 0) * (shape[d] ?? 1);
      ib -= (rb[d] ?? 0) * (shape[d] ?? 1);
      counter[d] = 0;
    }
  }
  const bothInt = a.dtype !== 'float64' && b.dtype !== 'float64';
  let dtype: DType;
  if (COMPARE.has(op)) dtype = 'bool';
  else if (['&', '|', '^'].includes(op) && a.dtype === 'bool' && b.dtype === 'bool') dtype = 'bool';
  else if (op === '/') dtype = 'float64';
  else dtype = bothInt ? (a.dtype === 'bool' && b.dtype === 'bool' && (op === '+' || op === '*') ? 'bool' : 'int64') : 'float64';
  return new NdArray(shape, dtype === 'bool' && !COMPARE.has(op) ? out.map((x) => (x ? 1 : 0)) : out, dtype);
}

export function matmul(a: NdArray, b: NdArray): Value {
  if (a.ndim === 0 || b.ndim === 0) return broadcast('*', a, b);
  const float = a.dtype === 'float64' || b.dtype === 'float64';
  if (a.ndim === 1 && b.ndim === 1) {
    if (a.size !== b.size) throw new PyError('ValueError', `shapes (${String(a.size)},) and (${String(b.size)},) not aligned: ${String(a.size)} (dim 0) != ${String(b.size)} (dim 0)`);
    const s = a.nums.reduce((t, x, i) => t + x * (b.nums[i] ?? 0), 0);
    return float ? s : BigInt(s);
  }
  const [ar = 0, ac = 0] = a.ndim === 1 ? [1, a.size] : a.shape;
  const [br = 0, bc = 0] = b.ndim === 1 ? [b.size, 1] : b.shape;
  if (ac !== br) throw new PyError('ValueError', `shapes (${a.shape.join(',')}${a.ndim === 1 ? ',' : ''}) and (${b.shape.join(',')}${b.ndim === 1 ? ',' : ''}) not aligned: ${String(ac)} (dim ${String(a.ndim - 1)}) != ${String(br)} (dim 0)`);
  const out: number[] = [];
  for (let i = 0; i < ar; i += 1) for (let j = 0; j < bc; j += 1) {
    let s = 0;
    for (let k = 0; k < ac; k += 1) s += (a.nums[i * ac + k] ?? 0) * (b.nums[k * bc + j] ?? 0);
    out.push(s);
  }
  const shape = a.ndim === 1 ? [bc] : b.ndim === 1 ? [ar] : [ar, bc];
  return new NdArray(shape, out, float ? 'float64' : 'int64');
}

function argsort(a: NdArray): NdArray {
  const order = a.nums.map((x, i) => [x, i] as const).sort((p, q) => p[0] - q[0] || p[1] - q[1]).map((p) => p[1]);
  return new NdArray([order.length], order, 'int64');
}

export function mean(xs: readonly number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function variance(xs: readonly number[], ddof: number): number {
  const m = mean(xs);
  return xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - ddof);
}

/** numpy の percentile（線形補間） */
export function percentile(sortedIn: readonly number[], q: number): number {
  const s = [...sortedIn].sort((a, b) => a - b);
  const at = (q / 100) * (s.length - 1);
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  return (s[lo] ?? 0) + ((s[hi] ?? 0) - (s[lo] ?? 0)) * (at - lo);
}

function kahanless(name: string, xs: number[], kw: Kw): number {
  const ddof = kw.get('ddof');
  const d = ddof === undefined || ddof === null ? 0 : num(ddof);
  switch (name) {
    case 'sum': return xs.reduce((a, b) => a + b, 0);
    case 'prod': return xs.reduce((a, b) => a * b, 1);
    case 'mean': return mean(xs);
    case 'var': return variance(xs, d);
    case 'std': return Math.sqrt(variance(xs, d));
    case 'min': return xs.reduce((a, b) => Math.min(a, b), Infinity);
    case 'max': return xs.reduce((a, b) => Math.max(a, b), -Infinity);
    case 'median': return percentile(xs, 50);
    case 'argmax': { let at = 0; xs.forEach((x, i) => { if (x > (xs[at] ?? 0)) at = i; }); return at; }
    case 'argmin': { let at = 0; xs.forEach((x, i) => { if (x < (xs[at] ?? 0)) at = i; }); return at; }
    case 'any': return xs.some((x) => x !== 0) ? 1 : 0;
    case 'all': return xs.every((x) => x !== 0) ? 1 : 0;
    default: throw new PyError('AttributeError', name);
  }
}

export function aggregate(name: string, a: NdArray, axis: Value, kw: Kw): Value {
  const float = a.dtype === 'float64';
  const resultType = (): DType => {
    if (name === 'any' || name === 'all') return 'bool';
    if (name === 'argmax' || name === 'argmin') return 'int64';
    if (['mean', 'var', 'std', 'median'].includes(name)) return 'float64';
    return float ? 'float64' : 'int64';
  };
  const wrap = (x: number): Value => {
    const t = resultType();
    return t === 'bool' ? x !== 0 : t === 'int64' ? BigInt(x) : x;
  };
  if (name === 'cumsum') {
    let t = 0;
    return new NdArray([a.size], a.nums.map((x) => { t += x; return t; }), float ? 'float64' : 'int64');
  }
  if (a.size === 0 && (name === 'min' || name === 'max' || name === 'argmax' || name === 'argmin')) throw new PyError('ValueError', `zero-size array to reduction operation ${name === 'min' || name === 'argmin' ? 'minimum' : 'maximum'} which has no identity`);
  if (axis === null) return wrap(kahanless(name, a.nums, kw));
  const ax = toInt(axis);
  if (a.ndim === 1) return wrap(kahanless(name, a.nums, kw));
  const [r = 0, c = 0] = a.shape;
  const out: number[] = [];
  if (ax === 0) for (let j = 0; j < c; j += 1) out.push(kahanless(name, Array.from({ length: r }, (_, i) => a.nums[i * c + j] ?? 0), kw));
  else for (let i = 0; i < r; i += 1) out.push(kahanless(name, a.nums.slice(i * c, (i + 1) * c), kw));
  return new NdArray([out.length], out, resultType());
}

/** numpy の float の 1 列の書き方（桁を揃える） */
export function floatStrings(xs: readonly number[]): string[] {
  const finite = xs.filter((x) => Number.isFinite(x));
  const abs = finite.filter((x) => x !== 0).map(Math.abs);
  const maxV = abs.length ? Math.max(...abs) : 0;
  const minV = abs.length ? Math.min(...abs) : 0;
  const expMode = abs.length > 0 && (maxV >= 1e8 || minV < 1e-4 || maxV / minV > 1000);
  const special = (x: number): string => (Number.isNaN(x) ? 'nan' : x > 0 ? 'inf' : '-inf');
  if (expMode) {
    const digits = finite.map((x) => {
      const m = /^-?\d(?:\.(\d+))?e/.exec(Number(x.toPrecision(9)).toExponential());
      return (m?.[1] ?? '').length;
    });
    const p = Math.max(0, ...digits);
    return xs.map((x) => (Number.isFinite(x) ? x.toExponential(p).replace(/^(-?\d)e/, '$1.e').replace(/e([+-])(\d)$/, 'e$10$2') : special(x)));
  }
  const parts = finite.map((x) => {
    const s = trimFixed(x);
    const [i = '', f = ''] = s.split('.');
    return { i, f };
  });
  const fw = Math.max(0, ...parts.map((p) => p.f.length));
  return xs.map((x) => {
    if (!Number.isFinite(x)) return special(x);
    const s = trimFixed(x);
    const [i = '', f = ''] = s.split('.');
    return `${i}.${f}${' '.repeat(fw - f.length)}`;
  });
}

function trimFixed(x: number): string {
  // 8 桁までで、値を区別できる最短の形
  const shortest = String(Number(x.toFixed(8)));
  if (shortest.includes('e')) return x.toFixed(8).replace(/0+$/, '');
  const s = shortest.includes('.') ? shortest : `${shortest}.`;
  // 元の値が 8 桁で丸まらないなら本物も 8 桁まで
  return s.startsWith('-0.') && x === 0 ? s : s;
}

function cellStrings(a: NdArray): string[] {
  if (a.dtype === 'float64') return floatStrings(a.nums);
  if (a.dtype === 'bool') return a.nums.map((x) => (x ? 'True' : 'False'));
  if (a.dtype === 'str') return a.data.map((x) => `'${String(x)}'`);
  return a.nums.map((x) => String(x));
}

const LINE_WIDTH = 75;

/** 配列の表示（print の形。prefix は repr の時の字下げ） */
function formatArray(a: NdArray, prefix: string): string {
  if (a.ndim === 0) return String(cellStrings(a)[0] ?? '');
  const cells = cellStrings(a);
  const w = Math.max(0, ...cells.map((c) => c.length));
  const fmt = (c: string): string => (a.dtype === 'str' ? c : c.padStart(w));
  const indent = ' '.repeat(prefix.length);
  const render = (start: number, shape: number[], depth: number): string => {
    if (shape.length === 1) {
      const n = shape[0] ?? 0;
      const lead = depth + 1 + indent.length;
      const lines: string[] = [];
      let cur = '';
      for (let i = 0; i < n; i += 1) {
        const item = fmt(cells[start + i] ?? '') + (i < n - 1 && prefix !== '' ? ',' : '');
        const next = cur === '' ? item : `${cur} ${item}`;
        if (cur !== '' && lead + next.length + 1 > LINE_WIDTH) { lines.push(cur); cur = item; } else cur = next;
      }
      lines.push(cur);
      return `[${lines.join(`\n${' '.repeat(lead)}`)}]`;
    }
    const n = shape[0] ?? 0;
    const rest = shape.slice(1);
    const size = product(rest);
    const rows = Array.from({ length: n }, (_, i) => render(start + i * size, rest, depth + 1));
    const nl = '\n'.repeat(Math.max(1, rest.length));
    return `[${rows.join(`${prefix !== '' ? ',' : ''}${nl}${indent}${' '.repeat(depth + 1)}`)}]`;
  };
  return render(0, a.shape, 0);
}

/* ---------- 関数 ---------- */

const arr = (v: Value | undefined): NdArray => NdArray.from(v ?? null);
const seqOf = (v: Value): number[] => (v instanceof PyObj ? iterOf(v).map(toInt) : [toInt(v)]);

function unaryF(name: string, f: (x: number) => number): Value {
  return fn(name, (a) => {
    const v = a[0] ?? null;
    if (v instanceof PyObj) {
      const x = NdArray.from(v);
      return x.mapF(f);
    }
    return f(num(v));
  });
}

function agg(name: string): Value {
  return fn(name, (a, kw) => {
    const [x, axis, ddof] = bind(name, ['a', 'axis', 'ddof'], a, kw);
    return aggregate(name, arr(x), axis ?? null, ddof === undefined ? new Map() : new Map([['ddof', ddof]]));
  });
}

function pct(x: NdArray, q: Value, axis: Value | undefined, scale: number): Value {
  const one = (xs: number[], p: number): number => percentile(xs, p * scale);
  const qs: number[] | number = q instanceof PyObj ? NdArray.from(q).nums : num(q);
  if (axis !== undefined && axis !== null && x.ndim === 2) {
    const t = toInt(axis) === 0 ? x : x.transpose();
    const cols = t.transpose().rows();
    return new NdArray([cols.length], cols.map((c) => one(c, typeof qs === 'number' ? qs : qs[0] ?? 0)), 'float64');
  }
  if (typeof qs === 'number') return one(x.nums, qs);
  return new NdArray([qs.length], qs.map((p) => one(x.nums, p)), 'float64');
}

function corrMatrix(columns: number[][], corr: boolean): NdArray {
  const n = columns.length;
  const out: number[] = [];
  const cov = (a: number[], b: number[]): number => {
    const ma = mean(a);
    const mb = mean(b);
    return a.reduce((s, x, i) => s + (x - ma) * ((b[i] ?? 0) - mb), 0) / (a.length - 1);
  };
  for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) {
    const a = columns[i] ?? [];
    const b = columns[j] ?? [];
    out.push(corr ? (i === j ? 1 : cov(a, b) / Math.sqrt(cov(a, a) * cov(b, b))) : cov(a, b));
  }
  return new NdArray([n, n], out, 'float64');
}

const columnsOf = (a: NdArray, b?: NdArray): number[][] => {
  const first = a.ndim === 1 ? [a.nums] : a.rows();
  return b ? [...first, b.nums] : first;
};

function solve(a: number[][], b: number[]): number[] {
  const n = a.length;
  const m = a.map((r, i) => [...r, b[i] ?? 0]);
  for (let c = 0; c < n; c += 1) {
    let p = c;
    for (let r = c + 1; r < n; r += 1) if (Math.abs(m[r]?.[c] ?? 0) > Math.abs(m[p]?.[c] ?? 0)) p = r;
    const t = m[c] as number[];
    m[c] = m[p] as number[];
    m[p] = t;
    const pivot = m[c]?.[c] ?? 0;
    if (Math.abs(pivot) < 1e-13) throw new PyError('LinAlgError', 'Singular matrix');
    for (let r = c + 1; r < n; r += 1) {
      const f = (m[r]?.[c] ?? 0) / pivot;
      for (let k = c; k <= n; k += 1) (m[r] as number[])[k] = (m[r]?.[k] ?? 0) - f * (m[c]?.[k] ?? 0);
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r -= 1) {
    let s = m[r]?.[n] ?? 0;
    for (let k = r + 1; k < n; k += 1) s -= (m[r]?.[k] ?? 0) * (x[k] ?? 0);
    x[r] = s / (m[r]?.[r] ?? 1);
  }
  return x;
}

export const linSolve = solve;

function randomModule(): PyModule {
  let rs = new RandomState(1234);
  const sized = (size: Value | undefined, gen: () => number, dtype: DType = 'float64'): Value => {
    if (size === undefined || size === null) return dtype === 'int64' ? BigInt(gen()) : gen();
    const shape = seqOf(size);
    return new NdArray(shape, Array.from({ length: product(shape) }, gen), dtype);
  };
  return new PyModule('numpy.random', {
    seed: fn('seed', (a) => { rs = new RandomState(toInt(a[0] ?? 0n)); return null; }),
    rand: fn('rand', (a) => (a.length === 0 ? rs.random() : sized(new PyTuple(a), () => rs.random()))),
    random: fn('random', (a, kw) => sized(a[0] ?? kw.get('size'), () => rs.random())),
    randn: fn('randn', (a) => (a.length === 0 ? rs.normal() : sized(new PyTuple(a), () => rs.normal()))),
    normal: fn('normal', (a, kw) => {
      const [loc, scale, size] = bind('normal', ['loc', 'scale', 'size'], a, kw);
      const m = loc === undefined ? 0 : num(loc);
      const s = scale === undefined ? 1 : num(scale);
      return sized(size, () => m + s * rs.normal());
    }),
    uniform: fn('uniform', (a, kw) => {
      const [low, high, size] = bind('uniform', ['low', 'high', 'size'], a, kw);
      const l = low === undefined ? 0 : num(low);
      const h = high === undefined ? 1 : num(high);
      return sized(size, () => l + (h - l) * rs.random());
    }),
    randint: fn('randint', (a, kw) => {
      const [low, high, size] = bind('randint', ['low', 'high', 'size'], a, kw);
      const l = high === undefined || high === null ? 0 : toInt(low ?? 0n);
      const h = high === undefined || high === null ? toInt(low ?? 0n) : toInt(high);
      if (l >= h) throw new PyError('ValueError', 'high <= 0');
      return sized(size, () => l + rs.interval(h - l - 1), 'int64');
    }),
    permutation: fn('permutation', (a) => {
      const v = a[0] ?? null;
      if (typeof v === 'bigint') return new NdArray([Number(v)], rs.permutation(Number(v)), 'int64');
      const x = NdArray.from(v);
      const order = rs.permutation(x.size);
      return new NdArray([x.size], order.map((i) => x.data[i] ?? 0), x.dtype);
    }),
    shuffle: fn('shuffle', (a) => {
      const x = a[0] ?? null;
      if (x instanceof NdArray) rs.shuffle(x.data);
      else if (x instanceof PyList) rs.shuffle(x.items);
      return null;
    }),
    choice: fn('choice', (a, kw) => {
      const [pop, size] = bind('choice', ['a', 'size', 'replace', 'p'], a, kw);
      const x = typeof pop === 'bigint' ? new NdArray([Number(pop)], Array.from({ length: Number(pop) }, (_, i) => i), 'int64') : arr(pop);
      const pick = (): number => rs.interval(x.size - 1);
      if (size === undefined || size === null) return x.elem(pick());
      const shape = seqOf(size);
      return new NdArray(shape, Array.from({ length: product(shape) }, () => x.data[pick()] ?? 0), x.dtype);
    }),
    RandomState: fn('RandomState', () => { throw new PyError('NotImplementedError', 'RandomState is not available in this practice'); }),
  });
}

export function numpyModule(): PyModule {
  const math = (name: string, f: (x: number) => number): [string, Value] => [name, unaryF(name, f)];
  const binaryF = (name: string, f: (x: number, y: number) => number): [string, Value] => [name, fn(name, (a) => {
    const x = arr(a[0]);
    const y = arr(a[1]);
    const r = broadcast('+', x, y);
    const n = r.size;
    const bx = broadcast('+', x, new NdArray(r.shape, new Array<number>(n).fill(0), 'float64')).nums;
    const by = broadcast('+', y, new NdArray(r.shape, new Array<number>(n).fill(0), 'float64')).nums;
    const out = new NdArray(r.shape, bx.map((v, i) => f(v, by[i] ?? 0)), x.dtype === 'float64' || y.dtype === 'float64' ? 'float64' : 'int64');
    return out.ndim === 0 ? out.elem(0) : out;
  })];
  const stack = (name: string, axis: (p: NdArray[]) => NdArray): Value => fn(name, (a) => axis(iterOf(a[0] ?? null).map((x) => NdArray.from(x))));
  const concat = (parts: NdArray[], axis: number): NdArray => {
    const dtype: DType = parts.some((p) => p.dtype === 'float64') ? 'float64' : parts[0]?.dtype ?? 'float64';
    if (axis === 0) {
      const rest = parts[0]?.shape.slice(1) ?? [];
      return new NdArray([parts.reduce((s, p) => s + (p.shape[0] ?? 0), 0), ...rest], parts.flatMap((p) => p.data), dtype);
    }
    const rows = parts[0]?.shape[0] ?? 0;
    const data: (number | string)[] = [];
    for (let i = 0; i < rows; i += 1) for (const p of parts) {
      const w = p.ndim === 1 ? 1 : p.shape[1] ?? 1;
      data.push(...p.data.slice(i * w, (i + 1) * w));
    }
    return new NdArray([rows, parts.reduce((s, p) => s + (p.ndim === 1 ? 1 : p.shape[1] ?? 1), 0)], data, dtype);
  };
  const filled = (name: string, value: number): Value => fn(name, (a, kw) => {
    const shape = seqOf(a[0] ?? 0n);
    const t = kw.get('dtype');
    return new NdArray(shape, new Array<number>(product(shape)).fill(value), t === undefined ? 'float64' : dtypeOf(t));
  });
  return new PyModule('numpy', {
    pi: Math.PI, e: Math.E, nan: Number.NaN, inf: Infinity, newaxis: null, __version__: '2.1.3',
    array: fn('array', (a, kw) => { const t = kw.get('dtype') ?? a[1]; const x = NdArray.from(a[0] ?? null, t === undefined ? undefined : dtypeOf(t)); return new NdArray([...x.shape], [...x.data], x.dtype); }),
    asarray: fn('asarray', (a) => NdArray.from(a[0] ?? null)),
    zeros: filled('zeros', 0),
    ones: filled('ones', 1),
    full: fn('full', (a) => { const shape = seqOf(a[0] ?? 0n); const v = num(a[1] ?? 0n); return new NdArray(shape, new Array<number>(product(shape)).fill(v), typeof a[1] === 'bigint' ? 'int64' : 'float64'); }),
    zeros_like: fn('zeros_like', (a) => { const x = arr(a[0]); return new NdArray([...x.shape], new Array<number>(x.size).fill(0), x.dtype); }),
    ones_like: fn('ones_like', (a) => { const x = arr(a[0]); return new NdArray([...x.shape], new Array<number>(x.size).fill(1), x.dtype); }),
    eye: fn('eye', (a) => { const n = toInt(a[0] ?? 0n); return new NdArray([n, n], Array.from({ length: n * n }, (_, i) => (i % (n + 1) === 0 ? 1 : 0)), 'float64'); }),
    arange: fn('arange', (a) => {
      const ns = a.map((x) => num(x));
      const [p = 0, q, r = 1] = ns;
      const start = q === undefined ? 0 : p;
      const stop = q === undefined ? p : q;
      const n = Math.max(0, Math.ceil((stop - start) / r));
      return new NdArray([n], Array.from({ length: n }, (_, i) => start + i * r), a.every((x) => typeof x === 'bigint') ? 'int64' : 'float64');
    }),
    linspace: fn('linspace', (a, kw) => {
      const [start, stop, num_] = bind('linspace', ['start', 'stop', 'num'], a, kw);
      const n = num_ === undefined ? 50 : toInt(num_);
      const s = num(start ?? 0n);
      const e = num(stop ?? 0n);
      return new NdArray([n], Array.from({ length: n }, (_, i) => (i === n - 1 && n > 1 ? e : s + (i * (e - s)) / (n > 1 ? n - 1 : 1))), 'float64');
    }),
    ...Object.fromEntries([
      math('exp', Math.exp), math('log', Math.log), math('log2', Math.log2), math('log10', Math.log10), math('sqrt', Math.sqrt),
      math('sin', Math.sin), math('cos', Math.cos), math('tanh', Math.tanh), math('sign', Math.sign), math('floor', Math.floor), math('ceil', Math.ceil),
    ]),
    abs: fn('abs', (a) => { const v = a[0] ?? null; if (v instanceof PyObj) return arr(v).mapF(Math.abs); return typeof v === 'bigint' ? (v < 0n ? -v : v) : Math.abs(num(v)); }),
    isnan: fn('isnan', (a) => { const x = arr(a[0]); const r = new NdArray([...x.shape], x.nums.map((v) => (Number.isNaN(v) ? 1 : 0)), 'bool'); return r.ndim === 0 ? r.elem(0) : r; }),
    round: fn('round', (a, kw) => {
      const [x, d] = bind('round', ['a', 'decimals'], a, kw);
      const digits = d === undefined ? 0 : toInt(d);
      if (x instanceof PyObj) return arr(x).rounded(digits);
      return npRound(num(x ?? null), digits);
    }),
    ...Object.fromEntries(['sum', 'mean', 'std', 'var', 'min', 'max', 'median', 'argmax', 'argmin', 'prod', 'any', 'all', 'cumsum'].map((n) => [n, agg(n)])),
    amin: agg('min'), amax: agg('max'),
    power: fn('power', (a) => { const r = broadcast('**', arr(a[0]), arr(a[1])); return r.ndim === 0 ? r.elem(0) : r; }),
    ...Object.fromEntries([binaryF('maximum', Math.max), binaryF('minimum', Math.min)]),
    clip: fn('clip', (a) => { const lo = num(a[1] ?? null); const hi = num(a[2] ?? null); const f = (x: number): number => Math.min(Math.max(x, lo), hi); const v = a[0] ?? null; return v instanceof PyObj ? arr(v).mapF(f, arr(v).dtype) : f(num(v)); }),
    dot: fn('dot', (a) => matmul(arr(a[0]), arr(a[1]))),
    matmul: fn('matmul', (a) => matmul(arr(a[0]), arr(a[1]))),
    transpose: fn('transpose', (a) => arr(a[0]).transpose()),
    where: fn('where', (a) => {
      const c = arr(a[0]);
      if (a.length === 1) { const at: number[] = []; c.nums.forEach((v, i) => { if (v) at.push(i); }); return new PyTuple([new NdArray([at.length], at, 'int64')]); }
      const x = arr(a[1]);
      const y = arr(a[2]);
      const float = x.dtype === 'float64' || y.dtype === 'float64';
      const str_ = x.dtype === 'str' || y.dtype === 'str';
      return new NdArray([...c.shape], c.nums.map((v, i) => (v ? x.data[x.size === 1 ? 0 : i] : y.data[y.size === 1 ? 0 : i]) ?? 0), str_ ? 'str' : float ? 'float64' : x.dtype);
    }),
    sort: fn('sort', (a) => { const x = arr(a[0]); return new NdArray([x.size], [...x.nums].sort((p, q) => p - q), x.dtype); }),
    argsort: fn('argsort', (a) => argsort(arr(a[0]))),
    unique: fn('unique', (a, kw) => {
      const x = arr(a[0]);
      const counts = kw.get('return_counts');
      const uniq = [...new Set(x.data)].sort((p, q) => (typeof p === 'number' && typeof q === 'number' ? p - q : String(p) < String(q) ? -1 : 1));
      const u = new NdArray([uniq.length], uniq, x.dtype);
      if (counts !== undefined && truthy(counts)) return new PyTuple([u, new NdArray([uniq.length], uniq.map((v) => x.data.filter((y) => y === v).length), 'int64')]);
      return u;
    }),
    count_nonzero: fn('count_nonzero', (a) => BigInt(arr(a[0]).nums.filter((x) => x !== 0).length)),
    percentile: fn('percentile', (a, kw) => { const [x, q, axis] = bind('percentile', ['a', 'q', 'axis'], a, kw); return pct(arr(x), q ?? null, axis, 1); }),
    quantile: fn('quantile', (a, kw) => { const [x, q, axis] = bind('quantile', ['a', 'q', 'axis'], a, kw); return pct(arr(x), q ?? null, axis, 100); }),
    corrcoef: fn('corrcoef', (a) => corrMatrix(columnsOf(arr(a[0]), a[1] === undefined ? undefined : arr(a[1])), true)),
    cov: fn('cov', (a) => corrMatrix(columnsOf(arr(a[0]), a[1] === undefined ? undefined : arr(a[1])), false)),
    concatenate: fn('concatenate', (a, kw) => concat(iterOf(a[0] ?? null).map((x) => NdArray.from(x)), toInt(a[1] ?? kw.get('axis') ?? 0n))),
    vstack: stack('vstack', (p) => concat(p.map((x) => (x.ndim === 1 ? x.reshape([1, -1]) : x)), 0)),
    hstack: stack('hstack', (p) => concat(p, p[0]?.ndim === 1 ? 0 : 1)),
    column_stack: stack('column_stack', (p) => concat(p.map((x) => (x.ndim === 1 ? x.reshape([-1, 1]) : x)), 1)),
    random: randomModule(),
    linalg: new PyModule('numpy.linalg', {
      norm: fn('norm', (a) => Math.sqrt(arr(a[0]).nums.reduce((s, x) => s + x * x, 0))),
      inv: fn('inv', (a) => {
        const x = arr(a[0]);
        const n = x.shape[0] ?? 0;
        const rows = x.rows();
        const cols = Array.from({ length: n }, (_, j) => solve(rows, Array.from({ length: n }, (_u, i) => (i === j ? 1 : 0))));
        return new NdArray([n, n], new NdArray([n, n], cols.flat(), 'float64').transpose().data, 'float64');
      }),
      solve: fn('solve', (a) => { const s = solve(arr(a[0]).rows(), arr(a[1]).nums); return new NdArray([s.length], s, 'float64'); }),
    }),
  });
}
