import { describe, expect, it } from 'vitest';
import { backoffMs, createClock } from './clock';
import { createRng } from './rng';

describe('SimClock', () => {
  it('tick と実時間が対応する', () => {
    const c = createClock(500);
    expect(c.nowMs).toBe(0);
    c.advance();
    expect(c.tick).toBe(1);
    expect(c.nowMs).toBe(500);
    c.advance(3);
    expect(c.nowMs).toBe(2000);
  });

  it('reset で戻る', () => {
    const c = createClock();
    c.advance(10);
    c.reset();
    expect(c.tick).toBe(0);
  });

  it('負の advance を拒否する', () => {
    const c = createClock();
    expect(() => {
      c.advance(-1);
    }).toThrow(RangeError);
  });
});

describe('backoff', () => {
  it('再起動のたびに倍増し、上限で止まる', () => {
    expect(backoffMs(0)).toBe(0);
    expect(backoffMs(1)).toBe(10_000);
    expect(backoffMs(2)).toBe(20_000);
    expect(backoffMs(3)).toBe(40_000);
    expect(backoffMs(99)).toBe(300_000);
  });
});

describe('Rng', () => {
  it('同じ seed なら同じ列', () => {
    const a = createRng(42);
    const b = createRng(42);
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);
  });

  it('違う seed なら違う列', () => {
    expect(createRng(1).next()).not.toBe(createRng(2).next());
  });

  it('0..1 に収まる', () => {
    const r = createRng(7);
    for (let i = 0; i < 200; i += 1) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int と pick が範囲内', () => {
    const r = createRng(3);
    const items = ['a', 'b', 'c'] as const;
    for (let i = 0; i < 50; i += 1) {
      expect(r.int(3)).toBeLessThan(3);
      expect(items).toContain(r.pick(items));
    }
  });
});
