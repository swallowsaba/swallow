import { mean, NdArray } from './numpy';
import { RandomState } from './mt19937';
import { DataFrame, Series } from './pandas';
import { bind, fn, iterOf, num, PyDict, PyError, PyList, PyModule, PyObj, PyTuple, repr, str, toInt, truthy, typeName, type Kw, type Value } from './values';

/**
 * scikit-learn の模擬: 実戦に要る範囲の推定器と評価。決まった計算（最小二乗・決定木・k 近傍など）は本物と同じ値になる。
 * 反復で解く物（ロジスティック回帰・Lasso）は同じ目的関数を十分に解くので、表示の桁では本物と同じになる。
 */

const X2D = (v: Value | undefined, name = 'X'): number[][] => {
  const a = NdArray.from(v ?? null);
  if (a.dtype === 'str') throw new PyError('ValueError', `could not convert string to float: '${String(a.data[0] ?? '')}'`);
  if (a.ndim === 1) throw new PyError('ValueError', `Expected 2D array, got 1D array instead:\narray=${a.str()}.\nReshape your data either using array.reshape(-1, 1) if your data has a single feature or array.reshape(1, -1) if it contains a single sample.`);
  if (a.nums.some((x) => Number.isNaN(x))) throw new PyError('ValueError', `Input ${name} contains NaN.`);
  return a.rows();
};
const labels = (v: Value | undefined): NdArray => {
  const a = NdArray.from(v ?? null);
  return a.ndim === 2 ? new NdArray([a.size], a.data, a.dtype) : a;
};
const col1D = (xs: readonly number[], dtype: 'float64' | 'int64' = 'float64'): NdArray => new NdArray([xs.length], [...xs], dtype);
const mat = (rows: readonly (readonly number[])[]): NdArray => new NdArray([rows.length, rows[0]?.length ?? 0], rows.flat(), 'float64');

function checkSameLength(x: number[][], y: NdArray): void {
  if (x.length !== y.size) throw new PyError('ValueError', `Found input variables with inconsistent numbers of samples: [${String(x.length)}, ${String(y.size)}]`);
}

function gauss(a: number[][], b: number[]): number[] {
  const n = a.length;
  const m = a.map((r, i) => [...r, b[i] ?? 0]);
  for (let c = 0; c < n; c += 1) {
    let p = c;
    for (let r = c + 1; r < n; r += 1) if (Math.abs(m[r]?.[c] ?? 0) > Math.abs(m[p]?.[c] ?? 0)) p = r;
    const t = m[c] as number[];
    m[c] = m[p] as number[];
    m[p] = t;
    const pivot = m[c]?.[c] ?? 0;
    if (Math.abs(pivot) < 1e-12) continue;
    for (let r = 0; r < n; r += 1) {
      if (r === c) continue;
      const f = (m[r]?.[c] ?? 0) / pivot;
      for (let k = c; k <= n; k += 1) (m[r] as number[])[k] = (m[r]?.[k] ?? 0) - f * (m[c]?.[k] ?? 0);
    }
  }
  return m.map((r, i) => (Math.abs(r[i] ?? 0) < 1e-12 ? 0 : (r[n] ?? 0) / (r[i] ?? 1)));
}

abstract class Estimator extends PyObj {
  fitted = false;
  abstract readonly className: string;
  abstract clone(): Estimator;
  abstract readonly isClassifier: boolean;
  params(): Record<string, Value> { return {}; }
  setParam(k: string, v: Value): void { void [k, v]; }
  override get typeName(): string { return this.className; }
  protected needFit(): void {
    if (!this.fitted) throw new PyError('NotFittedError', `This ${this.className} instance is not fitted yet. Call 'fit' with appropriate arguments before using this estimator.`);
  }
  abstract fitModel(x: number[][], y: NdArray): void;
  abstract predictRows(x: number[][]): NdArray;
  scoreOf(x: number[][], y: NdArray): number {
    const p = this.predictRows(x);
    if (this.isClassifier) return p.data.filter((v, i) => v === y.data[i]).length / y.size;
    return r2(y.nums, p.nums);
  }
  override getAttr(name: string): Value | undefined {
    switch (name) {
      case 'fit': return fn(name, (a) => {
        const x = X2D(a[0]);
        const y = labels(a[1]);
        checkSameLength(x, y);
        this.fitModel(x, y);
        this.fitted = true;
        return this;
      });
      case 'predict': return fn(name, (a) => { this.needFit(); return this.predictRows(X2D(a[0])); });
      case 'score': return fn(name, (a) => { this.needFit(); return this.scoreOf(X2D(a[0]), labels(a[1])); });
      default: return undefined;
    }
  }
  override repr(): string {
    const p = Object.entries(this.params()).map(([k, v]) => `${k}=${repr(v)}`).join(', ');
    return `${this.className}(${p})`;
  }
}

function r2(y: readonly number[], p: readonly number[]): number {
  const m = mean(y);
  const ssr = y.reduce((s, v, i) => s + (v - (p[i] ?? 0)) ** 2, 0);
  const sst = y.reduce((s, v) => s + (v - m) ** 2, 0);
  return 1 - ssr / sst;
}

