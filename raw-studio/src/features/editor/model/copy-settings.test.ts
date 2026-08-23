import { describe, expect, it } from 'vitest';
import type { Adjustments } from '@/types';
import { createDefaultAdjustments } from '@/features/adjustments/model/defaults';
import { ALL_GROUPS, nonNeutralGroups, pickAdjustments, resetGroupsPatch } from './copy-settings';

function withEdits(): Adjustments {
  const a = createDefaultAdjustments();
  return {
    ...a,
    basic: { ...a.basic, exposure: 1.2, contrast: 30 },
    detail: { ...a.detail, clarity: 15 },
  };
}

describe('pickAdjustments', () => {
  it('includes only the selected groups', () => {
    const src = withEdits();
    const patch = pickAdjustments(src, ['basic']);
    expect(patch.basic).toEqual(src.basic);
    expect(patch.detail).toBeUndefined();
    expect(patch.lens).toBeUndefined();
  });

  it('can carry several groups', () => {
    const src = withEdits();
    const patch = pickAdjustments(src, ['basic', 'detail']);
    expect(patch.basic).toEqual(src.basic);
    expect(patch.detail).toEqual(src.detail);
  });

  it('is an empty patch for an empty selection', () => {
    expect(pickAdjustments(withEdits(), [])).toEqual({});
  });

  it('ignores duplicate groups', () => {
    const patch = pickAdjustments(withEdits(), ['basic', 'basic']);
    expect(Object.keys(patch)).toEqual(['basic']);
  });

  it('covers every group when all are selected', () => {
    const src = withEdits();
    const patch = pickAdjustments(src, ALL_GROUPS);
    for (const g of ALL_GROUPS) expect(patch[g]).toEqual(src[g]);
  });
});

describe('nonNeutralGroups', () => {
  it('lists only groups that differ from neutral', () => {
    const neutral = createDefaultAdjustments();
    const edited = withEdits();
    const groups = nonNeutralGroups(edited, neutral);
    expect(groups).toContain('basic');
    expect(groups).toContain('detail');
    expect(groups).not.toContain('lens');
    expect(groups).not.toContain('hsl');
  });

  it('returns nothing for an unedited image', () => {
    const neutral = createDefaultAdjustments();
    expect(nonNeutralGroups(neutral, neutral)).toEqual([]);
  });
});


describe('resetGroupsPatch', () => {
  it('returns default values for the selected groups', () => {
    const neutral = createDefaultAdjustments();
    const patch = resetGroupsPatch(neutral, ['basic']);
    expect(patch.basic).toEqual(neutral.basic);
    expect(patch.detail).toBeUndefined();
  });

  it('applying it over an edited image restores those groups to neutral', () => {
    const neutral = createDefaultAdjustments();
    const edited = withEdits();
    // Simulate a merge: reset patch overrides the edited basic with neutral basic.
    const patch = resetGroupsPatch(neutral, ['basic']);
    expect(patch.basic).toEqual(neutral.basic);
    expect(patch.basic).not.toEqual(edited.basic);
  });

  it('an empty selection resets nothing', () => {
    expect(resetGroupsPatch(createDefaultAdjustments(), [])).toEqual({});
  });
});
