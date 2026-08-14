import { describe, expect, it } from 'vitest';
import type { Adjustments, PresetAdjustments } from '@/types';
import { createDefaultAdjustments } from '@/features/adjustments/model/defaults';
import { lookKey, resolveLook, type LookInputs } from './look-source';

function base(patch: Partial<Adjustments['basic']>): Adjustments {
  const b = createDefaultAdjustments();
  return { ...b, basic: { ...b.basic, ...patch } };
}

const inputs: LookInputs = {
  current: base({ exposure: 1 }),
  snapshots: [{ id: 's1', name: 'Punchy', adjustments: base({ contrast: 50 }) }],
  presets: [
    { id: 'p1', name: 'Warm', adjustments: { basic: { temperature: 20 } } as PresetAdjustments },
  ],
};

describe('resolveLook', () => {
  it('resolves current and neutral', () => {
    expect(resolveLook({ kind: 'current' }, inputs)?.adjustments.basic.exposure).toBe(1);
    expect(resolveLook({ kind: 'neutral' }, inputs)?.adjustments.basic.exposure).toBe(0);
  });

  it('resolves a snapshot by id', () => {
    const r = resolveLook({ kind: 'snapshot', id: 's1', name: 'Punchy' }, inputs);
    expect(r?.adjustments.basic.contrast).toBe(50);
    expect(r?.label).toBe('Punchy');
  });

  it('resolves a preset merged onto current', () => {
    const r = resolveLook({ kind: 'preset', id: 'p1', name: 'Warm' }, inputs);
    // Preset temperature applied…
    expect(r?.adjustments.basic.temperature).toBe(20);
    // …on top of current exposure.
    expect(r?.adjustments.basic.exposure).toBe(1);
  });

  it('returns null for missing references', () => {
    expect(resolveLook({ kind: 'snapshot', id: 'nope', name: 'x' }, inputs)).toBeNull();
    expect(resolveLook({ kind: 'preset', id: 'nope', name: 'x' }, inputs)).toBeNull();
  });
});

describe('lookKey', () => {
  it('is stable and distinct per kind', () => {
    expect(lookKey({ kind: 'current' })).toBe('current');
    expect(lookKey({ kind: 'neutral' })).toBe('neutral');
    expect(lookKey({ kind: 'snapshot', id: 'a', name: 'x' })).toBe('snapshot:a');
    expect(lookKey({ kind: 'preset', id: 'a', name: 'x' })).toBe('preset:a');
  });
});
