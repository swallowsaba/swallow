import { describe, expect, it } from 'vitest';
import { isFlippedH, isFlippedV, toggleFlip } from './flip-ops';

describe('isFlippedH / isFlippedV', () => {
  it('reads each axis out of the combined mode', () => {
    expect(isFlippedH('none')).toBe(false);
    expect(isFlippedH('horizontal')).toBe(true);
    expect(isFlippedH('both')).toBe(true);
    expect(isFlippedV('vertical')).toBe(true);
    expect(isFlippedV('horizontal')).toBe(false);
    expect(isFlippedV('both')).toBe(true);
  });
});

describe('toggleFlip', () => {
  it('toggles horizontal without touching vertical', () => {
    expect(toggleFlip('none', 'horizontal')).toBe('horizontal');
    expect(toggleFlip('horizontal', 'horizontal')).toBe('none');
    expect(toggleFlip('vertical', 'horizontal')).toBe('both');
    expect(toggleFlip('both', 'horizontal')).toBe('vertical');
  });

  it('toggles vertical without touching horizontal', () => {
    expect(toggleFlip('none', 'vertical')).toBe('vertical');
    expect(toggleFlip('vertical', 'vertical')).toBe('none');
    expect(toggleFlip('horizontal', 'vertical')).toBe('both');
    expect(toggleFlip('both', 'vertical')).toBe('horizontal');
  });

  it('round-trips: toggling the same axis twice is a no-op', () => {
    for (const m of ['none', 'horizontal', 'vertical', 'both'] as const) {
      expect(toggleFlip(toggleFlip(m, 'horizontal'), 'horizontal')).toBe(m);
      expect(toggleFlip(toggleFlip(m, 'vertical'), 'vertical')).toBe(m);
    }
  });
});
