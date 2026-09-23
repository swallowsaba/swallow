/**
 * seed から決める。乱数は使わない。
 *
 * 街の見た目の振れ幅（建物の向き、木の位置、車の色）は、すべてここを通す。
 * 同じ seed と同じ番号からは必ず同じ数が出るので、街は毎回同じ姿になる。
 */

/** 32bit の混ぜ合わせ。1 つの整数から、散らばった 1 つの整数を出す */
export function hash32(value: number): number {
  let x = value | 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = x ^ (x >>> 16);
  return x >>> 0;
}

/** 文字列から seed を作る（FNV-1a）。同じ名前のビルは毎回同じ顔になる */
export function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** seed と番号から 0 以上 1 未満の数を出す */
export function unit(seed: number, index: number): number {
  return hash32(Math.imul(seed | 0, 0x9e3779b1) + index) / 0x100000000;
}

/** seed と番号から min 以上 max 未満の数を出す */
export function between(seed: number, index: number, min: number, max: number): number {
  return min + unit(seed, index) * (max - min);
}

/** seed と番号から min 以上 max 以下の整数を出す */
export function intBetween(seed: number, index: number, min: number, max: number): number {
  return min + Math.floor(unit(seed, index) * (max - min + 1));
}

/** seed と番号で 1 つ選ぶ */
export function pick<T>(items: readonly T[], seed: number, index: number): T {
  if (items.length === 0) throw new Error('選ぶものが無い');
  const chosen = items[Math.floor(unit(seed, index) * items.length) % items.length];
  if (chosen === undefined) throw new Error('選べなかった');
  return chosen;
}

/**
 * 番号を自分で進める引き出し。
 * 並べて置くもの（木・街灯・窓）を順に決めるときに使う。
 * 作った順に同じ数が出るので、結果は決定論のまま。
 */
export interface Rng {
  unit(): number;
  between(min: number, max: number): number;
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  /** 確率 p で true */
  chance(p: number): boolean;
  /** 同じ seed から枝分かれした別の引き出しを作る */
  fork(tag: string): Rng;
}

export function stream(seed: number): Rng {
  let index = 0;
  const next = (): number => {
    index += 1;
    return unit(seed, index);
  };
  return {
    unit: next,
    between: (min, max) => min + next() * (max - min),
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (items) => {
      if (items.length === 0) throw new Error('選ぶものが無い');
      const chosen = items[Math.floor(next() * items.length) % items.length];
      if (chosen === undefined) throw new Error('選べなかった');
      return chosen;
    },
    chance: (p) => next() < p,
    fork: (tag) => stream(hash32(seed + hashString(tag))),
  };
}