class LinearModel extends Estimator {
  readonly isClassifier = false;
  coef: number[] = [];
  intercept = 0;
  constructor(readonly className: string, readonly alpha: number, readonly kind: 'ols' | 'ridge' | 'lasso') { super(); }
  clone(): Estimator { return new LinearModel(this.className, this.alpha, this.kind); }
  override params(): Record<string, Value> { return this.kind === 'ols' ? {} : { alpha: this.alpha }; }
  fitModel(x: number[][], yy: NdArray): void {
    const y = yy.nums;
    const p = x[0]?.length ?? 0;
    const mx = Array.from({ length: p }, (_, j) => mean(x.map((r) => r[j] ?? 0)));
    const my = mean(y);
    const xc = x.map((r) => r.map((v, j) => v - (mx[j] ?? 0)));
    const yc = y.map((v) => v - my);
    if (this.kind === 'lasso') {
      const n = x.length;
      const w = new Array<number>(p).fill(0);
      const z = Array.from({ length: p }, (_, j) => xc.reduce((s, r) => s + (r[j] ?? 0) ** 2, 0));
      for (let it = 0; it < 100000; it += 1) {
        let change = 0;
        for (let j = 0; j < p; j += 1) {
          let rho = 0;
          for (let i = 0; i < n; i += 1) {
            const row = xc[i] ?? [];
            let pred = 0;
            for (let k = 0; k < p; k += 1) if (k !== j) pred += (row[k] ?? 0) * (w[k] ?? 0);
            rho += (row[j] ?? 0) * ((yc[i] ?? 0) - pred);
          }
          const t = this.alpha * n;
          const next = (z[j] ?? 0) === 0 ? 0 : (Math.sign(rho) * Math.max(Math.abs(rho) - t, 0)) / (z[j] ?? 1);
          change = Math.max(change, Math.abs(next - (w[j] ?? 0)));
          w[j] = next;
        }
        if (change < 1e-10) break;
      }
      this.coef = w;
    } else {
      const xtx = Array.from({ length: p }, (_, a) => Array.from({ length: p }, (_u, b) => xc.reduce((s, r) => s + (r[a] ?? 0) * (r[b] ?? 0), 0) + (a === b && this.kind === 'ridge' ? this.alpha : 0)));
      const xty = Array.from({ length: p }, (_, a) => xc.reduce((s, r, i) => s + (r[a] ?? 0) * (yc[i] ?? 0), 0));
      this.coef = gauss(xtx, xty);
    }
    this.intercept = my - mx.reduce((s, v, j) => s + v * (this.coef[j] ?? 0), 0);
  }
  predictRows(x: number[][]): NdArray {
    if ((x[0]?.length ?? 0) !== this.coef.length) throw new PyError('ValueError', `X has ${String(x[0]?.length ?? 0)} features, but ${this.className} is expecting ${String(this.coef.length)} features as input.`);
    return col1D(x.map((r) => this.intercept + r.reduce((s, v, j) => s + v * (this.coef[j] ?? 0), 0)));
  }
  override getAttr(name: string): Value | undefined {
    if (name === 'coef_') { this.needFit(); return col1D(this.coef); }
    if (name === 'intercept_') { this.needFit(); return this.intercept; }
    return super.getAttr(name);
  }
}

const sigmoid = (z: number): number => 1 / (1 + Math.exp(-z));

class Logistic extends Estimator {
  readonly className = 'LogisticRegression';
  readonly isClassifier = true;
  coef: number[] = [];
  intercept = 0;
  classes: (number | string)[] = [];
  constructor(readonly C: number, readonly yDtype: { dtype: 'int64' | 'float64' | 'str' | 'bool' } = { dtype: 'int64' }) { super(); }
  clone(): Estimator { return new Logistic(this.C); }
  override params(): Record<string, Value> { return this.C === 1 ? {} : { C: this.C }; }
  fitModel(x: number[][], y: NdArray): void {
    this.classes = [...new Set(y.data)].sort((a, b) => (typeof a === 'number' && typeof b === 'number' ? a - b : String(a) < String(b) ? -1 : 1));
    this.yDtype.dtype = y.dtype;
    if (this.classes.length !== 2) {
      if (this.classes.length < 2) throw new PyError('ValueError', `This solver needs samples of at least 2 classes in the data, but the data contains only one class: ${String(this.classes[0] ?? '')}`);
      throw new PyError('NotImplementedError', 'this practice handles two classes only');
    }
    const t = y.data.map((v) => (v === this.classes[1] ? 1 : 0));
    const p = x[0]?.length ?? 0;
    let w = new Array<number>(p + 1).fill(0);
    for (let it = 0; it < 200; it += 1) {
      const g = new Array<number>(p + 1).fill(0);
      const h = Array.from({ length: p + 1 }, () => new Array<number>(p + 1).fill(0));
      x.forEach((r, i) => {
        const row = [...r, 1];
        const z = row.reduce((s, v, j) => s + v * (w[j] ?? 0), 0);
        const q = sigmoid(z);
        const d = q - (t[i] ?? 0);
        const s = Math.max(q * (1 - q), 1e-10);
        row.forEach((v, a) => {
          g[a] = (g[a] ?? 0) + this.C * d * v;
          row.forEach((u, b) => { (h[a] as number[])[b] = (h[a]?.[b] ?? 0) + this.C * s * v * u; });
        });
      });
      for (let j = 0; j < p; j += 1) {
        g[j] = (g[j] ?? 0) + (w[j] ?? 0);
        (h[j] as number[])[j] = (h[j]?.[j] ?? 0) + 1;
      }
      const step = gauss(h, g);
      const next = w.map((v, j) => v - (step[j] ?? 0));
      const done = step.every((v) => Math.abs(v) < 1e-10);
      w = next;
      if (done) break;
    }
    this.coef = w.slice(0, p);
    this.intercept = w[p] ?? 0;
  }
  proba(x: number[][]): number[] { return x.map((r) => sigmoid(this.intercept + r.reduce((s, v, j) => s + v * (this.coef[j] ?? 0), 0))); }
  predictRows(x: number[][]): NdArray {
    const a = this.classes[0] ?? 0;
    const b = this.classes[1] ?? 1;
    return new NdArray([x.length], this.proba(x).map((q) => (q > 0.5 ? b : a)), this.yDtype.dtype);
  }
  override getAttr(name: string): Value | undefined {
    if (name === 'coef_') { this.needFit(); return mat([this.coef]); }
    if (name === 'intercept_') { this.needFit(); return col1D([this.intercept]); }
    if (name === 'classes_') { this.needFit(); return new NdArray([2], this.classes, this.yDtype.dtype); }
    if (name === 'predict_proba') return fn(name, (a) => { this.needFit(); return mat(this.proba(X2D(a[0])).map((q) => [1 - q, q])); });
    return super.getAttr(name);
  }
}

