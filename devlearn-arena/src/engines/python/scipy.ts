import { mean, NdArray } from './numpy';
import { bind, fn, floatRepr, num, PyError, PyModule, PyObj, str, toInt, truthy, type Value } from './values';

/** scipy.stats の模擬: 分布の関数と検定。数の計算は標準の方法（不完全ベータ・不完全ガンマ関数）で、本物と同じ値になる */

function logGamma(x: number): number {
  const c = ['76.18009172947146', '-86.50532032941677', '24.01409824083091', '-1.231739572450155', '0.001208650973866179', '-0.000005395239384953'].map(Number);
  let y = x;
  const t = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
  let s = Number('1.000000000190015');
  for (const k of c) { y += 1; s += k / y; }
  return -t + Math.log((2.5066282746310005 * s) / x);
}

/** 正則化された下側の不完全ガンマ関数 P(a, x) */
function gammaP(a: number, x: number): number {
  if (x <= 0) return 0;
  if (x < a + 1) {
    let sum = 1 / a;
    let del = sum;
    let ap = a;
    for (let n = 0; n < 2000; n += 1) {
      ap += 1;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-16) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
  }
  return 1 - gammaQcf(a, x);
}

function gammaQcf(a: number, x: number): number {
  let b = x + 1 - a;
  let c = 1e300;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 2000; i += 1) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c;
    if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-16) break;
  }
  return Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
}

const gammaQ = (a: number, x: number): number => (x <= 0 ? 1 : x < a + 1 ? 1 - gammaP(a, x) : gammaQcf(a, x));

/** 正則化された不完全ベータ関数 I_x(a, b) */
function betaI(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  const cf = (p: number, q: number, y: number): number => {
    let c = 1;
    let d = 1 - ((p + q) * y) / (p + 1);
    if (Math.abs(d) < 1e-300) d = 1e-300;
    d = 1 / d;
    let h = d;
    for (let m = 1; m < 2000; m += 1) {
      const m2 = 2 * m;
      let aa = (m * (q - m) * y) / ((p - 1 + m2) * (p + m2));
      d = 1 + aa * d;
      if (Math.abs(d) < 1e-300) d = 1e-300;
      c = 1 + aa / c;
      if (Math.abs(c) < 1e-300) c = 1e-300;
      d = 1 / d;
      h *= d * c;
      aa = (-(p + m) * (p + q + m) * y) / ((p + m2) * (p + 1 + m2));
      d = 1 + aa * d;
      if (Math.abs(d) < 1e-300) d = 1e-300;
      c = 1 + aa / c;
      if (Math.abs(c) < 1e-300) c = 1e-300;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < 1e-16) break;
    }
    return h;
  };
  return x < (a + 1) / (a + b + 2) ? (bt * cf(a, b, x)) / a : 1 - (bt * cf(b, a, 1 - x)) / b;
}

const normSf = (z: number): number => (z >= 0 ? 0.5 * gammaQ(0.5, (z * z) / 2) : 1 - 0.5 * gammaQ(0.5, (z * z) / 2));
export const normCdf = (z: number): number => 1 - normSf(z);
const tCdf = (t: number, df: number): number => {
  const p = betaI(df / 2, 0.5, df / (df + t * t)) / 2;
  return t > 0 ? 1 - p : p;
};
const tSf = (t: number, df: number): number => tCdf(-t, df);
const chi2Cdf = (x: number, df: number): number => gammaP(df / 2, x / 2);
const chi2Sf = (x: number, df: number): number => gammaQ(df / 2, x / 2);
const fCdf = (x: number, d1: number, d2: number): number => (x <= 0 ? 0 : betaI(d1 / 2, d2 / 2, (d1 * x) / (d1 * x + d2)));
const fSf = (x: number, d1: number, d2: number): number => (x <= 0 ? 1 : betaI(d2 / 2, d1 / 2, d2 / (d1 * x + d2)));

/** 分布の下側の点（累積の値を二分法で解く） */
function quantile(cdf: (x: number) => number, p: number, lo0: number, hi0: number): number {
  if (Number.isNaN(p) || p < 0 || p > 1) return Number.NaN;
  let lo = lo0;
  let hi = hi0;
  while (cdf(hi) < p) hi = hi <= 0 ? hi / 2 + 1 : hi * 2;
  while (cdf(lo) > p) lo = lo >= 0 ? lo / 2 - 1 : lo * 2;
  for (let i = 0; i < 400; i += 1) {
    const mid = (lo + hi) / 2;
    if (cdf(mid) < p) lo = mid; else hi = mid;
    if (hi - lo <= Math.abs(mid) * 1e-15) break;
  }
  return (lo + hi) / 2;
}

