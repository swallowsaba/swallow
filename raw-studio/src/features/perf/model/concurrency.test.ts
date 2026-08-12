import { describe, expect, it } from 'vitest';
import { createLimiter } from './concurrency';

describe('createLimiter', () => {
  it('never exceeds the concurrency limit', async () => {
    const limit = createLimiter(2);
    let active = 0;
    let maxActive = 0;
    const task = () =>
      limit(async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 5));
        active -= 1;
        return 1;
      });
    const results = await Promise.all([task(), task(), task(), task(), task()]);
    expect(maxActive).toBeLessThanOrEqual(2);
    expect(results).toEqual([1, 1, 1, 1, 1]);
  });
});