interface TreeNode { feature: number; threshold: number; left?: TreeNode; right?: TreeNode; counts: number[]; n: number; impurity: number }

class DecisionTree extends Estimator {
  readonly className = 'DecisionTreeClassifier';
  readonly isClassifier = true;
  root: TreeNode | null = null;
  classes: (number | string)[] = [];
  importances: number[] = [];
  yType: 'int64' | 'float64' | 'str' | 'bool' = 'int64';
  constructor(public maxDepth: number | null, readonly randomState: Value, public minLeaf: number) { super(); }
  clone(): Estimator { return new DecisionTree(this.maxDepth, this.randomState, this.minLeaf); }
  override params(): Record<string, Value> {
    return { ...(this.maxDepth === null ? {} : { max_depth: BigInt(this.maxDepth) }), ...(this.randomState === null ? {} : { random_state: this.randomState }) };
  }
  override setParam(k: string, v: Value): void {
    if (k === 'max_depth') this.maxDepth = v === null ? null : toInt(v);
    if (k === 'min_samples_leaf') this.minLeaf = toInt(v);
  }
  fitModel(x: number[][], y: NdArray): void {
    this.classes = [...new Set(y.data)].sort((a, b) => (typeof a === 'number' && typeof b === 'number' ? a - b : String(a) < String(b) ? -1 : 1));
    this.yType = y.dtype;
    const t = y.data.map((v) => this.classes.indexOf(v));
    const p = x[0]?.length ?? 0;
    const total = x.length;
    const imp = new Array<number>(p).fill(0);
    const gini = (c: number[], n: number): number => 1 - c.reduce((s, v) => s + (v / n) ** 2, 0);
    const build = (at: number[], depth: number): TreeNode => {
      const counts = this.classes.map((_, k) => at.filter((i) => t[i] === k).length);
      const node: TreeNode = { feature: -1, threshold: 0, counts, n: at.length, impurity: gini(counts, at.length) };
      if (node.impurity <= 1e-12 || (this.maxDepth !== null && depth >= this.maxDepth) || at.length < 2) return node;
      let best = -Infinity;
      let bestF = -1;
      let bestT = 0;
      for (let f = 0; f < p; f += 1) {
        const order = [...at].sort((a, b) => (x[a]?.[f] ?? 0) - (x[b]?.[f] ?? 0));
        const left = this.classes.map(() => 0);
        const right = [...counts];
        for (let k = 0; k < order.length - 1; k += 1) {
          const i = order[k] ?? 0;
          left[t[i] ?? 0] = (left[t[i] ?? 0] ?? 0) + 1;
          right[t[i] ?? 0] = (right[t[i] ?? 0] ?? 0) - 1;
          const v = x[i]?.[f] ?? 0;
          const w = x[order[k + 1] ?? 0]?.[f] ?? 0;
          if (v === w) continue;
          const nl = k + 1;
          const nr = order.length - nl;
          if (nl < this.minLeaf || nr < this.minLeaf) continue;
          const score = -(nl * gini(left, nl) + nr * gini(right, nr));
          if (score > best + 1e-12) { best = score; bestF = f; bestT = (v + w) / 2; }
        }
      }
      if (bestF < 0) return node;
      const l = at.filter((i) => (x[i]?.[bestF] ?? 0) <= bestT);
      const r = at.filter((i) => (x[i]?.[bestF] ?? 0) > bestT);
      node.feature = bestF;
      node.threshold = bestT;
      node.left = build(l, depth + 1);
      node.right = build(r, depth + 1);
      imp[bestF] = (imp[bestF] ?? 0) + (at.length * node.impurity - l.length * node.left.impurity - r.length * node.right.impurity) / total;
      return node;
    };
    this.root = build(x.map((_, i) => i), 0);
    const sum = imp.reduce((a, b) => a + b, 0);
    this.importances = imp.map((v) => (sum === 0 ? 0 : v / sum));
  }
  private leaf(r: number[]): TreeNode {
    let n = this.root as TreeNode;
    while (n.left && n.right) n = (r[n.feature] ?? 0) <= n.threshold ? n.left : n.right;
    return n;
  }
  predictRows(x: number[][]): NdArray {
    return new NdArray([x.length], x.map((r) => {
      const c = this.leaf(r).counts;
      return this.classes[c.indexOf(Math.max(...c))] ?? 0;
    }), this.yType);
  }
  depth(n: TreeNode | null = this.root): number {
    if (!n?.left || !n.right) return 0;
    return 1 + Math.max(this.depth(n.left), this.depth(n.right));
  }
  leaves(n: TreeNode | null = this.root): number {
    if (!n?.left || !n.right) return 1;
    return this.leaves(n.left) + this.leaves(n.right);
  }
  override getAttr(name: string): Value | undefined {
    if (name === 'get_depth') return fn(name, () => { this.needFit(); return BigInt(this.depth()); });
    if (name === 'get_n_leaves') return fn(name, () => { this.needFit(); return BigInt(this.leaves()); });
    if (name === 'feature_importances_') { this.needFit(); return col1D(this.importances); }
    if (name === 'classes_') { this.needFit(); return new NdArray([this.classes.length], this.classes, this.yType); }
    if (name === 'predict_proba') return fn(name, (a) => { this.needFit(); return mat(X2D(a[0]).map((r) => { const l = this.leaf(r); return l.counts.map((c) => c / l.n); })); });
    return super.getAttr(name);
  }
  rules(names: string[]): string {
    const out: string[] = [];
    const walk = (n: TreeNode, depth: number): void => {
      const pre = `${'|   '.repeat(depth)}|---`;
      if (!n.left || !n.right) {
        out.push(`${pre} class: ${String(this.classes[n.counts.indexOf(Math.max(...n.counts))] ?? '')}`);
        return;
      }
      const f = names[n.feature] ?? `feature_${String(n.feature)}`;
      const t = n.threshold.toFixed(2);
      out.push(`${pre} ${f} <= ${t}`);
      walk(n.left, depth + 1);
      out.push(`${pre} ${f} >  ${t}`);
      walk(n.right, depth + 1);
    };
    walk(this.root as TreeNode, 0);
    return `${out.join('\n')}\n`;
  }
}

