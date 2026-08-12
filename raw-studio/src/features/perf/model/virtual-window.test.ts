import { describe, expect, it } from 'vitest';
import { computeVisibleRange } from './virtual-window';

describe('computeVisibleRange', () => {
  it('returns the leading window at scroll 0', () => {
    expect(computeVisibleRange(0, 100, 20, 100, 0)).toEqual({ start: 0, end: 5 });
  });

  it('shifts the window with scroll and adds overscan', () => {
    expect(computeVisibleRange(200, 100, 20, 100, 2)).toEqual({ start: 8, end: 17 });
  });

  it('returns an empty range for a zero viewport', () => {
    expect(computeVisibleRange(0, 0, 20, 100)).toEqual({ start: 0, end: 0 });
  });
});
