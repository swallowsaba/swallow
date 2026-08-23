import type { Adjustments, PresetAdjustments } from '@/types';

/**
 * Copy/paste of edit settings between images. The clipboard holds a full
 * `Adjustments`; pasting turns the chosen groups into a `PresetAdjustments`
 * patch that the normal apply path merges in. All pure and unit-tested; the
 * clipboard state and the actual commit live in the editor store.
 */

export type SettingsGroup = 'basic' | 'toneCurves' | 'hsl' | 'colorGrading' | 'detail' | 'lens';

export const ALL_GROUPS: readonly SettingsGroup[] = [
  'basic',
  'toneCurves',
  'hsl',
  'colorGrading',
  'detail',
  'lens',
];

/**
 * Build a paste patch from a copied Adjustments, including only the selected
 * groups. Unknown/duplicate groups are ignored; an empty selection yields an
 * empty patch (a no-op paste).
 */
export function pickAdjustments(
  source: Adjustments,
  groups: readonly SettingsGroup[],
): PresetAdjustments {
  const want = new Set(groups);
  const patch: PresetAdjustments = {};
  return {
    ...patch,
    ...(want.has('basic') ? { basic: source.basic } : {}),
    ...(want.has('toneCurves') ? { toneCurves: source.toneCurves } : {}),
    ...(want.has('hsl') ? { hsl: source.hsl } : {}),
    ...(want.has('colorGrading') ? { colorGrading: source.colorGrading } : {}),
    ...(want.has('detail') ? { detail: source.detail } : {}),
    ...(want.has('lens') ? { lens: source.lens } : {}),
  };
}

/** The groups in `source` that differ from `neutral` (i.e. actually carry an
 *  edit) — used to show which settings a copy would carry. */
export function nonNeutralGroups(
  source: Adjustments,
  neutral: Adjustments,
): SettingsGroup[] {
  return ALL_GROUPS.filter((g) => JSON.stringify(source[g]) !== JSON.stringify(neutral[g]));
}

/**
 * A paste patch that resets the given groups back to their default values. Built
 * from a neutral Adjustments (createDefaultAdjustments) so applying it through
 * the normal merge path restores those groups. Reuses pickAdjustments, so it's
 * covered by the same guarantees.
 */
export function resetGroupsPatch(
  neutral: Adjustments,
  groups: readonly SettingsGroup[],
): PresetAdjustments {
  return pickAdjustments(neutral, groups);
}