class KNN extends Estimator {
  readonly className = 'KNeighborsClassifier';
  readonly isClassifier = true;
  x: number[][] = [];
  y: NdArray = col1D([]);
  constructor(public k: number) { super(); }
  clone(): Estimator { return new KNN(this.k); }
  override params(): Record<string, Value> { return this.k === 5 ? {} : { n_neighbors: BigInt(this.k) }; }
  override setParam(k: string, v: Value): void { if (k === 'n_neighbors') this.k = toInt(v); }
  fitModel(x: number[][], y: NdArray): void {
    if (this.k > x.length) throw new PyError('ValueError', `Expected n_neighbors <= n_samples_fit, but n_neighbors = ${String(this.k)}, n_samples_fit = ${String(x.length)}`);
    this.x = x;
    this.y = y;
  }
  predictRows(x: number[][]): NdArray {
    const classes = [...new Set(this.y.data)].sort((a, b) => (typeof a === 'number' && typeof b === 'number' ? a - b : String(a) < String(b) ? -1 : 1));
    return new NdArray([x.length], x.map((r) => {
      const near = this.x.map((t, i) => [t.reduce((s, v, j) => s + (v - (r[j] ?? 0)) ** 2, 0), i] as const).sort((a, b) => a[0] - b[0] || a[1] - b[1]).slice(0, this.k);
      const votes = classes.map((c) => near.filter(([, i]) => this.y.data[i] === c).length);
      return classes[votes.indexOf(Math.max(...votes))] ?? 0;
    }), this.y.dtype);
  }
}

class Voting extends Estimator {
  readonly className = 'VotingClassifier';
  readonly isClassifier = true;
  yType: 'int64' | 'float64' | 'str' | 'bool' = 'int64';
  constructor(readonly members: [string, Estimator][]) { super(); }
  clone(): Estimator { return new Voting(this.members.map(([n, e]) => [n, e.clone()])); }
  fitModel(x: number[][], y: NdArray): void {
    this.yType = y.dtype;
    for (const [, e] of this.members) { e.fitModel(x, y); e.fitted = true; }
  }
  predictRows(x: number[][]): NdArray {
    const preds = this.members.map(([, e]) => e.predictRows(x));
    return new NdArray([x.length], x.map((_, i) => {
      const seen = new Map<number | string, number>();
      for (const p of preds) seen.set(p.data[i] ?? 0, (seen.get(p.data[i] ?? 0) ?? 0) + 1);
      const best = [...seen].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
      return best?.[0] ?? 0;
    }), this.yType);
  }
}

/* ---------- 前処理と教師なし ---------- */

class Transformer extends PyObj {
  readonly typeName = 'Transformer';
  private a: number[] = [];
  private b: number[] = [];
  private ok = false;
  constructor(readonly kind: 'standard' | 'minmax') { super(); }
  private fit(x: number[][]): void {
    const p = x[0]?.length ?? 0;
    const cols = Array.from({ length: p }, (_, j) => x.map((r) => r[j] ?? 0));
    if (this.kind === 'standard') {
      this.a = cols.map(mean);
      this.b = cols.map((c, j) => { const s = Math.sqrt(c.reduce((t, v) => t + (v - (this.a[j] ?? 0)) ** 2, 0) / c.length); return s === 0 ? 1 : s; });
    } else {
      this.a = cols.map((c) => Math.min(...c));
      this.b = cols.map((c, j) => { const s = Math.max(...c) - (this.a[j] ?? 0); return s === 0 ? 1 : s; });
    }
    this.ok = true;
  }
  private apply(x: number[][]): NdArray {
    if (!this.ok) throw new PyError('NotFittedError', `This ${this.kind === 'standard' ? 'StandardScaler' : 'MinMaxScaler'} instance is not fitted yet. Call 'fit' with appropriate arguments before using this estimator.`);
    return mat(x.map((r) => r.map((v, j) => (v - (this.a[j] ?? 0)) / (this.b[j] ?? 1))));
  }
  override getAttr(name: string): Value | undefined {
    switch (name) {
      case 'fit': return fn(name, (a) => { this.fit(X2D(a[0])); return this; });
      case 'transform': return fn(name, (a) => this.apply(X2D(a[0])));
      case 'fit_transform': return fn(name, (a) => { const x = X2D(a[0]); this.fit(x); return this.apply(x); });
      case 'mean_': return col1D(this.a);
      case 'scale_': return col1D(this.b);
      default: return undefined;
    }
  }
}

function jacobi(m: number[][]): { values: number[]; vectors: number[][] } {
  const n = m.length;
  const a = m.map((r) => [...r]);
  const v = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_u, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 100; sweep += 1) {
    let off = 0;
    for (let i = 0; i < n; i += 1) for (let j = i + 1; j < n; j += 1) off += (a[i]?.[j] ?? 0) ** 2;
    if (off < 1e-24) break;
    for (let p = 0; p < n; p += 1) for (let q = p + 1; q < n; q += 1) {
      const apq = a[p]?.[q] ?? 0;
      if (Math.abs(apq) < 1e-300) continue;
      const theta = ((a[q]?.[q] ?? 0) - (a[p]?.[p] ?? 0)) / (2 * apq);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1);
      const s = t * c;
      for (let k = 0; k < n; k += 1) {
        const akp = a[k]?.[p] ?? 0;
        const akq = a[k]?.[q] ?? 0;
        (a[k] as number[])[p] = c * akp - s * akq;
        (a[k] as number[])[q] = s * akp + c * akq;
      }
      for (let k = 0; k < n; k += 1) {
        const apk = a[p]?.[k] ?? 0;
        const aqk = a[q]?.[k] ?? 0;
        (a[p] as number[])[k] = c * apk - s * aqk;
        (a[q] as number[])[k] = s * apk + c * aqk;
      }
      for (let k = 0; k < n; k += 1) {
        const vkp = v[k]?.[p] ?? 0;
        const vkq = v[k]?.[q] ?? 0;
        (v[k] as number[])[p] = c * vkp - s * vkq;
        (v[k] as number[])[q] = s * vkp + c * vkq;
      }
    }
  }
  return { values: a.map((r, i) => r[i] ?? 0), vectors: v };
}