/** 数でも配列でも受ける関数にする */
function vec(f: (x: number) => number): (v: Value) => Value {
  return (v) => {
    if (v instanceof PyObj) {
      const a = NdArray.from(v);
      return new NdArray([...a.shape], a.nums.map(f), 'float64');
    }
    return f(num(v));
  };
}

function shapes(name: string, params: readonly string[], a: Value[], kw: ReadonlyMap<string, Value>): { x: Value; ps: number[] } {
  const [x = null, ...rest] = bind(name, ['x', ...params], a, kw);
  return { x, ps: rest.map((p, i) => (p === undefined ? (params[i] === 'loc' ? 0 : params[i] === 'scale' ? 1 : Number.NaN) : num(p))) };
}

function continuous(name: string, params: readonly string[], cdf: (x: number, p: number[]) => number, sf: (x: number, p: number[]) => number, pdf: (x: number, p: number[]) => number, support: (p: number[]) => [number, number], moments?: (p: number[]) => [number, number]): PyModule {
  const call = (m: string, f: (x: number, p: number[]) => number): Value => fn(m, (a, kw) => {
    const { x, ps } = shapes(m, m === 'ppf' ? [...params] : [...params], a, kw);
    return vec((v) => f(v, ps))(x);
  });
  return new PyModule(name, {
    cdf: call('cdf', cdf),
    sf: call('sf', sf),
    pdf: call('pdf', pdf),
    ppf: call('ppf', (q, p) => { const [lo, hi] = support(p); return quantile((x) => cdf(x, p), q, lo, hi); }),
    isf: call('isf', (q, p) => { const [lo, hi] = support(p); return quantile((x) => cdf(x, p), 1 - q, lo, hi); }),
    ...(moments ? {
      mean: fn('mean', (a, kw) => { const { ps } = shapes('mean', params, [0n, ...a], kw); return moments(ps)[0]; }),
      var: fn('var', (a, kw) => { const { ps } = shapes('var', params, [0n, ...a], kw); return moments(ps)[1]; }),
      std: fn('std', (a, kw) => { const { ps } = shapes('std', params, [0n, ...a], kw); return Math.sqrt(moments(ps)[1]); }),
    } : {}),
  });
}

const logChoose = (n: number, k: number): number => logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1);

function discrete(name: string, params: readonly string[], pmf: (k: number, p: number[]) => number, moments: (p: number[]) => [number, number]): PyModule {
  const cdf = (x: number, p: number[]): number => {
    let s = 0;
    for (let k = 0; k <= Math.floor(x); k += 1) s += pmf(k, p);
    return Math.min(1, s);
  };
  const call = (m: string, f: (x: number, p: number[]) => number): Value => fn(m, (a, kw) => {
    const { x, ps } = shapes(m, params, a, kw);
    return vec((v) => f(v, ps))(x);
  });
  return new PyModule(name, {
    pmf: call('pmf', pmf),
    cdf: call('cdf', cdf),
    sf: call('sf', (x, p) => 1 - cdf(x, p)),
    mean: fn('mean', (a, kw) => { const { ps } = shapes('mean', params, [0n, ...a], kw); return moments(ps)[0]; }),
    var: fn('var', (a, kw) => { const { ps } = shapes('var', params, [0n, ...a], kw); return moments(ps)[1]; }),
    std: fn('std', (a, kw) => { const { ps } = shapes('std', params, [0n, ...a], kw); return Math.sqrt(moments(ps)[1]); }),
  });
}

/** 検定の結果（名前で読め、順に取り出せる） */
export class Result extends PyObj {
  constructor(readonly typeName: string, readonly fields: readonly [string, Value][], readonly unpack: number = fields.length) { super(); }
  override getAttr(name: string): Value | undefined { return this.fields.find(([k]) => k === name)?.[1]; }
  override iter(): Value[] { return this.fields.slice(0, this.unpack).map(([, v]) => v); }
  override len(): number { return this.unpack; }
  override getItem(i: Value): Value { return this.iter()[toInt(i)] ?? null; }
  override repr(): string {
    const show = (v: Value): string => (typeof v === 'number' ? `np.float64(${floatRepr(v)})` : typeof v === 'bigint' ? `np.int64(${String(v)})` : v instanceof PyObj ? v.repr() : str(v));
    return `${this.typeName}(${this.fields.map(([k, v]) => `${k}=${show(v)}`).join(', ')})`;
  }
}

