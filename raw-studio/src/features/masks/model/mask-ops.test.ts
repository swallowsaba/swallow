import { describe, expect, it } from 'vitest';
import type { EditState, Mask } from '@/types';
import { createDefaultAdjustments, createDefaultGeometry } from '@/features/adjustments/model/defaults';
import {
  activeMasks,
  addMask,
  createMask,
  defaultGeometryFor,
  invertMaskAdjustments,
  maskHasEffect,
  removeMask,
  renameMask,
  reorderMask,
  setMaskEnabled,
  updateMaskAdjustments,
  updateMaskGeometry,
} from './mask-ops';

function emptyState(): EditState {
  return {
    imageId: 'img1',
    adjustments: createDefaultAdjustments(),
    geometry: createDefaultGeometry(),
    masks: [],
    updatedAt: 0,
  };
}

describe('mask factories', () => {
  it('creates masks of each kind with unique numbered names', () => {
    const brush = createMask('brush', []);
    expect(brush.geometry.kind).toBe('brush');
    expect(brush.name).toBe('Brush 1');
    const second = createMask('brush', [brush]);
    expect(second.name).toBe('Brush 2');
    expect(second.id).not.toBe(brush.id);
  });

  it('defaultGeometryFor returns the matching kind', () => {
    expect(defaultGeometryFor('radial').kind).toBe('radial');
    expect(defaultGeometryFor('linear').kind).toBe('linear');
    expect(defaultGeometryFor('brush').kind).toBe('brush');
  });
});

describe('add / update / remove', () => {
  it('addMask appends without mutating the input', () => {
    const s0 = emptyState();
    const s1 = addMask(s0, createMask('radial', s0.masks));
    expect(s0.masks.length).toBe(0);
    expect(s1.masks.length).toBe(1);
    expect(s1.updatedAt).toBeGreaterThanOrEqual(s0.updatedAt);
  });

  it('updateMaskGeometry replaces geometry but keeps adjustments', () => {
    let s = addMask(emptyState(), createMask('radial', []));
    const id = s.masks[0]!.id;
    s = updateMaskAdjustments(s, id, { exposure: 1 });
    s = updateMaskGeometry(s, id, {
      kind: 'radial',
      centerX: 0.2,
      centerY: 0.5,
      radiusX: 0.3,
      radiusY: 0.3,
      rotation: 0,
      feather: 0.5,
      inverted: false,
    });
    const m = s.masks[0]!;
    expect(m.geometry.kind).toBe('radial');
    expect((m.geometry as { centerX: number }).centerX).toBe(0.2);
    expect(m.adjustments.exposure).toBe(1);
  });

  it('updateMaskAdjustments merges patches', () => {
    let s = addMask(emptyState(), createMask('brush', []));
    const id = s.masks[0]!.id;
    s = updateMaskAdjustments(s, id, { exposure: 0.5 });
    s = updateMaskAdjustments(s, id, { contrast: 20 });
    expect(s.masks[0]!.adjustments).toEqual({ exposure: 0.5, contrast: 20 });
  });

  it('setMaskEnabled toggles the flag', () => {
    let s = addMask(emptyState(), createMask('brush', []));
    const id = s.masks[0]!.id;
    s = setMaskEnabled(s, id, false);
    expect(s.masks[0]!.enabled).toBe(false);
  });

  it('renameMask ignores blank names', () => {
    let s = addMask(emptyState(), createMask('brush', []));
    const id = s.masks[0]!.id;
    s = renameMask(s, id, '  Sky  ');
    expect(s.masks[0]!.name).toBe('Sky');
    const same = renameMask(s, id, '   ');
    expect(same.masks[0]!.name).toBe('Sky');
  });

  it('removeMask drops the target', () => {
    let s = addMask(emptyState(), createMask('brush', []));
    const id = s.masks[0]!.id;
    s = removeMask(s, id);
    expect(s.masks.length).toBe(0);
  });
});

describe('invert + reorder + effect detection', () => {
  it('invertMaskAdjustments negates every numeric field', () => {
    let s = addMask(emptyState(), createMask('radial', []));
    const id = s.masks[0]!.id;
    s = updateMaskAdjustments(s, id, { exposure: 1, contrast: -20 });
    s = invertMaskAdjustments(s, id);
    expect(s.masks[0]!.adjustments).toEqual({ exposure: -1, contrast: 20 });
  });

  it('reorderMask swaps neighbours and clamps at the ends', () => {
    let s = emptyState();
    const a = createMask('brush', []);
    const b = createMask('radial', [a]);
    s = addMask(addMask(s, a), b);
    expect(s.masks.map((m) => m.id)).toEqual([a.id, b.id]);
    s = reorderMask(s, a.id, 'up');
    expect(s.masks.map((m) => m.id)).toEqual([b.id, a.id]);
    // 'up' past the end is a no-op.
    const same = reorderMask(s, a.id, 'up');
    expect(same.masks.map((m) => m.id)).toEqual([b.id, a.id]);
  });

  it('maskHasEffect / activeMasks ignore empty or disabled masks', () => {
    const empty = createMask('brush', []);
    expect(maskHasEffect(empty)).toBe(false);
    const withFx: Mask = { ...empty, adjustments: { exposure: 1 } };
    expect(maskHasEffect(withFx)).toBe(true);
    const disabled: Mask = { ...withFx, enabled: false };
    expect(activeMasks([empty, withFx, disabled]).map((m) => m.id)).toEqual([withFx.id]);
  });
});
