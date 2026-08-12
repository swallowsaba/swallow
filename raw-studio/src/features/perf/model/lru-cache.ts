/**
 * A small, insertion-ordered LRU cache. Getting or setting a key marks it as
 * most-recently-used; when the cache exceeds `max`, the least-recently-used
 * entry is evicted and `onEvict` is called (used to close ImageBitmaps and free
 * GPU/CPU memory).
 */
export interface LruOptions<V> {
  max: number;
  onEvict?: (value: V, key: string) => void;
}

export class LruCache<V> {
  private readonly map = new Map<string, V>();

  constructor(private readonly options: LruOptions<V>) {}

  get size(): number {
    return this.map.size;
  }

  has(key: string): boolean {
    return this.map.has(key);
  }

  get(key: string): V | undefined {
    const value = this.map.get(key);
    if (value === undefined) return undefined;
    // Move to most-recently-used.
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: string, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.options.max) {
      const oldest = this.map.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      const evicted = this.map.get(oldest);
      this.map.delete(oldest);
      if (evicted !== undefined) this.options.onEvict?.(evicted, oldest);
    }
  }

  delete(key: string): void {
    this.map.delete(key);
  }

  clear(): void {
    for (const [key, value] of this.map) this.options.onEvict?.(value, key);
    this.map.clear();
  }

  keys(): readonly string[] {
    return [...this.map.keys()];
  }
}
