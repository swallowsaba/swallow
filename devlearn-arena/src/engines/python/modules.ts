import { numpyModule } from './numpy';
import { pandasModule } from './pandas';
import { scipyStatsModule } from './scipy';
import { sklearnModules } from './sklearn';
import { fn, num, PyError, PyModule, toInt, type Value } from './values';

/** import で読めるモジュール。実戦に要る範囲だけで、ほかは本物の入っていない機械と同じく ModuleNotFoundError */

function mathModule(): PyModule {
  const f1 = (name: string, f: (x: number) => number): [string, Value] => [name, fn(name, (a) => {
    const x = num(a[0] ?? null);
    const r = f(x);
    if (Number.isNaN(r) && !Number.isNaN(x)) throw new PyError('ValueError', name === 'sqrt' ? 'math domain error' : 'math domain error');
    return r;
  })];
  return new PyModule('math', {
    pi: Math.PI, e: Math.E, inf: Infinity, nan: Number.NaN,
    ...Object.fromEntries([f1('sqrt', Math.sqrt), f1('exp', Math.exp), f1('log2', Math.log2), f1('log10', Math.log10), f1('sin', Math.sin), f1('cos', Math.cos), f1('tan', Math.tan), f1('fabs', Math.abs)]),
    log: fn('log', (a) => {
      const x = num(a[0] ?? null);
      if (x <= 0) throw new PyError('ValueError', `expected a positive input, got ${String(x)}`);
      return a[1] === undefined ? Math.log(x) : Math.log(x) / Math.log(num(a[1]));
    }),
    floor: fn('floor', (a) => BigInt(Math.floor(num(a[0] ?? null)))),
    ceil: fn('ceil', (a) => BigInt(Math.ceil(num(a[0] ?? null)))),
    pow: fn('pow', (a) => num(a[0] ?? null) ** num(a[1] ?? null)),
    isnan: fn('isnan', (a) => Number.isNaN(num(a[0] ?? null))),
    factorial: fn('factorial', (a) => { let r = 1n; for (let i = 2n; i <= BigInt(toInt(a[0] ?? 0n)); i += 1n) r *= i; return r; }),
    comb: fn('comb', (a) => {
      const n = BigInt(toInt(a[0] ?? 0n));
      const k = BigInt(toInt(a[1] ?? 0n));
      let r = 1n;
      for (let i = 1n; i <= k; i += 1n) r = (r * (n - k + i)) / i;
      return k > n ? 0n : r;
    }),
  });
}

export function loadModule(name: string, host: { read: (path: string) => string | null }): PyModule | null {
  if (name === 'numpy') return numpy();
  if (name === 'numpy.random') return numpy().getAttr('random') as PyModule;
  if (name === 'numpy.linalg') return numpy().getAttr('linalg') as PyModule;
  if (name === 'pandas') return pandasModule(host.read);
  if (name === 'math') return mathModule();
  if (name === 'scipy') return new PyModule('scipy', { stats: scipyStats(), __version__: '1.14.1' });
  if (name === 'scipy.stats') return scipyStats();
  if (name === 'sklearn' || name.startsWith('sklearn.')) return sklearn()[name] ?? null;
  return null;
}

let np: PyModule | null = null;
const numpy = (): PyModule => { np ??= numpyModule(); return np; };
let stats: PyModule | null = null;
const scipyStats = (): PyModule => { stats ??= scipyStatsModule(); return stats; };
let sk: Record<string, PyModule> | null = null;
const sklearn = (): Record<string, PyModule> => { sk ??= sklearnModules(); return sk; };
