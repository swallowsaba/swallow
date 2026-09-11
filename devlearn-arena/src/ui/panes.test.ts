import { describe, expect, it } from 'vitest';
import { splitTemplate } from './panes';

describe('仕切りで分けた格子の並び', () => {
  it('手前が割合どおり、奥が残り、間に仕切りを挟む', () => {
    expect(splitTemplate(35)).toBe('minmax(0, 35fr) auto minmax(0, 65fr)');
  });
});
