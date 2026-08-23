import { describe, expect, it } from 'vitest';
import { clipOverlay } from './clip-overlay';

describe('clipOverlay', () => {
  it('flags a blown highlight when any channel is at the top', () => {
    expect(clipOverlay(1, 0.5, 0.2)).toBe('highlight');
    expect(clipOverlay(0.998, 0.998, 0.998)).toBe('highlight');
  });

  it('flags a crushed shadow when every channel is at the bottom', () => {
    expect(clipOverlay(0, 0, 0)).toBe('shadow');
    expect(clipOverlay(0.002, 0.001, 0.003)).toBe('shadow');
  });

  it('returns null for a normal mid pixel', () => {
    expect(clipOverlay(0.5, 0.4, 0.6)).toBeNull();
  });

  it('prioritizes highlight over shadow when both would trigger', () => {
    // e.g. pure red: r=1 (highlight) and g=b=0 (shadow) — highlight wins.
    expect(clipOverlay(1, 0, 0)).toBe('highlight');
  });

  it('respects custom thresholds', () => {
    expect(clipOverlay(0.9, 0.9, 0.9, 0.8, 0.1)).toBe('highlight');
    expect(clipOverlay(0.05, 0.05, 0.05, 0.8, 0.1)).toBe('shadow');
  });
});