class PCA extends PyObj {
  readonly typeName = 'PCA';
  private center: number[] = [];
  private comps: number[][] = [];
  private ratio: number[] = [];
  private vars: number[] = [];
  constructor(readonly n: number | null) { super(); }
  private fit(x: number[][]): void {
    const p = x[0]?.length ?? 0;
    this.center = Array.from({ length: p }, (_, j) => mean(x.map((r) => r[j] ?? 0)));
    const xc = x.map((r) => r.map((v, j) => v - (this.center[j] ?? 0)));
    const cov = Array.from({ length: p }, (_, a) => Array.from({ length: p }, (_u, b) => xc.reduce((s, r) => s + (r[a] ?? 0) * (r[b] ?? 0), 0) / (x.length - 1)));
    const { values, vectors } = jacobi(cov);
    const order = values.map((v, i) => [v, i] as const).sort((a, b) => b[0] - a[0]);
    const total = values.reduce((a, b) => a + b, 0);
    const k = this.n ?? p;
    this.vars = order.slice(0, k).map(([v]) => v);
    this.ratio = this.vars.map((v) => v / total);
    // 向きは、一番大きい要素が正になるように揃える（本物の svd_flip と同じ）
    this.comps = order.slice(0, k).map(([, i]) => {
      const c = vectors.map((r) => r[i] ?? 0);
      const big = c.reduce((b, v) => (Math.abs(v) > Math.abs(b) ? v : b), 0);
      return big < 0 ? c.map((v) => -v) : c;
    });
  }
  private transform(x: number[][]): NdArray {
    return mat(x.map((r) => this.comps.map((c) => c.reduce((s, v, j) => s + v * ((r[j] ?? 0) - (this.center[j] ?? 0)), 0))));
  }
  override getAttr(name: string): Value | undefined {
    switch (name) {
      case 'fit': return fn(name, (a) => { this.fit(X2D(a[0])); return this; });
      case 'transform': return fn(name, (a) => this.transform(X2D(a[0])));
      case 'fit_transform': return fn(name, (a) => { const x = X2D(a[0]); this.fit(x); return this.transform(x); });
      case 'explained_variance_ratio_': return col1D(this.ratio);
      case 'explained_variance_': return col1D(this.vars);
      case 'components_': return mat(this.comps);
      default: return undefined;
    }
  }
}

class KMeans extends PyObj {
  readonly typeName = 'KMeans';
  private centers: number[][] = [];
  private labels: number[] = [];
  private inertia = 0;
  constructor(readonly k: number, readonly init: number[][] | null) { super(); }
  private assign(x: number[][]): number[] {
    return x.map((r) => {
      let best = 0;
      let bd = Infinity;
      this.centers.forEach((c, i) => {
        const d = r.reduce((s, v, j) => s + (v - (c[j] ?? 0)) ** 2, 0);
        if (d < bd) { bd = d; best = i; }
      });
      return best;
    });
  }
  private fit(x: number[][]): void {
    if (x.length < this.k) throw new PyError('ValueError', `n_samples=${String(x.length)} should be >= n_clusters=${String(this.k)}.`);
    if (this.init) this.centers = this.init.map((r) => [...r]);
    else {
      // 離れた点から始める（乱数の初めの点は本物と同じ列にならないが、離れた塊では同じ結果に落ち着く）
      const first = x[0] ?? [];
      this.centers = [first];
      while (this.centers.length < this.k) {
        let far = first;
        let fd = -1;
        for (const r of x) {
          const d = Math.min(...this.centers.map((c) => r.reduce((s, v, j) => s + (v - (c[j] ?? 0)) ** 2, 0)));
          if (d > fd) { fd = d; far = r; }
        }
        this.centers.push(far);
      }
    }
    for (let it = 0; it < 300; it += 1) {
      const l = this.assign(x);
      const next = this.centers.map((c, i) => {
        const members = x.filter((_, at) => l[at] === i);
        return members.length === 0 ? c : c.map((_, j) => mean(members.map((r) => r[j] ?? 0)));
      });
      const moved = next.some((c, i) => c.some((v, j) => Math.abs(v - (this.centers[i]?.[j] ?? 0)) > 1e-12));
      this.centers = next;
      this.labels = l;
      if (!moved) break;
    }
    this.labels = this.assign(x);
    this.inertia = x.reduce((s, r, i) => s + r.reduce((t, v, j) => t + (v - (this.centers[this.labels[i] ?? 0]?.[j] ?? 0)) ** 2, 0), 0);
  }
  override getAttr(name: string): Value | undefined {
    switch (name) {
      case 'fit': return fn(name, (a) => { this.fit(X2D(a[0])); return this; });
      case 'fit_predict': return fn(name, (a) => { this.fit(X2D(a[0])); return new NdArray([this.labels.length], this.labels, 'int64'); });
      case 'predict': return fn(name, (a) => { const l = this.assign(X2D(a[0])); return new NdArray([l.length], l, 'int64'); });
      case 'labels_': return new NdArray([this.labels.length], this.labels, 'int64');
      case 'cluster_centers_': return mat(this.centers);
      case 'inertia_': return this.inertia;
      default: return undefined;
    }
  }
}

