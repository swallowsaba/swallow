/**
 * numpy の np.random（RandomState）と同じ乱数。種が同じなら本物と同じ列になる（同じ操作からは同じ結果。CLAUDE.md 7 章）。
 * MT19937 の本体と、numpy の legacy の振る舞い（random_sample・gauss・interval・randint・permutation）。
 */
export class RandomState {
  private readonly mt = new Uint32Array(624);
  private pos = 624;
  private gauss: number | null = null;

  constructor(seed: number) { this.seed(seed); }

  seed(seed: number): void {
    let s = seed >>> 0;
    for (let i = 0; i < 624; i += 1) {
      this.mt[i] = s;
      s = (Math.imul(1812433253, s ^ (s >>> 30)) + i + 1) >>> 0;
    }
    this.pos = 624;
    this.gauss = null;
  }

  private next32(): number {
    const mt = this.mt;
    if (this.pos === 624) {
      for (let k = 0; k < 624; k += 1) {
        const y = ((mt[k] ?? 0) & 0x80000000) | ((mt[(k + 1) % 624] ?? 0) & 0x7fffffff);
        mt[k] = ((mt[(k + 397) % 624] ?? 0) ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0)) >>> 0;
      }
      this.pos = 0;
    }
    let y = mt[this.pos] ?? 0;
    this.pos += 1;
    y ^= y >>> 11;
    y ^= (y << 7) & 0x9d2c5680;
    y ^= (y << 15) & 0xefc60000;
    y ^= y >>> 18;
    return y >>> 0;
  }

  /** [0, 1) の一様な乱数 */
  random(): number {
    const a = this.next32() >>> 5;
    const b = this.next32() >>> 6;
    return (a * 67108864 + b) / 9007199254740992;
  }

  /** 標準正規分布の乱数（極座標法。2 つ作って 1 つを控える） */
  normal(): number {
    if (this.gauss !== null) {
      const g = this.gauss;
      this.gauss = null;
      return g;
    }
    let x1 = 0;
    let x2 = 0;
    let r2 = 0;
    do {
      x1 = 2 * this.random() - 1;
      x2 = 2 * this.random() - 1;
      r2 = x1 * x1 + x2 * x2;
    } while (r2 >= 1 || r2 === 0);
    const f = Math.sqrt((-2 * Math.log(r2)) / r2);
    this.gauss = f * x1;
    return f * x2;
  }

  /** [0, max] の整数（マスクして、はみ出たら引き直す。max は 2^32 未満） */
  interval(max: number): number {
    if (max === 0) return 0;
    let mask = max;
    mask |= mask >>> 1;
    mask |= mask >>> 2;
    mask |= mask >>> 4;
    mask |= mask >>> 8;
    mask |= mask >>> 16;
    mask >>>= 0;
    for (;;) {
      const v = (this.next32() & mask) >>> 0;
      if (v <= max) return v;
    }
  }

  /** np.random.shuffle と同じ入れ替え */
  shuffle<T>(xs: T[]): void {
    for (let i = xs.length - 1; i >= 1; i -= 1) {
      const j = this.interval(i);
      const t = xs[i] as T;
      xs[i] = xs[j] as T;
      xs[j] = t;
    }
  }

  permutation(n: number): number[] {
    const xs = Array.from({ length: n }, (_, i) => i);
    this.shuffle(xs);
    return xs;
  }
}