const numsOf = (v: Value | undefined): number[] => NdArray.from(v ?? null).nums.filter((x) => !Number.isNaN(x));
const sampleVar = (xs: number[]): number => { const m = mean(xs); return xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1); };

function tailP(t: number, df: number, alt: string): number {
  if (alt === 'greater') return tSf(t, df);
  if (alt === 'less') return tCdf(t, df);
  return 2 * tSf(Math.abs(t), df);
}

const altOf = (v: Value | undefined): string => (v === undefined ? 'two-sided' : str(v));

function ranks(xs: readonly number[]): number[] {
  const order = xs.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
  const out = new Array<number>(xs.length).fill(0);
  for (let i = 0; i < order.length;) {
    let j = i;
    while (j + 1 < order.length && order[j + 1]?.[0] === order[i]?.[0]) j += 1;
    for (let k = i; k <= j; k += 1) out[order[k]?.[1] ?? 0] = (i + j) / 2 + 1;
    i = j + 1;
  }
  return out;
}

/** マン・ホイットニーの U の正確な分布（同順位が無い時） */
function exactUSf(u: number, n1: number, n2: number): number {
  const memo = new Map<string, number>();
  const count = (m: number, n: number, k: number): number => {
    if (k < 0) return 0;
    if (m === 0 || n === 0) return k === 0 ? 1 : 0;
    const key = `${String(m)},${String(n)},${String(k)}`;
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    const r = count(m - 1, n, k - n) + count(m, n - 1, k);
    memo.set(key, r);
    return r;
  };
  let total = 0;
  let above = 0;
  for (let k = 0; k <= n1 * n2; k += 1) {
    const c = count(n1, n2, k);
    total += c;
    if (k >= u) above += c;
  }
  return above / total;
}