/* ---------- 分け方と評価 ---------- */

const pickRows = (v: Value, at: number[]): Value => {
  if (v instanceof DataFrame) return v.pick(at);
  if (v instanceof Series) return v.pick(at);
  const a = NdArray.from(v);
  if (a.ndim === 1) return new NdArray([at.length], at.map((i) => a.data[i] ?? 0), a.dtype);
  const w = a.shape[1] ?? 1;
  return new NdArray([at.length, w], at.flatMap((i) => a.data.slice(i * w, (i + 1) * w)), a.dtype);
};

const lengthOf = (v: Value): number => (v instanceof PyObj ? v.len() ?? 0 : 0);

function stratifiedFolds(y: NdArray, k: number): number[] {
  const firstSeen: (number | string)[] = [];
  for (const v of y.data) if (!firstSeen.includes(v)) firstSeen.push(v);
  const encoded = y.data.map((v) => firstSeen.indexOf(v));
  const counts = firstSeen.map((_, c) => encoded.filter((e) => e === c).length);
  if (Math.max(...counts) < k) throw new PyError('ValueError', `n_splits=${String(k)} cannot be greater than the number of members in each class.`);
  const sorted = [...encoded].sort((a, b) => a - b);
  const alloc = Array.from({ length: k }, (_, f) => firstSeen.map((_u, c) => sorted.filter((v, i) => i % k === f && v === c).length));
  const folds = new Array<number>(y.size).fill(0);
  firstSeen.forEach((_, c) => {
    const forClass = alloc.flatMap((row, f) => Array.from({ length: row[c] ?? 0 }, () => f));
    let at = 0;
    encoded.forEach((e, i) => { if (e === c) { folds[i] = forClass[at] ?? 0; at += 1; } });
  });
  return folds;
}

function kfolds(n: number, k: number): number[] {
  const out = new Array<number>(n).fill(0);
  let at = 0;
  for (let f = 0; f < k; f += 1) {
    const size = Math.floor(n / k) + (f < n % k ? 1 : 0);
    for (let i = 0; i < size; i += 1) { out[at] = f; at += 1; }
  }
  return out;
}

class Splitter extends PyObj {
  constructor(readonly typeName: string, readonly k: number, readonly stratified: boolean, readonly shuffleState: number | null) { super(); }
  folds(n: number, y: NdArray | null): number[] {
    let base = this.stratified && y ? stratifiedFolds(y, this.k) : kfolds(n, this.k);
    if (this.shuffleState !== null && !this.stratified) {
      const order = new RandomState(this.shuffleState).permutation(n);
      const f = new Array<number>(n).fill(0);
      base.forEach((v, i) => { f[order[i] ?? 0] = v; });
      base = f;
    }
    return base;
  }
  override getAttr(name: string): Value | undefined {
    if (name !== 'split') return undefined;
    return fn(name, (a) => {
      const n = lengthOf(a[0] ?? null);
      const y = a[1] === undefined ? null : labels(a[1]);
      const f = this.folds(n, y);
      return new PyList(Array.from({ length: this.k }, (_, k) => {
        const test: number[] = [];
        const train: number[] = [];
        f.forEach((v, i) => { (v === k ? test : train).push(i); });
        return new PyTuple([new NdArray([train.length], train, 'int64'), new NdArray([test.length], test, 'int64')]);
      }));
    });
  }
}

function cvScores(est: Estimator, X: Value, y: Value, cv: Value | undefined): number[] {
  const x = X2D(X);
  const t = labels(y);
  checkSameLength(x, t);
  const splitter = cv instanceof Splitter ? cv : new Splitter('KFold', cv === undefined || cv === null ? 5 : toInt(cv), est.isClassifier, null);
  const f = splitter.folds(x.length, t);
  return Array.from({ length: splitter.k }, (_, k) => {
    const train = f.flatMap((v, i) => (v === k ? [] : [i]));
    const test = f.flatMap((v, i) => (v === k ? [i] : []));
    const m = est.clone();
    m.fitModel(train.map((i) => x[i] ?? []), new NdArray([train.length], train.map((i) => t.data[i] ?? 0), t.dtype));
    m.fitted = true;
    return m.scoreOf(test.map((i) => x[i] ?? []), new NdArray([test.length], test.map((i) => t.data[i] ?? 0), t.dtype));
  });
}

class GridSearch extends PyObj {
  readonly typeName = 'GridSearchCV';
  private best: Record<string, Value> = {};
  private bestScore = 0;
  private bestModel: Estimator | null = null;
  constructor(readonly est: Estimator, readonly grid: PyDict, readonly cv: Value | undefined) { super(); }
  override getAttr(name: string): Value | undefined {
    switch (name) {
      case 'fit': return fn(name, (a) => {
        const names = this.grid.entries().map(([k]) => str(k)).sort();
        const lists = names.map((n) => iterOf(this.grid.getItem(n)));
        let combos: Value[][] = [[]];
        for (const l of lists) combos = combos.flatMap((c) => l.map((v) => [...c, v]));
        let bs = -Infinity;
        for (const c of combos) {
          const m = this.est.clone();
          names.forEach((n, i) => { m.setParam(n, c[i] ?? null); });
          const s = mean(cvScores(m, a[0] ?? null, a[1] ?? null, this.cv));
          if (s > bs + 1e-12) { bs = s; this.best = Object.fromEntries(names.map((n, i) => [n, c[i] ?? null])); this.bestModel = m; }
        }
        this.bestScore = bs;
        const m = this.bestModel as Estimator;
        m.fitModel(X2D(a[0]), labels(a[1]));
        m.fitted = true;
        return this;
      });
      case 'best_params_': return new PyDict(Object.entries(this.best));
      case 'best_score_': return this.bestScore;
      case 'best_estimator_': return this.bestModel;
      case 'predict': return fn(name, (a) => (this.bestModel as Estimator).predictRows(X2D(a[0])));
      case 'score': return fn(name, (a) => (this.bestModel as Estimator).scoreOf(X2D(a[0]), labels(a[1])));
      default: return undefined;
    }
  }
}

