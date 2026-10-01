/**
 * seed から決まる乱数（docs/architecture.md 3 章）。
 * 都市の模型では Math.random を使わない。同じ seed からは必ず同じ都市になる。
 */

/** mulberry32。0 以上 1 未満を返す関数を作る */
export function createRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** 整数の組から 0 以上 1 未満の値を 1 つ決める（場所ごとの揺らぎ用） */
export function hash01(seed: number, a: number, b = 0, c = 0): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  for (const v of [a, b, c]) {
    h = Math.imul(h ^ (Math.floor(v) >>> 0), 0x85ebca6b) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
    h = Math.imul(h, 0xc2b2ae35) >>> 0;
    h = (h ^ (h >>> 16)) >>> 0;
  }
  return h / 4_294_967_296;
}

/** 文字列から seed を作る（建物の ID ごとの揺らぎ用） */
export function seedOf(text: string, base = 0): number {
  let h = (2166136261 ^ base) >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}