export function scipyStatsModule(): PyModule {
  const norm = continuous('norm', ['loc', 'scale'],
    (x, [m = 0, s = 1]) => normCdf((x - m) / s), (x, [m = 0, s = 1]) => normSf((x - m) / s),
    (x, [m = 0, s = 1]) => Math.exp(-(((x - m) / s) ** 2) / 2) / (s * Math.sqrt(2 * Math.PI)),
    ([m = 0, s = 1]) => [m - 40 * s, m + 40 * s], ([m = 0, s = 1]) => [m, s * s]);
  const t = continuous('t', ['df'], (x, [df = 1]) => tCdf(x, df), (x, [df = 1]) => tSf(x, df),
    (x, [df = 1]) => Math.exp(logGamma((df + 1) / 2) - logGamma(df / 2)) / Math.sqrt(df * Math.PI) * (1 + (x * x) / df) ** (-(df + 1) / 2), () => [-1e6, 1e6], ([df = 1]) => [0, df > 2 ? df / (df - 2) : Infinity]);
  const chi2 = continuous('chi2', ['df'], (x, [df = 1]) => chi2Cdf(x, df), (x, [df = 1]) => chi2Sf(x, df),
    (x, [df = 1]) => (x <= 0 ? 0 : Math.exp((df / 2 - 1) * Math.log(x) - x / 2 - (df / 2) * Math.LN2 - logGamma(df / 2))), () => [0, 1e6], ([df = 1]) => [df, 2 * df]);
  const f = continuous('f', ['dfn', 'dfd'], (x, [a = 1, b = 1]) => fCdf(x, a, b), (x, [a = 1, b = 1]) => fSf(x, a, b), () => Number.NaN, () => [0, 1e6]);
  const binom = discrete('binom', ['n', 'p'], (k, [n = 0, p = 0]) => {
    if (k < 0 || k > n || !Number.isInteger(k)) return 0;
    if (p === 0) return k === 0 ? 1 : 0;
    if (p === 1) return k === n ? 1 : 0;
    return Math.exp(logChoose(n, k) + k * Math.log(p) + (n - k) * Math.log(1 - p));
  }, ([n = 0, p = 0]) => [n * p, n * p * (1 - p)]);
  const poisson = discrete('poisson', ['mu'], (k, [mu = 0]) => (k < 0 || !Number.isInteger(k) ? 0 : Math.exp(k * Math.log(mu) - mu - logGamma(k + 1))), ([mu = 0]) => [mu, mu]);

  const ttest = (statistic: number, df: number, alt: string): Result => new Result('TtestResult', [['statistic', statistic], ['pvalue', tailP(statistic, df, alt)], ['df', df]], 2);

  return new PyModule('scipy.stats', {
    norm, t, chi2, f, binom, poisson,
    ttest_1samp: fn('ttest_1samp', (a, kw) => {
      const [x, popmean, alt] = bind('ttest_1samp', ['a', 'popmean', 'alternative'], a, kw);
      const xs = numsOf(x);
      const se = Math.sqrt(sampleVar(xs) / xs.length);
      return ttest((mean(xs) - num(popmean ?? 0n)) / se, xs.length - 1, altOf(alt));
    }),
    ttest_ind: fn('ttest_ind', (a, kw) => {
      const [x, y, eq, alt] = bind('ttest_ind', ['a', 'b', 'equal_var', 'alternative'], a, kw);
      const p = numsOf(x);
      const q = numsOf(y);
      const v1 = sampleVar(p);
      const v2 = sampleVar(q);
      const n1 = p.length;
      const n2 = q.length;
      if (eq !== undefined && !truthy(eq)) {
        const se2 = v1 / n1 + v2 / n2;
        const df = se2 ** 2 / ((v1 / n1) ** 2 / (n1 - 1) + (v2 / n2) ** 2 / (n2 - 1));
        return ttest((mean(p) - mean(q)) / Math.sqrt(se2), df, altOf(alt));
      }
      const df = n1 + n2 - 2;
      const sp = ((n1 - 1) * v1 + (n2 - 1) * v2) / df;
      return ttest((mean(p) - mean(q)) / Math.sqrt(sp * (1 / n1 + 1 / n2)), df, altOf(alt));
    }),
    ttest_rel: fn('ttest_rel', (a, kw) => {
      const [x, y, alt] = bind('ttest_rel', ['a', 'b', 'alternative'], a, kw);
      const p = numsOf(x);
      const q = numsOf(y);
      if (p.length !== q.length) throw new PyError('ValueError', 'unequal length arrays');
      const d = p.map((v, i) => v - (q[i] ?? 0));
      return ttest(mean(d) / Math.sqrt(sampleVar(d) / d.length), d.length - 1, altOf(alt));
    }),
    chi2_contingency: fn('chi2_contingency', (a, kw) => {
      const [table, correction] = bind('chi2_contingency', ['observed', 'correction'], a, kw);
      const x = NdArray.from(table ?? null);
      const [r = 0, c = 0] = x.shape;
      if (x.nums.some((v) => v < 0)) throw new PyError('ValueError', 'All values in `observed` must be nonnegative.');
      const row = Array.from({ length: r }, (_, i) => x.nums.slice(i * c, (i + 1) * c).reduce((s, v) => s + v, 0));
      const col = Array.from({ length: c }, (_, j) => Array.from({ length: r }, (_u, i) => x.nums[i * c + j] ?? 0).reduce((s, v) => s + v, 0));
      const total = row.reduce((s, v) => s + v, 0);
      const expected = row.flatMap((p) => col.map((q) => (p * q) / total));
      if (expected.some((e) => e === 0)) throw new PyError('ValueError', 'The internally computed table of expected frequencies has a zero element at (0, 0).');
      const dof = (r - 1) * (c - 1);
      const correct = dof === 1 && (correction === undefined || truthy(correction));
      const stat = x.nums.reduce((s, o, i) => {
        const e = expected[i] ?? 1;
        const d = o - e;
        const adj = correct ? Math.sign(d) * Math.min(0.5, Math.abs(d)) : 0;
        return s + (d - adj) ** 2 / e;
      }, 0);
      return new Result('Chi2ContingencyResult', [['statistic', stat], ['pvalue', chi2Sf(stat, dof)], ['dof', BigInt(dof)], ['expected_freq', new NdArray([r, c], expected, 'float64')]]);
    }),
    f_oneway: fn('f_oneway', (a) => {
      const groups = a.map(numsOf);
      const all = groups.flat();
      const m = mean(all);
      const between = groups.reduce((s, g) => s + g.length * (mean(g) - m) ** 2, 0);
      const within = groups.reduce((s, g) => { const gm = mean(g); return s + g.reduce((t, x) => t + (x - gm) ** 2, 0); }, 0);
      const d1 = groups.length - 1;
      const d2 = all.length - groups.length;
      const stat = between / d1 / (within / d2);
      return new Result('F_onewayResult', [['statistic', stat], ['pvalue', fSf(stat, d1, d2)]]);
    }),
    mannwhitneyu: fn('mannwhitneyu', (a, kw) => {
      const [x, y, , alt] = bind('mannwhitneyu', ['x', 'y', 'use_continuity', 'alternative'], a, kw);
      const p = numsOf(x);
      const q = numsOf(y);
      const n1 = p.length;
      const n2 = q.length;
      const rs = ranks([...p, ...q]);
      const r1 = rs.slice(0, n1).reduce((s, v) => s + v, 0);
      const u1 = r1 - (n1 * (n1 + 1)) / 2;
      const u2 = n1 * n2 - u1;
      const how = altOf(alt);
      const tied = new Set([...p, ...q]).size !== n1 + n2;
      const big = how === 'greater' ? u1 : how === 'less' ? u2 : Math.max(u1, u2);
      let pv: number;
      if (!tied && Math.min(n1, n2) <= 8) {
        pv = exactUSf(big, n1, n2);
      } else {
        const counts = new Map<number, number>();
        for (const v of [...p, ...q]) counts.set(v, (counts.get(v) ?? 0) + 1);
        const n = n1 + n2;
        const tie = [...counts.values()].reduce((s, c) => s + (c ** 3 - c), 0);
        const sd = Math.sqrt(((n1 * n2) / 12) * (n + 1 - tie / (n * (n - 1))));
        pv = normSf((big - (n1 * n2) / 2 - 0.5) / sd);
      }
      if (how === 'two-sided') pv *= 2;
      return new Result('MannwhitneyuResult', [['statistic', u1], ['pvalue', Math.min(1, pv)]]);
    }),
    pearsonr: fn('pearsonr', (a) => {
      const x = numsOf(a[0]);
      const y = numsOf(a[1]);
      if (x.length !== y.length) throw new PyError('ValueError', '`x` and `y` must have the same length along `axis`.');
      const mx = mean(x);
      const my = mean(y);
      const r = x.reduce((s, v, i) => s + (v - mx) * ((y[i] ?? 0) - my), 0) / Math.sqrt(x.reduce((s, v) => s + (v - mx) ** 2, 0) * y.reduce((s, v) => s + (v - my) ** 2, 0));
      const df = x.length - 2;
      const tv = r * Math.sqrt(df / (1 - r * r));
      return new Result('PearsonRResult', [['statistic', r], ['pvalue', 2 * tSf(Math.abs(tv), df)]]);
    }),
    spearmanr: fn('spearmanr', (a) => {
      const x = ranks(numsOf(a[0]));
      const y = ranks(numsOf(a[1]));
      const mx = mean(x);
      const my = mean(y);
      const r = x.reduce((s, v, i) => s + (v - mx) * ((y[i] ?? 0) - my), 0) / Math.sqrt(x.reduce((s, v) => s + (v - mx) ** 2, 0) * y.reduce((s, v) => s + (v - my) ** 2, 0));
      const df = x.length - 2;
      const tv = r * Math.sqrt(df / (1 - r * r));
      return new Result('SignificanceResult', [['statistic', r], ['pvalue', 2 * tSf(Math.abs(tv), df)]]);
    }),
    linregress: fn('linregress', (a) => {
      const x = numsOf(a[0]);
      const y = numsOf(a[1]);
      const mx = mean(x);
      const my = mean(y);
      const sxx = x.reduce((s, v) => s + (v - mx) ** 2, 0);
      const syy = y.reduce((s, v) => s + (v - my) ** 2, 0);
      const sxy = x.reduce((s, v, i) => s + (v - mx) * ((y[i] ?? 0) - my), 0);
      const slope = sxy / sxx;
      const r = sxy / Math.sqrt(sxx * syy);
      const df = x.length - 2;
      const tv = r * Math.sqrt(df / (1 - r * r));
      const stderr = Math.sqrt(((1 - r * r) * syy) / sxx / df);
      return new Result('LinregressResult', [['slope', slope], ['intercept', my - slope * mx], ['rvalue', r], ['pvalue', 2 * tSf(Math.abs(tv), df)], ['stderr', stderr]], 5);
    }),
    sem: fn('sem', (a) => { const x = numsOf(a[0]); return Math.sqrt(sampleVar(x) / x.length); }),
    iqr: fn('iqr', (a) => {
      const x = NdArray.from(a[0] ?? null);
      const s = [...x.nums].sort((p, q) => p - q);
      const at = (q: number): number => { const k = q * (s.length - 1); const l = Math.floor(k); return (s[l] ?? 0) + ((s[Math.ceil(k)] ?? 0) - (s[l] ?? 0)) * (k - l); };
      return at(0.75) - at(0.25);
    }),
    zscore: fn('zscore', (a) => { const x = NdArray.from(a[0] ?? null); const m = mean(x.nums); const sd = Math.sqrt(x.nums.reduce((s, v) => s + (v - m) ** 2, 0) / x.size); return x.mapF((v) => (v - m) / sd); }),
  });
}

