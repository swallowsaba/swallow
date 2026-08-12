import { mergeAdjustments } from '@/features/editor/model/apply';
import type { Adjustments, EditState, Preset, PresetCategory } from '@/types';
import { createId } from '@/utils';

/** Apply a preset's overlay to an edit state, producing a new edit state. */
export function applyPresetToEdit(edit: EditState, preset: Preset, at: number = Date.now()): EditState {
  return {
    ...edit,
    adjustments: mergeAdjustments(edit.adjustments, preset.adjustments),
    updatedAt: at,
  };
}

/** Capture the current adjustments as a new user preset. */
export function captureUserPreset(
  name: string,
  category: PresetCategory,
  adjustments: Adjustments,
): Preset {
  const now = Date.now();
  return {
    id: createId('pre'),
    name: name.trim() || 'Untitled',
    category,
    favorite: false,
    builtin: false,
    createdAt: now,
    updatedAt: now,
    adjustments: {
      basic: { ...adjustments.basic },
      detail: { ...adjustments.detail },
      lens: { ...adjustments.lens },
      hsl: { ...adjustments.hsl },
      colorGrading: { ...adjustments.colorGrading },
    },
  };
}
