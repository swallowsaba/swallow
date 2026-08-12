import { describe, expect, it } from 'vitest';
import { LruCache } from './lru-cache';

describe('LruCache', () => {
  it('evicts the least-recently-used entry', () => {
    const evicted: string[] = [];
    const c = new LruCache<number>({ max: 2, onEvict: (_v, k) => evicted.push(k) });
    c.set('a', 1);
    c.set('b', 2);
    c.set('c', 3);
    expect(evicted).toEqual(['a']);
    expect(c.keys()).toEqual(['b', 'c']);
  });

  it('marks entries used on get', () => {
    const evicted: string[] = [];
    const c = new LruCache<number>({ max: 2, onEvict: (_v, k) => evicted.push(k) });
    c.set('a', 1);
    c.set('b', 2);
    c.get('a'); // a becomes most recent
    c.set('c', 3); // evicts b
    expect(evicted).toEqual(['b']);
  });
});
