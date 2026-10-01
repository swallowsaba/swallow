import { describe, expect, it } from 'vitest';
import { splitTemplate } from './panes';

describe('仕切りで分けた格子の並び', () => {
  it('手前が割合どおり、奥が残り、間に仕切りを挟む', () => {
    expect(splitTemplate(35)).toBe('minmax(0, 35fr) auto minmax(0, 65fr)');
  });

  it('両側とも中身の量で大きさが変わらない（auto にしない）', () => {
    for (const ratio of [15, 35, 70]) {
      const [front, back] = splitTemplate(ratio).split(' auto ');
      expect(front).toMatch(/^minmax\(0, \d+fr\)$/);
      expect(back).toMatch(/^minmax\(0, \d+fr\)$/);
    }
  });
});
