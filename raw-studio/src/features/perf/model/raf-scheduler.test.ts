import { describe, expect, it } from 'vitest';
import { createRafScheduler, type RafLike } from './raf-scheduler';

describe('createRafScheduler', () => {
  it('coalesces multiple schedules into one call per frame', () => {
    const queue: (() => void)[] = [];
    const raf: RafLike = { request: (cb) => queue.push(cb), cancel: () => undefined };
    let calls = 0;
    const s = createRafScheduler(() => (calls += 1), raf);
    s.schedule();
    s.schedule();
    s.schedule();
    expect(queue.length).toBe(1);
    queue.forEach((cb) => cb());
    expect(calls).toBe(1);
    s.schedule();
    queue.slice(1).forEach((cb) => cb());
    expect(calls).toBe(2);
  });
});