function binaryCounts(yt: NdArray, yp: NdArray, pos: Value | undefined): { tp: number; fp: number; fn_: number; tn: number } {
  if (yt.size !== yp.size) throw new PyError('ValueError', `Found input variables with inconsistent numbers of samples: [${String(yt.size)}, ${String(yp.size)}]`);
  const p = pos === undefined ? 1 : typeof pos === 'string' ? pos : num(pos);
  let tp = 0; let fp = 0; let f = 0; let tn = 0;
  yt.data.forEach((t, i) => {
    const q = yp.data[i];
    if (t === p && q === p) tp += 1;
    else if (t !== p && q === p) fp += 1;
    else if (t === p && q !== p) f += 1;
    else tn += 1;
  });
  return { tp, fp, fn_: f, tn };
}

function rocPoints(y: NdArray, s: number[]): { fpr: number[]; tpr: number[]; thr: number[]; auc: number } {
  const order = s.map((v, i) => [v, i] as const).sort((a, b) => b[0] - a[0]);
  const P = y.nums.filter((v) => v === 1).length;
  const N = y.size - P;
  const fpr = [0];
  const tpr = [0];
  const thr = [Infinity];
  let tp = 0;
  let fp = 0;
  for (let i = 0; i < order.length; i += 1) {
    const [v, at] = order[i] ?? [0, 0];
    if (y.nums[at] === 1) tp += 1; else fp += 1;
    if (i === order.length - 1 || order[i + 1]?.[0] !== v) { fpr.push(fp / N); tpr.push(tp / P); thr.push(v); }
  }
  let auc = 0;
  for (let i = 1; i < fpr.length; i += 1) auc += ((fpr[i] ?? 0) - (fpr[i - 1] ?? 0)) * ((tpr[i] ?? 0) + (tpr[i - 1] ?? 0)) / 2;
  return { fpr, tpr, thr, auc };
}

export function sklearnModules(): Record<string, PyModule> {
  const metric = (name: string, f: (a: NdArray, b: NdArray, kw: Kw) => number): Value => fn(name, (a, kw) => f(labels(a[0]), labels(a[1]), kw));
  const prf = (a: NdArray, b: NdArray, kw: Kw): { tp: number; fp: number; fn_: number; tn: number } => binaryCounts(a, b, kw.get('pos_label'));
  const linear = new PyModule('sklearn.linear_model', {
    LinearRegression: fn('LinearRegression', () => new LinearModel('LinearRegression', 0, 'ols')),
    Ridge: fn('Ridge', (a, kw) => new LinearModel('Ridge', num(a[0] ?? kw.get('alpha') ?? 1), 'ridge')),
    Lasso: fn('Lasso', (a, kw) => new LinearModel('Lasso', num(a[0] ?? kw.get('alpha') ?? 1), 'lasso')),
    LogisticRegression: fn('LogisticRegression', (_a, kw) => new Logistic(num(kw.get('C') ?? 1))),
  });
  const tree = new PyModule('sklearn.tree', {
    DecisionTreeClassifier: fn('DecisionTreeClassifier', (_a, kw) => {
      const d = kw.get('max_depth') ?? null;
      return new DecisionTree(d === null ? null : toInt(d), kw.get('random_state') ?? null, kw.get('min_samples_leaf') === undefined ? 1 : toInt(kw.get('min_samples_leaf') ?? 1n));
    }),
    export_text: fn('export_text', (a, kw) => {
      const m = a[0];
      if (!(m instanceof DecisionTree)) throw new PyError('TypeError', 'export_text needs a fitted tree');
      const names = kw.get('feature_names');
      return m.rules(names === undefined ? [] : iterOf(names).map((x) => str(x)));
    }),
  });
  const neighbors = new PyModule('sklearn.neighbors', {
    KNeighborsClassifier: fn('KNeighborsClassifier', (a, kw) => new KNN(toInt(a[0] ?? kw.get('n_neighbors') ?? 5n))),
  });
  const ensemble = new PyModule('sklearn.ensemble', {
    VotingClassifier: fn('VotingClassifier', (a, kw) => {
      const list = iterOf(a[0] ?? kw.get('estimators') ?? null).map((p) => {
        const [n = '', e = null] = iterOf(p);
        if (!(e instanceof Estimator)) throw new PyError('TypeError', `estimator must be an estimator, not ${typeName(e)}`);
        return [str(n), e] as [string, Estimator];
      });
      return new Voting(list);
    }),
  });
  const preprocessing = new PyModule('sklearn.preprocessing', {
    StandardScaler: fn('StandardScaler', () => new Transformer('standard')),
    MinMaxScaler: fn('MinMaxScaler', () => new Transformer('minmax')),
  });
  const decomposition = new PyModule('sklearn.decomposition', {
    PCA: fn('PCA', (a, kw) => { const n = a[0] ?? kw.get('n_components') ?? null; return new PCA(n === null ? null : toInt(n)); }),
  });
  const cluster = new PyModule('sklearn.cluster', {
    KMeans: fn('KMeans', (a, kw) => {
      const init = kw.get('init');
      return new KMeans(toInt(a[0] ?? kw.get('n_clusters') ?? 8n), init instanceof PyObj ? NdArray.from(init).rows() : null);
    }),
  });
  const model_selection = new PyModule('sklearn.model_selection', {
    train_test_split: fn('train_test_split', (a, kw) => {
      if (a.length === 0) throw new PyError('ValueError', 'At least one array required as input');
      const n = lengthOf(a[0] ?? null);
      for (const v of a) if (lengthOf(v) !== n) throw new PyError('ValueError', `Found input variables with inconsistent numbers of samples: [${a.map((x) => String(lengthOf(x))).join(', ')}]`);
      const ts = kw.get('test_size');
      const tr = kw.get('train_size');
      const size = (v: Value): number => (typeof v === 'number' ? v : Number(v) / n);
      const nTest = ts !== undefined && ts !== null ? (typeof ts === 'number' ? Math.ceil(ts * n) : toInt(ts)) : tr !== undefined && tr !== null ? n - Math.floor(size(tr) * n) : Math.ceil(0.25 * n);
      const nTrain = tr !== undefined && tr !== null ? Math.floor(size(tr) * n) : n - nTest;
      const shuffle = kw.get('shuffle');
      if (kw.get('stratify') !== undefined && kw.get('stratify') !== null) throw new PyError('NotImplementedError', 'stratify is not available in this practice');
      let train: number[];
      let test: number[];
      if (shuffle !== undefined && !truthy(shuffle)) {
        train = Array.from({ length: nTrain }, (_, i) => i);
        test = Array.from({ length: nTest }, (_, i) => nTrain + i);
      } else {
        const rs = kw.get('random_state');
        const order = new RandomState(rs === undefined || rs === null ? 0 : toInt(rs)).permutation(n);
        test = order.slice(0, nTest);
        train = order.slice(nTest, nTest + nTrain);
      }
      return new PyList(a.flatMap((v) => [pickRows(v, train), pickRows(v, test)]));
    }),
    KFold: fn('KFold', (a, kw) => {
      const sh = kw.get('shuffle');
      const rs = kw.get('random_state');
      return new Splitter('KFold', toInt(a[0] ?? kw.get('n_splits') ?? 5n), false, sh !== undefined && truthy(sh) ? (rs === undefined || rs === null ? 0 : toInt(rs)) : null);
    }),
    StratifiedKFold: fn('StratifiedKFold', (a, kw) => new Splitter('StratifiedKFold', toInt(a[0] ?? kw.get('n_splits') ?? 5n), true, null)),
    cross_val_score: fn('cross_val_score', (a, kw) => {
      const [est, X, y, , cv] = bind('cross_val_score', ['estimator', 'X', 'y', 'groups', 'cv', 'scoring'], a.length > 3 ? [a[0] ?? null, a[1] ?? null, a[2] ?? null] : a, kw);
      if (!(est instanceof Estimator)) throw new PyError('TypeError', `estimator should be an estimator implementing 'fit' method, ${repr(est ?? null)} was passed`);
      const s = cvScores(est, X ?? null, y ?? null, cv);
      return col1D(s);
    }),
    GridSearchCV: fn('GridSearchCV', (a, kw) => {
      const [est, grid, cv] = bind('GridSearchCV', ['estimator', 'param_grid', 'cv'], a, kw);
      if (!(est instanceof Estimator) || !(grid instanceof PyDict)) throw new PyError('TypeError', 'GridSearchCV needs an estimator and a param_grid');
      return new GridSearch(est, grid, cv);
    }),
  });
  const metrics = new PyModule('sklearn.metrics', {
    accuracy_score: metric('accuracy_score', (a, b) => {
      if (a.size !== b.size) throw new PyError('ValueError', `Found input variables with inconsistent numbers of samples: [${String(a.size)}, ${String(b.size)}]`);
      return a.data.filter((v, i) => v === b.data[i]).length / a.size;
    }),
    precision_score: metric('precision_score', (a, b, kw) => { const c = prf(a, b, kw); return c.tp + c.fp === 0 ? 0 : c.tp / (c.tp + c.fp); }),
    recall_score: metric('recall_score', (a, b, kw) => { const c = prf(a, b, kw); return c.tp + c.fn_ === 0 ? 0 : c.tp / (c.tp + c.fn_); }),
    f1_score: metric('f1_score', (a, b, kw) => { const c = prf(a, b, kw); return 2 * c.tp + c.fp + c.fn_ === 0 ? 0 : (2 * c.tp) / (2 * c.tp + c.fp + c.fn_); }),
    confusion_matrix: fn('confusion_matrix', (a) => {
      const t = labels(a[0]);
      const p = labels(a[1]);
      if (t.size !== p.size) throw new PyError('ValueError', `Found input variables with inconsistent numbers of samples: [${String(t.size)}, ${String(p.size)}]`);
      const classes = [...new Set([...t.data, ...p.data])].sort((x, y) => (typeof x === 'number' && typeof y === 'number' ? x - y : String(x) < String(y) ? -1 : 1));
      const out: number[] = [];
      for (const r of classes) for (const c of classes) out.push(t.data.filter((v, i) => v === r && p.data[i] === c).length);
      return new NdArray([classes.length, classes.length], out, 'int64');
    }),
    roc_auc_score: fn('roc_auc_score', (a) => rocPoints(labels(a[0]), labels(a[1]).nums).auc),
    roc_curve: fn('roc_curve', (a) => {
      const r = rocPoints(labels(a[0]), labels(a[1]).nums);
      return new PyTuple([col1D(r.fpr), col1D(r.tpr), col1D(r.thr)]);
    }),
    mean_squared_error: metric('mean_squared_error', (a, b) => mean(a.nums.map((v, i) => (v - (b.nums[i] ?? 0)) ** 2))),
    mean_absolute_error: metric('mean_absolute_error', (a, b) => mean(a.nums.map((v, i) => Math.abs(v - (b.nums[i] ?? 0))))),
    r2_score: metric('r2_score', (a, b) => r2(a.nums, b.nums)),
  });
  const parts = { linear_model: linear, tree, neighbors, ensemble, preprocessing, decomposition, cluster, model_selection, metrics };
  const top = new PyModule('sklearn', { ...parts, __version__: '1.5.2' });
  return { sklearn: top, ...Object.fromEntries(Object.entries(parts).map(([k, v]) => [`sklearn.${k}`, v])) };
}
